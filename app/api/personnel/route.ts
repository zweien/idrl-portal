import { NextResponse } from 'next/server'
import { mockPersonnel } from '@/lib/mock-data'
import type { Person, ApiResponse, PaginatedResponse } from '@/lib/types'

// In-memory storage (would be replaced with database)
let personnel = [...mockPersonnel]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let filtered = [...personnel]

  // Filter by status
  if (status) {
    filtered = filtered.filter(p => p.status === status)
  }

  // Filter by search query
  if (search) {
    const query = search.toLowerCase()
    filtered = filtered.filter(p => 
      p.name.toLowerCase().includes(query) ||
      p.email?.toLowerCase().includes(query) ||
      p.researchAreas?.some(area => area.toLowerCase().includes(query))
    )
  }

  // Paginate
  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<Person>> = {
    success: true,
    data: {
      items,
      total,
      page,
      pageSize,
      totalPages,
    },
  }

  return NextResponse.json(response)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { success: false, error: 'Name is required' },
        { status: 400 }
      )
    }

    const newPerson: Person = {
      id: `p-${Date.now()}`,
      name: body.name,
      email: body.email,
      role: body.role || 'master',
      status: body.status || 'offline',
      workstationId: body.workstationId,
      researchAreas: body.researchAreas || [],
      dingUserId: body.dingUserId,
    }

    personnel.push(newPerson)

    const response: ApiResponse<Person> = {
      success: true,
      data: newPerson,
      message: 'Person created successfully',
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
