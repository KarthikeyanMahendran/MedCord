import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/cases', () => ({ submitCase: vi.fn() }))

import { submitCase } from '../api/cases'
import { enqueue, flushQueue, queuedCount } from './offlineQueue'

const mocked = vi.mocked(submitCase)
const c = (text: string) => ({ chiefComplaint: text })

describe('offline case queue', () => {
  beforeEach(() => { localStorage.clear(); mocked.mockReset() })

  it('stores cases on the device and counts them', () => {
    expect(queuedCount()).toBe(0)
    enqueue(c('a')); enqueue(c('b'))
    expect(queuedCount()).toBe(2)
  })

  it('sends queued cases in order and empties the queue', async () => {
    mocked.mockResolvedValue({} as never)
    enqueue(c('first')); enqueue(c('second'))
    expect(await flushQueue()).toBe(2)
    expect(mocked.mock.calls.map((x) => x[0].chiefComplaint)).toEqual(['first', 'second'])
    expect(queuedCount()).toBe(0)
  })

  it('keeps the case when the network is down', async () => {
    mocked.mockRejectedValue(Object.assign(new Error('Network Error'), { isAxiosError: true, response: undefined }))
    enqueue(c('x'))
    expect(await flushQueue()).toBe(0)
    expect(queuedCount()).toBe(1)
  })

  it('drops a case the server rejects so it cannot block the rest', async () => {
    mocked.mockRejectedValueOnce(Object.assign(new Error('bad'), { isAxiosError: true, response: { status: 400 } }))
    mocked.mockResolvedValueOnce({} as never)
    enqueue(c('bad')); enqueue(c('good'))
    expect(await flushQueue()).toBe(2)
    expect(queuedCount()).toBe(0)
  })
})
