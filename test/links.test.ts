import { describe, expect, test } from 'bun:test'
import { parseClickUpLink } from '../src/links'

describe('parseClickUpLink', () => {
  test('parses /v/li/ list links', () => {
    expect(parseClickUpLink('https://app.clickup.com/9012471762/v/li/65001234567')).toEqual({
      kind: 'list',
      listId: '65001234567',
    })
  })

  test('parses /v/b/ board view links', () => {
    expect(parseClickUpLink('https://app.clickup.com/9012471762/v/b/1a2b3c')).toEqual({
      kind: 'view',
      viewId: '1a2b3c',
    })
  })

  test('parses hyphenated view ids like the documented 3c-105 and 6kgye-11234', () => {
    expect(parseClickUpLink('https://app.clickup.com/9012471762/v/b/3c-105')).toEqual({
      kind: 'view',
      viewId: '3c-105',
    })
    expect(parseClickUpLink('https://app.clickup.com/9012471762/v/l/6kgye-11234')).toEqual({
      kind: 'view',
      viewId: '6kgye-11234',
    })
  })

  test('parses /v/l/ link view links', () => {
    expect(parseClickUpLink('https://app.clickup.com/9012471762/v/l/9z8y7x')).toEqual({
      kind: 'view',
      viewId: '9z8y7x',
    })
  })

  test('accepts a trailing path and query after the id', () => {
    expect(parseClickUpLink('https://app.clickup.com/901/v/li/abc123?focus=true')).toEqual({
      kind: 'list',
      listId: 'abc123',
    })
    expect(parseClickUpLink('https://app.clickup.com/901/v/b/3c-105/some/tab')).toEqual({
      kind: 'view',
      viewId: '3c-105',
    })
    expect(parseClickUpLink('https://app.clickup.com/901/v/l/vw456/#comment')).toEqual({
      kind: 'view',
      viewId: 'vw456',
    })
  })

  test('returns null for everything else', () => {
    const rejected = [
      'https://app.clickup.com/901/t/abc123',
      'https://app.clickup.com/901/v/s/abc123',
      'https://app.clickup.com/901/v/dc/abc123',
      'https://app.clickup.com/901/v/b/-abc',
      'https://app.clickup.com/901/v/b/abc-',
      'https://app.clickup.com/901/v/b/a--b',
      'https://not.clickup.com/901/v/li/abc123',
      'http://app.clickup.com/901/v/li/abc123',
      'https://app.clickup.com/901/v/li/',
      'https://app.clickup.com/901/v/li',
      'app.clickup.com/901/v/li/abc123',
      'look at this board please',
    ]
    for (const url of rejected) expect(parseClickUpLink(url)).toBeNull()
  })
})
