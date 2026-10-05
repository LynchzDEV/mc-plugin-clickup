import { describe, expect, test } from 'bun:test'
import { createClickUp } from '../src/clickup-api'
import { createDeadline } from '../src/deadline'
import { askText, isTaskId, sourceItem, sourcePost, sourceReplies } from '../src/source'
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

  test('sourceItem clamps the title, an oversized link and the context to the host limits', async () => {
    const { clock, api, deadline } = setup(({ path }) => {
      if (path === '/task/t1') return { body: { id: 't1', name: 'n'.repeat(600), url: `https://app.clickup.com/${'x'.repeat(2100)}`, description: 'd'.repeat(600000) } }
      if (path === '/task/t1/comment') return { body: { comments: [] } }
      return { status: 404, body: {} }
    })
    const result = await settle(clock, sourceItem(api, 't1', deadline, clock))
    expect(result.title).toBe('n'.repeat(500))
    expect(result.url).toBe('https://app.clickup.com/t/t1')
    expect(result.contextMarkdown).toHaveLength(524288)
  })

  test('sourceItem ignores a url that is not a string', async () => {
    const { clock, api, deadline } = setup(({ path }) => {
      if (path === '/task/t1') return { body: { id: 't1', name: 'Login copy', url: 42 } }
      if (path === '/task/t1/comment') return { body: { comments: [] } }
      return { status: 404, body: {} }
    })
    const result = await settle(clock, sourceItem(api, 't1', deadline, clock))
    expect(result.url).toBe('https://app.clickup.com/t/t1')
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

  test('sourcePost treats a null date like a missing one', async () => {
    const { clock, api, deadline } = setup(({ method }) =>
      method === 'POST' ? { body: { id: '9001', date: null } } : { status: 404, body: {} },
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

const comment = (id: string, date: number, text: string, extra: Record<string, unknown> = {}) => ({ id, date: String(date), comment_text: text, user: { username: 'Ploy' }, reply_count: 0, ...extra })

function repliesSetup(top: unknown[], threads: Record<string, unknown[]> = {}) {
  return setup(({ path }) => {
    if (path === '/task/t1/comment') return { body: { comments: top } }
    const thread = /^\/comment\/([^/]+)\/reply$/.exec(path)
    if (thread) return { body: { comments: threads[thread[1]!] ?? [] } }
    return { status: 404, body: {} }
  })
}

describe('sourceReplies', () => {
  test('returns new top-level comments oldest first with the newest date as cursor', async () => {
    const { clock, api, deadline } = repliesSetup([comment('3', 300, 'second'), comment('2', 200, 'first'), comment('1', 100, 'old')])
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: '150' }, deadline))
    expect(result.replies).toEqual([
      { id: '2', author: 'Ploy', text: 'first', images: [] },
      { id: '3', author: 'Ploy', text: 'second', images: [] },
    ])
    expect(result.lastId).toBe('300')
  })

  test('skips comments carrying the marker but still advances the cursor past them', async () => {
    const { clock, api, deadline } = repliesSetup([comment('4', 400, 'ขอถาม…\n— Mission Control'), comment('3', 300, 'answer')])
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: '100' }, deadline))
    expect(result.replies.map((reply) => reply.text)).toEqual(['answer'])
    expect(result.lastId).toBe('400')
  })

  test('returns thread replies under any comment', async () => {
    const { clock, api, deadline } = repliesSetup([comment('4', 400, 'q\n— Mission Control', { reply_count: 1 })], { '4': [comment('5', 500, 'หน้า login ครับ')] })
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: '400' }, deadline))
    expect(result.replies.map((reply) => reply.text)).toEqual(['หน้า login ครับ'])
    expect(result.lastId).toBe('500')
  })

  test('keeps the cursor when nothing is newer', async () => {
    const older = repliesSetup([comment('1', 100, 'old')])
    expect(await settle(older.clock, sourceReplies(older.api, { id: 't1', sinceId: '900' }, older.deadline))).toEqual({ replies: [], lastId: '900' })
    const empty = repliesSetup([])
    expect(await settle(empty.clock, sourceReplies(empty.api, { id: 't1', sinceId: null }, empty.deadline))).toEqual({ replies: [], lastId: null })
  })

  test('lists image links in the reply text', async () => {
    const { clock, api, deadline } = repliesSetup([
      comment('6', 600, 'see', {
        comment: [
          { text: 'see' },
          { type: 'image', image: { url: 'https://t1.p.clickup-attachments.com/a.png' } },
          { type: 'attachment', attachment: { url: 'https://t1.p.clickup-attachments.com/b.pdf' } },
        ],
      }),
    ])
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: '0' }, deadline))
    expect(result.replies).toEqual([
      {
        id: '6',
        author: 'Ploy',
        text: 'see\nImage: https://t1.p.clickup-attachments.com/a.png\nImage: https://t1.p.clickup-attachments.com/b.pdf',
        images: [],
      },
    ])
  })

  test('reads at most ten threads', async () => {
    const top = Array.from({ length: 12 }, (_, index) => comment(`c${index}`, 100 + index, `t${index}`, { reply_count: 1 }))
    const { clock, api, deadline, fake } = repliesSetup(top)
    await settle(clock, sourceReplies(api, { id: 't1', sinceId: null }, deadline))
    expect(fake.calls.filter((call) => /^\/comment\/[^/]+\/reply$/.test(call.path))).toHaveLength(10)
  })

  test('refuses a bad id before any request', async () => {
    const { api, deadline, fake } = repliesSetup([])
    await expect(sourceReplies(api, { id: 'a/b', sinceId: null }, deadline)).rejects.toThrow('Not a ClickUp task id')
    expect(fake.calls).toHaveLength(0)
  })

  test('clamps reply text, author and id to the host limits', async () => {
    const long = comment('i'.repeat(250), 700, 't'.repeat(70000), { user: { username: 'a'.repeat(300) } })
    const { clock, api, deadline } = repliesSetup([long])
    const [reply] = (await settle(clock, sourceReplies(api, { id: 't1', sinceId: null }, deadline))).replies
    expect(reply!.text).toHaveLength(64000)
    expect(reply!.author).toHaveLength(200)
    expect(reply!.id).toHaveLength(200)
  })

  test('keeps only the newest hundred replies, still oldest first, with the cursor at the newest', async () => {
    const top = Array.from({ length: 105 }, (_, index) => comment(String(index), 1000 + index, `r${index}`))
    const { clock, api, deadline } = repliesSetup(top)
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: null }, deadline))
    expect(result.replies).toHaveLength(100)
    expect(result.replies[0]!.text).toBe('r5')
    expect(result.replies[99]!.text).toBe('r104')
    expect(result.lastId).toBe('1104')
  })

  test('names an unknown author and turns a numeric id into a string', async () => {
    const { clock, api, deadline } = repliesSetup([{ id: 77, date: 800, comment_text: '  hi  ' }])
    const result = await settle(clock, sourceReplies(api, { id: 't1', sinceId: null }, deadline))
    expect(result.replies).toEqual([{ id: '77', author: 'someone', text: 'hi', images: [] }])
  })
})
