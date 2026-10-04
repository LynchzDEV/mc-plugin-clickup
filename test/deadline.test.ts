import { describe, expect, test } from 'bun:test'
import { createDeadline, DEADLINE_ERROR } from '../src/deadline'
import { fakeClock } from './helpers/fake-clock'

describe('createDeadline', () => {
  test('remaining counts down and expires at the end', async () => {
    const clock = fakeClock()
    const deadline = createDeadline(25000, clock)
    expect(deadline.remaining()).toBe(25000)
    expect(deadline.expired()).toBe(false)
    await clock.advance(10000)
    expect(deadline.remaining()).toBe(15000)
    await clock.advance(15000)
    expect(deadline.expired()).toBe(true)
    expect(deadline.remaining()).toBe(0)
    expect(deadline.signal.aborted).toBe(true)
    expect((deadline.signal.reason as Error).message).toBe(DEADLINE_ERROR)
    deadline.dispose()
  })

  test('the timer aborts exactly at the deadline', async () => {
    const clock = fakeClock()
    const deadline = createDeadline(5000, clock)
    await clock.advance(4999)
    expect(deadline.signal.aborted).toBe(false)
    await clock.advance(1)
    expect(deadline.signal.aborted).toBe(true)
    deadline.dispose()
  })

  test('dispose cancels the abort timer without changing expiry math', async () => {
    const clock = fakeClock()
    const deadline = createDeadline(1000, clock)
    deadline.dispose()
    await clock.advance(5000)
    expect(deadline.signal.aborted).toBe(false)
    expect(deadline.expired()).toBe(true)
  })
})
