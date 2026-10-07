import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import type { Db, Queryable } from '@/lib/server/db'

/**
 * A real Postgres (PGlite, in-process) with the production migration applied.
 * Every transaction runs as the restricted `aegis_app` role, exactly like
 * production, so RLS, grants and the append-only trigger are all exercised.
 */
export async function createTestDb() {
  const pg = new PGlite()
  // Supabase's API roles, so the migration's revoke block runs as in production.
  await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;`)
  const dir = join(__dirname, '..', '..', 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(dir, file), 'utf8'))
  }

  let chain: Promise<unknown> = Promise.resolve()
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }

  const q: Queryable = {
    query: async <T,>(text: string, params?: unknown[]) => {
      const res = await pg.query<T>(text, params as unknown[] | undefined)
      return { rows: res.rows }
    },
  }

  const db: Db = {
    tx: <T,>(ownerId: string | null, fn: (q: Queryable) => Promise<T>) =>
      serial(async () => {
        await pg.exec('begin')
        try {
          await pg.exec('set local role aegis_app')
          if (ownerId) await pg.query("select set_config('aegis.owner_id', $1, true)", [ownerId])
          const out = await fn(q)
          await pg.exec('commit')
          return out
        } catch (err) {
          await pg.exec('rollback')
          throw err
        }
      }),
  }

  /** Superuser access for test setup/inspection (e.g. simulating clock expiry). */
  const admin = <T,>(text: string, params?: unknown[]) => serial(async () => (await pg.query<T>(text, params as unknown[] | undefined)).rows)

  /** Run SQL as aegis_app with an optional owner context, outside the service layer. */
  const asApp = <T,>(text: string, params: unknown[] = [], ownerId: string | null = null) =>
    db.tx(ownerId, async qq => (await qq.query<T>(text, params)).rows)

  return { db, admin, asApp, close: () => pg.close() }
}
