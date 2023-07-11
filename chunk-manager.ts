import msgpack from '@ygoe/msgpack'

import { Chunk } from './chunk'
import { Mutex } from './mutex'

class PacketChunks {
  mutex: Mutex
  data: Map<number, Chunk>
  private totalChunks: number | null
  size: number

  constructor () {
    this.mutex = new Mutex()
    this.data = new Map()
    this.totalChunks = null
    this.size = 0
  }

  addChunk (chunk: Chunk) {
    this.data.set(chunk.seq, chunk)
    this.size += chunk.data.length
    if (chunk.end) {
      this.totalChunks = chunk.seq + 1
    }
  }

  total () {
    if (this.totalChunks === null) {
      throw new Error('Unknown total number of chunks')
    }
    return this.totalChunks
  }

  isComplete () {
    if (this.totalChunks === null) {
      return false
    }
    return this.data.size === this.totalChunks
  }
}

export class ChunkManager {
  mutex: Mutex
  partialPackets: Map<number, PacketChunks>
  onPacket: (data: Uint8Array) => Promise<void> | void

  constructor (onPacket: (data: Uint8Array) => Promise<void> | void) {
    this.mutex = new Mutex()
    this.partialPackets = new Map()
    this.onPacket = onPacket
  }

  async addChunk (chunk: Chunk) {
    const packetChunks = await this.mutex.protect(async () => {
      if (!this.partialPackets.has(chunk.id)) {
        this.partialPackets.set(chunk.id, new PacketChunks())
      }
      const packetChunks = this.partialPackets.get(chunk.id)!
      return packetChunks
    })
    const isComplete = await this.mutex.protect(async () => {
      packetChunks.addChunk(chunk)
      return packetChunks.isComplete()
    })

    if (isComplete) {
      await this.mutex.protect(async () => {
        this.partialPackets.delete(chunk.id)
      })
      // TODO: We're copying bytes. Optimize this
      const data = new Uint8Array(packetChunks.size)
      let offset = 0
      for (let idx = 0; idx < packetChunks.total(); idx++) {
        const chunk = packetChunks.data.get(idx)!
        data.set(chunk.data, offset)
        offset += chunk.data.length
      }
      await this.onPacket(data)
    }
  }

  async onIncomingData (data: Uint8Array) {
    const chunk = parseChunkFromBytes(data)
    await this.addChunk(chunk)
  }
}

export function parseChunkFromBytes (bytes: Uint8Array): Chunk {
  const ret: Chunk = msgpack.deserialize(bytes)
  if (ret.id === undefined || ret.seq === undefined || ret.end === undefined || ret.data === undefined) {
    throw new Error('Not a chunk')
  }
  return ret
}
