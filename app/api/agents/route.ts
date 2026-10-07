import { getDb } from '@/lib/server/db'
import { bearer, handle, json, readJson } from '@/lib/server/http'
import { authOwner, createAgent, listAgents } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    return json({ agents: await listAgents(db, ownerId) })
  })
}

/** Register an agent. Its API key is returned once and only its hash is stored. */
export async function POST(req: Request) {
  return handle(async () => {
    const db = getDb()
    const ownerId = await authOwner(db, bearer(req))
    const body = await readJson(req)
    return json(await createAgent(db, ownerId, body.name), 201)
  })
}
