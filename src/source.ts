import type { ClickUp } from './clickup-api'
import type { Clock, Deadline } from './deadline'
import { buildDossier } from './dossier'

export const MC_MARKER = '— Mission Control'
export const ASK_HEADER = 'ขอถามเพิ่มเติมก่อนเริ่มงานนี้นิดนึงครับ'
const TASK_ID = /^[A-Za-z0-9_-]{1,40}$/
const MAX_TITLE = 500
const MAX_URL = 2048
const MAX_CONTEXT = 524288
const MAX_THREADS = 10
const MAX_REPLIES = 100
const MAX_REPLY_TEXT = 64000
const MAX_AUTHOR = 200
const MAX_REPLY_ID = 200

export function isTaskId(id: unknown): id is string {
  return typeof id === 'string' && TASK_ID.test(id)
}

function taskId(id: unknown): string {
  if (!isTaskId(id)) throw new Error('Not a ClickUp task id')
  return id
}

export function askText(lines: string[]): string {
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
  return `${ASK_HEADER}\n\n${numbered}\n\nตอบใต้คอมเมนต์นี้หรือคอมเมนต์ใหม่ได้เลยครับ\n${MC_MARKER}`
}

export async function sourceItem(api: ClickUp, id: string, deadline: Deadline, clock: Clock): Promise<{ title: string; url: string; contextMarkdown: string }> {
  const task = taskId(id)
  const body = (await api.get(`/task/${task}`, deadline)) as { name?: string; url?: unknown }
  const dossier = await buildDossier(api, task, { clock }, deadline)
  const url = typeof body.url === 'string' && body.url !== '' && body.url.length <= MAX_URL ? body.url : `https://app.clickup.com/t/${task}`
  return { title: (body.name?.trim() || task).slice(0, MAX_TITLE), url, contextMarkdown: dossier.markdown.slice(0, MAX_CONTEXT) }
}

export async function sourcePost(api: ClickUp, input: { id: string; kind: 'ask'; lines: string[] }, deadline: Deadline, now: number): Promise<{ commentId: string }> {
  const task = taskId(input.id)
  const lines = (Array.isArray(input.lines) ? input.lines : []).filter((line): line is string => typeof line === 'string' && line.trim() !== '')
  if (lines.length === 0) throw new Error('Nothing to ask')
  const body = (await api.post(`/task/${task}/comment`, { comment_text: askText(lines), notify_all: true }, deadline)) as { date?: number | string }
  return { commentId: body.date == null ? String(now) : String(body.date) }
}

type RawComment = { id?: string | number; date?: string | number; comment_text?: string; user?: { username?: string }; reply_count?: number | string; comment?: unknown }
type CommentList = { comments?: RawComment[] }
export type SourceReply = { id: string; author: string; text: string; images: [] }

function imageLinks(parts: unknown): string[] {
  if (!Array.isArray(parts)) return []
  return parts.flatMap((part) => {
    if (part === null || typeof part !== 'object') return []
    const item = part as { type?: string; url?: unknown; image?: { url?: unknown }; attachment?: { url?: unknown } }
    if (item.type !== 'image' && item.type !== 'attachment') return []
    const url = item.image?.url ?? item.attachment?.url ?? item.url
    return typeof url === 'string' ? [url] : []
  })
}

export function isOwnAsk(text: string): boolean {
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '')
  return lines[0] === ASK_HEADER && lines.at(-1) === MC_MARKER
}

function toReply(raw: RawComment): SourceReply {
  const text = [(raw.comment_text ?? '').trim(), ...imageLinks(raw.comment).map((url) => `Image: ${url}`)].filter((line) => line !== '').join('\n')
  return {
    id: String(raw.id).slice(0, MAX_REPLY_ID),
    author: (raw.user?.username ?? 'someone').slice(0, MAX_AUTHOR),
    text: text.slice(0, MAX_REPLY_TEXT),
    images: [],
  }
}

const dateOf = (raw: RawComment): number => Number(raw.date ?? 0)

export async function sourceReplies(api: ClickUp, input: { id: string; sinceId: string | null }, deadline: Deadline): Promise<{ replies: SourceReply[]; lastId: string | null }> {
  const task = taskId(input.id)
  const since = Number(input.sinceId ?? 0)
  const top = ((await api.get(`/task/${task}/comment`, deadline)) as CommentList).comments ?? []
  const threaded = top.filter((raw) => Number(raw.reply_count ?? 0) > 0).slice(0, MAX_THREADS)
  const threads = await Promise.all(
    threaded.map(async (raw) => ((await api.get(`/comment/${encodeURIComponent(String(raw.id))}/reply`, deadline)) as CommentList).comments ?? []),
  )
  const all = [...top, ...threads.flat()]
  const newest = all.reduce((max, raw) => Math.max(max, dateOf(raw)), since)
  const fresh = all
    .filter((raw) => dateOf(raw) > since && !isOwnAsk(raw.comment_text ?? ''))
    .sort((a, b) => dateOf(a) - dateOf(b))
    .slice(-MAX_REPLIES)
  return { replies: fresh.map(toReply), lastId: newest > since ? String(newest) : input.sinceId }
}
