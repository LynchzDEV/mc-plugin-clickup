import type { ViewFilter } from './filter-catalog'
import { isActive, ME, needsValues, OPERATOR_LABELS, operatorsFor, type Condition, type FieldOption, type FilterField, type FilterGroup } from './filters'
import { esc } from './view'

export type PanelState = { open: boolean; picking: number | null }

export const FILTER_STYLES = `
[data-region="filters"] { position: relative; }
.mk-filter-bar { display: flex; align-items: center; gap: 10px; margin: -6px 0 14px; position: relative; }
.mk-filter-bar input[type="search"] { flex: 0 1 280px; font-size: 13px; padding: 8px 11px; border: 0; border-radius: var(--r-sm, 8px); background: var(--field, #e2e6f0); color: inherit; }
.mk-filter-btn[data-active] { border-color: var(--accent, #8062bd); color: var(--accent, #8062bd); background: color-mix(in srgb, var(--accent, #8062bd) 10%, transparent); }
.mk-filter-count { font-size: 12px; color: var(--muted, #626e82); }
.mk-filters { position: absolute; top: 40px; left: 0; z-index: 30; width: min(760px, 100%); display: grid; gap: 10px; padding: 18px 20px; border-radius: var(--r-lg, 16px); background: var(--paper, #eaedf6); box-shadow: var(--dialog-shadow, 0 12px 35px #737ea333); }
.mk-filters > header { display: flex; align-items: center; gap: 10px; }
.mk-filters > header strong { font-size: 15px; font-weight: 500; color: var(--text-strong, #344155); }
.mk-filters > header .sp, .mk-filters > footer .sp { flex: 1; }
.mk-filters > footer { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
.mk-filter-row { display: grid; grid-template-columns: 64px minmax(120px, 170px) minmax(110px, 140px) 1fr 32px; gap: 8px; align-items: start; padding: 8px; border-radius: var(--r-md, 12px); background: color-mix(in srgb, var(--hi, #fff) 35%, var(--paper, #eaedf6)); }
.mk-filter-row select, .mk-filter-row input[type="date"] { font-size: 13px; padding: 7px 9px; border: 0; border-radius: var(--r-sm, 8px); background: var(--field, #e2e6f0); color: inherit; min-width: 0; }
.mk-filter-where { font-size: 13px; color: var(--muted, #626e82); padding-top: 7px; }
.mk-filter-where select { width: 100%; }
.mk-filter-locked { grid-template-columns: 64px auto auto 1fr; align-items: center; }
.mk-filter-locked span.mk-filter-tag { font-size: 13px; padding: 5px 9px; border-radius: var(--r-sm, 8px); background: var(--field, #e2e6f0); }
.mk-filter-from { grid-column: 2 / -1; font-size: 11px; color: var(--muted, #626e82); }
.mk-filter-values { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 32px; padding: 4px 6px; text-align: left; border: 1px solid var(--line, #dce2ee); border-radius: var(--r-sm, 8px); background: transparent; box-shadow: none; font-size: 12px; color: var(--muted, #626e82); }
.mk-filter-values b { font-weight: 500; font-size: 12px; padding: 2px 8px; border-radius: 6px; color: #fff; background: var(--c, var(--accent, #8062bd)); }
.mk-filter-picker { grid-column: 4 / 5; display: grid; gap: 6px; padding: 8px; border-radius: var(--r-md, 12px); background: var(--paper, #eaedf6); box-shadow: var(--raised, 0 4px 14px #b4c1d699); max-height: 260px; overflow: auto; }
.mk-filter-picker input { font-size: 13px; padding: 7px 9px; border: 0; border-radius: var(--r-sm, 8px); background: var(--field, #e2e6f0); color: inherit; }
.mk-filter-picker button { display: flex; align-items: center; gap: 8px; text-align: left; border: 0; box-shadow: none; background: transparent; padding: 6px 8px; border-radius: 8px; font-size: 13px; color: inherit; }
.mk-filter-picker button[aria-pressed="true"] { background: var(--purple-bg, #e6def7); color: var(--purple-ink, #6b4fb0); }
.mk-filter-picker button i { width: 10px; height: 10px; border-radius: 3px; background: var(--c, #87909e); flex: 0 0 10px; }
.mk-filter-remove { border: 0; box-shadow: none; background: transparent; color: var(--muted, #626e82); padding: 6px; border-radius: 8px; }
.mk-filter-remove:hover { color: var(--danger, #b0556a); }
.mk-filter-remove svg { width: 16px; height: 16px; }
`

export function activeCount(group: FilterGroup, viewFilter: ViewFilter | null): number {
  return (viewFilter?.rows.length ?? 0) + group.conditions.filter(isActive).length
}

export function renderFilterBar(query: string, count: number, shown: number, total: number, state: PanelState): string {
  const label = count === 0 ? 'Filters' : `${count} Filter${count === 1 ? '' : 's'}`
  const summary = shown === total ? '' : `<span class="mk-filter-count">Showing ${shown} of ${total} tasks</span>`
  return `<div class="mk-filter-bar"><button type="button" class="connection-button mk-filter-btn" data-act="filters-toggle" aria-expanded="${state.open}"${count > 0 ? ' data-active=""' : ''}>${label}</button><input type="search" data-input="board-search" placeholder="Search tasks" aria-label="Search tasks" value="${esc(query)}">${summary}</div>`
}

function optionsOf(field: FilterField | undefined): FieldOption[] {
  if (field === undefined) return []
  return field.kind === 'assignee' || field.kind === 'users' || field.kind === 'creator' ? [{ id: ME, name: 'Me' }, ...field.options] : field.options
}

