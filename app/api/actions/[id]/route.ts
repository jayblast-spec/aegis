import { getDb } from '@/lib/server/db'
import { bearer, handle, json } from '@/lib/server/http'
import { authAgent, getActionForAgent } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** Agent polls a held action. Once approved, the first poll returns the single-use approval token. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const db = getDb()
    const auth = await authAgent(db, bearer(req))
    const { id } = await ctx.params
    return json(await getActionForAgent(db, auth, id))
  })
}
