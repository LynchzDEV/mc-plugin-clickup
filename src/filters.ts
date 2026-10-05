export type FieldKind = 'status' | 'tags' | 'assignee' | 'creator' | 'priority' | 'date' | 'option' | 'labels' | 'checkbox' | 'users'

export type FieldOption = { id: string; name: string; color?: string }

export type FilterField = { key: string; label: string; kind: FieldKind; options: FieldOption[] }

export type Operator =
  | 'is' | 'is_not' | 'any' | 'all' | 'none' | 'set' | 'not_set'
  | 'checked' | 'unchecked'
  | 'today' | 'overdue' | 'this_week' | 'next_week' | 'last_7_days' | 'before' | 'after'

export type Condition = { field: string; op: Operator; values: string[] }

export type FilterGroup = { join: 'and' | 'or'; conditions: Condition[] }

export type CardFacts = {
  status: string
  tags: string[]
  assignees: string[]
  creator: string | null
  priority: string | null
  dates: { due: number | null; created: number | null; updated: number | null; closed: number | null }
  fields: Record<string, string[] | boolean | null>
}

export type FilterContext = { now: number; me: string | null }

export const ME = 'me'

const DAY = 24 * 60 * 60 * 1000

const OPERATORS: Record<FieldKind, Operator[]> = {
  status: ['is', 'is_not'],
  tags: ['any', 'all', 'none', 'set', 'not_set'],
  labels: ['any', 'all', 'none', 'set', 'not_set'],
  users: ['any', 'none', 'set', 'not_set'],
  assignee: ['any', 'none', 'set', 'not_set'],
  creator: ['is', 'is_not'],
  priority: ['is', 'is_not', 'set', 'not_set'],
  option: ['is', 'is_not', 'set', 'not_set'],
  checkbox: ['checked', 'unchecked'],
  date: ['today', 'overdue', 'this_week', 'next_week', 'last_7_days', 'before', 'after', 'set', 'not_set'],
}

export const OPERATOR_LABELS: Record<Operator, string> = {
  is: 'Is', is_not: 'Is not', any: 'Is any of', all: 'Is all of', none: 'Is none of', set: 'Is set', not_set: 'Is not set',
  checked: 'Is checked', unchecked: 'Is not checked',
  today: 'Today', overdue: 'Overdue', this_week: 'This week', next_week: 'Next week', last_7_days: 'Last 7 days', before: 'Before', after: 'After',
}

export function operatorsFor(kind: FieldKind, fieldKey: string): Operator[] {
  return kind === 'date' && fieldKey !== 'due' ? OPERATORS.date.filter(op => op !== 'overdue') : OPERATORS[kind]
}

export function needsValues(op: Operator): boolean {
  return op === 'is' || op === 'is_not' || op === 'any' || op === 'all' || op === 'none' || op === 'before' || op === 'after'
}

function startOfDay(time: number): number {
  const day = new Date(time)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

function startOfWeek(time: number): number {
  const day = new Date(startOfDay(time))
  const sinceMonday = (day.getDay() + 6) % 7
  day.setDate(day.getDate() - sinceMonday)
  return day.getTime()
}

function parseDay(value: string | undefined): number | null {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!).getTime()
}

function factValues(facts: CardFacts, field: string): string[] | boolean | null {
  if (field === 'status') return [facts.status]
  if (field === 'tags') return facts.tags
  if (field === 'assignee') return facts.assignees
  if (field === 'creator') return facts.creator === null ? [] : [facts.creator]
  if (field === 'priority') return facts.priority === null ? [] : [facts.priority]
  if (field.startsWith('cf:')) return facts.fields[field.slice(3)] ?? null
  return null
}

function dateOf(facts: CardFacts, field: string): number | null {
  if (field === 'due' || field === 'created' || field === 'updated' || field === 'closed') return facts.dates[field]
  return null
}

function wanted(values: string[], me: string | null): string[] {
  return values.map(value => (value === ME ? me ?? '' : value)).filter(value => value !== '')
}

function matchesDate(when: number | null, op: Operator, values: string[], now: number): boolean {
  if (op === 'set') return when !== null
  if (op === 'not_set') return when === null
  if (when === null) return false
  const today = startOfDay(now)
  if (op === 'today') return when >= today && when < today + DAY
  if (op === 'overdue') return when < now
  if (op === 'this_week') return when >= startOfWeek(now) && when < startOfWeek(now) + 7 * DAY
  if (op === 'next_week') return when >= startOfWeek(now) + 7 * DAY && when < startOfWeek(now) + 14 * DAY
  if (op === 'last_7_days') return when >= today - 6 * DAY && when < today + DAY
  const day = parseDay(values[0])
  if (day === null) return true
  if (op === 'before') return when < day
  if (op === 'after') return when >= day + DAY
  return true
}

export function matchesCondition(facts: CardFacts, condition: Condition, context: FilterContext): boolean {
  const { field, op } = condition
  if (field === 'due' || field === 'created' || field === 'updated' || field === 'closed') return matchesDate(dateOf(facts, field), op, condition.values, context.now)
  const actual = factValues(facts, field)
  if (op === 'checked') return actual === true
  if (op === 'unchecked') return actual !== true
  const have = Array.isArray(actual) ? actual : []
  if (op === 'set') return have.length > 0
  if (op === 'not_set') return have.length === 0
  const want = wanted(condition.values, context.me)
  if (want.length === 0) return true
  if (op === 'is' || op === 'any') return have.some(value => want.includes(value))
  if (op === 'is_not' || op === 'none') return !have.some(value => want.includes(value))
  if (op === 'all') return want.every(value => have.includes(value))
  return true
}

export function isActive(condition: Condition): boolean {
  return !needsValues(condition.op) || condition.values.length > 0
}

export function applyFilters<T extends { facts: CardFacts }>(cards: T[], group: FilterGroup, context: FilterContext): T[] {
  const active = group.conditions.filter(isActive)
  if (active.length === 0) return cards
  return cards.filter(card => group.join === 'and'
    ? active.every(condition => matchesCondition(card.facts, condition, context))
    : active.some(condition => matchesCondition(card.facts, condition, context)))
}

export function matchesSearch(card: { id: string; name: string }, query: string): boolean {
  const needle = query.trim().toLowerCase()
  return needle === '' || card.name.toLowerCase().includes(needle) || card.id.toLowerCase().includes(needle)
}

export function emptyGroup(): FilterGroup {
  return { join: 'and', conditions: [] }
}

export function sanitizeGroup(raw: unknown): FilterGroup {
  if (typeof raw !== 'object' || raw === null) return emptyGroup()
  const record = raw as { join?: unknown; conditions?: unknown }
  const conditions = Array.isArray(record.conditions) ? record.conditions : []
  return {
    join: record.join === 'or' ? 'or' : 'and',
    conditions: conditions.flatMap(entry => {
      if (typeof entry !== 'object' || entry === null) return []
      const item = entry as { field?: unknown; op?: unknown; values?: unknown }
      if (typeof item.field !== 'string' || typeof item.op !== 'string' || !(item.op in OPERATOR_LABELS)) return []
      const values = Array.isArray(item.values) ? item.values.filter((value): value is string => typeof value === 'string') : []
      return [{ field: item.field, op: item.op as Operator, values }]
    }).slice(0, 20),
  }
}
