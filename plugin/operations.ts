import native from '../index.cjs'
import type { Cancellation } from '../index.cjs'

/** Own native operations for both caller cancellation and Cordis disposal. */
export class Operations {
  #active = new Set<Cancellation>()

  start(signal?: AbortSignal) {
    const cancellation = new native.Cancellation()
    const abort = () => cancellation.cancel()
    this.#active.add(cancellation)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
    return {
      cancellation,
      close: () => {
        abort()
        signal?.removeEventListener('abort', abort)
        this.#active.delete(cancellation)
      },
    }
  }

  dispose() {
    for (const cancellation of this.#active) cancellation.cancel()
    this.#active.clear()
  }
}
