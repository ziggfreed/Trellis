/**
 * A tiny local HTTP server for e2e tests that stand in for web services
 * (GitHub's API, AI providers), so tests never touch the network.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeRequest {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: unknown
}

export interface FakeServer {
  /** e.g. http://127.0.0.1:54321 */
  url: string
  /** Every request received, in order. */
  requests: FakeRequest[]
  close: () => Promise<void>
}

/**
 * Start a server; `handle` gets each request (body parsed as JSON when
 * possible) and writes the response.
 */
export async function startFakeServer(
  handle: (request: FakeRequest, response: ServerResponse) => void,
): Promise<FakeServer> {
  const requests: FakeRequest[] = []
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()))
    req.on('end', () => {
      let body: unknown = raw
      try {
        body = JSON.parse(raw)
      } catch {
        // Not JSON: keep the text.
      }
      const request = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body }
      requests.push(request)
      handle(request, res)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  }
}

/** Send `events` as a Server-Sent Events stream, one write per event. */
export function sendEvents(response: ServerResponse, events: { event?: string; data: unknown }[]) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  for (const { event, data } of events) {
    const text = typeof data === 'string' ? data : JSON.stringify(data)
    response.write(`${event ? `event: ${event}\n` : ''}data: ${text}\n\n`)
  }
  response.end()
}

/** Split text into a few pieces, to check streaming joins them back up. */
export function pieces(text: string, size = 7): string[] {
  const parts: string[] = []
  for (let i = 0; i < text.length; i += size) parts.push(text.slice(i, i + size))
  return parts
}
