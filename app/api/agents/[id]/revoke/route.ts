import { getDb } from '@/lib/server/db'
import { bearer, handle, json } from '@/lib/server/http'
import { authOwner, revokeAgent } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** One-click revoke: the agent's key is dead for /api/enforce from the moment this commits. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const { id } = await ctx.params
    return json(await revokeAgent(db, ownerId, id))
  })
}
