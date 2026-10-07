import { getDb } from '@/lib/server/db'
import { bearer, handle, json, readJson } from '@/lib/server/http'
import { authOwner, getPolicy, listAgents, setPolicy } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

async function write(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const body = await readJson(req)
    return json(await setPolicy(db, ownerId, body.agentId, body.policy))
  })
}

/** Set or replace an agent's policy. Owner key required; the agent must belong to that owner. */
export const POST = write
export const PUT = write

export async function GET(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const agentId = new URL(req.url).searchParams.get('agentId')
    if (agentId) return json(await getPolicy(db, ownerId, agentId))
    const agents = await listAgents(db, ownerId)
    return json({ policies: agents.map(a => ({ agentId: a.id, agentName: a.name, policy: a.policy })) })
  })
}
