import type { Board, Card, Column } from './board'

export const PARTIAL_FILTERS_NOTE = "This board shows the whole list; ClickUp didn't let us apply the view's filters."

export type LoadedBoard = { columns: Column[]; partialFilters: boolean }

export type EmptyKind = 'token' | 'first'

export type ErrorActions = { editBoard?: boolean; removeBoard?: boolean; changeToken?: boolean }

const SYMBOLS = `
<symbol id="mk-clickup" viewBox="0 0 24 24"><defs><linearGradient id="cu1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#8930FD"/><stop offset="1" stop-color="#49CCF9"/></linearGradient><linearGradient id="cu2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FF02F0"/><stop offset="1" stop-color="#FFC800"/></linearGradient></defs><path d="M3.5 17.2 6.4 15c1.6 2 3.3 3 5.6 3s4-1 5.6-3l2.9 2.2C18.3 20.1 15.6 21.6 12 21.6s-6.3-1.5-8.5-4.4z" fill="url(#cu1)"/><path d="M12 6.4 6.6 11 4.1 8.1 12 1.4l7.9 6.7-2.5 2.9z" fill="url(#cu2)"/></symbol>
<symbol id="mk-chat" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6a1.5 1.5 0 0 1-1.5 1.5H9l-3.5 3v-3h0A1.5 1.5 0 0 1 4 11.5z"/></symbol>
<symbol id="mk-refresh" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 9A5.5 5.5 0 0 0 5.4 6.5M4.5 11a5.5 5.5 0 0 0 10.1 2.5"/><path d="M5 3.5v3h3M15 16.5v-3h-3"/></symbol>
<symbol id="mk-sub" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 4v8.5a2 2 0 0 0 2 2h8"/><path d="m12.5 12 2.5 2.5-2.5 2.5"/></symbol>
<symbol id="mk-comment" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 5.5h12v8H9l-3 2.5v-2.5H4z"/></symbol>
<symbol id="folder-icon" viewBox="0 0 20 20"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H8l1.5 2h6A1.5 1.5 0 0 1 17 8.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 14.5Z"/></symbol>
<symbol id="terminal-icon" viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="m6 8 2.5 2L6 12M10.5 12H14"/></symbol>
<symbol id="chevron-icon" viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></symbol>
<symbol id="check-icon" viewBox="0 0 20 20"><path d="m5 10.5 3.2 3L15 6.5"/></symbol>
<symbol id="close-icon" viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></symbol>`

export function renderSprite(): string {
  return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${SYMBOLS}</svg>`
}

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

const CLICKUP_LOGO = '<span class="mk-logo" style="--s:52px"><svg><use href="#mk-clickup"></use></svg></span>'

export function renderEmpty(kind: EmptyKind): string {
  if (kind === 'token') {
    return `<div class="mk-empty">${CLICKUP_LOGO}<h2>Connect ClickUp</h2><p class="muted">Paste a personal token so the board can read your tasks. It stays on this machine and only this plugin can use it.</p><form><label class="mk-field">ClickUp token<input data-input="token" type="password" placeholder="pk_…"><small>ClickUp, Settings, Apps, Generate.</small></label><button type="button" class="pill" data-act="connect">Connect</button></form></div>`
  }
  return `<div class="mk-empty">${CLICKUP_LOGO}<h2>Pick your first board</h2><p class="muted">Choose a List from your workspace, or paste a link to a board view you already use.</p><button type="button" class="pill" data-act="add-board">Add a board</button></div>`
}

export function renderBoardBar(boards: Board[], currentId: string, loadedAt: string | null, now: number): string {
  const options = boards
    .map((board) => `<option value="${esc(board.id)}"${board.id === currentId ? ' selected' : ''}>${esc(board.name)}</option>`)
    .join('')
  const current = boards.find((board) => board.id === currentId)
  const folder = current
    ? `<span class="mk-folder" title="Sessions start in this folder"><svg><use href="#folder-icon"></use></svg>${esc(current.folder)}</span><button type="button" class="connection-button" data-act="edit-board">Edit board</button>`
    : ''
  const ago = loadedAt ? updatedAgo(loadedAt, now) : 'Loading…'
  return `<div class="mk-board-bar"><select aria-label="Board" data-act="select-board">${options}<option value="__add">Add a board…</option></select>${folder}<span class="sp"></span><span class="muted">${ago}</span><button type="button" class="connection-button connection-refresh" data-act="refresh"><svg><use href="#mk-refresh"></use></svg>Refresh</button></div>`
}

export function renderColumns(loaded: LoadedBoard): string {
  const note = loaded.partialFilters ? `<p class="muted" role="note">${PARTIAL_FILTERS_NOTE}</p>` : ''
  const columns = loaded.columns
    .map((column) => {
      const tint = column.color ? ` style="--st:${esc(column.color)}"` : ''
      const cards = column.tasks.map((task) => renderCard(task)).join('')
      return `<section class="mk-col"${tint}><header><i></i>${esc(column.status)}<em>${column.tasks.length}</em></header>${cards}</section>`
    })
    .join('')
  return `${note}<div class="mk-cols">${columns}</div>`
}

export function renderCard(task: Card, gathering = false): string {
  const tags = task.tags.map((tag) => `<span class="mk-chip">${esc(tag)}</span>`).join('')
  const subtasks = task.subtaskCount > 0 ? `<span><svg><use href="#mk-sub"></use></svg>${task.subtaskCount}</span>` : ''
  const comments = task.commentCount ? `<span><svg><use href="#mk-comment"></use></svg>${task.commentCount}</span>` : ''
  const avatars = task.assignees.map((who) => `<span class="mk-av" style="--a:${esc(who.color)}">${esc(who.initials)}</span>`).join('')
  const crew = avatars ? `<span class="mk-crew">${avatars}</span>` : ''
  const acts = gathering
    ? '<span class="muted">Gathering task…</span>'
    : `<button type="button" class="connection-button primary" data-act="start-chat" data-task="${esc(task.id)}"><svg><use href="#mk-chat"></use></svg>Start chat</button><button type="button" class="connection-button mk-icon-only" data-act="start-terminal" data-task="${esc(task.id)}" title="Start terminal" aria-label="Start terminal"><svg><use href="#terminal-icon"></use></svg><span>Start terminal</span></button>`
  return `<article class="mk-card" data-task="${esc(task.id)}" tabindex="0"${gathering ? ' data-hover=""' : ''}><div class="mk-head"><strong>${esc(task.name)}</strong>${crew}</div><div class="mk-meta">${tags}<span class="mk-id">${esc(task.id)}</span><span class="sp"></span>${subtasks}${comments}</div><div class="mk-acts">${acts}</div></article>`
}

export function renderError(message: string, actions: ErrorActions = {}): string {
  const buttons = [
    '<button type="button" class="pill" data-act="retry">Retry</button>',
    actions.editBoard ? '<button type="button" class="connection-button" data-act="edit-board">Edit board</button>' : '',
    actions.removeBoard ? '<button type="button" class="connection-button" data-act="remove-board">Remove</button>' : '',
    actions.changeToken ? '<button type="button" class="connection-button" data-act="change-token">Change token</button>' : '',
  ]
    .filter(Boolean)
    .join('')
  return `<div class="mk-empty" role="alert"><h2>${esc(message)}</h2><div>${buttons}</div></div>`
}

export function updatedAgo(loadedAt: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(loadedAt)) / 60000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `Updated ${hours} hr${hours === 1 ? '' : 's'} ago`
}
