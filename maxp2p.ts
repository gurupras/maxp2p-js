import { Chunk } from './chunk'
import { ChunkManager } from './chunk-manager'
import { Mutex } from './mutex'
import { SignalTransmitter } from './signaler'
import msgpack from '@ygoe/msgpack'
import Deferred from '@gurupras/deferred'
import BlockingQueue from './blocking-queue'

const maxChunkSize = 16384 - (80) // Approximate size of metadata of Chunk

type RTCConfiguration = ConstructorParameters<typeof RTCPeerConnection>[0]

let globalPacketID = 0

interface PeerConnectionEventMap {
  connectionstatechange: Event
  datachannel: RTCDataChannelEvent
  icecandidate: RTCPeerConnectionIceEvent
  icecandidateerror: Event
  iceconnectionstatechange: Event
  icegatheringstatechange: Event
  negotiationneeded: Event
  signalingstatechange: Event
  track: RTCTrackEvent
  message: CustomEvent<Uint8Array>
}

class PeerConnection extends RTCPeerConnection {
  private dc?: RTCDataChannel
  private maxBufferedAmount: number
  private mutex: Mutex
  private drain?: Deferred<void>
  sent: number
  received: number
  private onIncomingData: (bytes: Uint8Array) => void | Promise<void>

  constructor (config: RTCConfiguration, maxBufferedAmount: number = 1 * 1024 * 1024, onIncomingData: (bytes: Uint8Array) => void | Promise<void>) {
    super(config)
    this.maxBufferedAmount = maxBufferedAmount
    this.mutex = new Mutex()
    this.sent = 0
    this.received = 0
    this.onIncomingData = onIncomingData
  }

  async send (data: any) {
    const bytes = msgpack.serialize(data)
    const numChunks = Math.ceil(bytes.length / maxChunkSize)
    const written = 0

    const packetID = globalPacketID++
    for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
      const remaining = bytes.length - written
      const chunkSize = Math.min(remaining, maxChunkSize)

      const chunk: Chunk = {
        id: packetID,
        seq: chunkIdx,
        data: bytes.subarray(written, written + chunkSize),
        end: chunkIdx === numChunks - 1
      }

      const chunkBytes = msgpack.serialize(chunk)

      await this.mutex.protect(async () => {
        this.dc!.send(chunkBytes)
        this.sent += chunkBytes.length
        const bufferedAmount = this.dc!.bufferedAmount
        if (bufferedAmount > this.maxBufferedAmount) {
          this.drain = new Deferred()
          await this.drain
          this.drain = undefined
        }
      })
    }
  }

  addDC (dc: RTCDataChannel) {
    this.dc = dc
    dc.onbufferedamountlow = () => {
      if (this.drain) {
        this.drain.resolve()
      }
    }
    dc.onmessage = (e) => {
      const bytes = e.data as ArrayBuffer
      this.received += bytes.byteLength
      this.onIncomingData(new Uint8Array(bytes))
    }
  }

  addEventListener<K extends keyof PeerConnectionEventMap> (type: K, listener: (this: RTCPeerConnection, ev: PeerConnectionEventMap[K]) => any, options?: Parameters<RTCPeerConnection['addEventListener']>[2]) {
    super.addEventListener(type as any, listener as any, options)
  }
}

export default class MaxP2P {
  name: string
  peer: string
  webRTCConfig: RTCConfiguration
  maxBufferSize: number
  private chunkManager: ChunkManager
  private connectionsMap: Map<string, PeerConnection>
  private signaler: SignalTransmitter
  private dataCB?: (data: any) => Promise<void> | void
  private sendQueue: BlockingQueue<PeerConnection>
  private serialPC?: PeerConnection

  constructor (name: string, peer: string, signaler: SignalTransmitter, webRTCConfig: RTCConfiguration, maxBufferSize: number) {
    this.name = name
    this.peer = peer
    this.webRTCConfig = webRTCConfig
    this.maxBufferSize = maxBufferSize
    this.signaler = signaler

    this.chunkManager = new ChunkManager(this.onFullPacket)
    this.connectionsMap = new Map()
    this.sendQueue = new BlockingQueue()
  }

  async start (numConnections: number = navigator.hardwareConcurrency) {
    const promises: Promise<PeerConnection>[] = []
    for (let idx = 0; idx < numConnections; idx++) {
      const pcPromise = this.createConnection(`${idx.toString().padStart(4, '0')}`)
      promises.push(pcPromise)
    }
    await Promise.all(promises)
  }

