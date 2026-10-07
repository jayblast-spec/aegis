import { getDb } from '@/lib/server/db'
import { bearer, handle, json } from '@/lib/server/http'
import { authOwner, listDecisions } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** Owner's append-only decision log, newest first. */
export async function GET(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const params = new URL(req.url).searchParams
    const limit = Number(params.get('limit') ?? 50)
    return json({ decisions: await listDecisions(db, ownerId, { limit: Number.isFinite(limit) ? limit : 50, agentId: params.get('agentId') }) })
  })
}
