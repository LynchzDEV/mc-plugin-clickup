import { describe, expect, test } from 'bun:test'
import { createClickUp, type ClickUp } from '../src/clickup-api'
import { createDeadline } from '../src/deadline'
import { loadBoard, type Board, type Card } from '../src/board'
import { drain, fakeClock, type FakeClock } from './helpers/fake-clock'
import { fakeClickUp, outcome, type FakeClickUp, type Responder } from './helpers/fake-clickup'

const listDetail = {
  id: 'li1',
  name: 'Backlog',
  space: { name: 'KT' },
  folder: { name: 'HerMEZ' },
  statuses: [
    { status: 'Done', orderindex: 2, color: '#c3' },
    { status: 'Open', orderindex: 0, color: '#c1' },
    { status: 'In Progress', orderindex: 1, color: '#c2' },
  ],
}

type TaskFixture = {
  id: string
  name: string
  status: { status: string }
  tags?: Array<{ name: string }>
  assignees?: Array<{ username: string; color: string }>
  subtask_count?: number
  comment_count?: number
}

const task = (id: string, status = 'Open'): TaskFixture => ({ id, name: `Task ${id}`, status: { status } })

function makeBoard(respond: Responder): { api: ClickUp; fake: FakeClickUp; clock: FakeClock } {
  const clock = fakeClock()
  const fake = fakeClickUp(clock, respond)
  return { api: createClickUp('pk_board', { fetch: fake.fetchImpl, clock }), fake, clock }
}

async function load(respond: Responder, board: Board) {
  const { api, fake, clock } = makeBoard(respond)
  const deadline = createDeadline(25000, clock)
  const result = await drain(clock, loadBoard(api, board, deadline))
  deadline.dispose()
  return { result, fake }
}

const viewBoard: Board = { id: 'b-aaaaaaaa', name: 'Sprint', folder: '~/work', source: { kind: 'view', viewId: 'vw1', listId: 'li1' } }
const listBoard: Board = { id: 'b-bbbbbbbb', name: 'Backlog', folder: '/abs/work', source: { kind: 'list', listId: 'li1' } }

