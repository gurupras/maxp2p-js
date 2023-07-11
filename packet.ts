import { SignalPacketType } from './signaler'

export interface Packet {
  connectionID: string
  type: SignalPacketType
  data: string
}

export interface SignalPacket extends Packet {
  src: string
  dest: string
}
