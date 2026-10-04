import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BOARD_ID = /^b-[0-9a-f]{8}$/

function cacheFile(dataDir: string, boardId: string): string | null {
  return dataDir !== '' && BOARD_ID.test(boardId) ? join(dataDir, 'boards', `${boardId}.json`) : null
}

export async function readCachedBoard<T>(dataDir: string, boardId: string): Promise<T | null> {
  const file = cacheFile(dataDir, boardId)
  if (file === null) return null
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

export async function writeCachedBoard(dataDir: string, boardId: string, value: unknown): Promise<void> {
  const file = cacheFile(dataDir, boardId)
  if (file === null) return
  await mkdir(join(dataDir, 'boards'), { recursive: true })
  await writeFile(file, JSON.stringify(value))
}

export async function dropCachedBoard(dataDir: string, boardId: string): Promise<void> {
  const file = cacheFile(dataDir, boardId)
  if (file !== null) await rm(file, { force: true })
}
