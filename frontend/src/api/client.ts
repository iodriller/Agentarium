const BASE = '/api'

/** Error carrying the HTTP status and parsed response body so callers can show
 *  the backend's actual reason (e.g. a 422 validation detail) instead of a
 *  generic failure. */
export class ApiError extends Error {
  status: number
  body: unknown
  constructor(message: string, status: number, body: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function _readError(res: Response, path: string, method: string): Promise<never> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* response had no JSON body */
  }
  throw new ApiError(`${method} ${path} → ${res.status}`, res.status, body)
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) await _readError(res, path, 'GET')
  return res.json() as Promise<T>
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await _readError(res, path, 'POST')
  return res.json() as Promise<T>
}

export const api = { get, post }

// Trigger a browser download of an export endpoint (returns a file attachment).
export function downloadUrl(path: string): void {
  const a = document.createElement('a')
  a.href = `${BASE}${path}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export function wsUrl(path: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws${path}`
}
