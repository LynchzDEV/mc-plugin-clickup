import { definePlugin } from '@mission-control/plugin-sdk/server'
import type { ServerContext } from '@mission-control/plugin-sdk'
import { createClickUp, type ClickUp } from './clickup-api'
import { createDeadline, realClock, type Clock, type Deadline } from './deadline'
import { fetchListDetail, listPath, loadBoard, type Board, type BoardSource } from './board'
import { buildDossier } from './dossier'
import { treeChildren, type TreeNode } from './tree'
import { parseClickUpLink } from './links'

const METHOD_TIMEOUT_MS = 25000
const BOARD_ID_PATTERN = /^b-[0-9a-f]{8}$/
const LIST_PARENT_TYPE = 6

type ViewDetail = { name?: string; parent?: { id?: string | number; type?: string | number } }
type ViewResponse = { view?: ViewDetail } & ViewDetail

export type PluginDeps = { fetch?: typeof fetch; clock?: Clock }

async function requireToken(ctx: ServerContext): Promise<string> {
  const token = await ctx.settings.get('token')
  if (!token) throw new Error('Connect ClickUp first')
  return token
}

async function readBoards(ctx: ServerContext): Promise<Board[]> {
  const raw = await ctx.settings.get('boards')
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Board[]) : []
  } catch {
    return []
  }
}

async function writeBoards(ctx: ServerContext, boards: Board[]): Promise<void> {
  await ctx.settings.set('boards', JSON.stringify(boards))
}

function newBoardId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return `b-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function isBoardInputValid(board: { name?: string; folder?: string }): boolean {
  const name = (board.name ?? '').trim()
  const folder = (board.folder ?? '').trim()
  return name.length >= 1 && name.length <= 80 && (folder.startsWith('/') || folder.startsWith('~/'))
}

export function createMethods(deps: PluginDeps = {}) {
  const clock = deps.clock ?? realClock

  async function withClickUp<T>(
    ctx: ServerContext,
    run: (api: ClickUp, deadline: Deadline) => Promise<T>,
  ): Promise<T> {
    const token = await requireToken(ctx)
    const api = createClickUp(token, { fetch: deps.fetch, clock })
    const deadline = createDeadline(METHOD_TIMEOUT_MS, clock)
    try {
      return await run(api, deadline)
    } finally {
      deadline.dispose()
    }
  }

  return {
    'token.check': async (_params: {}, ctx: ServerContext) =>
      withClickUp(ctx, async (api, deadline) => {
        const body = (await api.get('/user', deadline)) as { user?: { username?: string; email?: string } }
        return { ok: true, user: { username: body.user?.username ?? '', email: body.user?.email ?? '' } }
      }),

    'tree.children': async (params: TreeNode, ctx: ServerContext) =>
      withClickUp(ctx, (api, deadline) => treeChildren(api, params, deadline)),

    'link.resolve': async (params: { url: string }, ctx: ServerContext) =>
      withClickUp(ctx, async (api, deadline) => {
        const link = parseClickUpLink(params.url)
        if (!link) throw new Error("That doesn't look like a ClickUp list or board link")
        if (link.kind === 'list') {
          const list = await fetchListDetail(api, link.listId, deadline)
          return { source: { kind: 'list', listId: link.listId }, name: list.name, path: listPath(list) }
        }
        const body = (await api.get(`/view/${link.viewId}`, deadline)) as ViewResponse
        const view = body.view ?? body
        const parent = view.parent
        if (!parent?.id || Number(parent.type) !== LIST_PARENT_TYPE) {
          throw new Error('Only board views of a list are supported')
        }
        const listId = String(parent.id)
        const list = await fetchListDetail(api, listId, deadline)
        return {
          source: { kind: 'view', viewId: link.viewId, listId },
          name: view.name ?? list.name,
          path: listPath(list),
        }
      }),

    'boards.list': async (_params: {}, ctx: ServerContext) => readBoards(ctx),

    'boards.save': async (params: { board: { id?: string; name: string; folder: string; source: BoardSource } }, ctx: ServerContext) => {
      if (!isBoardInputValid(params.board)) throw new Error('Give the board a name and a folder')
      const boards = await readBoards(ctx)
      const id = params.board.id ?? newBoardId()
      const saved: Board = {
        id,
        name: params.board.name.trim(),
        folder: params.board.folder.trim(),
        source: params.board.source,
      }
      if (!BOARD_ID_PATTERN.test(saved.id)) throw new Error('This board was removed')
      const index = boards.findIndex((board) => board.id === saved.id)
      if (params.board.id !== undefined && index < 0) throw new Error('This board was removed')
      const next = index >= 0 ? boards.with(index, saved) : [...boards, saved]
      await writeBoards(ctx, next)
      return saved
    },

    'boards.remove': async (params: { id: string }, ctx: ServerContext) => {
      const boards = await readBoards(ctx)
      await writeBoards(ctx, boards.filter((board) => board.id !== params.id))
      return { ok: true }
    },

    'board.load': async (params: { boardId: string }, ctx: ServerContext) =>
      withClickUp(ctx, async (api, deadline) => {
        const boards = await readBoards(ctx)
        const board = boards.find((candidate) => candidate.id === params.boardId)
        if (!board) throw new Error('This board was removed')
        const loaded = await loadBoard(api, board, deadline)
        return { board, ...loaded, loadedAt: new Date(clock.now()).toISOString() }
      }),

    'task.dossier': async (params: { taskId: string }, ctx: ServerContext) =>
      withClickUp(ctx, (api, deadline) => buildDossier(api, params.taskId, { clock }, deadline)),
  }
}

export default definePlugin({ methods: createMethods() })
