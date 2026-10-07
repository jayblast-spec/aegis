import { getDb } from '@/lib/server/db'
import { bearer, handle, json, readJson } from '@/lib/server/http'
import { authOwner, decideApproval, listApprovals } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** Owner's approval queue (default: pending only). */
export async function GET(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const status = new URL(req.url).searchParams.get('status') ?? 'pending'
    return json({ actions: await listApprovals(db, ownerId, status) })
  })
}

/** Owner approves or denies a pending action: { actionId, approve: boolean }. */
export async function POST(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const body = await readJson(req)
    return json({ action: await decideApproval(db, ownerId, body.actionId, body.approve) })
  })
}
