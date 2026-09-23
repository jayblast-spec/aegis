import { NextRequest, NextResponse } from 'next/server'
import { setPolicy, getPolicy, getAllPolicies } from '@/lib/policyStore'

export async function POST(request: NextRequest) {
  try {
    const { userId, agentId, policy } = await request.json()

    if (!userId || !agentId || !policy) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Store policy
    const storedPolicy = setPolicy(userId, agentId, policy)

    return NextResponse.json(
      {
        success: true,
        message: `Policy stored for agent ${agentId}`,
        policy: storedPolicy,
      },
      { status: 201 }
    )

  } catch (error) {
    console.error('Policy creation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId')
    const agentId = request.nextUrl.searchParams.get('agentId')

    if (!userId) {
      return NextResponse.json(
        { error: 'userId required' },
        { status: 400 }
      )
    }

    if (agentId) {
      // Get specific agent policy
      const policy = getPolicy(userId, agentId)
      if (!policy) {
        return NextResponse.json(
          { error: 'Policy not found' },
          { status: 404 }
        )
      }
      return NextResponse.json({ policy }, { status: 200 })
    }

    // Get all policies for user
    const policies = getAllPolicies(userId)
    return NextResponse.json({ policies }, { status: 200 })

  } catch (error) {
    console.error('Policy retrieval error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
