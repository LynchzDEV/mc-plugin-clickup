import type { Clock } from '../../src/deadline'

export type FakeClock = Clock & { advance(ms: number): Promise<void> }

type FakeTimer = { at: number; seq: number; fn: () => void; cancelled: boolean }

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

export function fakeClock(start = 0): FakeClock {
  let now = start
  let seq = 0
  const timers: FakeTimer[] = []

  const setTimer = (ms: number, fn: () => void): (() => void) => {
    const timer: FakeTimer = { at: now + ms, seq: seq++, fn, cancelled: false }
    timers.push(timer)
    return () => {
      timer.cancelled = true
    }
  }

  const advance = async (ms: number): Promise<void> => {
    await flushMicrotasks()
    const target = now + ms
    for (;;) {
      const due = timers
        .filter((timer) => !timer.cancelled && timer.at <= target)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0]
      if (!due) break
      due.cancelled = true
      now = Math.max(now, due.at)
      due.fn()
      await flushMicrotasks()
    }
    now = Math.max(now, target)
    await flushMicrotasks()
  }

  return {
    now: () => now,
    setTimer,
    sleep: (ms: number) => new Promise<void>((resolve) => setTimer(ms, resolve)),
    advance,
  }
}

export async function settle<T>(clock: FakeClock, promise: Promise<T>): Promise<T> {
  let done = false
  promise.then(
    () => {
      done = true
    },
    () => {
      done = true
    },
  )
  for (let i = 0; i < 5000 && !done; i++) await clock.advance(0)
  if (!done) throw new Error('promise did not settle under the fake clock')
  return await promise
}

export async function drain<T>(
  clock: FakeClock,
  promise: Promise<T>,
  options: { step?: number; horizon?: number } = {},
): Promise<T> {
  const step = options.step ?? 25
  const horizon = options.horizon ?? 24000
  let done = false
  promise.then(
    () => {
      done = true
    },
    () => {
      done = true
    },
  )
  while (!done && clock.now() < horizon) {
    await clock.advance(Math.min(step, horizon - clock.now()))
  }
  if (!done) throw new Error('promise did not settle before the fake-clock horizon')
  return await promise
}
