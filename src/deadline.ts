export const DEADLINE_ERROR = 'ClickUp took too long; try again'

export type Clock = {
  now(): number
  setTimer(ms: number, fn: () => void): () => void
  sleep(ms: number): Promise<void>
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimer: (ms, fn) => {
    const timer = setTimeout(fn, ms)
    return () => clearTimeout(timer)
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export type Deadline = {
  remaining(): number
  expired(): boolean
  signal: AbortSignal
  dispose(): void
}

export function createDeadline(ms: number, clock: Clock): Deadline {
  const controller = new AbortController()
  const cancelTimer = clock.setTimer(ms, () => controller.abort(new Error(DEADLINE_ERROR)))
  const end = clock.now() + ms
  return {
    remaining: () => Math.max(0, end - clock.now()),
    expired: () => clock.now() >= end,
    signal: controller.signal,
    dispose: cancelTimer,
  }
}
