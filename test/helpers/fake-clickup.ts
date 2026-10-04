import type { FakeClock } from './fake-clock'

export type FakeReply = { status?: number; headers?: Record<string, string>; body?: unknown; text?: string; delay?: number }

export type RecordedCall = {
  url: string
  path: string
  query: URLSearchParams
  startedAt: number
  abortedAt?: number
  abortReason?: unknown
}

export type Responder = (call: { path: string; query: URLSearchParams }) => FakeReply | 'hang'

export type FakeClickUp = { fetchImpl: typeof fetch; calls: RecordedCall[]; maxInFlight(): number }

const API_PREFIX = '/api/v2'

export function fakeClickUp(clock: FakeClock, respond: Responder): FakeClickUp {
  const calls: RecordedCall[] = []
  let inFlight = 0
  let maxSeen = 0

  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input))
    const signal = init?.signal ?? new AbortController().signal
    const call: RecordedCall = {
      url: url.toString(),
      path: url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname,
      query: url.searchParams,
      startedAt: clock.now(),
    }
    calls.push(call)
    inFlight += 1
    maxSeen = Math.max(maxSeen, inFlight)
    let settled = false

    const abort = (reject: (reason?: unknown) => void): void => {
      if (settled) return
      settled = true
      call.abortedAt = clock.now()
      call.abortReason = signal.reason
      inFlight -= 1
      reject(signal.reason)
    }

    const reply = respond({ path: call.path, query: call.query })
    if (reply === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        if (signal.aborted) abort(reject)
        else signal.addEventListener('abort', () => abort(reject), { once: true })
      })
    }
    const { status = 200, headers = {}, body = {}, text, delay = 0 } = reply
    return new Promise<Response>((resolve, reject) => {
      const cancelTimer = clock.setTimer(delay, () => {
        if (settled) return
        settled = true
        inFlight -= 1
        resolve(new Response(text ?? JSON.stringify(body), { status, headers }))
      })
      if (signal.aborted) {
        cancelTimer()
        abort(reject)
        return
      }
      signal.addEventListener('abort', () => {
        cancelTimer()
        abort(reject)
      }, { once: true })
    })
  }) as typeof fetch

  return { fetchImpl, calls, maxInFlight: () => maxSeen }
}

export function seq(...replies: Array<FakeReply | 'hang'>): () => FakeReply | 'hang' {
  let index = 0
  return () => {
    const reply = replies[Math.min(index, replies.length - 1)]
    index += 1
    return reply
  }
}

export function outcome<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error) => ({ ok: false as const, error }),
  )
}
