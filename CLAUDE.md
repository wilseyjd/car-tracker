# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Express + Vite middleware on port 5000) |
| `npm run build` | Production build (client → dist/public/, server → dist/index.cjs) |
| `npm start` | Run production build |
| `npm run check` | TypeScript type checking (no tests exist) |
| `npm run db:push` | Push Drizzle schema changes to PostgreSQL (Neon) |

## Environment Variables

Required in `.env`: `DATABASE_URL` (Neon PostgreSQL), `SESSION_SECRET`. Phase 3 adds `BLOB_READ_WRITE_TOKEN` (Vercel Blob).

## What This App Is

Personal car total-cost-of-ownership tracker. See `PRODUCT_SPEC.md` for the full product spec and phased roadmap. **Phase 1 (built)**: auth, vehicle garage, odometer log, expense ledger with per-user categories, dashboard summary. **Phase 2 (planned)**: recurring costs, maintenance schedules + service log. **Phase 3 (planned)**: attachments (Vercel Blob), value/depreciation tracking, full reports + CSV export.

## Architecture

Same conventions as Outwork_workout / rostr_sports:

- **client/** — React 19 SPA, Vite, Wouter routing, TanStack Query (infinite staleTime, manual invalidation), shadcn/ui (new-york) + Tailwind 4 (CSS-first config in `client/src/index.css`), sonner for toasts.
- **server/** — Express + TypeScript. All DB access goes through `server/storage.ts` (`IStorage`). Routes in `server/routes.ts`, Zod-validated. Session auth in `server/auth.ts`: express-session + connect-pg-simple + **bcryptjs** (no Passport — session.userId directly).
- **shared/schema.ts** — Drizzle tables + drizzle-zod insert schemas + types, imported by both sides via `@shared/*`.

### Path Aliases
- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Data Model Notes
- All PKs are UUIDs (`gen_random_uuid()`).
- `expenses` is the single ledger; Phase 2 recurring instances will be expense rows with `recurring_cost_id` set.
- Odometer readings live in `odometer_logs`; expenses with an odometer value auto-insert a log row (`source: "expense"`, `sourceId: expenseId`) — kept in sync on expense update/delete.
- New users get 10 system categories seeded at registration (`is_system = true`; renameable/archivable, never deleted).
- `sessions` table is defined in the schema (connect-pg-simple uses it with `createTableIfMissing: false`).
- Money columns are `numeric` → strings in TS; parse with `parseFloat` for math.

### Client Patterns
- Query keys are URL strings joined by the default queryFn (e.g. `["/api/expenses"]`). Summary keys embed query strings (`/api/reports/summary?vehicleId=x`), so invalidation uses `predicate` matching on key prefixes — see `invalidateExpenseData()` in `ExpenseFormDialog.tsx`.
- Expense filtering is client-side (personal-scale data); the API supports server-side filters too.
- Forms are plain controlled useState (no react-hook-form yet).
- Quick-add expense is the primary action: header button on desktop, FAB on mobile (in `Layout.tsx`).
