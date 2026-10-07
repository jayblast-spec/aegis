import 'server-only'
import { Pool, type PoolClient } from 'pg'

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>
}

/**
 * Every unit of work runs in one transaction. When `ownerId` is given, the
 * transaction-local setting `aegis.owner_id` is set first so row-level
 * security only exposes that owner's rows.
 */
export interface Db {
  tx<T>(ownerId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T>
}

class PgDb implements Db {
  constructor(private readonly pool: Pool) {}

  async tx<T>(ownerId: string | null, fn: (q: Queryable) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect()
    try {
      await client.query('begin')
      if (ownerId) await client.query("select set_config('aegis.owner_id', $1, true)", [ownerId])
      const result = await fn({
        query: async <R,>(text: string, params?: unknown[]) => {
          const res = await client.query(text, params as unknown[] | undefined)
          return { rows: res.rows as R[] }
        },
      })
      await client.query('commit')
      return result
    } catch (err) {
      await client.query('rollback').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  }
}

let override: Db | null = null
let shared: Db | null = null

/** Test hook: route all data access through an injected database. */
export function setDb(db: Db | null) {
  override = db
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super('AEGIS_DATABASE_URL is not configured')
  }
}

export function getDb(): Db {
  if (override) return override
  if (shared) return shared
  const connectionString = process.env.AEGIS_DATABASE_URL
  if (!connectionString) throw new DbNotConfiguredError()
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: { rejectUnauthorized: process.env.AEGIS_DATABASE_SSL_INSECURE === '1' ? false : true },
  })
  shared = new PgDb(pool)
  return shared
}
