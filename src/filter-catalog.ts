import type { CardFacts, FieldKind, FieldOption, FilterField } from './filters'

export type TaskUser = { id?: number | string; username?: string; color?: string }

export type TaskCustomField = { id: string; type?: string; value?: unknown }

export type FactSource = {
  status?: { status?: string }
  tags?: Array<{ name?: string }>
  assignees?: TaskUser[]
  creator?: TaskUser
  priority?: { id?: string | number } | null
  due_date?: string | number | null
  date_created?: string | number | null
  date_updated?: string | number | null
  date_closed?: string | number | null
  custom_fields?: TaskCustomField[]
}

export type ListField = {
  id: string
  name: string
  type: string
  type_config?: { options?: Array<{ id: string; name?: string; label?: string; color?: string | null; orderindex?: number | string }> }
}

export type ViewFilterRow = { label: string; op: string; values: string[] }

export type ViewFilter = { join: 'and' | 'or'; rows: ViewFilterRow[] }

const FIELD_KINDS: Record<string, FieldKind> = { drop_down: 'option', labels: 'labels', users: 'users', checkbox: 'checkbox' }

export const PRIORITIES: FieldOption[] = [
  { id: '1', name: 'Urgent', color: '#f50000' },
  { id: '2', name: 'High', color: '#f8ae00' },
  { id: '3', name: 'Normal', color: '#6fddff' },
  { id: '4', name: 'Low', color: '#d8d8d8' },
]

function time(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function dropdownOptionId(value: unknown, field: ListField | undefined): string | null {
  if (value === null || value === undefined) return null
  const options = field?.type_config?.options ?? []
  const byIndex = options.find(option => String(option.orderindex) === String(value))
  if (byIndex) return byIndex.id
  return typeof value === 'string' ? value : null
}

export function customValue(custom: TaskCustomField, field: ListField | undefined): string[] | boolean | null {
  const type = custom.type ?? field?.type
  const value = custom.value
  if (type === 'checkbox') return value === true || value === 'true'
  if (type === 'drop_down') {
    const id = dropdownOptionId(value, field)
    return id === null ? null : [id]
  }
  if (type === 'labels') return Array.isArray(value) ? value.map(String) : null
  if (type === 'users') return Array.isArray(value) ? value.map(user => String((user as TaskUser).id ?? '')).filter(Boolean) : null
  return null
}

export function factsOf(task: FactSource, fields: Map<string, ListField>): CardFacts {
  const custom: CardFacts['fields'] = {}
  for (const entry of task.custom_fields ?? []) custom[entry.id] = customValue(entry, fields.get(entry.id))
  return {
    status: task.status?.status ?? '',
    tags: (task.tags ?? []).map(tag => tag.name ?? '').filter(Boolean),
    assignees: (task.assignees ?? []).map(user => String(user.id ?? '')).filter(Boolean),
    creator: task.creator?.id === undefined ? null : String(task.creator.id),
    priority: task.priority?.id === undefined || task.priority === null ? null : String(task.priority.id),
    dates: { due: time(task.due_date), created: time(task.date_created), updated: time(task.date_updated), closed: time(task.date_closed) },
    fields: custom,
  }
}

function usersSeen(tasks: FactSource[], pick: (task: FactSource) => TaskUser[]): FieldOption[] {
  const seen = new Map<string, FieldOption>()
  for (const task of tasks) for (const user of pick(task)) {
    if (user.id === undefined) continue
    seen.set(String(user.id), { id: String(user.id), name: user.username ?? String(user.id), ...(user.color ? { color: user.color } : {}) })
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function filterFields(input: { statuses: Array<{ status: string; color?: string }>; tasks: FactSource[]; listFields: ListField[] }): FilterField[] {
  const tags = [...new Set(input.tasks.flatMap(task => (task.tags ?? []).map(tag => tag.name ?? '')).filter(Boolean))].sort()
  const builtIns: FilterField[] = [
    { key: 'status', label: 'Status', kind: 'status', options: input.statuses.map(status => ({ id: status.status, name: status.status, ...(status.color ? { color: status.color } : {}) })) },
    { key: 'tags', label: 'Tags', kind: 'tags', options: tags.map(tag => ({ id: tag, name: tag })) },
    { key: 'assignee', label: 'Assignee', kind: 'assignee', options: usersSeen(input.tasks, task => task.assignees ?? []) },
    { key: 'due', label: 'Due date', kind: 'date', options: [] },
    { key: 'priority', label: 'Priority', kind: 'priority', options: PRIORITIES },
    { key: 'creator', label: 'Created by', kind: 'creator', options: usersSeen(input.tasks, task => (task.creator ? [task.creator] : [])) },
    { key: 'closed', label: 'Date closed', kind: 'date', options: [] },
    { key: 'created', label: 'Date created', kind: 'date', options: [] },
    { key: 'updated', label: 'Date updated', kind: 'date', options: [] },
  ]
  const custom = input.listFields.flatMap((field): FilterField[] => {
    const kind = FIELD_KINDS[field.type]
    if (kind === undefined) return []
    const options = kind === 'users'
      ? usersSeen(input.tasks, task => (task.custom_fields ?? []).filter(entry => entry.id === field.id).flatMap(entry => (Array.isArray(entry.value) ? entry.value as TaskUser[] : [])))
      : (field.type_config?.options ?? []).map(option => ({ id: option.id, name: option.name ?? option.label ?? option.id, ...(option.color ? { color: option.color } : {}) }))
    return [{ key: `cf:${field.id}`, label: field.name, kind, options }]
  })
  return [...builtIns, ...custom.sort((a, b) => a.label.localeCompare(b.label))]
}

const VIEW_OPS: Record<string, string> = {
  EQ: 'Is', NOT: 'Is not', ANY: 'Is any of', ALL: 'Is all of', 'NOT ANY': 'Is none of', 'NOT ALL': 'Is not all of',
  'IS SET': 'Is set', 'IS NOT SET': 'Is not set', GT: 'After', LT: 'Before', GTE: 'On or after', LTE: 'On or before',
}

const VIEW_FIELD_LABELS: Record<string, string> = {
  status: 'Status', tag: 'Tags', tags: 'Tags', assignee: 'Assignee', assignees: 'Assignee', priority: 'Priority',
  dueDate: 'Due date', startDate: 'Start date', dateCreated: 'Date created', dateUpdated: 'Date updated', dateClosed: 'Date closed', creator: 'Created by',
}

export function describeViewFilter(raw: unknown, fields: FilterField[]): ViewFilter | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as { op?: unknown; fields?: unknown }
  const entries = Array.isArray(record.fields) ? record.fields as Array<{ field?: unknown; op?: unknown; values?: unknown }> : []
  const rows = entries.flatMap((entry): ViewFilterRow[] => {
    if (typeof entry.field !== 'string') return []
    const key = entry.field.startsWith('cf_') ? `cf:${entry.field.slice(3)}` : entry.field
    const field = fields.find(candidate => candidate.key === key)
    const label = field?.label ?? VIEW_FIELD_LABELS[entry.field] ?? entry.field
    const op = typeof entry.op === 'string' ? VIEW_OPS[entry.op] ?? entry.op.toLowerCase() : ''
    const values = (Array.isArray(entry.values) ? entry.values : []).map(value => {
      const id = typeof value === 'object' && value !== null ? String((value as { id?: unknown }).id ?? '') : String(value)
      return field?.options.find(option => option.id === id)?.name ?? id
    })
    return [{ label, op, values }]
  })
  return rows.length === 0 ? null : { join: record.op === 'OR' ? 'or' : 'and', rows }
}
