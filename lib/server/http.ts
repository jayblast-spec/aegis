import { DbNotConfiguredError } from './db'
import { sha256Hex } from './crypto'
import { ValidationError } from './policy'
import { HttpError } from './service'

const MAX_BODY_BYTES = 16_384

const NO_STORE = { 'Cache-Control': 'no-store' }

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h || !h.toLowerCase().startsWith('bearer ')) return null
  const token = h.slice(7).trim()
  return token || null
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large', 'Request body too large')
  if (!text.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Body must be valid JSON')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'invalid_json', 'Body must be a JSON object')
  return parsed as Record<string, unknown>
}

export function clientIpHash(req: Request): string | null {
  const ip = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!ip) return null
  return sha256Hex((process.env.AEGIS_IP_SALT ?? 'aegis') + ':' + ip)
}

/** Maps domain errors to JSON responses; never leaks internals. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status)
    if (err instanceof ValidationError) return json({ error: err.message, code: 'invalid_request' }, 400)
    if (err instanceof DbNotConfiguredError) return json({ error: 'Enforcement store not configured', code: 'not_configured' }, 503)
    console.error('[aegis] unhandled error', err instanceof Error ? err.message : err)
    return json({ error: 'Internal server error', code: 'internal' }, 500)
  }
}
