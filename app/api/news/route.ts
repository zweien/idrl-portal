import { NextResponse } from 'next/server'
import { mockNews } from '@/lib/mock-data'
import type { NewsItem, ApiResponse, PaginatedResponse } from '@/lib/types'

// In-memory storage (would be replaced with database)
let news = [...mockNews]

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '20')
  const type = searchParams.get('type')
  const pinned = searchParams.get('pinned')
  const search = searchParams.get('search')

  let filtered = [...news]

  // Filter by type
  if (type) {
    filtered = filtered.filter(n => n.type === type)
  }

  // Filter by pinned
  if (pinned === 'true') {
    filtered = filtered.filter(n => n.pinned)
  }

  // Filter by search query
  if (search) {
    const query = search.toLowerCase()
    filtered = filtered.filter(n => 
      n.title.toLowerCase().includes(query) ||
      n.content.toLowerCase().includes(query) ||
      n.tags?.some(tag => tag.toLowerCase().includes(query))
    )
  }

  // Sort by pinned first, then by date
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  // Paginate
  const total = filtered.length
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize
  const items = filtered.slice(start, start + pageSize)

  const response: ApiResponse<PaginatedResponse<NewsItem>> = {
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
    
    if (!body.title || !body.type || !body.content) {
      return NextResponse.json(
        { success: false, error: 'Title, type, and content are required' },
        { status: 400 }
      )
    }

    const newNews: NewsItem = {
      id: `n-${Date.now()}`,
      type: body.type,
      title: body.title,
      content: body.content,
      summary: body.summary,
      author: body.author,
      date: body.date || new Date().toISOString().split('T')[0],
      tags: body.tags || [],
      imageUrl: body.imageUrl,
      link: body.link,
      pinned: body.pinned || false,
    }

    news.unshift(newNews) // Add to beginning

    const response: ApiResponse<NewsItem> = {
      success: true,
      data: newNews,
      message: 'News item created successfully',
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
