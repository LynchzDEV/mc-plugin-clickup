import { describe, expect, test } from 'bun:test'
import { createClickUp } from '../src/clickup-api'
import { createDeadline } from '../src/deadline'
import { askText, isTaskId, sourceItem, sourcePost } from '../src/source'
import { fakeClock, settle } from './helpers/fake-clock'
import { fakeClickUp, type Responder } from './helpers/fake-clickup'

function setup(respond: Responder) {
  const clock = fakeClock()
  const fake = fakeClickUp(clock, respond)
  const api = createClickUp('pk_test', { fetch: fake.fetchImpl, clock })
  const deadline = createDeadline(25000, clock)
  return { clock, fake, api, deadline }
}

describe('askText', () => {
  test('askText numbers the questions in Thai and ends with the marker', () => {
    expect(askText(['หน้าไหนครับ', 'Thai or English?'])).toBe(
      'ขอถามเพิ่มเติมก่อนเริ่มงานนี้นิดนึงครับ\n\n1. หน้าไหนครับ\n2. Thai or English?\n\nตอบใต้คอมเมนต์นี้หรือคอมเมนต์ใหม่ได้เลยครับ\n— Mission Control',
    )
  })
})

describe('isTaskId', () => {
  test('rejects task ids that are not plain ClickUp ids', () => {
    expect(isTaskId('86d3j4f8q')).toBe(true)
    expect(isTaskId('CU-123_a')).toBe(true)
    for (const bad of ['', '../user', 't1?x=1', 'a/b', 'x'.repeat(41), 7, null]) expect(isTaskId(bad)).toBe(false)
  })
})

describe('sourceItem', () => {
  test('sourceItem returns the task name, its link and the dossier markdown', async () => {
    const { clock, api, deadline } = setup(({ path }) => {
      if (path === '/task/t1') return { body: { id: 't1', name: 'Login copy', url: 'https://app.clickup.com/t/t1' } }
      if (path === '/task/t1/comment') return { body: { comments: [] } }
      return { status: 404, body: {} }
    })
    const result = await settle(clock, sourceItem(api, 't1', deadline, clock))
    expect(result.title).toBe('Login copy')
    expect(result.url).toBe('https://app.clickup.com/t/t1')
    expect(result.contextMarkdown).toContain('# Dossier: Login copy (t1)')
  })

  test('sourceItem falls back to the standard task link when ClickUp omits url', async () => {
    const { clock, api, deadline } = setup(({ path }) => {
      if (path === '/task/t1') return { body: { id: 't1', name: 'Login copy' } }
      if (path === '/task/t1/comment') return { body: { comments: [] } }
      return { status: 404, body: {} }
    })
    const result = await settle(clock, sourceItem(api, 't1', deadline, clock))
    expect(result.url).toBe('https://app.clickup.com/t/t1')
  })
})

describe('sourcePost', () => {
  test('sourcePost posts the ask text with notify_all and returns the comment date as the cursor', async () => {
    const { clock, api, deadline, fake } = setup(({ path, method }) =>
      method === 'POST' && path === '/task/t1/comment'
        ? { body: { id: '9001', date: 1700000000000 } }
        : { status: 404, body: {} },
    )
    const result = await settle(clock, sourcePost(api, { id: 't1', kind: 'ask', lines: ['Which page?'] }, deadline, 1234))
    expect(result).toEqual({ commentId: '1700000000000' })
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].method).toBe('POST')
    expect(fake.calls[0].body).toEqual({ comment_text: askText(['Which page?']), notify_all: true })
  })

  test('sourcePost uses now as the cursor when ClickUp returns no date', async () => {
    const { clock, api, deadline } = setup(({ method }) =>
      method === 'POST' ? { body: { id: '9001' } } : { status: 404, body: {} },
    )
    const result = await settle(clock, sourcePost(api, { id: 't1', kind: 'ask', lines: ['q'] }, deadline, 1234))
    expect(result).toEqual({ commentId: '1234' })
  })

  test('sourcePost refuses an empty question list and a bad id', async () => {
    const { api, deadline, fake } = setup(() => ({ body: {} }))
    await expect(sourcePost(api, { id: 't1', kind: 'ask', lines: [] }, deadline, 1)).rejects.toThrow('Nothing to ask')
    await expect(sourcePost(api, { id: '../x', kind: 'ask', lines: ['q'] }, deadline, 1)).rejects.toThrow('Not a ClickUp task id')
    expect(fake.calls).toHaveLength(0)
  })
})
