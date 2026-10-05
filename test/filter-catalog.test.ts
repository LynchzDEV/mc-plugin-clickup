import { describe, expect, test } from 'bun:test'
import { describeViewFilter, factsOf, filterFields, type ListField } from '../src/filter-catalog'

const planning: ListField = {
  id: 'plan', name: 'Planning', type: 'drop_down',
  type_config: { options: [{ id: 'opt-s17', name: 'Sprint 17', orderindex: 0, color: '#7b68ee' }, { id: 'opt-ref', name: 'Refinement Plan', orderindex: 1 }] },
}
const logType: ListField = { id: 'log', name: 'Log Type', type: 'labels', type_config: { options: [{ id: 'l-bug', label: 'Bug' }, { id: 'l-cr', label: 'CR' }] } }
const done: ListField = { id: 'ok', name: 'Checked', type: 'checkbox' }
const notes: ListField = { id: 'txt', name: 'Notes', type: 'text' }

const task = {
  status: { status: 'in progress' },
  tags: [{ name: 'portal' }],
  assignees: [{ id: 7, username: 'Palm', color: '#123' }],
  creator: { id: 9, username: 'Mac' },
  priority: { id: '2' },
  due_date: '1791100000000', date_created: '1790000000000', date_updated: null, date_closed: null,
  custom_fields: [
    { id: 'plan', type: 'drop_down', value: 1 },
    { id: 'log', type: 'labels', value: ['l-cr'] },
    { id: 'ok', type: 'checkbox', value: 'true' },
    { id: 'txt', type: 'text', value: 'hello' },
  ],
}

describe('factsOf', () => {
  test('maps ids, priority, dates and custom field values the way filters read them', () => {
    const fields = new Map([planning, logType, done, notes].map(field => [field.id, field]))
    expect(factsOf(task, fields)).toEqual({
      status: 'in progress', tags: ['portal'], assignees: ['7'], creator: '9', priority: '2',
      dates: { due: 1791100000000, created: 1790000000000, updated: null, closed: null },
      fields: { plan: ['opt-ref'], log: ['l-cr'], ok: true, txt: null },
    })
  })
})

describe('filterFields', () => {
  test('lists the built-ins then the supported custom fields with their options', () => {
    const fields = filterFields({ statuses: [{ status: 'open', color: '#ccc' }], tasks: [task], listFields: [planning, logType, done, notes] })
    expect(fields.map(field => field.label)).toEqual(['Status', 'Tags', 'Assignee', 'Due date', 'Priority', 'Created by', 'Date closed', 'Date created', 'Date updated', 'Checked', 'Log Type', 'Planning'])
    expect(fields.find(field => field.key === 'cf:plan')?.options.map(option => option.name)).toEqual(['Sprint 17', 'Refinement Plan'])
    expect(fields.find(field => field.key === 'assignee')?.options).toEqual([{ id: '7', name: 'Palm', color: '#123' }])
    expect(fields.find(field => field.key === 'tags')?.options).toEqual([{ id: 'portal', name: 'portal' }])
  })
})

describe('describeViewFilter', () => {
  test('turns the saved ClickUp view filter into readable rows', () => {
    const fields = filterFields({ statuses: [], tasks: [], listFields: [planning] })
    const raw = { op: 'AND', fields: [{ field: 'cf_plan', op: 'NOT', values: ['opt-s17', 'opt-unknown'] }, { field: 'status', op: 'EQ', values: ['review'] }] }
    expect(describeViewFilter(raw, fields)).toEqual({ join: 'and', rows: [
      { label: 'Planning', op: 'Is not', values: ['Sprint 17', 'opt-unknown'] },
      { label: 'Status', op: 'Is', values: ['review'] },
    ] })
    expect(describeViewFilter({ op: 'AND', fields: [] }, fields)).toBeNull()
    expect(describeViewFilter(null, fields)).toBeNull()
  })
})
