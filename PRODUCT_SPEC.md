# Car Tracker — Product Specification

**Working name:** Car Tracker (alternatives: Garage Ledger, Odometer, TrueCost)
**Author:** Jeffrey (with Claude)
**Date:** 2026-07-08
**Status:** Approved for Phase 1 build

---

## 1. Overview & Goals

### Problem

Car ownership costs are scattered across bank statements, glove-box receipts, insurance portals, and memory. There is no single place to answer:

- *What does this car actually cost me per month / per mile?*
- *What maintenance is due, and what has already been done?*
- *Is the car worth more or less than what I've put into it?*
- *Where is my title / registration / insurance card / that repair invoice?*

### Goals

1. **Complete TCO visibility** — capture *every* cost: car payments, insurance, fuel, maintenance, repairs, registration/taxes, car washes, parking/tolls, accessories.
2. **Never miss standard maintenance** — track the factory maintenance schedule against time and mileage, log every service performed.
3. **Value awareness** — track the car's estimated market value over time against cumulative spend and (optionally) loan balance.
4. **One home for car paperwork** — attach images and documents (receipts, invoices, title, registration, insurance cards, warranty) to the vehicle or to individual records.

### Non-Goals (v1)

- Multi-user / household sharing
- OBD-II or telematics integration
- Paid valuation APIs (KBB/Black Book)
- Native mobile app (the web app is mobile-first instead)
- Automatic bank/credit-card import

---

## 2. Users

Single owner (personal use), with standard session-based authentication from day one. The data model supports **multiple vehicles** from the start — adding a second car later requires no schema changes.

---

## 3. Core Features

### F1 — Vehicle Garage

> *As an owner, I can register my car and keep its mileage current so every other feature has accurate context.*

- Add/edit vehicle: year, make, model, trim, VIN (optional), license plate (optional), purchase date, purchase price, odometer at purchase, photo.
- **Odometer log**: manual mileage entries with date. Expenses and service records may also stamp mileage, which feeds the same log.
- Current mileage = latest odometer reading from any source.

**Acceptance criteria**
- Creating a vehicle requires only year/make/model; everything else optional.
- Odometer entries must be non-decreasing per vehicle (warn, allow override for corrections).
- Vehicle profile shows purchase info, current mileage, and mileage/month rate.

### F2 — Expense Tracking

> *As an owner, I can log any car-related expense in under 15 seconds so the TCO picture stays complete.*

- Fields: date, amount, category, vehicle, odometer (optional), vendor (optional), notes (optional), attachments (Phase 3).
- **Default categories**: Car Payment, Insurance, Fuel, Maintenance, Repairs, Registration/Taxes/Fees, Car Wash/Detailing, Parking/Tolls, Accessories, Other. User can add/rename/archive custom categories.
- **Fuel extras**: optional gallons and price/gallon on Fuel expenses. MPG is derived from odometer deltas between fill-ups (full-tank assumption).

**Acceptance criteria**
- Quick-add form: date defaults to today, amount + category are the only required fields.
- Expense list filterable by category, date range, and vehicle; sortable by date/amount.
- Deleting a category is blocked if expenses reference it (archive instead).

### F3 — Recurring Costs

> *As an owner, I define my car payment and insurance once and the app logs them automatically.*

- Recurring template: name, amount, category, cadence (weekly / monthly / quarterly / semi-annual / annual), start date, optional end date (e.g., loan payoff).
- The app **materializes instances directly into the `expenses` table** (with a `recurring_cost_id` FK) as each period arrives — generated lazily on app load for any elapsed periods.
- Each instance is a real expense: editable (variable insurance premium), deletable (skipped payment), and included in all reports automatically.
- **Loan fields (optional)** on a template: principal/interest split per payment, original loan amount, APR — enables remaining-balance and equity math in F5.

**Acceptance criteria**
- Creating a template with a past start date backfills instances to the start date (user confirms).
- Editing a template only affects future instances.
- Ending/pausing a template stops generation without touching history.

### F4 — Maintenance Schedules & Service Log

> *As an owner, I can see what maintenance is due next and keep a complete service history.*

- **Schedule items**: name, interval in miles and/or months (whichever comes first), notes. Seeded with standard defaults the user tunes to the owner's manual:

  | Item | Default interval |
  |---|---|
  | Oil & filter change | 5,000 mi / 6 mo |
  | Tire rotation | 5,000 mi / 6 mo |
  | Engine air filter | 30,000 mi / 36 mo |
  | Cabin air filter | 15,000 mi / 12 mo |
  | Brake fluid | 36 mo |
  | Coolant | 60,000 mi / 60 mo |
  | Transmission service | 60,000 mi |
  | Brake pads (inspect) | 10,000 mi / 12 mo |
  | Battery (inspect/replace) | 48 mo |
  | Wiper blades | 12 mo |
  | Tires (replace) | 50,000 mi |

