import type {
  Floor, Zone, NewWorkstation, Person, NewsItem, Resource, User, Category,
  Feedback, FeedbackReply,
} from '@/lib/types'
import type {
  Floor as DBFloor, Zone as DBZone, Workstation as DBWorkstation,
  Person as DBPerson, NewsItem as DBNews, Resource as DBResource,
  User as DBUser, Category as DBCategory,
  Feedback as DBFeedback, FeedbackReply as DBFeedbackReply,
} from '@prisma/client'
import type { PrismaClient } from '@prisma/client'

/**
 * Author name lookup: userId → display name. Built by the API layer from a
 * batched User+Person query (Feedback/FeedbackReply have no FK to User, so we
 * can't use Prisma include — we join manually to keep posts deletable-user-safe).
 */
export type AuthorNameMap = Map<string, string>

// ===== DB → TS =====

export function toPerson(p: DBPerson): Person {
  return {
    id: p.id,
    name: p.name,
    role: p.role as Person['role'],
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    dingUserId: p.dingUserId ?? undefined,
    status: p.status as Person['status'],
    lastSeen: p.lastSeen ?? undefined,
    researchAreas: p.researchAreas ? JSON.parse(p.researchAreas) : undefined,
    avatar: p.avatar ?? undefined,
  }
}

export function toNewsItem(n: DBNews): NewsItem {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    summary: n.summary ?? undefined,
    author: n.author ?? undefined,
    date: n.date,
    tags: n.tags ? JSON.parse(n.tags) : undefined,
    imageUrl: n.imageUrl ?? undefined,
    link: n.link ?? undefined,
    pinned: n.pinned,
    order: n.order,
    status: n.status as NewsItem['status'],
    publishAt: n.publishAt ?? undefined,
    categoryId: n.categoryId ?? undefined,
  }
}

export function toResource(r: DBResource): Resource {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    url: r.url ?? undefined,
    icon: r.icon ?? undefined,
    status: r.status as Resource['status'],
    specs: r.specs ? JSON.parse(r.specs) : undefined,
    accessLevel: r.accessLevel as Resource['accessLevel'],
    order: r.order,
    categoryId: r.categoryId ?? undefined,
  }
}

export function toCategory(c: DBCategory): Category {
  return {
    id: c.id,
    name: c.name,
    kind: c.kind as Category['kind'],
    order: c.order,
  }
}

/**
 * Author display name: prefer the linked Person's name (portal convention),
 * fall back to the userId itself when the user/person isn't in the map (e.g.
 * the author's account was deleted — the post survives as an orphan).
 */
function authorName(userId: string, names: AuthorNameMap): string {
  return names.get(userId) ?? `用户:${userId.slice(-6)}`
}

/** Resolve display names for a set of userIds by batching a User+Person query. */
export async function buildAuthorNameMap(
  userIds: string[],
  prisma: PrismaClient,
): Promise<AuthorNameMap> {
  if (userIds.length === 0) return new Map()
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(userIds)] } },
    include: { person: { select: { name: true } } },
  })
  return new Map(users.map(u => [u.id, u.person?.name ?? u.externalId]))
}

export function toFeedback(f: DBFeedback, names: AuthorNameMap): Feedback {
  return {
    id: f.id,
    userId: f.userId,
    authorName: authorName(f.userId, names),
    content: f.content,
    category: f.category as Feedback['category'],
    contact: f.contact,
    status: f.status as Feedback['status'],
    replyCount: f.replyCount,
    createdAt: f.createdAt.toISOString(),
    lastReplyAt: f.lastReplyAt.toISOString(),
  }
}

export function toFeedbackReply(r: DBFeedbackReply, names: AuthorNameMap): FeedbackReply {
  return {
    id: r.id,
    feedbackId: r.feedbackId,
    userId: r.userId,
    authorName: authorName(r.userId, names),
    content: r.content,
    createdAt: r.createdAt.toISOString(),
  }
}

