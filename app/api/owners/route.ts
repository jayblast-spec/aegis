import { getDb } from '@/lib/server/db'
import { clientIpHash, handle, json, readJson } from '@/lib/server/http'
import { createOwner } from '@/lib/server/service'

export const dynamic = 'force-dynamic'

/** Create an owner account. The owner key is returned once and only its hash is stored. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = await readJson(req)
    const owner = await createOwner(getDb(), body.label, clientIpHash(req))
    return json(owner, 201)
  })
}
