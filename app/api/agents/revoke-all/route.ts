import { getDb } from '@/lib/server/db'
import { bearer, handle, json } from '@/lib/server/http'
import { authOwner, revokeAllAgents } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** Kill switch: revoke every active agent belonging to the owner. */
export async function POST(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    return json(await revokeAllAgents(db, ownerId))
  })
}
