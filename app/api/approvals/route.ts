import { NextRequest, NextResponse } from 'next/server'

// In-memory approval queue
const approvalQueue: Record<string, any[]> = {}

export async function POST(request: NextRequest) {
  try {
    const { userId, agentId, action, actionId, approved } = await request.json()

    if (!userId || !agentId || actionId === undefined || approved === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Store approval decision
    if (!approvalQueue[userId]) {
      approvalQueue[userId] = []
    }

    const decision = {
      actionId,
      agentId,
      action,
      approved,
      decidedAt: new Date().toISOString(),
    }

    approvalQueue[userId].push(decision)

    return NextResponse.json(
      {
        success: true,
        message: `Action ${approved ? 'approved' : 'denied'}`,
        decision,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Approval error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      )
    }

    const decisions = approvalQueue[userId] || []
    return NextResponse.json({ decisions }, { status: 200 })
  } catch (error) {
    console.error('Approval retrieval error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