  private async createConnection (connectionID: string) {
    const pc = new PeerConnection(this.webRTCConfig, this.maxBufferSize, this.onIncomingBytes)
    const connectedPromise = this.waitUntilConnected(pc)
    const dc = pc.createDataChannel('dc', {
      ordered: true
    })
    dc.binaryType = 'arraybuffer'

    const dcPromise = new Promise<void>(resolve => {
      dc.onopen = () => {
        pc.addDC(dc)
        resolve()
      }
    })

    this.addConnection(connectionID, pc)
    pc.onicecandidate = async (e) => {
      if (!e.candidate) {
        return
      }
      await this.signaler.sendICECandidate(this.peer, connectionID, e.candidate)
    }
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.signaler.sendSDP(this.peer, connectionID, offer as RTCSessionDescription)
    await Promise.all([
      connectedPromise,
      dcPromise
    ]).then(() => {
      this.sendQueue.put(pc)
    })
    return pc
  }

  async close () {
    const promises = []
    for (const pc of this.connectionsMap.values()) {
      const promise = new Promise<void>(resolve => {
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'closed') {
            resolve()
          }
        }
      })
      promises.push(promise)
      pc.close()
    }
    await Promise.all(promises)
  }

  private async waitUntilConnected (pc: PeerConnection) {
    await new Promise<void>(resolve => {
      pc.addEventListener('connectionstatechange', function once () {
        if (pc.connectionState === 'connected') {
          pc.removeEventListener('connectionstatechange', once)
          resolve()
        }
      })
    })
  }

  private onIncomingBytes = async (bytes: Uint8Array) => {
    await this.chunkManager.onIncomingData(bytes)
  }

  onData (cb: (data: any) => void) {
    this.dataCB = cb
  }

  private onFullPacket = (bytes: Uint8Array) => {
    // We serialize and send the data, so de-serialize here
    const data = msgpack.deserialize(bytes)
    if (this.dataCB) {
      this.dataCB(data)
    }
  }

  async onOffer (connectionID: string, sdp: RTCSessionDescription) {
    const pc = new PeerConnection(this.webRTCConfig, this.maxBufferSize, this.onIncomingBytes)
    const connectedPromise = this.waitUntilConnected(pc)
    pc.addEventListener('message', e => {
      this.onIncomingBytes(e.detail)
    })
    const dcPromise = new Promise<void>(resolve => {
      pc.ondatachannel = e => {
        e.channel.binaryType = 'arraybuffer'
        e.channel.onopen = () => {
          console.log(`[${this.name}]: DC ready`)
          pc.addDC(e.channel)
          resolve()
        }
      }
    })
    this.addConnection(connectionID, pc)
    await pc.setRemoteDescription(sdp)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await this.signaler.sendSDP(this.peer, connectionID, answer as RTCSessionDescription)
    await Promise.all([
      connectedPromise,
      dcPromise
    ]).then(() => {
      this.sendQueue.put(pc)
    })
  }

  async onAnswer (connectionID: string, sdp: RTCSessionDescription) {
    const pc = this.connectionsMap.get(connectionID)
    if (!pc) {
      throw new Error('Got answer for a PeerConnection that does not exist')
    }
    await pc.setRemoteDescription(sdp)
  }

  async onICECandidate (connectionID: string, candidate: Parameters<RTCPeerConnection['addIceCandidate']>[0]) {
    const pc = this.connectionsMap.get(connectionID)
    if (!pc) {
      throw new Error('Got ICE candidate for a PeerConnection that does not exist')
    }
    await pc.addIceCandidate(candidate)
  }

  addConnection (connectionID: string, pc: PeerConnection) {
    this.connectionsMap.set(connectionID, pc)
    if (this.connectionsMap.size === 1) {
      // This is the connection we use for serial transmission
      this.serialPC = pc
    }
  }

  async send (data: any) {
    await this.sendQueue.use(pc => {
      return pc.send(data)
    })
  }

  async sendSerial (data: any) {
    await this.serialPC!.send(data)
  }

  stats () {
    const result: Record<string, { sent: number, received: number }> = {}
    for (const [id, pc] of this.connectionsMap.entries()) {
      result[id] = {
        sent: pc.sent,
        received: pc.received
      }
    }
    return result
  }
}
