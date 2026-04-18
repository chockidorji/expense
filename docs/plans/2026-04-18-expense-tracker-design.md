# Expense Tracker — Design

**Date:** 2026-04-18
**Owner:** chockidorji@gmail.com
**Status:** Approved, ready for implementation planning

## Goal

Personal expense tracker that captures Indian bank transactions from Gmail in near real-time, supplemented by CSV statement uploads, with automatic categorization and a dashboard showing monthly spend patterns.

## Stack (locked)

- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Prisma ORM + PostgreSQL 16 (Docker locally, Hostinger VPS in prod)
- NextAuth.js v4 with Google provider (single-step OAuth, `gmail.readonly` requested upfront)
- Recharts (charts), papaparse (CSV), node-cron (scheduler)
- pnpm
- Deployment: Hostinger VPS runs Next.js (pm2) + Postgres on the same box

## Architecture decisions

1. **Cron runtime:** `node-cron` inside the Next.js server process, registered once via `instrumentation.ts`. Cron calls an internal sync function directly; `POST /api/gmail/sync` exists as a manual trigger.
2. **Gmail OAuth:** single-step — `gmail.readonly` is requested alongside profile/email at first sign-in.
3. **Data isolation:** every Prisma query goes through `db.forUser(userId)` helper that applies `where: { userId }` at the source. Not optional per-route.
4. **Secrets:** `.env` (gitignored) in dev, `/etc/expense-tracker.env` in prod. Required keys: `DATABASE_URL`, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY` (32-byte hex), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. App throws on boot if any is missing.
5. **Testing:** MVP has no test suite. Parser development uses a local `scripts/parse-fixture.ts` harness against sample email fixtures — tight feedback loop without Gmail round-trips. Vitest can be added later.

## Folder structure

```
/app
  /api
    /auth/[...nextauth]/route.ts
    /gmail/sync/route.ts          # POST — manual trigger, also callable from cron
    /transactions/route.ts         # GET list, POST create (manual)
    /transactions/[id]/route.ts    # PATCH category, DELETE
    /upload/csv/preview/route.ts   # POST — parse headers, return sample rows
    /upload/csv/import/route.ts    # POST — apply mapping, bulk insert
  /dashboard/page.tsx
  /upload/page.tsx
  /auth/signin/page.tsx
  /layout.tsx
  /page.tsx                        # redirect to /dashboard or /auth/signin
/components                        # shadcn components
/lib
  /parsers
    /index.ts                      # detectBankAndParse()
    /hdfc.ts
    /types.ts                      # ParsedTransaction, BankParser
  /categorizer.ts
  /dedup.ts
  /gmail.ts
  /crypto.ts                       # encrypt/decrypt refresh tokens
  /db.ts                           # Prisma client + forUser helper
  /auth.ts                         # NextAuth config
  /cron.ts                         # registerCronJobs()
/prisma
  /schema.prisma
  /migrations/
/scripts
  /parse-fixture.ts                # local parser test harness
  /fixtures/hdfc-debit-1.txt
/instrumentation.ts                # Next hook — calls registerCronJobs()
/docker-compose.yml                # postgres:16
/.env.example
```

## Data model (Prisma)

Key decisions:

- **Composite unique is `(userId, amount, transactionDate, merchantNormalized)`** — scoped to user, preventing cross-user collision.
- **`gmailMessageId` is `@unique`** when present — second dedup layer prevents re-ingesting the same Gmail message.
- **`TxnSource` enum** includes `EMAIL | CSV | MANUAL`.
- **`Account.needsReauth: Boolean`** flag (added to NextAuth's Account table) — set when Gmail refresh fails with `invalid_grant`.
- **NextAuth standard tables** (`User`, `Account`, `Session`, `VerificationToken`) included. `Account.refresh_token` and `Account.access_token` stored AES-256-GCM encrypted by application layer before write.

See the conversation transcript for the full Prisma schema; will be committed as `prisma/schema.prisma` in step 1.

## Gmail integration

**Sync function (called every 5 min by node-cron and by `POST /api/gmail/sync`):**

1. For each user with a linked Google account (skip `needsReauth = true`):
2. Build Gmail client: decrypt `access_token` + `refresh_token`, instantiate `google.auth.OAuth2`, attach refresh handler that re-encrypts and persists new access tokens.
3. List messages matching `from:(alerts@hdfcbank.net OR alerts@axisbank.com OR onlinesbi@sbi.co.in OR credit_cards@sbicard.com OR alerts@icicibank.com OR kmbl.alerts@kotak.com) newer_than:1d`.
4. For each message:
   - If `Transaction` exists with this `gmailMessageId`, skip.
   - Fetch full message, pass through `detectBankAndParse(rawEmail)`.
   - If parser returns null, continue (unsupported sender format).
   - Run `categorize(merchantNormalized, userId)`.
   - Insert `Transaction`. On P2002, write `DedupLog` and continue.
5. On `invalid_grant` from Google, set `Account.needsReauth = true` and surface a banner on the dashboard.

**Why `newer_than:1d` with 5-min polling:** the one-day window gives slack for brief cron outages — missed polls self-heal on the next run without bespoke state-tracking.

**Timezone:** all `transactionDate` stored as UTC instants. Parsers interpret bank-local times as IST and convert to UTC. Dashboard renders in `Asia/Kolkata`.

**Parser contract (`lib/parsers/types.ts`):**

```ts
export type ParsedTransaction = {
  amount: number;
  type: "DEBIT" | "CREDIT";
  transactionDate: Date;
  merchant: string;
  bankAccount?: string;
  referenceNumber?: string;
  bank: "HDFC" | "SBI" | "ICICI" | "AXIS" | "KOTAK";
};

