# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

IDRL Portal (智能数据研究实验室门户) — a lab information aggregation portal for tracking personnel attendance, resource links, and news/announcements. Built as a Chinese-language application (zh-CN).

## Tech Stack

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (strict mode), `@/*` path alias maps to project root
- **Styling**: Tailwind CSS v4 with `@tailwindcss/postcss`, custom oklch-based design tokens in `app/globals.css`
- **UI Components**: shadcn/ui (new-york style, RSC-enabled) — components in `components/ui/`
- **Icons**: lucide-react
- **Charts**: recharts
- **Forms**: react-hook-form + zod + @hookform/resolvers
- **Theme**: next-themes (light/dark/system, stored as `idrl-theme`)
- **Package Manager**: pnpm

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build (TypeScript errors ignored via next.config)
pnpm start        # Start production server
pnpm lint         # ESLint
```

No test framework is configured.

## Architecture

### Routing Structure

- `/` → redirects to `/login`
- `/(auth)/login` — login page, wrapped in `AuthProvider` via `(auth)/layout.tsx`
- `/dashboard` — main dashboard (stats, floor plan, news, quick-access resources)
- `/dashboard/personnel` — personnel & workstation management
- `/dashboard/resources` — resource links
- `/dashboard/news` — news & announcements
- `/dashboard/admin` — admin panel

All dashboard pages share `app/dashboard/layout.tsx` which provides `AuthProvider` + `DashboardNav` (sidebar on desktop, header on mobile). Unauthenticated users are redirected to `/login`.

### Key Patterns

- **Auth**: Client-side only via `lib/auth-context.tsx` (React Context). Uses `sessionStorage` for persistence. Mock login accepts any credentials; `admin/admin` gets admin role. SSO (Authentik, DingTalk) stubs exist but are not implemented.
- **Data**: All data is mock/static from `lib/mock-data.ts`. API routes in `app/api/` (`/api/personnel`, `/api/news`, `/api/resources`) serve mock data with pagination/filtering — in-memory, no database.
- **Types**: Centralized in `lib/types.ts` — `Person`, `Workstation`, `Resource`, `NewsItem`, `User`, `ApiResponse<T>`, `PaginatedResponse<T>`, plus DingTalk/SSO config interfaces for future integration.
- **Floor Plan**: `components/dashboard/floor-plan.tsx` renders an SVG interactive lab floor plan with zones A–D, workstation status indicators, and tooltips.
- **Design System**: Custom CSS variables in `globals.css` using oklch colors. Status tokens (`--status-online`, etc.) for attendance states. Light and dark themes fully defined. Radius uses a single `--radius` token (0.375rem) with computed variants.

### Import Conventions

- `@/components/ui/*` — shadcn/ui primitives
- `@/components/dashboard/*` — domain-specific dashboard components
- `@/lib/*` — utilities, types, mock data, auth context
- `@/hooks/*` — custom React hooks
- `cn()` from `@/lib/utils` for className merging (clsx + tailwind-merge)