describe('loadBoard', () => {
  test('orders columns by statuses orderindex and groups tasks', async () => {
    const { result } = await load(
      ({ path }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/list/li1/task') return { body: { tasks: [task('a', 'Open'), task('b', 'Done'), task('c', 'In Progress')] } }
        return { status: 404, body: {} }
      },
      listBoard,
    )
    expect(result.partialFilters).toBe(false)
    expect(result.columns.map((column) => column.status)).toEqual(['Open', 'In Progress', 'Done'])
    expect(result.columns.map((column) => column.color)).toEqual(['#c1', '#c2', '#c3'])
    expect(result.columns[0].tasks.map((card) => card.id)).toEqual(['a'])
    expect(result.columns[2].tasks.map((card) => card.id)).toEqual(['b'])
  })

  test('paginates a view source until last_page', async () => {
    let viewPage = 0
    const { result, fake } = await load(
      ({ path, query }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/view/vw1/task') {
          viewPage = Number(query.get('page'))
          return { body: { tasks: viewPage === 0 ? [task('a'), task('b')] : [task('c')], last_page: viewPage !== 0 } }
        }
        return { status: 404, body: {} }
      },
      viewBoard,
    )
    const viewCalls = fake.calls.filter((call) => call.path === '/view/vw1/task')
    expect(viewCalls.map((call) => call.query.get('page'))).toEqual(['0', '1', '2', '3'])
    expect(result.partialFilters).toBe(false)
    expect(result.columns.flatMap((column) => column.tasks).map((card) => card.id)).toEqual(['a', 'b', 'c'])
  })

  test('paginates a list source until a page has fewer than 100 tasks', async () => {
    let listPage = 0
    const { fake } = await load(
      ({ path, query }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/list/li1/task') {
          listPage = Number(query.get('page'))
          const count = listPage === 0 ? 100 : 37
          return { body: { tasks: Array.from({ length: count }, (_v, i) => task(`p${listPage}-${i}`)) } }
        }
        return { status: 404, body: {} }
      },
      listBoard,
    )
    const taskCalls = fake.calls.filter((call) => call.path === '/list/li1/task')
    expect(taskCalls[0].query.get('subtasks')).toBe('false')
    expect(taskCalls.map((call) => call.query.get('page'))).toEqual(['0', '1', '2', '3'])
  })

  test('ten view pages arrive in waves of four, in page order', async () => {
    const { result, fake } = await load(
      ({ path, query }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/view/vw1/task') {
          const page = Number(query.get('page'))
          return { body: { tasks: page < 10 ? [task(`t${page}`)] : [], last_page: page >= 9 }, delay: 1000 }
        }
        return { status: 404, body: {} }
      },
      viewBoard,
    )
    const pages = fake.calls.filter((call) => call.path === '/view/vw1/task').map((call) => Number(call.query.get('page')))
    expect(pages).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(fake.maxInFlight()).toBeLessThanOrEqual(4)
    expect(result.columns.flatMap((column) => column.tasks).map((card) => card.id)).toEqual(['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9'])
  })

  for (const status of [401, 403, 404]) {
    test(`a view endpoint refusal (${status}) falls back to the list with partialFilters`, async () => {
      const { result, fake } = await load(
        ({ path }) => {
          if (path === '/list/li1') return { body: listDetail }
          if (path === '/view/vw1/task') return { status, body: {} }
          if (path === '/list/li1/task') return { body: { tasks: [task('a'), task('z', 'Blocked')] } }
          return { status: 500, body: {} }
        },
        viewBoard,
      )
      expect(result.partialFilters).toBe(true)
      expect(fake.calls.some((call) => call.path === '/list/li1/task')).toBe(true)
      expect(result.columns.map((column) => column.status)).toEqual(['Open', 'In Progress', 'Done', 'Blocked'])
    })
  }

  test('a view refusal with a non-JSON body still falls back with partialFilters', async () => {
    const { result, fake } = await load(
      ({ path }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/view/vw1/task') return { status: 403, text: 'Forbidden' }
        if (path === '/list/li1/task') return { body: { tasks: [task('a')] } }
        return { status: 500, body: {} }
      },
      viewBoard,
    )
    expect(result.partialFilters).toBe(true)
    expect(fake.calls.some((call) => call.path === '/list/li1/task')).toBe(true)
    expect(result.columns[0].tasks.map((card) => card.id)).toEqual(['a'])
  })

  test('maps cards with url, tags, assignee initials and colors, counts', async () => {
    const rich: TaskFixture = {
      id: 'abc1',
      name: 'Rich task',
      status: { status: 'Open' },
      tags: [{ name: 'bug' }, { name: 'urgent' }],
      assignees: [{ username: 'Jinnawat Vilairat', color: '#800080' }],
      subtask_count: 3,
      comment_count: 5,
    }
    const { result } = await load(
      ({ path }) => {
        if (path === '/list/li1') return { body: listDetail }
        if (path === '/list/li1/task') return { body: { tasks: [rich] } }
        return { status: 404, body: {} }
      },
      listBoard,
    )
    const card = result.columns[0].tasks[0] as Card & { commentCount?: number }
    expect(card).toMatchObject({
      id: 'abc1',
      name: 'Rich task',
      url: 'https://app.clickup.com/t/abc1',
      status: 'Open',
      tags: ['bug', 'urgent'],
      assignees: [{ initials: 'JV', color: '#800080' }],
      subtaskCount: 3,
      commentCount: 5,
    })
  })

  test('a missing list reports the gone-list message', async () => {
    const { api, clock } = makeBoard(({ path }) => (path === '/list/li1' ? { status: 404, body: {} } : { status: 500, body: {} }))
    const deadline = createDeadline(25000, clock)
    const failure = await outcome(drain(clock, loadBoard(api, listBoard, deadline)))
    deadline.dispose()
    expect(failure.ok).toBe(false)
    expect((failure.error as Error).message).toBe("This board's list is gone")
  })
})
