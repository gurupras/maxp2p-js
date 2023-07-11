export type SDPCallback = (src: string, connectionID: string, sdp: RTCSessionDescription) => Promise<void> | void
export type ICECandidateCallback = (src: string, connectionID: string, candidate: RTCIceCandidate) => Promise<void> | void

export interface SignalTransmitter {
  sendICECandidate: (dest: string, connectionID: string, candidate: RTCIceCandidate) => Promise<void> | void
  sendSDP: (dest: string, connectionID: string, sdp: RTCSessionDescription) => Promise<void> | void
}

export interface SignalReceiver {
  onIncomingSDP: SDPCallback
  onIncomingICECandidate: ICECandidateCallback
}

export enum SignalPacketType {
  CANDIDATE = 'candidate',
  SDP = 'sdp'
}