export interface BankParser {
  name: ParsedTransaction["bank"];
  senderPatterns: RegExp[];
  parse(emailText: string, subject: string): ParsedTransaction | null;
}
```

## CSV upload flow

1. **Upload page** — drag-and-drop file input.
2. **Preview** — `POST /api/upload/csv/preview` streams into papaparse, returns `{ headers, sampleRows (first 5), rowCount }`. Raw CSV cached under `/tmp` keyed by a short-lived session token so re-upload isn't needed on import.
3. **Column mapper** — shadcn `Select` per required field (date, amount, merchant, optional type/account) with CSV headers as options. Preview table renders first 5 rows with the mapping applied live; rows that fail date/amount parsing are visually flagged.
4. **Import** — `POST /api/upload/csv/import` with `{ mapping, defaultType? }`. For each row: normalize, categorize, insert, catch P2002 → `DedupLog`. Response: `{ inserted, duplicates, errors: [{ row, reason }] }`.

**Amount parser** strips `₹`, `Rs.`, commas; handles `Dr`/`Cr` suffixes.
**Date parser** tries a short whitelist: `dd/MM/yyyy`, `dd-MM-yyyy`, `yyyy-MM-dd`.

## Deduplication

```ts
function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Insertion wrapper catches Prisma `P2002` (unique violation), writes to `DedupLog` with the attempted data and offending constraint, returns `{ status: "duplicate" }`. Other errors propagate.

## Categorizer

Order of resolution:

1. If `CategoryOverride(userId, merchantNormalized)` exists → return its category.
2. Otherwise, substring match against a keyword map in `lib/categorizer.ts`:
   - **food**: swiggy, zomato, dominos, mcdonalds, starbucks, restaurant, cafe, bakery
   - **transport**: uber, ola, rapido, irctc, petrol, hpcl, indian oil, metro
   - **shopping**: amazon, flipkart, myntra, ajio, meesho, decathlon
   - **bills**: airtel, jio, vi, bescom, electricity, gas, water, broadband
   - **rent**: rent, housing, landlord, nobroker
   - **groceries**: bigbasket, blinkit, zepto, dmart, grofers, reliance fresh
   - **entertainment**: netflix, prime video, hotstar, spotify, bookmyshow
   - **health**: apollo, pharmeasy, 1mg, practo, hospital, clinic
3. Fallback: `uncategorized`.

**Override flow:** editing a transaction's category PATCHes the row AND upserts `CategoryOverride(userId, merchantNormalized, newCategory)`. Does NOT retroactively re-categorize past transactions (keeps audit clean; can add an opt-in "apply to past" toggle later).

## Dashboard

Server component fetches the current month's data, hands off to client components for charts.

Layout top-to-bottom:

1. **KPI row** (3 cards): *Total spend this month*, *Top category*, *Transactions this month* — all scoped to `Asia/Kolkata` calendar month, debits only.
2. **Category pie** — `sum(amount)` grouped by category, month-to-date, debits only.
3. **30-day trend line** — daily debit totals for last 30 days.
4. **Transaction table** — server-rendered initial page, client-side filters. Columns: date, merchant, category (inline-editable shadcn Select → PATCH + override upsert), amount, type, source badge. Filters: date range, category multi-select, source, amount min/max. Pagination: 50/page, cursor on `(transactionDate desc, id desc)`.

Amount arithmetic uses `Prisma.Decimal`. Numbers are only converted to `number` when serializing chart payloads.

## Build sequence

| Step | Deliverable | Checkpoint |
|---|---|---|
| 1 | pnpm scaffold, Tailwind, shadcn init, `docker-compose.yml`, Prisma schema, migrations run, NextAuth Google provider working (single-scope), `/auth/signin` + stub `/dashboard` with auth guard | Can sign in, see stub dashboard |
| 2 | Manual txn CRUD, transaction table with filters, KPI cards, charts with real data | Can hand-enter txns and see charts |
| 3 | CSV upload page, preview, column mapper, import with dedup + DedupLog | Import real bank statement |
| 4 | Encrypt Account tokens, `lib/gmail.ts`, HDFC parser + fixtures + `scripts/parse-fixture.ts`, `POST /api/gmail/sync` manual trigger | One-click pull last day of HDFC emails |
| 5 | `instrumentation.ts` + `lib/cron.ts` registering 5-min node-cron, pm2 ecosystem file | Cron fires in dev; pm2 config ready |
| 6 | Parsers for SBI, ICICI, Axis, Kotak with fixtures | All 5 banks parse known samples |
| 7 | Category override upsert on PATCH, override list page, refined keyword map | Editing category learns for future |

**Checkpoint discipline:** halt after each step, show what runs, wait for explicit approval before the next.

## Non-goals (YAGNI)

- Multi-currency (INR only)
- Budgeting/alerts (add later if useful)
- SMS parsing (email only)
- Mobile app (web only)
- Sharing/family accounts (single-user per login; row-level scoping is for safety, not product)
- Exporting data (add later if useful)
