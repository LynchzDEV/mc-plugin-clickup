import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Clock, Deadline } from './deadline'

export const MAX_IMAGES_PER_REPLY = 4
export const MAX_IMAGES_PER_RESULT = 8
export const IMAGE_TIMEOUT_MS = 10000
export const MAX_IMAGE_BYTES = 3_932_160

const IMAGE_HOST_SUFFIX = '.clickup-attachments.com'
const REPLIES_FOLDER = 'replies'
const EXTENSION_BY_TYPE: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' }

export type SavedImage = { name: string; path: string }
export type ImageStore = { data: string; fetch: typeof fetch; clock: Clock }
export type DownloadedImage = { url: string; image: SavedImage }

export function isAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.username === '' && parsed.password === '' && parsed.hostname.endsWith(IMAGE_HOST_SUFFIX)
  } catch {
    return false
  }
}

function fileStem(commentId: string): string {
  return commentId.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100)
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined)
}

async function readCapped(body: ReadableStream<Uint8Array> | null, signal: AbortSignal): Promise<Uint8Array> {
  if (body === null) throw new Error('image has no body')
  const reader = body.getReader()
  const stop = () => void reader.cancel().catch(() => undefined)
  signal.addEventListener('abort', stop, { once: true })
  try {
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) return Buffer.concat(chunks)
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        stop()
        throw new Error(`image over ${MAX_IMAGE_BYTES} bytes`)
      }
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener('abort', stop)
  }
}

async function fetchImage(url: string, store: ImageStore, deadline: Deadline): Promise<{ bytes: Uint8Array; extension: string }> {
  const controller = new AbortController()
  const cancelTimer = store.clock.setTimer(Math.min(IMAGE_TIMEOUT_MS, deadline.remaining()), () => controller.abort(new Error('image download timed out')))
  const signal = AbortSignal.any([deadline.signal, controller.signal])
  try {
    const response = await store.fetch(url, { redirect: 'error', signal })
    const type = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const extension = EXTENSION_BY_TYPE[type]
    const declaredSize = Number(response.headers.get('content-length') ?? 0)
    if (!response.ok || extension === undefined || declaredSize > MAX_IMAGE_BYTES) {
      await discard(response)
      throw new Error(`image refused: ${response.status} ${type}`)
    }
    return { bytes: await readCapped(response.body, signal), extension }
  } finally {
    cancelTimer()
  }
}

async function saveImage(store: ImageStore, stem: string, bytes: Uint8Array, extension: string): Promise<SavedImage> {
  const name = `${stem}.${extension}`
  const path = `${REPLIES_FOLDER}/${name}`
  const file = join(store.data, path)
  await mkdir(join(store.data, REPLIES_FOLDER), { recursive: true })
  await rm(file, { force: true })
  await writeFile(file, bytes, { flag: 'wx' })
  return { name, path }
}

export async function downloadReplyImages(commentId: string, urls: string[], store: ImageStore, deadline: Deadline): Promise<DownloadedImage[]> {
  if (store.data === '') return []
  const stem = fileStem(commentId)
  const outcomes = await Promise.all(
    urls.map(async (url, index): Promise<DownloadedImage | null> => {
      try {
        const { bytes, extension } = await fetchImage(url, store, deadline)
        return { url, image: await saveImage(store, `${stem}-${index}`, bytes, extension) }
      } catch {
        return null
      }
    }),
  )
  return outcomes.filter((outcome): outcome is DownloadedImage => outcome !== null)
}