- **Service records**: schedule item (optional — one-off repairs allowed), date, mileage, shop/DIY, notes, linked expense (cost), attachments (Phase 3).
- **Due computation**: next due = last service (date, mileage) + interval; compare against today + current odometer. Status: OK / Due soon (within 500 mi or 30 days) / Overdue.

**Acceptance criteria**
- Maintenance page shows every schedule item with status badge and "due in X mi / Y days."
- Logging a service against an item resets its clock; cost can create a linked Maintenance/Repairs expense in one step.
- Service history is a filterable timeline per vehicle.

### F5 — Vehicle Value & Equity

> *As an owner, I can see what my car is worth versus what I've spent and what I owe.*

- **Value checkpoints**: manual entries — date, estimated value, source (KBB, Carvana, CarMax offer, dealer, other), notes.
- **Depreciation curve**: computed curve anchored at purchase price, fitted through checkpoints (exponential decay fit; standard ~15%/yr fallback when fewer than 2 checkpoints exist).
- **Equity** (when F3 loan fields are used): estimated value − remaining loan balance.
- **Cost vs. value chart**: cumulative spend line vs. estimated value curve over time.

**Acceptance criteria**
- Value page renders the curve with checkpoint markers and today's estimate.
- Adding a checkpoint immediately refits the curve.
- With no loan data, equity UI is hidden (not zeroed).

### F6 — Documents & Images

> *As an owner, everything paper about the car lives in the app.*

- Upload images (jpg/png/heic/webp) and PDFs to: a vehicle, an expense, a service record, or the standalone **document vault** (title, registration, insurance card, warranty, window sticker, purchase contract).
- Storage: **Vercel Blob**; Postgres stores metadata only (filename, mime type, size, blob URL, linked entity type + id, uploaded date, label).
- Inline image preview; PDFs open in a new tab. Delete removes blob + metadata.

**Acceptance criteria**
- Max 10 MB per file; type-validated server-side.
- Vault groups documents by label with search.
- Deleting a parent record prompts to delete or orphan its attachments to the vault.

### F7 — Dashboard & Reports

> *As an owner, one screen tells me the state of my car and my money.*

- **Headline stats**: total spend (all time), cost/month (trailing 12 mo), cost/mile, current estimated value.
- **Charts** (Recharts): spend by category (donut), spend over time (monthly stacked bars), MPG trend (line), cost vs. value (line).
- **Panels**: upcoming/overdue maintenance, recent activity feed.
- **Filters**: date range, vehicle. **Export**: expenses as CSV.

---

## 4. Data Model

PostgreSQL via Drizzle ORM. All PKs are UUIDs (`gen_random_uuid()`). All tables have `created_at`/`updated_at`. All user data rows carry `user_id` FK; vehicle-scoped rows carry `vehicle_id` FK.

```
users
  id, username (unique), password_hash (bcrypt), created_at

vehicles
  id, user_id, year, make, model, trim?, vin?, license_plate?,
  purchase_date?, purchase_price?, purchase_odometer?, photo_url?, nickname?

odometer_logs
  id, vehicle_id, reading (int), reading_date, source (manual|expense|service), source_id?

expense_categories
  id, user_id, name, is_system (bool), is_archived (bool), sort_order

expenses
  id, vehicle_id, category_id, amount (numeric 10,2), expense_date,
  odometer?, vendor?, notes?, recurring_cost_id?,
  gallons? (numeric 6,3), price_per_gallon? (numeric 5,3)   -- fuel only

recurring_costs
  id, vehicle_id, name, category_id, amount, cadence (enum), start_date, end_date?,
  is_paused (bool), last_generated_date,
  -- optional loan fields:
  principal_amount?, interest_amount?, loan_original_amount?, loan_apr?

maintenance_schedules
  id, vehicle_id, name, interval_miles?, interval_months?, notes?, is_archived

service_records
  id, vehicle_id, schedule_id?, service_date, odometer?, shop?, notes?, expense_id?

value_estimates
  id, vehicle_id, estimate_date, value (numeric 10,2), source, notes?

attachments        -- Phase 3
  id, user_id, entity_type (vehicle|expense|service_record|vault), entity_id?,
  label?, file_name, mime_type, size_bytes, blob_url, uploaded_at
```

Notes:
- Recurring instances are **rows in `expenses`** (via `recurring_cost_id`) — one source of truth for all reporting.
- `expenses.odometer` and `service_records.odometer` insert into `odometer_logs` (source-tagged) so current mileage is always `max(reading)`.
- New users get the 10 system categories seeded (`is_system = true`, renameable, archivable, not deletable).

---

## 5. API Surface

REST under `/api/*`. All non-auth routes require session auth (401 otherwise). Zod validation on every body via `drizzle-zod` insert schemas. All list endpoints accept `vehicleId` and return only the authenticated user's data.

