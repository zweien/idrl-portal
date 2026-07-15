import type {
  Floor, Zone, NewWorkstation, Person, NewsItem, Resource, User,
} from '@/lib/types'
import type {
  Floor as DBFloor, Zone as DBZone, Workstation as DBWorkstation,
  Person as DBPerson, NewsItem as DBNews, Resource as DBResource,
  User as DBUser,
} from '@prisma/client'

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
    type: n.type as NewsItem['type'],
    title: n.title,
    content: n.content,
    summary: n.summary ?? undefined,
    author: n.author ?? undefined,
    date: n.date,
    tags: n.tags ? JSON.parse(n.tags) : undefined,
    imageUrl: n.imageUrl ?? undefined,
    link: n.link ?? undefined,
    pinned: n.pinned,
  }
}

export function toResource(r: DBResource): Resource {
  return {
    id: r.id,
    name: r.name,
    type: r.type as Resource['type'],
    description: r.description,
    url: r.url ?? undefined,
    icon: r.icon ?? undefined,
    status: r.status as Resource['status'],
    specs: r.specs ? JSON.parse(r.specs) : undefined,
    accessLevel: r.accessLevel as Resource['accessLevel'],
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
    type: n.type,
    title: n.title,
    content: n.content,
    summary: n.summary ?? null,
    author: n.author ?? null,
    date: n.date,
    tags: n.tags ? JSON.stringify(n.tags) : null,
    imageUrl: n.imageUrl ?? null,
    link: n.link ?? null,
    pinned: n.pinned ?? false,
  }
}

export function fromResource(r: Resource) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description,
    url: r.url ?? null,
    icon: r.icon ?? null,
    status: r.status,
    specs: r.specs ? JSON.stringify(r.specs) : null,
    accessLevel: r.accessLevel,
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
