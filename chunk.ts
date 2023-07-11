export interface Chunk {
  id: number
  seq: number
  end: boolean
  data: Uint8Array
}
