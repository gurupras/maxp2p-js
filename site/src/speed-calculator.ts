import prettyBytes from 'pretty-bytes'

export class SpeedCalculator {
  private readonly start: number
  private transferred: number
  private lastTransferred: number
  private lastUpdated: number
  private readonly interval: number
  speed: string

  constructor (intervalMillis: number) {
    this.start = Date.now()
    this.transferred = 0
    this.lastTransferred = 0
    this.lastUpdated = 0
    this.interval = intervalMillis
    this.speed = ''
  }

  update (tx: number) {
    this.transferred += tx
    const now = Date.now()
    const timeSinceLastUpdate = now - this.lastUpdated
    const transferred = this.transferred - this.lastTransferred
    if (timeSinceLastUpdate > this.interval) {
      this.updateSpeed(transferred, timeSinceLastUpdate / 1e3)
      this.lastUpdated = now
      this.lastTransferred = this.transferred
    }
  }

  private updateSpeed (tx: number, sec: number) {
    this.speed = `${prettyBytes(tx / (sec), { maximumFractionDigits: 2 })}/s`
  }

  summary () {
    this.updateSpeed(this.transferred, (Date.now() - this.start) / 1e3)
  }
}