| Group | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/user` |
| Vehicles | `GET/POST /api/vehicles`, `GET/PATCH/DELETE /api/vehicles/:id` |
| Odometer | `GET/POST /api/vehicles/:id/odometer`, `DELETE /api/odometer/:id` |
| Categories | `GET/POST /api/categories`, `PATCH /api/categories/:id` (rename/archive) |
| Expenses | `GET/POST /api/expenses` (filters: vehicleId, categoryId, from, to), `PATCH/DELETE /api/expenses/:id` |
| Recurring | `GET/POST /api/recurring`, `PATCH/DELETE /api/recurring/:id`, `POST /api/recurring/generate` (materialize elapsed instances; called on app load) |
| Maintenance | `GET/POST /api/vehicles/:id/schedules`, `PATCH/DELETE /api/schedules/:id`, `GET /api/vehicles/:id/maintenance-status` |
| Services | `GET/POST /api/vehicles/:id/services`, `PATCH/DELETE /api/services/:id` |
| Values | `GET/POST /api/vehicles/:id/values`, `DELETE /api/values/:id`, `GET /api/vehicles/:id/value-curve` |
| Attachments | `POST /api/attachments` (multipart → Vercel Blob), `GET /api/attachments?entityType&entityId`, `DELETE /api/attachments/:id` |
| Reports | `GET /api/reports/summary`, `GET /api/reports/by-category`, `GET /api/reports/over-time`, `GET /api/reports/mpg`, `GET /api/reports/export.csv` |

---

## 6. UX / Pages

Mobile-first; primary action everywhere is **quick-add expense** (floating action button on mobile, header button on desktop). Bottom navigation on mobile, sidebar on desktop.

| Route | Page |
|---|---|
| `/auth` | Login / register |
| `/` | Dashboard (headline stats, charts, maintenance panel, activity feed) |
| `/expenses` | Expense list + filters + quick-add |
| `/maintenance` | Schedule status board + service history + log-service flow |
| `/value` | Value curve, checkpoints, equity (if loan data) |
| `/documents` | Document vault (Phase 3) |
| `/vehicle/:id` | Vehicle profile, odometer log, edit |
| `/settings` | Categories, recurring cost definitions, account |

Design: shadcn/ui (new-york), Tailwind, dark/light via `next-themes`. Accent: automotive blue/steel. Charts: Recharts.

---

## 7. Tech Stack & Architecture

Mirrors the conventions of `Outwork_workout/` and `rostr_sports/`:

- **Client**: React 18 + TypeScript + Vite SPA in `client/`; Wouter routing; TanStack Query (manual invalidation, infinite stale time); shadcn/ui + Tailwind; react-hook-form + zod resolvers.
- **Server**: Express + TypeScript in `server/`; all DB access through `server/storage.ts` (`IStorage` interface); routes in `server/routes.ts`; Zod-validated input.
- **Shared**: `shared/schema.ts` — Drizzle tables + drizzle-zod schemas + inferred types, imported by both sides via `@shared/*`.
- **Auth**: Passport local strategy, `express-session` + `connect-pg-simple`, **bcrypt** password hashing from day one.
- **Database**: Neon serverless PostgreSQL; `drizzle-kit push` workflow.
- **Dev**: single `npm run dev` — Express mounts Vite middleware on port 5000.
- **Build/Deploy**: Vite → `dist/public/`, esbuild → `dist/index.cjs`; Vercel (serverless function + static assets).
- **Files**: Vercel Blob (`@vercel/blob`), server-side uploads.

**Env vars**: `DATABASE_URL`, `SESSION_SECRET`, `BLOB_READ_WRITE_TOKEN` (Phase 3).

**Path aliases**: `@/*` → `client/src/*`, `@shared/*` → `shared/*`.

---

## 8. Phased Roadmap

### Phase 1 — MVP (core ledger)
Auth (register/login/logout) · vehicle CRUD + odometer log · expense CRUD with seeded categories + fuel fields · custom categories · dashboard headline stats (total spend, cost/month, cost/mile) + spend-by-category donut + recent activity.

**Done when:** a user can register, add their car, log expenses of every category, and see accurate totals and cost/mile on the dashboard.

### Phase 2 — Automation & maintenance
Recurring cost templates + lazy instance generation + backfill · maintenance schedules with seeded defaults · service log linked to expenses · due/overdue status board · dashboard maintenance panel.

**Done when:** car payment and insurance appear automatically each month, and the maintenance page correctly shows due/overdue items that reset when a service is logged.

### Phase 3 — Documents, value & reports
Vercel Blob attachments on vehicle/expense/service + document vault · value checkpoints + depreciation curve + equity · full chart suite (spend over time, MPG, cost vs. value) · CSV export.

**Done when:** every artifact (photo/PDF) can be attached and retrieved, the value page plots curve + checkpoints, and expenses export to CSV.

---

## 9. Open Questions / Future Ideas

- **VIN decode**: free NHTSA vPIC API to auto-fill year/make/model/trim from VIN.
- **Reminders**: email or push notifications for due maintenance and upcoming recurring costs.
- **Receipt OCR**: photo of a receipt → pre-filled expense form.
- **Household sharing**: multi-user access to a shared garage.
- **Fuel price API**: regional gas price context for fill-up analysis.
- **Insurance shopping cue**: flag when insurance cost/6-mo trends up N%.
