import { NextRequest, NextResponse } from 'next/server'
import { requestHash } from '@/lib/enforce'
import { recordApproval, peekApproval } from '@/lib/approvalStore'

// POST: a human approves (or denies) ONE exact request. The approval is bound to a hash of
// (userId, agentId, action, cost, scopes) and is single-use — it only lets through an enforce
// call for that identical request, once.
//
// Body: { userId, agentId, action, cost, scopes?, approved }
export async function POST(request: NextRequest) {
  try {
    const { userId, agentId, action, cost, scopes, approved } = await request.json()

    if (!userId || !agentId || !action || approved === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, agentId, action, approved' },
        { status: 400 }
      )
    }
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      return NextResponse.json(
        { error: 'Approval must specify the exact numeric cost being approved' },
        { status: 400 }
      )
    }

    const hash = requestHash({ userId, agentId, action, cost, scopes })
    recordApproval(hash, Boolean(approved), { action, cost })

    return NextResponse.json(
      {
        success: true,
        message: `Request ${approved ? 'approved' : 'denied'} (single-use, bound to this exact request)`,
        requestHash: hash,
        approved: Boolean(approved),
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET: inspect the status of an approval by its request hash.
// GET /api/approvals?hash=...
export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('hash')
  if (!hash) {
    return NextResponse.json({ error: 'hash required' }, { status: 400 })
  }
  const a = peekApproval(hash)
  if (!a) return NextResponse.json({ found: false }, { status: 404 })
  return NextResponse.json(
    { found: true, approved: a.approved, used: a.used, createdAt: a.createdAt, usedAt: a.usedAt ?? null },
    { status: 200 }
  )
}