export function toUser(u: DBUser): User {
  return {
    id: u.id,
    provider: u.provider as User['provider'],
    externalId: u.externalId,
    role: u.role as User['role'],
    personId: u.personId ?? undefined,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }
}

export function toWorkstation(w: DBWorkstation): NewWorkstation {
  return {
    id: w.id,
    name: w.name,
    zoneId: w.zoneId,
    floorId: w.floorId,
    row: w.row,
    col: w.col,
    personId: w.personId ?? undefined,
    status: w.status as NewWorkstation['status'],
    nameCustomized: w.nameCustomized,
  }
}

export function toZone(z: DBZone & { workstations: DBWorkstation[] }): Zone {
  return {
    id: z.id,
    name: z.name,
    floorId: z.floorId,
    color: z.color,
    order: z.order,
    mode: z.mode as Zone['mode'],
    rows: z.rows,
    cols: z.cols,
    maxRows: z.maxRows,
    maxCols: z.maxCols,
    workstations: z.workstations.map(toWorkstation),
  }
}

export function toFloor(
  f: DBFloor & { zones: (DBZone & { workstations: DBWorkstation[] })[] },
): Floor {
  return {
    id: f.id,
    name: f.name,
    order: f.order,
    zones: f.zones.map(toZone),
  }
}

// ===== TS → DB =====

/**
 * Normalize a publishAt value to a canonical UTC ISO string (ending in "Z"), or
 * null. Accepts any Date-parseable input (incl. offset-bearing ISO like
 * "...+08:00"). Returns null for empty/unparseable input so the scheduler's
 * string comparison (against new Date().toISOString()) always compares
 * like-formatted UTC instants.
 */
export function normalizePublishAt(v: string | null | undefined): string | null {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export function fromPerson(p: Person) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    email: p.email ?? null,
    phone: p.phone ?? null,
    dingUserId: p.dingUserId ?? null,
    status: p.status,
    lastSeen: p.lastSeen ?? null,
    researchAreas: p.researchAreas ? JSON.stringify(p.researchAreas) : null,
    avatar: p.avatar ?? null,
  }
}

export function fromNewsItem(n: NewsItem) {
  return {
    id: n.id,
    title: n.title,
    content: n.content,
    summary: n.summary ?? null,
    author: n.author ?? null,
    date: n.date,
    tags: n.tags ? JSON.stringify(n.tags) : null,
    imageUrl: n.imageUrl ?? null,
    link: n.link ?? null,
    pinned: n.pinned ?? false,
    order: n.order ?? 0,
    status: n.status ?? 'published',
    // Normalize publishAt to a canonical UTC ISO instant (e.g. "+08:00" → "Z")
    // so the scheduler's publishDueNews string comparison against
    // new Date().toISOString() compares instants, not offset-bearing strings.
    publishAt: normalizePublishAt(n.publishAt),
    categoryId: n.categoryId ?? null,
  }
}

export function fromResource(r: Resource) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    url: r.url ?? null,
    icon: r.icon ?? null,
    status: r.status,
    specs: r.specs ? JSON.stringify(r.specs) : null,
    accessLevel: r.accessLevel,
    order: r.order ?? 0,
    categoryId: r.categoryId ?? null,
  }
}

export function fromUser(u: Omit<User, 'createdAt' | 'updatedAt'>) {
  return {
    id: u.id,
    provider: u.provider,
    externalId: u.externalId,
    role: u.role,
    personId: u.personId ?? null,
  }
}

export function fromWorkstation(w: NewWorkstation) {
  return {
    id: w.id,
    name: w.name,
    zoneId: w.zoneId,
    floorId: w.floorId,
    row: w.row,
    col: w.col,
    personId: w.personId ?? null,
    status: w.status,
    nameCustomized: w.nameCustomized ?? false,
  }
}

export function fromZone(z: Zone) {
  return {
    id: z.id,
    name: z.name,
    floorId: z.floorId,
    color: z.color,
    order: z.order,
    mode: z.mode,
    rows: z.rows,
    cols: z.cols,
    maxRows: z.maxRows,
    maxCols: z.maxCols,
  }
}
