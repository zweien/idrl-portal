import { z } from 'zod'

/**
 * Request-body schemas for mutating endpoints. zod both validates types
 * (rejecting, e.g., a numeric `id` or a malformed `tags`) AND strips unknown
 * keys, so a client cannot push extra fields through the serializer into a
 * Prisma write. zod is already a dependency (used by @hookform/resolvers);
 * these schemas centralize the API-side contracts.
 *
 * Schemas are intentionally permissive about optional fields (matching the
 * serializers' `?? null` defaults) but strict about the shapes that matter:
 * ids are strings, enums are constrained, dates are non-empty strings.
 */

const personStatus = z.enum(['present', 'leave', 'trip', 'absent'])
const personRole = z.string().min(1) // free-form 职位 title (研究员/工程师/...)

export const personSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: personRole,
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  dingUserId: z.string().nullable().optional(),
  status: personStatus,
  lastSeen: z.string().nullable().optional(),
  researchAreas: z.array(z.string()).nullable().optional(),
  avatar: z.string().nullable().optional(),
})

const newsStatus = z.enum(['draft', 'published'])

export const newsItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  summary: z.string().nullable().optional(),
  author: z.string().nullable().optional(),
  date: z.string().min(1),
  tags: z.array(z.string()).nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  link: z.string().nullable().optional(),
  pinned: z.boolean().optional(),
  order: z.number().int().optional(),
  status: newsStatus,
  publishAt: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
})

const resourceStatus = z.enum(['active', 'inactive'])
const accessLevel = z.enum(['public', 'member', 'admin'])

export const resourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  url: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  status: resourceStatus,
  specs: z.record(z.string(), z.unknown()).nullable().optional(),
  accessLevel,
  order: z.number().int().optional(),
  categoryId: z.string().nullable().optional(),
})

/** Body for PUT /api/admin-data — the full-table reseed. */
export const adminDataBodySchema = z.object({
  personnel: z.array(personSchema),
  news: z.array(newsItemSchema),
  resources: z.array(resourceSchema),
})

/** Body for POST /api/news (create). id/order are assigned server-side. */
export const createNewsBodySchema = newsItemSchema.omit({ id: true })

/** Body for PATCH /api/news/:id (partial update). */
export const updateNewsBodySchema = newsItemSchema.partial()

// ===== Feedback board =====

const feedbackCategory = z.enum(['bug', 'suggestion', 'question', 'other'])
const feedbackStatus = z.enum(['open', 'resolved'])

/** Body for POST /api/feedback (create a post). userId is taken from the session. */
export const createFeedbackBodySchema = z.object({
  content: z.string().trim().min(5, '内容至少 5 个字').max(2000, '内容不超过 2000 字'),
  category: feedbackCategory,
  contact: z.string().trim().max(200).nullable().optional(),
})

/** Body for PATCH /api/feedback/:id (admin status change). */
export const updateFeedbackBodySchema = z.object({
  status: feedbackStatus,
})

/** Body for POST /api/feedback/:id/replies (create a reply). */
export const createFeedbackReplyBodySchema = z.object({
  // trim before length checks so a whitespace-only reply is rejected.
  content: z.string().trim().min(1, '回复不能为空').max(2000, '回复不超过 2000 字'),
})
