import { describe, expect, test } from 'bun:test'
import type { Card, Column } from '../src/board'
import { PARTIAL_FILTERS_NOTE, renderCard, renderColumns, renderEmpty, updatedAgo } from '../src/view'

function card(over: Partial<Card> = {}): Card {
  return {
    id: '86d3j8w1c',
    name: 'HerMEZ kood queue stalls after deploy',
    url: 'https://app.clickup.com/t/86d3j8w1c',
    status: 'In progress',
    tags: ['hermez'],
    assignees: [{ initials: 'JV', color: '#8062bd' }],
    subtaskCount: 2,
    commentCount: 11,
    ...over,
  }
}

const columns: Column[] = [
  { status: 'To do', color: '#87909e', tasks: [card()] },
  {
    status: 'In progress',
    color: '#4a8fe0',
    tasks: [card({ id: '86d3j4f8q', name: 'Products v2: competitor compare page', tags: [], assignees: [], subtaskCount: 5, commentCount: 6 })],
  },
]

describe('renderEmpty', () => {
  test('token state shows the Connect ClickUp form exactly as the approved mockup', () => {
    const html = renderEmpty('token')
    expect(html).toContain('<h2>Connect ClickUp</h2>')
    expect(html).toContain('Paste a personal token so the board can read your tasks. It stays on this machine and only this plugin can use it.')
    expect(html).toContain('ClickUp token')
    expect(html).toContain('placeholder="pk_…"')
    expect(html).toContain('ClickUp, Settings, Apps, Generate.')
    expect(html).toContain('>Connect</button>')
  })

  test('first state tells the user to pick their first board', () => {
    const html = renderEmpty('first')
    expect(html).toContain('<h2>Pick your first board</h2>')
    expect(html).toContain('Choose a List from your workspace, or paste a link to a board view you already use.')
    expect(html).toContain('>Add a board</button>')
  })
})

describe('renderColumns', () => {
  test('renders columns in order with counts, cards and both start actions', () => {
    const html = renderColumns({ columns, partialFilters: false })
    expect(html.indexOf('To do')).toBeGreaterThanOrEqual(0)
    expect(html.indexOf('To do')).toBeLessThan(html.indexOf('In progress'))
    expect(html).toContain('<em>1</em>')
    expect(html).toContain('--st:#87909e')
    expect(html).toContain('HerMEZ kood queue stalls after deploy')
    expect(html).toContain('<span class="mk-chip">hermez</span>')
    expect(html).toContain('<span class="mk-av" style="--a:#8062bd">JV</span>')
    expect(html).toContain('>Start chat</button>')
    expect(html).toContain('<span>Start terminal</span></button>')
    expect(html.match(/<section class="mk-col"/g)).toHaveLength(2)
    expect(html).not.toContain(PARTIAL_FILTERS_NOTE)
  })

  test('shows the whole-list note when the view filters could not be applied', () => {
    const html = renderColumns({ columns, partialFilters: true })
    expect(html).toContain('This board shows the whole list; ClickUp didn\'t let us apply the view\'s filters.')
    expect(html.indexOf(PARTIAL_FILTERS_NOTE)).toBeLessThan(html.indexOf('mk-cols'))
  })

  test('escapes task and tag text', () => {
    const html = renderColumns({
      columns: [{ status: 'To do', color: '', tasks: [card({ name: '<b>evil</b>', tags: ['<i>tag</i>'] })] }],
      partialFilters: false,
    })
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt;')
    expect(html).toContain('&lt;i&gt;tag&lt;/i&gt;')
    expect(html).not.toContain('<b>evil</b>')
  })
})

describe('renderCard', () => {
  test('the card itself is the keyboard focus target so :focus-within reveals its actions', () => {
    const html = renderCard(card())
    expect(html).toContain('<article class="mk-card" data-task="86d3j8w1c" tabindex="0">')
    expect(html).toContain('>Start chat</button>')
    expect(renderCard(card(), true)).toContain('tabindex="0"')
  })

  test('assignees sit beside the title so a narrow column never pushes them out of the card', () => {
    const html = renderCard(card({ assignees: [{ initials: 'JV', color: '#8062bd' }, { initials: 'PM', color: '#3f7352' }] }))
    expect(html).toContain('<div class="mk-head"><strong>HerMEZ kood queue stalls after deploy</strong><span class="mk-crew"><span class="mk-av" style="--a:#8062bd">JV</span><span class="mk-av" style="--a:#3f7352">PM</span></span></div>')
    expect(html).toContain('<span class="mk-id">86d3j8w1c</span>')
  })

  test('a card without assignees keeps the title alone in its head', () => {
    expect(renderCard(card({ assignees: [] }))).toContain('<div class="mk-head"><strong>HerMEZ kood queue stalls after deploy</strong></div>')
  })

  test('Start terminal is an icon button that keeps its label for screen readers and tooltips', () => {
    const html = renderCard(card())
    expect(html).toContain('class="connection-button mk-icon-only" data-act="start-terminal" data-task="86d3j8w1c" title="Start terminal" aria-label="Start terminal"')
    expect(html).toContain('<span>Start terminal</span></button>')
  })
})

describe('updatedAgo', () => {
  const loadedAt = '2026-10-05T10:00:00.000Z'
  const base = Date.parse(loadedAt)
  const min = 60_000

  test('just now, minutes and hours', () => {
    expect(updatedAgo(loadedAt, base)).toBe('Updated just now')
    expect(updatedAgo(loadedAt, base + 2 * min)).toBe('Updated 2 min ago')
    expect(updatedAgo(loadedAt, base + 61 * min)).toBe('Updated 1 hr ago')
    expect(updatedAgo(loadedAt, base + 120 * min)).toBe('Updated 2 hrs ago')
  })
})
