import type { ClickUp } from './clickup-api'
import type { Clock, Deadline } from './deadline'
import { buildDossier } from './dossier'

export const MC_MARKER = '— Mission Control'
const TASK_ID = /^[A-Za-z0-9_-]{1,40}$/

export function isTaskId(id: unknown): id is string {
  return typeof id === 'string' && TASK_ID.test(id)
}

function taskId(id: unknown): string {
  if (!isTaskId(id)) throw new Error('Not a ClickUp task id')
  return id
}

export function askText(lines: string[]): string {
  const numbered = lines.map((line, index) => `${index + 1}. ${line}`).join('\n')
  return `ขอถามเพิ่มเติมก่อนเริ่มงานนี้นิดนึงครับ\n\n${numbered}\n\nตอบใต้คอมเมนต์นี้หรือคอมเมนต์ใหม่ได้เลยครับ\n${MC_MARKER}`
}

export async function sourceItem(api: ClickUp, id: string, deadline: Deadline, clock: Clock): Promise<{ title: string; url: string; contextMarkdown: string }> {
  const task = taskId(id)
  const body = (await api.get(`/task/${task}`, deadline)) as { name?: string; url?: string }
  const dossier = await buildDossier(api, task, { clock }, deadline)
  return { title: body.name?.trim() || task, url: body.url || `https://app.clickup.com/t/${task}`, contextMarkdown: dossier.markdown }
}

export async function sourcePost(api: ClickUp, input: { id: string; kind: 'ask'; lines: string[] }, deadline: Deadline, now: number): Promise<{ commentId: string }> {
  const task = taskId(input.id)
  const lines = (Array.isArray(input.lines) ? input.lines : []).filter((line): line is string => typeof line === 'string' && line.trim() !== '')
  if (lines.length === 0) throw new Error('Nothing to ask')
  const body = (await api.post(`/task/${task}/comment`, { comment_text: askText(lines), notify_all: true }, deadline)) as { date?: number | string }
  return { commentId: body.date === undefined ? String(now) : String(body.date) }
}
