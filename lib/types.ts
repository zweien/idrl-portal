// IDRL Portal - Type Definitions

// ============ Personnel & Attendance ============
export type AttendanceStatus = 'present' | 'leave' | 'trip' | 'absent'

export interface Person {
  id: string
  name: string
  avatar?: string
  /** Free-text job title/role (sourced from DingTalk's 职位 field on sync).
   * Was a fixed 6-value enum; now any string to preserve the real title. */
  role: string
  email?: string
  phone?: string
  dingUserId?: string
  workstationId?: string
  status: AttendanceStatus
  lastSeen?: string
  researchAreas?: string[]
}

export interface Workstation {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  personId?: string
  zone: 'A' | 'B' | 'C' | 'D'
}

// ============ Floor Layout ============
export interface Floor {
  id: string
  name: string
  order: number
  zones: Zone[]
}

export type ZoneMode = 'grid' | 'free'

export interface Zone {
  id: string
  name: string
  floorId: string
  color: string
  order: number
  mode: ZoneMode
  rows: number      // grid 模式：行数；free 模式：闲置（保留 0）
  cols: number      // grid 模式：列数；free 模式：闲置（保留 0）
  maxRows: number   // free 模式：栅格行上限；grid 模式：闲置（默认等于 rows）
  maxCols: number   // free 模式：栅格列上限；grid 模式：闲置（默认等于 cols）
  workstations: NewWorkstation[]
}

export type WorkstationStatus = 'occupied' | 'empty' | 'maintenance'

export interface NewWorkstation {
  id: string
  name: string
  zoneId: string
  floorId: string
  row: number
  col: number
  /** string = assigned id; null = explicitly unassigned (clears DB); undefined = omitted (stale-snapshot edit, protected) */
  personId?: string | null
  status: WorkstationStatus
  nameCustomized?: boolean
}

export interface AttendanceRecord {
  id: string
  personId: string
  date: string
  checkIn?: string
  checkOut?: string
  status: AttendanceStatus
}

// ============ Resources ============
export type AccessLevel = 'public' | 'member' | 'admin'

export interface Resource {
  id: string
  name: string
  description: string
  url?: string
  /** string = custom icon name; null = explicitly cleared; undefined = omitted (keep existing) */
  icon?: string | null
  status: 'available' | 'maintenance' | 'restricted'
  /** Record = specs; null = explicitly cleared; undefined = omitted (keep existing) */
  specs?: Record<string, string> | null
  accessLevel: AccessLevel
  categoryId?: string | null
}

// ============ News & Updates ============
export type NewsStatus = 'draft' | 'published'

export interface NewsItem {
  id: string
  title: string
  content: string
  summary?: string
  author?: string
  date: string
  tags?: string[]
  imageUrl?: string
  link?: string
  pinned?: boolean
  status: NewsStatus
  publishAt?: string | null
  categoryId?: string | null
}

// ============ Categories ============
export type CategoryKind = 'news' | 'resource'

export interface Category {
  id: string
  name: string
  kind: CategoryKind
  order: number
}

// ============ Authentication ============

// Login identity (auth): one per (provider, externalId). Linked to a Person profile.
export type AuthProvider = 'authentik' | 'dingtalk' | 'local'

export interface User {
  id: string
  provider: AuthProvider
  externalId: string // SSO subject/userId; local username for provider="local"
  role: 'admin' | 'member'
  personId?: string
  createdAt: string
  updatedAt: string
  disabledAt?: string | null
}

/** User row with the linked Person's name joined in (for the admin list). */
export type UserListItem = User & { personName?: string | null }

// Legacy client-side mock auth shape (to be removed in auth slice #6).
// Kept only so the current mock auth-context keeps compiling until #6 lands.
export interface LegacyUser {
  id: string
  username: string
  email: string
  name: string
  avatar?: string
  role: 'admin' | 'member' | 'guest'
  personId?: string
}

export interface AuthState {
  user: LegacyUser | null
  isAuthenticated: boolean
  isLoading: boolean
}

// ============ API Response Types ============
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ============ API Keys & Scheduling ============

/** Scopes assignable to an API key. Admin sessions bypass scope checks. */
export type ApiScope =
  | 'sync:members'
  | 'sync:attendance'
  | 'news:publish'
  | 'news:read'
  | 'resource:read'

/** API key row (never includes the plaintext — only the prefix + hash). */
export interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: ApiScope[]
  lastUsedAt?: string | null
  createdAt: string
  revokedAt?: string | null
  rateLimitPerMin?: number | null
}

export interface Setting {
  key: string
  value: string
}

export type SyncJob = 'sync-members' | 'sync-attendance' | 'publish-news'
export type SyncSource = 'cron' | 'api' | 'manual'

export interface SyncLog {
  id: string
  job: SyncJob
  source: SyncSource
  status: 'success' | 'error'
  message?: string | null
  stats?: Record<string, unknown> | null
  createdAt: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ============ DingTalk Integration (Future) ============
export interface DingTalkConfig {
  appKey: string
  appSecret: string
  agentId: string
  corpId: string
}

export interface DingTalkUser {
  userid: string
  name: string
  avatar?: string
  department?: number[]
  position?: string
  mobile?: string
  email?: string
}

// ============ SSO Integration (Future) ============
export interface SSOConfig {
  provider: 'authentik' | 'oauth2'
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string[]
}
