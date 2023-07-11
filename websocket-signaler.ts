import ReconnectingWebSocket from '@gurupras/reconnecting-websocket'
import { SignalPacket } from './packet'
import { ICECandidateCallback, SDPCallback, SignalPacketType, SignalReceiver, SignalTransmitter } from './signaler'

export class WebSocketSignaler implements SignalTransmitter, SignalReceiver {
  url: string
  id: string
  ws: ReconnectingWebSocket
  onIncomingSDP: SDPCallback
  onIncomingICECandidate: ICECandidateCallback

  constructor (url: string, id: string, onSDP: SDPCallback, onICECandidate: ICECandidateCallback) {
    this.url = url
    this.id = id
    this.onIncomingSDP = onSDP
    this.onIncomingICECandidate = onICECandidate

    this.ws = new ReconnectingWebSocket(url, {
      autoReconnect: true,
      heartbeat: true,
      onMessage: (ws, e) => {
        const data = JSON.parse(e.data)
        const action: string = data.action
        if (action) {
          switch (action) {
            case 'ready':
              break
            default:
              throw new Error('Unexpected message. Did not receive ready signal')
          }
        } else {
          this.onPacket(data)
        }
      }
    })
  }

  onPacket (pkt: SignalPacket) {
    debugger
    const { src, connectionID, type } = pkt
    switch (type) {
      case SignalPacketType.CANDIDATE: {
        break
      }
      case SignalPacketType.SDP: {
        this.onIncomingSDP(src, connectionID, pkt as any as RTCSessionDescription)
        break
      }
    }
  }

  async sendSDP (dest: string, connectionID: string, sdp: RTCSessionDescription) {
    const str = JSON.stringify(sdp)
    const pkt: SignalPacket = {
      connectionID,
      type: SignalPacketType.SDP,
      data: str,
      src: this.id,
      dest
    }
    this.ws.send(JSON.stringify(pkt))
  }

  async sendICECandidate (dest: string, connectionID: string, candidate: RTCIceCandidate) {
    const str = JSON.stringify(candidate.toJSON())
    const pkt: SignalPacket = {
      connectionID,
      type: SignalPacketType.CANDIDATE,
      data: str,
      src: this.id,
      dest
    }
    this.ws.send(JSON.stringify(pkt))
  }
}
