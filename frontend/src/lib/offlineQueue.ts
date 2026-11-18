import axios from 'axios'
import { submitCase } from '../api/cases'
import type { SubmitCase } from '../api/cases'

const KEY = 'mc_case_queue'

function read(): SubmitCase[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SubmitCase[] } catch { return [] }
}
function write(items: SubmitCase[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* storage unavailable */ }
}

export const queuedCount = () => read().length
export const enqueue = (c: SubmitCase) => write([...read(), c])

/** True when the failure means "no connection" rather than a server rejection. */
export const isOffline = (err: unknown) => !navigator.onLine || (axios.isAxiosError(err) && !err.response)

/** Sends queued cases in order; stops at the first network failure. Returns how many were sent. */
export async function flushQueue(): Promise<number> {
  let sent = 0
  for (;;) {
    const items = read()
    if (items.length === 0) return sent
    try {
      await submitCase(items[0])
    } catch (err) {
      if (isOffline(err)) return sent
      // Server rejected this case (e.g. validation): drop it so it cannot block the rest.
    }
    write(read().slice(1))
    sent++
  }
}
