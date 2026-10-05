export type ImageReply =
  | { status?: number; type?: string; length?: string; chunks?: Uint8Array[]; endless?: Uint8Array }
  | 'hang'
  | 'fail'

export type ImageCall = { url: string; init: RequestInit | undefined }

export type FakeImages = { fetchImpl: typeof fetch; calls: ImageCall[]; pulls(): number }

function bodyOf(reply: Exclude<ImageReply, 'hang' | 'fail'>, onPull: () => void): ReadableStream<Uint8Array> {
  const queued = [...(reply.chunks ?? [new Uint8Array([137, 80, 78, 71])])]
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      onPull()
      if (reply.endless) return controller.enqueue(reply.endless)
      const next = queued.shift()
      if (next === undefined) controller.close()
      else controller.enqueue(next)
    },
  })
}

export function fakeImages(respond: (url: string) => ImageReply): FakeImages {
  const calls: ImageCall[] = []
  let pulls = 0
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    calls.push({ url, init })
    const reply = respond(url)
    if (reply === 'fail') return Promise.reject(new TypeError('network down'))
    if (reply === 'hang') {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
      })
    }
    const headers = new Headers()
    if (reply.type !== undefined) headers.set('content-type', reply.type)
    if (reply.length !== undefined) headers.set('content-length', reply.length)
    return Promise.resolve(new Response(bodyOf(reply, () => { pulls += 1 }), { status: reply.status ?? 200, headers }))
  }) as typeof fetch
  return { fetchImpl, calls, pulls: () => pulls }
}
