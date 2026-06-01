import { NextResponse } from 'next/server'
import { mockResources } from '@/lib/mock-data'
import type { Resource, ApiResponse, PaginatedResponse } from '@/lib/types'

// In-memory storage (would be replaced with database)
let resources = [...mockResources]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  const search = searchParams.get('search')

  let filtered = [...resources]

  // Filter by type
  if (type) {
    filtered = filtered.filter(r => r.type === type)
  }

  // Filter by status
  if (status) {
    filtered = filtered.filter(r => r.status === status)
  }

  // Filter by search query
  if (search) {
    const query = search.toLowerCase()
    filtered = filtered.filter(r => 
      r.name.toLowerCase().includes(query) ||
      r.description.toLowerCase().includes(query)
    )
  }

  // Paginate
  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<Resource>> = {
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
    
    if (!body.name || !body.type) {
      return NextResponse.json(
        { success: false, error: 'Name and type are required' },
        { status: 400 }
      )
    }

    const newResource: Resource = {
      id: `r-${Date.now()}`,
      name: body.name,
      type: body.type,
      description: body.description || '',
      url: body.url,
      status: body.status || 'available',
      specs: body.specs || {},
      accessLevel: body.accessLevel || 'member',
    }

    resources.push(newResource)

    const response: ApiResponse<Resource> = {
      success: true,
      data: newResource,
      message: 'Resource created successfully',
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
