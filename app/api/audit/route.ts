import { NextRequest, NextResponse } from 'next/server'
import { getAudit } from '@/lib/policyStore'

// Read the append-only decision log for a user (optionally one agent).
// GET /api/audit?userId=...&agentId=...
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('userId')
  const agentId = request.nextUrl.searchParams.get('agentId') || undefined
  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 })
  }
  const entries = getAudit(userId, agentId)
  return NextResponse.json({ count: entries.length, entries }, { status: 200 })
}
