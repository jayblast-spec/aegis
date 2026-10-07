import { createHash, randomBytes } from 'node:crypto'

export type KeyKind = 'owner' | 'agent' | 'approval'

const PREFIX: Record<KeyKind, string> = {
  owner: 'aeg_own_',
  agent: 'aeg_agt_',
  approval: 'aeg_apv_',
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/**
 * 256-bit random secret with a type prefix. Only its SHA-256 hash is stored;
 * a fast hash is appropriate because the input is high-entropy, not a password.
 */
export function generateSecret(kind: KeyKind): { secret: string; hash: string; prefix: string } {
  const secret = PREFIX[kind] + randomBytes(32).toString('base64url')
  return { secret, hash: sha256Hex(secret), prefix: secret.slice(0, PREFIX[kind].length + 6) }
}

export function secretKind(secret: string): KeyKind | null {
  for (const kind of Object.keys(PREFIX) as KeyKind[]) {
    if (secret.startsWith(PREFIX[kind]) && secret.length >= PREFIX[kind].length + 40 && secret.length <= 128) return kind
  }
  return null
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value as Json))
}

function sortKeys(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: { [key: string]: Json } = {}
    for (const key of Object.keys(value).sort()) {
      const v = value[key]
      if (v !== undefined) out[key] = sortKeys(v)
    }
    return out
  }
  return value
}

export interface ActionPayload {
  agentId: string
  action: string
  amountCents: number
  scopes: string[]
  params: Record<string, unknown> | null
}

/** Hash that binds an approval to one exact action: agent, action, amount, scopes and params. */
export function payloadHash(p: ActionPayload): string {
  return sha256Hex(
    canonicalJson({
      agentId: p.agentId,
      action: p.action,
      amountCents: p.amountCents,
      scopes: [...p.scopes].sort(),
      params: p.params ?? null,
    }),
  )
}
