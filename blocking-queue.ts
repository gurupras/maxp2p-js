import { Mutex } from './mutex'

export default class BlockingQueue<T> {
  private queue: T[]
  private notifyList: Function[]

  constructor () {
    this.queue = []
    this.notifyList = []
  }

  async put (element: T) {
    let cb: Function | undefined

    this.queue.unshift(element)

    if (this.notifyList.length > 0) {
      cb = this.notifyList.splice(0, 1)[0]
      cb()
    }
  }

  async get (): Promise<T> {
    while (true) {
      let promise: Promise<void> | undefined
      if (this.queue.length === 0) {
        promise = new Promise<void>(resolve => {
          this.notifyList.push(resolve)
        })
        await promise
      } else {
        const entry = this.queue.pop()
        return entry!
      }
    }
  }

  async use (cb: (entry: T) => void | Promise<void>) {
    const entry = await this.get()
    try {
      await cb(entry)
      this.put(entry)
    } catch (e) {
      this.put(entry)
      throw e
    }
  }
}
