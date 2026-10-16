import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 钉钉端内免登回归：
// 1. lib/dingtalk.ts#fetchDingTalkUserByAuthCode — topapi/v2/user/getuserinfo
//    的请求形态与 errcode 分类（40078 授权码无效 / 40079 不在可见范围）。
// 2. POST /api/auth/dingtalk/exchange-authcode — 完整兑换链路（免登码 →
//    身份 → upsert User → 建会话）与各失败分支的 HTTP 语义。
// 官方文档未把 JSAPI 免登码接入 /v1.0/oauth2/userAccessToken，端内免登
// 必须走 topapi（docs/research/2026-10-16-dingtalk-client-free-login.md §2.2）。

const mockFindFirst = vi.fn()
const mockUpsert = vi.fn()
vi.mock('@/lib/db', () => ({
  prisma: {
    person: { findFirst: (...a: unknown[]) => mockFindFirst(...a) },
    user: { upsert: (...a: unknown[]) => mockUpsert(...a) },
  },
}))
vi.mock('@/lib/audit', () => ({ logAction: vi.fn(async () => {}) }))
vi.mock('@/lib/session', () => ({ saveSession: vi.fn(async () => {}) }))
vi.mock('@/lib/dingtalk-admin', () => ({
  getEnterpriseAccessToken: vi.fn(async () => 'enterprise-token'),
}))

const mockFetch = vi.fn()

const { fetchDingTalkUserByAuthCode, DingTalkFreeLoginError } = await import('@/lib/dingtalk')
const { POST } = await import('@/app/api/auth/dingtalk/exchange-authcode/route')

function post(body: unknown) {
  return POST(
    new Request('http://localhost:3500/api/auth/dingtalk/exchange-authcode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin' },
      body: JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DINGTALK_CLIENT_ID = 'test-appkey'
  process.env.DINGTALK_CLIENT_SECRET = 'test-appsecret'
  vi.stubGlobal('fetch', mockFetch)
  mockFindFirst.mockResolvedValue(null)
  mockUpsert.mockResolvedValue({ id: 'user-1', role: 'member', disabledAt: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DINGTALK_CLIENT_ID
  delete process.env.DINGTALK_CLIENT_SECRET
})

describe('fetchDingTalkUserByAuthCode', () => {
  it('posts the code to topapi/v2/user/getuserinfo with the enterprise token', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: { userid: 'u1', unionid: 'un1', name: '张三' },
    }), { status: 200 }))

    const user = await fetchDingTalkUserByAuthCode('the-auth-code', 'tok-123')

    expect(user.userid).toBe('u1')
    expect(user.unionid).toBe('un1')
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=tok-123')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ code: 'the-auth-code' })
  })

  it('throws DingTalkFreeLoginError carrying errcode 40078', async () => {
    // 注意：每次调用都新建 Response —— Response body 只能消费一次。
    mockFetch.mockImplementation(async () => new Response(JSON.stringify({
      errcode: 40078, errmsg: 'illegal temp auth code',
    }), { status: 200 }))

    await expect(fetchDingTalkUserByAuthCode('x', 'tok')).rejects.toMatchObject({
      errcode: 40078,
    })
    await expect(fetchDingTalkUserByAuthCode('x', 'tok')).rejects.toBeInstanceOf(
      DingTalkFreeLoginError,
    )
  })

  it('returns no result when DingTalk omits userid', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: {},
    }), { status: 200 }))

    await expect(fetchDingTalkUserByAuthCode('x', 'tok')).rejects.toThrow(/no userid/)
  })
})

describe('POST /api/auth/dingtalk/exchange-authcode', () => {
  it('400s when the authCode is missing', async () => {
    const res = await post({})
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('503s when DingTalk SSO is not configured', async () => {
    delete process.env.DINGTALK_CLIENT_ID
    const res = await post({ authCode: 'x' })
    expect(res.status).toBe(503)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('exchanges a valid code for a session', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: { userid: 'u1', unionid: 'un1', name: '张三' },
    }), { status: 200 }))

    const res = await post({ authCode: 'good-code' })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, role: 'member' })

    // externalId 用 unionid（与扫码链路、Person.dingUserId 一致）
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert.mock.calls[0][0].where).toEqual({
      provider_externalId: { provider: 'dingtalk', externalId: 'un1' },
    })
    expect(mockFindFirst).toHaveBeenCalledWith({ where: { dingUserId: 'un1' } })
  })

  it('falls back to userid as externalId when unionid is absent', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: { userid: 'u-only' },
    }), { status: 200 }))

    await post({ authCode: 'good-code' })
    expect(mockUpsert.mock.calls[0][0].where).toEqual({
      provider_externalId: { provider: 'dingtalk', externalId: 'u-only' },
    })
    // 没有 unionid 时不做 Person 关联（Person.dingUserId 只存 unionid）
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it('maps errcode 40078 to 400 with a readable message, code never echoed', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 40078, errmsg: 'illegal temp auth code',
    }), { status: 200 }))

    const res = await post({ authCode: 'SECRET-BADCODE' })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('免登授权码')
    expect(body.error).not.toContain('SECRET-BADCODE')
  })

  it('maps errcode 40079 (not in visible scope) to 403', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 40079, errmsg: 'auth info not exist',
    }), { status: 200 }))

    const res = await post({ authCode: 'x' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('可见范围')
  })

  it('403s a person offboarded through the departure UI', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: { userid: 'u1', unionid: 'un1' },
    }), { status: 200 }))
    mockFindFirst.mockResolvedValue({ id: 'p1', offboardedAt: new Date() })

    const res = await post({ authCode: 'x' })
    expect(res.status).toBe(403)
    // 未建会话
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('403s a banned user', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      errcode: 0, result: { userid: 'u1', unionid: 'un1' },
    }), { status: 200 }))
    mockUpsert.mockResolvedValue({ id: 'user-1', role: 'member', disabledAt: new Date() })

    const res = await post({ authCode: 'x' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'disabled' })
  })

  it('502s when the DingTalk API itself fails', async () => {
    mockFetch.mockResolvedValue(new Response('upstream 500', { status: 500 }))

    const res = await post({ authCode: 'x' })
    expect(res.status).toBe(502)
  })
})
