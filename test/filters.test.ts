import { describe, expect, test } from 'bun:test'
import { applyFilters, matchesSearch, operatorsFor, sanitizeGroup, ME, type CardFacts, type Condition } from '../src/filters'

const NOW = new Date(2026, 9, 7, 14, 0, 0).getTime()
const day = (offset: number, hour = 10): number => new Date(2026, 9, 7 + offset, hour).getTime()

function facts(over: Partial<CardFacts> = {}): CardFacts {
  return {
    status: 'open', tags: [], assignees: [], creator: null, priority: null,
    dates: { due: null, created: null, updated: null, closed: null }, fields: {}, ...over,
  }
}

const cards = [
  { id: 'a', name: 'Army export mapping', facts: facts({ status: 'in progress', tags: ['bug'], assignees: ['u1'], priority: '2', creator: 'u2', dates: { due: day(-1), created: day(-10), updated: day(0), closed: null }, fields: { plan: ['sprint17'], ok: true } }) },
  { id: 'b', name: 'HerMEZ kood queue', facts: facts({ status: 'review', tags: ['bug', 'cr'], assignees: ['u2'], dates: { due: day(0), created: day(-2), updated: day(-1), closed: null }, fields: { plan: ['refine'] } }) },
  { id: 'c', name: 'Moni export filter', facts: facts({ status: 'open', fields: { plan: null } }) },
]

const ids = (conditions: Condition[], join: 'and' | 'or' = 'and', me: string | null = 'u1') =>
  applyFilters(cards, { join, conditions }, { now: NOW, me }).map(card => card.id)

describe('applyFilters', () => {
  test('no active condition keeps every card', () => {
    expect(ids([])).toEqual(['a', 'b', 'c'])
    expect(ids([{ field: 'status', op: 'is', values: [] }])).toEqual(['a', 'b', 'c'])
  })

  test('status is and is not', () => {
    expect(ids([{ field: 'status', op: 'is', values: ['review', 'open'] }])).toEqual(['b', 'c'])
    expect(ids([{ field: 'status', op: 'is_not', values: ['review'] }])).toEqual(['a', 'c'])
  })

  test('tags any, all, none, set, not set', () => {
    expect(ids([{ field: 'tags', op: 'any', values: ['cr'] }])).toEqual(['b'])
    expect(ids([{ field: 'tags', op: 'all', values: ['bug', 'cr'] }])).toEqual(['b'])
    expect(ids([{ field: 'tags', op: 'none', values: ['bug'] }])).toEqual(['c'])
    expect(ids([{ field: 'tags', op: 'set', values: [] }])).toEqual(['a', 'b'])
    expect(ids([{ field: 'tags', op: 'not_set', values: [] }])).toEqual(['c'])
  })

  test('assignee Me resolves to the signed-in ClickUp user, and matches nothing without one', () => {
    expect(ids([{ field: 'assignee', op: 'any', values: [ME] }])).toEqual(['a'])
    expect(ids([{ field: 'assignee', op: 'any', values: [ME] }], 'and', null)).toEqual(['a', 'b', 'c'])
    expect(ids([{ field: 'assignee', op: 'not_set', values: [] }])).toEqual(['c'])
  })

  test('creator and priority', () => {
    expect(ids([{ field: 'creator', op: 'is', values: ['u2'] }])).toEqual(['a'])
    expect(ids([{ field: 'priority', op: 'set', values: [] }])).toEqual(['a'])
    expect(ids([{ field: 'priority', op: 'is_not', values: ['2'] }])).toEqual(['b', 'c'])
  })

  test('dropdown and checkbox custom fields', () => {
    expect(ids([{ field: 'cf:plan', op: 'is', values: ['sprint17'] }])).toEqual(['a'])
    expect(ids([{ field: 'cf:plan', op: 'is_not', values: ['sprint17'] }])).toEqual(['b', 'c'])
    expect(ids([{ field: 'cf:plan', op: 'not_set', values: [] }])).toEqual(['c'])
    expect(ids([{ field: 'cf:ok', op: 'checked', values: [] }])).toEqual(['a'])
    expect(ids([{ field: 'cf:ok', op: 'unchecked', values: [] }])).toEqual(['b', 'c'])
  })

  test('dates: today, overdue, last 7 days, before, after, not set', () => {
    expect(ids([{ field: 'due', op: 'today', values: [] }])).toEqual(['b'])
    expect(ids([{ field: 'due', op: 'overdue', values: [] }])).toEqual(['a', 'b'])
    expect(ids([{ field: 'created', op: 'last_7_days', values: [] }])).toEqual(['b'])
    expect(ids([{ field: 'created', op: 'before', values: ['2026-10-01'] }])).toEqual(['a'])
    expect(ids([{ field: 'updated', op: 'after', values: ['2026-10-06'] }])).toEqual(['a'])
    expect(ids([{ field: 'due', op: 'not_set', values: [] }])).toEqual(['c'])
  })

  test('this week runs Monday to Sunday', () => {
    const week = [
      { id: 'mon', name: '', facts: facts({ dates: { due: new Date(2026, 9, 5, 9).getTime(), created: null, updated: null, closed: null } }) },
      { id: 'sun', name: '', facts: facts({ dates: { due: new Date(2026, 9, 11, 23).getTime(), created: null, updated: null, closed: null } }) },
      { id: 'next', name: '', facts: facts({ dates: { due: new Date(2026, 9, 12, 9).getTime(), created: null, updated: null, closed: null } }) },
    ]
    expect(applyFilters(week, { join: 'and', conditions: [{ field: 'due', op: 'this_week', values: [] }] }, { now: NOW, me: null }).map(card => card.id)).toEqual(['mon', 'sun'])
    expect(applyFilters(week, { join: 'and', conditions: [{ field: 'due', op: 'next_week', values: [] }] }, { now: NOW, me: null }).map(card => card.id)).toEqual(['next'])
  })

  test('AND needs every condition, OR any of them', () => {
    const both: Condition[] = [{ field: 'tags', op: 'any', values: ['bug'] }, { field: 'status', op: 'is', values: ['open', 'review'] }]
    expect(ids(both, 'and')).toEqual(['b'])
    expect(ids(both, 'or')).toEqual(['a', 'b', 'c'])
  })
})

describe('matchesSearch', () => {
  test('matches name or task id, ignoring case', () => {
    expect(cards.filter(card => matchesSearch(card, 'EXPORT')).map(card => card.id)).toEqual(['a', 'c'])
    expect(cards.filter(card => matchesSearch(card, 'b')).map(card => card.id)).toEqual(['b'])
    expect(cards.filter(card => matchesSearch(card, '  ')).length).toBe(3)
  })
})

describe('operatorsFor and sanitizeGroup', () => {
  test('only the due date offers Overdue', () => {
    expect(operatorsFor('date', 'due')).toContain('overdue')
    expect(operatorsFor('date', 'created')).not.toContain('overdue')
  })

  test('stored filters are cleaned before use', () => {
    expect(sanitizeGroup(null)).toEqual({ join: 'and', conditions: [] })
    expect(sanitizeGroup({ join: 'or', conditions: [{ field: 'tags', op: 'any', values: ['x', 3] }, { field: 'tags', op: 'drop table' }, 'junk'] }))
      .toEqual({ join: 'or', conditions: [{ field: 'tags', op: 'any', values: ['x'] }] })
  })
})
