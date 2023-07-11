import AsyncLock from 'async-lock'

export class Mutex {
  private lock: AsyncLock

  constructor () {
    this.lock = new AsyncLock()
  }

  async protect<T = any> (cb: () => T | Promise<T>) {
    return this.lock.acquire('lock', cb)
  }
}
