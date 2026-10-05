import { ApiError, TokenRejected, type ClickUp } from './clickup-api'
import type { Deadline } from './deadline'
import { describeViewFilter, factsOf, filterFields, type FactSource, type ListField, type ViewFilter } from './filter-catalog'
import type { CardFacts, FilterField, FilterGroup } from './filters'

const MAX_PAGES = 100
const LIST_PAGE_SIZE = 100
const PAGE_WAVE = 4

export type BoardSource = { kind: 'list'; listId: string } | { kind: 'view'; viewId: string; listId: string }

export type Board = { id: string; name: string; folder: string; source: BoardSource; filters?: FilterGroup }

export type Card = {
  id: string
  name: string
  url: string
  status: string
  tags: string[]
  assignees: Array<{ initials: string; color: string }>
  subtaskCount: number
  commentCount?: number
  facts: CardFacts
}

export type Column = { status: string; color: string; tasks: Card[] }

export type LoadedBoard = { columns: Column[]; partialFilters: boolean; fields: FilterField[]; viewFilter: ViewFilter | null }

type StatusRecord = { status: string; orderindex?: number | string; color?: string }

export type ListDetail = {
  id: string
  name: string
  statuses?: StatusRecord[]
  space?: { name?: string }
  folder?: { name?: string; hidden?: boolean }
}

type TaskRecord = FactSource & {
  id: string
  name?: string
  url?: string
  subtask_count?: number | string
  comment_count?: number | string
}

export async function fetchListDetail(api: ClickUp, listId: string, deadline: Deadline): Promise<ListDetail> {
  return (await api.get(`/list/${listId}`, deadline)) as ListDetail
}

export function listPath(list: ListDetail): string {
  const parts = [
    list.space?.name,
    list.folder && !list.folder.hidden ? list.folder.name : undefined,
    list.name,
  ].filter((part): part is string => Boolean(part))
  return parts.join(' / ')
}

export async function loadBoard(api: ClickUp, board: Board, deadline: Deadline): Promise<LoadedBoard> {
  try {
    return await boardColumns(api, board, deadline)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new Error("This board's list is gone")
    throw error
  }
}

async function boardColumns(api: ClickUp, board: Board, deadline: Deadline): Promise<LoadedBoard> {
  const list = await fetchListDetail(api, board.source.listId, deadline)
  const columns = [...(list.statuses ?? [])]
    .sort((a, b) => Number(a.orderindex ?? 0) - Number(b.orderindex ?? 0))
    .map((status) => ({ status: status.status, color: status.color ?? '', tasks: [] as Card[] }))
  const byStatus = new Map(columns.map((column) => [column.status, column]))
  const extraColumns: Column[] = []
  const [{ tasks, partialFilters }, listFields, viewSettings] = await Promise.all([
    fetchTasks(api, board, deadline),
    listFieldsOf(api, board.source.listId, deadline),
    board.source.kind === 'view' ? viewFilterSource(api, board.source.viewId, deadline) : Promise.resolve(null),
  ])
  const fieldsById = new Map(listFields.map((field) => [field.id, field]))
  for (const task of tasks) {
    const card = toCard(task, fieldsById)
    const column = byStatus.get(card.status)
    if (column) {
      column.tasks.push(card)
      continue
    }
    const extra = extraColumns.find((candidate) => candidate.status === card.status)
    if (extra) extra.tasks.push(card)
    else extraColumns.push({ status: card.status, color: '', tasks: [card] })
  }
  const fields = filterFields({ statuses: list.statuses ?? [], tasks, listFields })
  const viewFilter = partialFilters ? null : describeViewFilter(viewSettings, fields)
  return { columns: [...columns, ...extraColumns], partialFilters, fields, viewFilter }
}

async function listFieldsOf(api: ClickUp, listId: string, deadline: Deadline): Promise<ListField[]> {
  try {
    const body = (await api.get(`/list/${listId}/field`, deadline)) as { fields?: ListField[] }
    return body.fields ?? []
  } catch (error) {
    if (error instanceof ApiError) return []
    throw error
  }
}

async function viewFilterSource(api: ClickUp, viewId: string, deadline: Deadline): Promise<unknown> {
  try {
    const body = (await api.get(`/view/${viewId}`, deadline)) as { view?: { filters?: unknown } }
    return body.view?.filters ?? null
  } catch (error) {
    if (error instanceof ApiError || error instanceof TokenRejected) return null
    throw error
  }
}

async function fetchTasks(api: ClickUp, board: Board, deadline: Deadline): Promise<{ tasks: TaskRecord[]; partialFilters: boolean }> {
  if (board.source.kind === 'view') {
    try {
      return { tasks: await viewTasks(api, board.source.viewId, deadline), partialFilters: false }
    } catch (error) {
      if (!isViewRefusal(error)) throw error
    }
  }
  return { tasks: await listTasks(api, board.source.listId, deadline), partialFilters: board.source.kind === 'view' }
}

function isViewRefusal(error: unknown): boolean {
  if (error instanceof TokenRejected) return true
  return error instanceof ApiError && (error.status === 403 || error.status === 404)
}

type TaskPage = { tasks: TaskRecord[]; last: boolean }

async function pagedTasks(fetchPage: (page: number) => Promise<TaskPage>): Promise<TaskRecord[]> {
  const tasks: TaskRecord[] = []
  for (let start = 0; start <= MAX_PAGES; start += PAGE_WAVE) {
    const count = Math.min(PAGE_WAVE, MAX_PAGES + 1 - start)
    const pages = await Promise.all(Array.from({ length: count }, (_, offset) => fetchPage(start + offset)))
    for (const page of pages) {
      tasks.push(...page.tasks)
      if (page.last) return tasks
    }
  }
  return tasks
}

async function viewTasks(api: ClickUp, viewId: string, deadline: Deadline): Promise<TaskRecord[]> {
  return pagedTasks(async page => {
    const body = (await api.get(`/view/${viewId}/task?page=${page}`, deadline)) as { tasks?: TaskRecord[]; last_page?: boolean }
    const tasks = body.tasks ?? []
    return { tasks, last: body.last_page !== false || tasks.length === 0 }
  })
}

async function listTasks(api: ClickUp, listId: string, deadline: Deadline): Promise<TaskRecord[]> {
  return pagedTasks(async page => {
    const body = (await api.get(`/list/${listId}/task?page=${page}&subtasks=false`, deadline)) as { tasks?: TaskRecord[] }
    const tasks = body.tasks ?? []
    return { tasks, last: tasks.length < LIST_PAGE_SIZE }
  })
}

function toCard(task: TaskRecord, fields: Map<string, ListField>): Card {
  return {
    id: String(task.id),
    name: task.name ?? '',
    url: task.url ?? `https://app.clickup.com/t/${task.id}`,
    status: task.status?.status ?? '',
    tags: (task.tags ?? []).map((tag) => tag.name ?? ''),
    assignees: (task.assignees ?? []).map((assignee) => ({
      initials: initialsOf(assignee.username ?? ''),
      color: assignee.color ?? '',
    })),
    subtaskCount: Number(task.subtask_count ?? 0),
    commentCount: task.comment_count === undefined ? undefined : Number(task.comment_count),
    facts: factsOf(task, fields),
  }
}

function initialsOf(username: string): string {
  return username
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
