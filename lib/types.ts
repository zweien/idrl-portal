// IDRL Portal - Type Definitions

// ============ Personnel & Attendance ============
export type AttendanceStatus = 'present' | 'leave' | 'trip' | 'absent'

export interface Person {
  id: string
  name: string
  avatar?: string
  role: 'professor' | 'postdoc' | 'phd' | 'master' | 'undergraduate' | 'staff'
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
export type ResourceType = 'compute' | 'storage' | 'code' | 'docs' | 'other'

export interface Resource {
  id: string
  name: string
  type: ResourceType
  description: string
  url?: string
  /** string = custom icon name; null = explicitly cleared; undefined = omitted (keep existing) */
  icon?: string | null
  status: 'available' | 'maintenance' | 'restricted'
  /** Record = specs; null = explicitly cleared; undefined = omitted (keep existing) */
  specs?: Record<string, string> | null
  accessLevel: 'public' | 'member' | 'admin'
}

// ============ News & Updates ============
export type NewsType = 'paper' | 'notice' | 'event' | 'achievement'

export interface NewsItem {
  id: string
  type: NewsType
  title: string
  content: string
  summary?: string
  author?: string
  date: string
  tags?: string[]
  imageUrl?: string
  link?: string
  pinned?: boolean
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
}

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
