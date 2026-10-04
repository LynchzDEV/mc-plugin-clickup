import { describe, expect, test } from 'bun:test'
import { fakeClock } from './helpers/fake-clock'

describe('fakeClock advance', () => {
  test('a timer observes its own due time, not the advance target', async () => {
    const clock = fakeClock()
    const seen: number[] = []
    clock.setTimer(10000, () => seen.push(clock.now()))
    await clock.advance(25000)
    expect(seen).toEqual([10000])
    expect(clock.now()).toBe(25000)
  })

  test('fires due timers in chronological order across flushes', async () => {
    const clock = fakeClock()
    const order: string[] = []
    clock.setTimer(5000, () => order.push('late'))
    clock.setTimer(3000, () => {
      order.push('early')
      clock.setTimer(1000, () => order.push('mid'))
    })
    await clock.advance(10000)
    expect(order).toEqual(['early', 'mid', 'late'])
  })

  test('sleep resumes at its own time', async () => {
    const clock = fakeClock()
    let atWake = -1
    const slept = clock.sleep(3000).then(() => {
      atWake = clock.now()
    })
    await clock.advance(5000)
    await slept
    expect(atWake).toBe(3000)
  })

  test('advance with no due timers only moves now', async () => {
    const clock = fakeClock()
    await clock.advance(7000)
    expect(clock.now()).toBe(7000)
  })
})
