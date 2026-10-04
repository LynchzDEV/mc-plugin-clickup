export type ClickUpLink = { kind: 'list'; listId: string } | { kind: 'view'; viewId: string }

const LINK_ID = '[a-z0-9]+(?:-[a-z0-9]+)*'

const viewLinkPattern = (segment: 'li' | 'b' | 'l') =>
  new RegExp(`^https:\\/\\/app\\.clickup\\.com\\/[a-z0-9]+\\/v\\/${segment}\\/(${LINK_ID})(?:$|[/?#])`)

const LIST_PATTERN = viewLinkPattern('li')
const BOARD_VIEW_PATTERN = viewLinkPattern('b')
const LINK_VIEW_PATTERN = viewLinkPattern('l')

export function parseClickUpLink(url: string): ClickUpLink | null {
  const trimmed = url.trim()
  const list = LIST_PATTERN.exec(trimmed)
  if (list) return { kind: 'list', listId: list[1] }
  const boardView = BOARD_VIEW_PATTERN.exec(trimmed)
  if (boardView) return { kind: 'view', viewId: boardView[1] }
  const linkView = LINK_VIEW_PATTERN.exec(trimmed)
  if (linkView) return { kind: 'view', viewId: linkView[1] }
  return null
}
