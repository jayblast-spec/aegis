import { getDb } from '@/lib/server/db'
import { bearer, handle, json, readJson } from '@/lib/server/http'
import { authAgent, enforce } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/**
 * Agents call this before acting, authenticated with their own agent key.
 * 200 ALLOWED, 202 REQUIRES_APPROVAL (a pending action is queued), 403 BLOCKED.
 * Pass `approvalToken` with the identical payload to release an approved action.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const db = getDb()
    const auth = await authAgent(db, bearer(req))
    const body = await readJson(req)
    const result = await enforce(db, auth, body)
    return json(result.body, result.status)
  })
}