function valueChips(field: FilterField | undefined, values: string[]): string {
  if (values.length === 0) return 'Select values'
  const options = optionsOf(field)
  const names = values.map(value => options.find(option => option.id === value)?.name ?? value)
  const chips = names.slice(0, 3).map((name, index) => {
    const color = options.find(option => option.id === values[index])?.color
    return `<b${color ? ` style="--c:${esc(color)}"` : ''}>${esc(name)}</b>`
  }).join('')
  return chips + (names.length > 3 ? `<span>+${names.length - 3}</span>` : '')
}

function rowHtml(condition: Condition, index: number, group: FilterGroup, fields: FilterField[], picking: boolean, firstWord: string): string {
  const field = fields.find(candidate => candidate.key === condition.field)
  const where = index === 0
    ? `<span class="mk-filter-where">${firstWord}</span>`
    : index === 1
      ? `<span class="mk-filter-where"><select data-input="filter-join" aria-label="Combine filters"><option value="and"${group.join === 'and' ? ' selected' : ''}>AND</option><option value="or"${group.join === 'or' ? ' selected' : ''}>OR</option></select></span>`
      : `<span class="mk-filter-where">${group.join.toUpperCase()}</span>`
  const fieldSelect = `<select data-input="filter-field" data-row="${index}" aria-label="Filter field">${fields.map(option => `<option value="${esc(option.key)}"${option.key === condition.field ? ' selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`
  const ops = field ? operatorsFor(field.kind, field.key) : []
  const opSelect = `<select data-input="filter-op" data-row="${index}" aria-label="Filter operator">${ops.map(op => `<option value="${op}"${op === condition.op ? ' selected' : ''}>${OPERATOR_LABELS[op]}</option>`).join('')}</select>`
  let value = '<span></span>'
  if (needsValues(condition.op)) {
    value = condition.op === 'before' || condition.op === 'after'
      ? `<input type="date" data-input="filter-date" data-row="${index}" aria-label="Date" value="${esc(condition.values[0] ?? '')}">`
      : `<button type="button" class="mk-filter-values" data-act="filter-values" data-row="${index}" aria-expanded="${picking}">${valueChips(field, condition.values)}</button>`
  }
  const remove = `<button type="button" class="mk-filter-remove" data-act="filter-remove" data-row="${index}" aria-label="Remove filter"><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6"/></svg></button>`
  const picker = picking && field
    ? `<div class="mk-filter-picker"><input type="search" data-input="filter-value-query" placeholder="Search…" aria-label="Search values">${optionsOf(field).map(option => `<button type="button" data-act="filter-value-toggle" data-row="${index}" data-value="${esc(option.id)}" aria-pressed="${condition.values.includes(option.id)}"${option.color ? ` style="--c:${esc(option.color)}"` : ''}><i></i>${esc(option.name)}</button>`).join('') || '<span class="muted">Nothing to pick yet</span>'}</div>`
    : ''
  return `<div class="mk-filter-row" data-row="${index}">${where}${fieldSelect}${opSelect}${value}${remove}${picker}</div>`
}

export function renderFilterPanel(group: FilterGroup, fields: FilterField[], viewFilter: ViewFilter | null, state: PanelState): string {
  if (!state.open) return ''
  const locked = (viewFilter?.rows ?? []).map((row, index) => {
    const shown = row.values.slice(0, 3).join(', ') + (row.values.length > 3 ? ` +${row.values.length - 3}` : '')
    return `<div class="mk-filter-row mk-filter-locked"><span class="mk-filter-where">${index === 0 ? 'Where' : viewFilter!.join.toUpperCase()}</span><span class="mk-filter-tag">${esc(row.label)}</span><span class="mk-filter-tag">${esc(row.op)}</span><span class="mk-filter-tag">${esc(shown)}</span><span class="mk-filter-from">From your ClickUp view. Change it in ClickUp.</span></div>`
  }).join('')
  const firstWord = locked === '' ? 'Where' : 'AND'
  const rows = group.conditions.map((condition, index) => rowHtml(condition, index, group, fields, state.picking === index, firstWord)).join('')
  const clear = group.conditions.length > 0 ? '<button type="button" class="connection-button" data-act="filters-clear">Clear all</button>' : ''
  return `<div class="mk-filters" role="dialog" aria-label="Filters"><header><strong>Filters</strong><span class="sp"></span><button type="button" class="mk-filter-remove" data-act="filters-toggle" aria-label="Close filters"><svg><use href="#close-icon"></use></svg></button></header>${locked}${rows}<footer><button type="button" class="connection-add" data-act="filter-add">+ Add filter</button><span class="sp"></span>${clear}</footer></div>`
}

export function defaultCondition(fields: FilterField[]): Condition {
  const field = fields[0]
  return field ? { field: field.key, op: operatorsFor(field.kind, field.key)[0]!, values: [] } : { field: 'status', op: 'is', values: [] }
}

export function changeField(condition: Condition, fieldKey: string, fields: FilterField[]): Condition {
  const field = fields.find(candidate => candidate.key === fieldKey)
  if (!field) return condition
  return { field: field.key, op: operatorsFor(field.kind, field.key)[0]!, values: [] }
}

export function changeOperator(condition: Condition, op: Condition['op']): Condition {
  const keepValues = needsValues(op) && needsValues(condition.op) && (op === 'before' || op === 'after') === (condition.op === 'before' || condition.op === 'after')
  return { ...condition, op, values: keepValues ? condition.values : [] }
}

export function toggleValue(condition: Condition, value: string): Condition {
  return { ...condition, values: condition.values.includes(value) ? condition.values.filter(item => item !== value) : [...condition.values, value] }
}
