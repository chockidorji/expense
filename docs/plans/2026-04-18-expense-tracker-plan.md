# Expense Tracker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Personal expense tracker that captures Indian bank transactions from Gmail (HDFC first, then SBI/ICICI/Axis/Kotak), supports CSV statement imports, dedupes, auto-categorizes, and shows monthly spend on a dashboard.

**Architecture:** Next.js 14 (App Router) all-in-one: single Node server on Hostinger VPS runs the web app and a `node-cron` job that polls Gmail every 5 minutes. Postgres 16 on the same VPS (Docker locally in dev). NextAuth v4 with Google single-step OAuth (`gmail.readonly` requested upfront). Every query scoped to `userId` via a `db.forUser(userId)` helper. Gmail refresh/access tokens encrypted at rest (AES-256-GCM) with an env-provided key.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, shadcn/ui, Prisma, PostgreSQL 16, NextAuth v4, googleapis, Recharts, papaparse, date-fns, date-fns-tz, node-cron, pnpm.

**Design doc:** `docs/plans/2026-04-18-expense-tracker-design.md`

**Checkpoint discipline:** User instruction — halt after every Step (1..7), demonstrate the deliverable, wait for explicit "yes" before the next Step. Within a step, commits are frequent but no user checkpoint needed.

**On testing:** User opted out of a broader test suite for MVP. The only automated test-like artifacts are parser fixture runs via `scripts/parse-fixture.ts` (step 4+). Every other task uses a *Verify* block (manual check with a specific command and expected observable outcome) in place of unit tests. This is a deliberate deviation from standard TDD, accepted in the design.

---

## Step 1 — Auth + Prisma + Database

**Deliverable:** Sign in with Google works, authenticated user lands on a stub `/dashboard` page. Postgres running locally in Docker. Prisma schema migrated.

### Task 1.1: Scaffold Next.js app

**Files:** project root

**Step 1:** From `/Users/chockeydorjee/Documents/expense tracker`, run:
```bash
pnpm create next-app@14.2 . --typescript --tailwind --app --src-dir=false --import-alias "@/*" --eslint --use-pnpm
```
When prompted "directory is not empty" (because `docs/` exists), answer **yes** to continue.

**Step 2:** Verify:
```bash
pnpm dev
```
Expected: server at `http://localhost:3000`, default Next.js landing page. Stop server (Ctrl+C).

**Step 3:** Commit:
```bash
git add -A && git commit -m "chore: scaffold Next.js 14 app with TypeScript + Tailwind"
```

### Task 1.2: Add .gitignore entries

**Files:** Modify `.gitignore`

Next's template already ignores `node_modules`, `.next`, `.env*`. Append:
```
# local data
/postgres-data
/tmp-uploads
```

Commit:
```bash
git add .gitignore && git commit -m "chore: ignore local postgres data and upload tmp dirs"
```

### Task 1.3: Install runtime dependencies

```bash
pnpm add next-auth@4 @auth/prisma-adapter@1 @prisma/client @google-cloud/local-auth googleapis papaparse date-fns date-fns-tz node-cron recharts zod lucide-react
pnpm add -D prisma @types/papaparse @types/node-cron tsx
```

Verify `package.json` has all of them. Commit:
```bash
git add package.json pnpm-lock.yaml && git commit -m "chore: add runtime and dev dependencies"
```

### Task 1.4: Initialize shadcn/ui

```bash
pnpm dlx shadcn@latest init
```
Accept defaults except:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **yes**

Then add the components we'll need:
```bash
pnpm dlx shadcn@latest add button card dialog input label select table badge dropdown-menu toast sonner form
```

Commit:
```bash
git add -A && git commit -m "chore: init shadcn/ui and add base components"
```

### Task 1.5: Create docker-compose.yml for Postgres

**Files:** Create `docker-compose.yml`

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: expense-tracker-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: expense
      POSTGRES_PASSWORD: expense_dev
      POSTGRES_DB: expense_tracker
    ports:
      - "5433:5432"   # 5433 host-side to avoid clashing with any other local pg
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U expense -d expense_tracker"]
      interval: 5s
      timeout: 3s
      retries: 10
```

**Verify:**
```bash
docker compose up -d
docker compose ps
```
Expected: `expense-tracker-db` status `healthy`.

Commit:
```bash
git add docker-compose.yml && git commit -m "chore: add local Postgres via docker-compose"
```

### Task 1.6: Create .env files

**Files:** Create `.env.example` and `.env.local`

`.env.example`:
```
# Database
DATABASE_URL="postgresql://expense:expense_dev@localhost:5433/expense_tracker?schema=public"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET=""          # openssl rand -base64 32

# Encryption for Gmail tokens at rest
ENCRYPTION_KEY=""            # 64 hex chars = 32 bytes; openssl rand -hex 32

# Google OAuth (Gmail readonly)
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# App
NODE_ENV="development"
```

`.env.local` — copy `.env.example`, then generate secrets:
```bash
cp .env.example .env.local
```
Then fill:
- `NEXTAUTH_SECRET`: output of `openssl rand -base64 32`
- `ENCRYPTION_KEY`: output of `openssl rand -hex 32`
- Leave Google creds blank for now — Task 1.11 fills them.

Commit `.env.example` only (.env.local is gitignored):
```bash
git add .env.example && git commit -m "chore: add .env.example with required variables"
```

### Task 1.7: Create lib/env.ts — strict env validation

**Files:** Create `lib/env.ts`

```ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/, "ENCRYPTION_KEY must be 64 hex chars (32 bytes)"),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed — see errors above");
}

export const env = parsed.data;
```

**Why throw at module load:** matches the spec's "throw on startup if the key is missing, never fall back silently."

**Verify:** write a quick smoke script:
```bash
pnpm tsx -e 'import("./lib/env").then(m => console.log("OK:", Object.keys(m.env)))'
```
Expected: `OK: [ 'DATABASE_URL', 'NEXTAUTH_URL', ... ]`. (Google creds are still empty, but `.min(1)` will fail — temporarily fill them with placeholder `"placeholder"` to smoke-test, then revert. **Or** just defer this verify to after Task 1.11.)

Commit:
```bash
git add lib/env.ts && git commit -m "feat: strict env validation with zod"
```

### Task 1.8: Create lib/crypto.ts — AES-256-GCM helpers

**Files:** Create `lib/crypto.ts`

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(env.ENCRYPTION_KEY, "hex"); // 32 bytes

/** Encrypt a UTF-8 string, return base64 of (iv|tag|ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Decrypt the base64 produced by encrypt(). */
export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
```

**Verify** with a smoke script:
```bash
pnpm tsx -e 'import("./lib/crypto").then(({encrypt,decrypt})=>{const e=encrypt("hello");console.log("enc:",e);console.log("dec:",decrypt(e));})'
```
Expected: `dec: hello`.

Commit:
```bash
git add lib/crypto.ts && git commit -m "feat: AES-256-GCM crypto helpers for token encryption"
```

### Task 1.9: Write Prisma schema

**Files:** Create `prisma/schema.prisma`

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  createdAt     DateTime  @default(now())

  accounts      Account[]
  sessions      Session[]
  transactions  Transaction[]
  overrides     CategoryOverride[]
  dedupLogs     DedupLog[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text   // encrypted
  access_token      String? @db.Text   // encrypted
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?
  needsReauth       Boolean @default(false)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

enum TxnType   { DEBIT  CREDIT }
enum TxnSource { EMAIL  CSV  MANUAL }

model Transaction {
  id                  String    @id @default(cuid())
  userId              String
  amount              Decimal   @db.Decimal(12, 2)
  transactionDate     DateTime
  merchant            String
  merchantNormalized  String
  category            String    @default("uncategorized")
  type                TxnType
  source              TxnSource
  bankAccount         String?
  referenceNumber     String?
  gmailMessageId      String?   @unique
  rawData             Json?
  createdAt           DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, amount, transactionDate, merchantNormalized], name: "dedup_key")
  @@index([userId, transactionDate])
  @@index([userId, category])
}

model CategoryOverride {
  id                  String   @id @default(cuid())
  userId              String
  merchantNormalized  String
  category            String
  createdAt           DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, merchantNormalized])
}

model DedupLog {
  id            String   @id @default(cuid())
  userId        String
  attemptedData Json
  reason        String
  createdAt     DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
}
```

Commit:
```bash
git add prisma/schema.prisma && git commit -m "feat: Prisma schema for users, transactions, overrides, dedup log"
```

### Task 1.10: Run initial migration

```bash
pnpm prisma migrate dev --name init
```
Expected: `migrations/<timestamp>_init/migration.sql` created, Prisma client generated, no errors.

Commit (the migration folder):
```bash
git add prisma/migrations && git commit -m "feat: initial database migration"
```

### Task 1.11: Create lib/db.ts with forUser helper

**Files:** Create `lib/db.ts`

```ts
import { PrismaClient, Prisma } from "@prisma/client";

// Singleton to avoid connection storm during Next.js dev hot reload
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Returns a limited surface of prisma scoped to a user. Every call automatically
 * filters by userId. Use this instead of raw `prisma.*` in route handlers.
 */
export function forUser(userId: string) {
  return {
    transaction: {
      findMany: (args?: Omit<Prisma.TransactionFindManyArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.findMany({ ...args, where: { ...(args?.where ?? {}), userId } }),
      findFirst: (args?: Omit<Prisma.TransactionFindFirstArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.findFirst({ ...args, where: { ...(args?.where ?? {}), userId } }),
      count: (args?: Omit<Prisma.TransactionCountArgs, "where"> & { where?: Prisma.TransactionWhereInput }) =>
        prisma.transaction.count({ ...args, where: { ...(args?.where ?? {}), userId } }),
      create: (data: Omit<Prisma.TransactionUncheckedCreateInput, "userId">) =>
        prisma.transaction.create({ data: { ...data, userId } }),
      update: (args: { where: { id: string }; data: Prisma.TransactionUpdateInput }) =>
        prisma.transaction.update({ where: { id: args.where.id, userId } as any, data: args.data }),
      delete: (args: { where: { id: string } }) =>
        prisma.transaction.delete({ where: { id: args.where.id, userId } as any }),
      groupBy: (args: Prisma.TransactionGroupByArgs) =>
        prisma.transaction.groupBy({ ...args, where: { ...(args.where ?? {}), userId } } as any),
    },
    categoryOverride: {
      findMany: (args?: Omit<Prisma.CategoryOverrideFindManyArgs, "where"> & { where?: Prisma.CategoryOverrideWhereInput }) =>
        prisma.categoryOverride.findMany({ ...args, where: { ...(args?.where ?? {}), userId } }),
      upsert: (args: { where: { merchantNormalized: string }; create: Omit<Prisma.CategoryOverrideUncheckedCreateInput, "userId">; update: Prisma.CategoryOverrideUpdateInput }) =>
        prisma.categoryOverride.upsert({
          where: { userId_merchantNormalized: { userId, merchantNormalized: args.where.merchantNormalized } },
          create: { ...args.create, userId },
          update: args.update,
        }),
      delete: (args: { where: { merchantNormalized: string } }) =>
        prisma.categoryOverride.delete({
          where: { userId_merchantNormalized: { userId, merchantNormalized: args.where.merchantNormalized } },
        }),
    },
    dedupLog: {
      create: (data: Omit<Prisma.DedupLogUncheckedCreateInput, "userId">) =>
        prisma.dedupLog.create({ data: { ...data, userId } }),
    },
  };
}
```

**Note:** `update`/`delete` use the compound `{ id, userId }` hack via `as any` because Prisma's strict `WhereUniqueInput` doesn't let us mix. A safer pattern (findFirst + update-by-id) is possible but slower. This is a personal single-user app; the `as any` stays pragmatic. If this ever ships multi-tenant, revisit with `transaction()` wrappers.

Commit:
```bash
git add lib/db.ts && git commit -m "feat: prisma client singleton and forUser helper"
```

### Task 1.12: Create lib/auth.ts — NextAuth configuration

**Files:** Create `lib/auth.ts`

```ts
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./db";
import { env } from "./env";
import { encrypt } from "./crypto";

const GMAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: GMAIL_SCOPES,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  session: { strategy: "database" },
  secret: env.NEXTAUTH_SECRET,
  events: {
    // Hook runs after account row is inserted/linked. Encrypt tokens in-place.
    async linkAccount({ account }) {
      if (account.provider !== "google") return;
      const data: Record<string, unknown> = {};
      if (account.refresh_token) data.refresh_token = encrypt(account.refresh_token);
      if (account.access_token) data.access_token = encrypt(account.access_token);
      if (Object.keys(data).length === 0) return;
      await prisma.account.update({
        where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } },
        data,
      });
    },
  },
  callbacks: {
    async session({ session, user }) {
      if (session.user) (session.user as any).id = user.id;
      return session;
    },
  },
};
```

**Note on token encryption:** `linkAccount` fires once at first sign-in. Subsequent token refreshes happen inside our Gmail client (Task 4.2) which is the only place we touch tokens after this.

Commit:
```bash
git add lib/auth.ts && git commit -m "feat: NextAuth config with Google provider and token encryption at link"
```

### Task 1.13: Mount NextAuth route handler

**Files:** Create `app/api/auth/[...nextauth]/route.ts`

```ts
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

Commit:
```bash
git add app/api/auth && git commit -m "feat: mount NextAuth route handler"
```

### Task 1.14: Google Cloud OAuth app — **manual step, user action required**

This is the only truly-manual task. You will:

1. Go to https://console.cloud.google.com
2. Create (or pick) a project
3. APIs & Services → OAuth consent screen → **External**, fill in app name "Expense Tracker", support email (your Gmail), developer email. Add yourself as a test user.
4. APIs & Services → Library → enable **Gmail API**.
5. APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy the client ID and secret into `.env.local`.

(When we deploy, we'll add the production URL to the same OAuth client.)

**Verify:**
```bash
pnpm tsx -e 'import("./lib/env").then(m => console.log("GOOGLE_CLIENT_ID len:", m.env.GOOGLE_CLIENT_ID.length))'
```
Expected: a non-zero length (Google client IDs are ~72 chars).

No commit — secrets are in `.env.local` which is gitignored.

### Task 1.15: Create /auth/signin page

**Files:** Create `app/auth/signin/page.tsx`

```tsx
"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Expense Tracker</CardTitle>
          <CardDescription>Sign in with your Google account to get started.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={() => signIn("google", { callbackUrl: "/dashboard" })}>
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
```

Commit:
```bash
git add app/auth && git commit -m "feat: sign-in page with Google button"
```

### Task 1.16: Wrap app in SessionProvider

**Files:** Modify `app/layout.tsx`, create `app/providers.tsx`

`app/providers.tsx`:
```tsx
"use client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster />
    </SessionProvider>
  );
}
```

Modify `app/layout.tsx` — wrap `{children}` in `<Providers>`. Replace the default return with:
```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = { title: "Expense Tracker", description: "Personal expense tracker" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Commit:
```bash
git add app/providers.tsx app/layout.tsx && git commit -m "feat: wrap app in SessionProvider"
```

### Task 1.17: Create auth-guarded /dashboard stub and root redirect

**Files:** Create `app/dashboard/page.tsx`, replace `app/page.tsx`

`app/dashboard/page.tsx`:
```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  return (
    <main className="p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-muted-foreground mt-2">Signed in as {session.user.email}</p>
      <p className="mt-4 text-sm">Stub — charts and transactions arrive in step 2.</p>
    </main>
  );
}
```

Replace `app/page.tsx` entirely:
```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);
  redirect(session?.user ? "/dashboard" : "/auth/signin");
}
```

Commit:
```bash
git add app/dashboard app/page.tsx && git commit -m "feat: stub dashboard with auth guard and root redirect"
```

### Task 1.18: End-to-end verify sign-in

**Step 1:** Ensure Postgres is up:
```bash
docker compose up -d
```

**Step 2:** Run dev server:
```bash
pnpm dev
```

**Step 3:** Open `http://localhost:3000` in a browser. Expected flow:
- Root redirects to `/auth/signin`
- Click "Continue with Google"
- Google consent screen shows app name + **requests Gmail read-only access** (this is the key confirmation — if the consent screen does NOT ask for Gmail, the scope config is wrong)
- Approve
- Redirected to `/dashboard`, shows "Signed in as <your-email>"

**Step 4:** Verify encrypted tokens:
```bash
pnpm prisma studio
```
Open `Account` table, find your row. `refresh_token` and `access_token` columns should be long base64 strings (not `1//0...` which would be a plain Google refresh token format). If they look like plain Google tokens, the `linkAccount` event didn't fire — debug before moving on.

**Step 5:** Stop dev server. Commit nothing — verification only.

---

### Step 1 checkpoint

**Demonstrate to user:**
- `docker compose ps` shows healthy
- Browser: sign-in flow works end-to-end with Gmail scope on consent screen
- Prisma Studio shows User row and Account row with encrypted tokens

**Await user approval before proceeding to Step 2.**

---

## Step 2 — Manual Transactions + Dashboard with Real Data

**Deliverable:** User can add a transaction manually via a dialog. Dashboard shows real KPI cards, category pie, 30-day line chart, and a filterable transaction table. Inline category editing works (but override-learning comes in step 7 — for now the PATCH just updates the row).

### Task 2.1: Categorizer

**Files:** Create `lib/categorizer.ts`

```ts
import { forUser } from "./db";

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: ["swiggy", "zomato", "dominos", "mcdonalds", "starbucks", "restaurant", "cafe", "bakery", "kfc", "burger king", "pizza hut", "barbeque"],
  transport: ["uber", "ola", "rapido", "irctc", "petrol", "hpcl", "iocl", "indian oil", "bpcl", "metro", "parking", "toll"],
  shopping: ["amazon", "flipkart", "myntra", "ajio", "meesho", "decathlon", "nykaa", "croma", "reliance digital"],
  bills: ["airtel", "jio", "vodafone", "vi ", "bescom", "electricity", "water board", "broadband", "act fibernet", "tata power", "adani electricity"],
  rent: ["rent", "housing", "landlord", "nobroker"],
  groceries: ["bigbasket", "blinkit", "zepto", "dmart", "grofers", "reliance fresh", "more supermarket"],
  entertainment: ["netflix", "prime video", "hotstar", "spotify", "bookmyshow", "jiocinema", "sonyliv", "youtube premium"],
  health: ["apollo", "pharmeasy", "1mg", "practo", "hospital", "clinic", "diagnostic", "medplus", "netmeds"],
  education: ["udemy", "coursera", "byjus", "unacademy", "school", "college", "tuition"],
  travel: ["indigo", "air india", "vistara", "makemytrip", "goibibo", "cleartrip", "oyo", "airbnb", "booking.com"],
};

export function categorizeByKeywords(merchantNormalized: string): string {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => merchantNormalized.includes(kw))) return category;
  }
  return "uncategorized";
}

/**
 * Full categorize: first check user's override, fall back to keywords.
 * Called from insert paths (manual, CSV, Gmail).
 */
export async function categorize(userId: string, merchantNormalized: string): Promise<string> {
  const override = await forUser(userId).categoryOverride.findMany({ where: { merchantNormalized } });
  if (override.length > 0) return override[0].category;
  return categorizeByKeywords(merchantNormalized);
}

export const ALL_CATEGORIES = [...Object.keys(CATEGORY_KEYWORDS), "uncategorized"] as const;
```

Commit:
```bash
git add lib/categorizer.ts && git commit -m "feat: categorizer with keyword map and override lookup"
```

### Task 2.2: Dedup helpers

**Files:** Create `lib/dedup.ts`

```ts
import { Prisma } from "@prisma/client";
import { forUser } from "./db";

export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type InsertOutcome =
  | { status: "inserted"; id: string }
  | { status: "duplicate"; reason: string };

/**
 * Attempt to insert a transaction. On P2002, log to DedupLog and return duplicate.
 * Caller is responsible for building the data object (merchantNormalized, category, etc.).
 */
export async function insertOrLog(
  userId: string,
  data: Omit<Prisma.TransactionUncheckedCreateInput, "userId">,
): Promise<InsertOutcome> {
  const scoped = forUser(userId);
  try {
    const created = await scoped.transaction.create(data);
    return { status: "inserted", id: created.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const reason = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]).join(",") : "unique_violation";
      await scoped.dedupLog.create({ attemptedData: data as any, reason });
      return { status: "duplicate", reason };
    }
    throw e;
  }
}
```

Commit:
```bash
git add lib/dedup.ts && git commit -m "feat: normalizeMerchant and insertOrLog wrapper"
```

### Task 2.3: Auth helper for route handlers

**Files:** Create `lib/session.ts`

```ts
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) throw new Response("Unauthorized", { status: 401 });
  return { userId, email: session!.user!.email! };
}
```

Commit:
```bash
git add lib/session.ts && git commit -m "feat: requireUser helper for route handlers"
```

### Task 2.4: POST /api/transactions (manual create)

**Files:** Create `app/api/transactions/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { normalizeMerchant, insertOrLog } from "@/lib/dedup";
import { categorize } from "@/lib/categorizer";
import { forUser } from "@/lib/db";
import { TxnSource, TxnType } from "@prisma/client";

const CreateSchema = z.object({
  amount: z.number().positive(),
  transactionDate: z.string().datetime(),
  merchant: z.string().min(1).max(200),
  type: z.nativeEnum(TxnType),
  category: z.string().optional(),
  bankAccount: z.string().optional(),
  referenceNumber: z.string().optional(),
});

const ListQuery = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  category: z.string().optional(),
  source: z.nativeEnum(TxnSource).optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = CreateSchema.parse(await req.json());
    const merchantNormalized = normalizeMerchant(body.merchant);
    const category = body.category ?? await categorize(userId, merchantNormalized);
    const result = await insertOrLog(userId, {
      amount: body.amount,
      transactionDate: new Date(body.transactionDate),
      merchant: body.merchant,
      merchantNormalized,
      category,
      type: body.type,
      source: TxnSource.MANUAL,
      bankAccount: body.bankAccount ?? null,
      referenceNumber: body.referenceNumber ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const q = ListQuery.parse(Object.fromEntries(req.nextUrl.searchParams));
    const where: any = {};
    if (q.from || q.to) where.transactionDate = { ...(q.from && { gte: new Date(q.from) }), ...(q.to && { lte: new Date(q.to) }) };
    if (q.category) where.category = q.category;
    if (q.source) where.source = q.source;
    if (q.minAmount !== undefined || q.maxAmount !== undefined) where.amount = { ...(q.minAmount !== undefined && { gte: q.minAmount }), ...(q.maxAmount !== undefined && { lte: q.maxAmount }) };
    const rows = await forUser(userId).transaction.findMany({
      where,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
    });
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, -1) : rows;
    return NextResponse.json({
      rows: page.map(r => ({ ...r, amount: r.amount.toString() })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
```

**Note:** `amount` is serialized as string (Prisma `Decimal` → JSON). The client parses back to number for display.

Commit:
```bash
git add app/api/transactions/route.ts && git commit -m "feat: POST/GET /api/transactions with filters and cursor pagination"
```

### Task 2.5: PATCH and DELETE /api/transactions/[id]

**Files:** Create `app/api/transactions/[id]/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";

const PatchSchema = z.object({ category: z.string().min(1).max(50) });

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    const body = PatchSchema.parse(await req.json());
    const updated = await forUser(userId).transaction.update({
      where: { id: ctx.params.id },
      data: { category: body.category },
    });
    // Override upsert arrives in step 7; for now just update the row.
    return NextResponse.json({ id: updated.id, category: updated.category });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const { userId } = await requireUser();
    await forUser(userId).transaction.delete({ where: { id: ctx.params.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

Commit:
```bash
git add app/api/transactions && git commit -m "feat: PATCH category and DELETE transaction"
```

### Task 2.6: Dashboard aggregation server actions

**Files:** Create `lib/dashboard.ts`

```ts
import { forUser, prisma } from "./db";
import { TxnType } from "@prisma/client";
import { startOfMonth, subDays, startOfDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

const TZ = "Asia/Kolkata";

function monthBoundsIST(now = new Date()): { from: Date; to: Date } {
  const istNow = toZonedTime(now, TZ);
  const monthStartIST = startOfMonth(istNow);
  return { from: fromZonedTime(monthStartIST, TZ), to: now };
}

export async function getMonthKpis(userId: string) {
  const { from, to } = monthBoundsIST();
  const debits = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    select: { amount: true, category: true },
  });
  const total = debits.reduce((sum, r) => sum + Number(r.amount), 0);
  const byCat = new Map<string, number>();
  for (const r of debits) byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.amount));
  const topCat = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    totalSpend: total,
    topCategory: topCat?.[0] ?? null,
    topCategoryAmount: topCat?.[1] ?? 0,
    transactionCount: debits.length,
  };
}

export async function getCategoryBreakdown(userId: string) {
  const { from, to } = monthBoundsIST();
  const rows = await forUser(userId).transaction.groupBy({
    by: ["category"],
    where: { type: TxnType.DEBIT, transactionDate: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  return rows.map(r => ({ category: r.category, amount: Number(r._sum.amount ?? 0) })).sort((a, b) => b.amount - a.amount);
}

export async function getDailyTrend(userId: string, days = 30) {
  const now = new Date();
  const start = fromZonedTime(startOfDay(subDays(toZonedTime(now, TZ), days - 1)), TZ);
  const rows = await forUser(userId).transaction.findMany({
    where: { type: TxnType.DEBIT, transactionDate: { gte: start, lte: now } },
    select: { amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });
  // Bucket by IST day key.
  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = startOfDay(subDays(toZonedTime(now, TZ), days - 1 - i));
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const r of rows) {
    const key = toZonedTime(r.transactionDate, TZ).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(r.amount));
  }
  return [...buckets.entries()].map(([date, amount]) => ({ date, amount }));
}
```

Commit:
```bash
git add lib/dashboard.ts && git commit -m "feat: dashboard aggregation queries (IST-aware)"
```

### Task 2.7: Dashboard UI — KPI cards + charts + table

**Files:** Create `app/dashboard/page.tsx` (replace), `app/dashboard/kpi-cards.tsx`, `app/dashboard/category-pie.tsx`, `app/dashboard/trend-line.tsx`, `app/dashboard/transaction-table.tsx`, `app/dashboard/add-transaction.tsx`, `app/dashboard/sign-out.tsx`

This task is big enough that I break it into sub-steps:

**Sub-step 2.7a — Server page shell:**

`app/dashboard/page.tsx`:
```tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getMonthKpis, getCategoryBreakdown, getDailyTrend } from "@/lib/dashboard";
import KpiCards from "./kpi-cards";
import CategoryPie from "./category-pie";
import TrendLine from "./trend-line";
import TransactionTable from "./transaction-table";
import AddTransaction from "./add-transaction";
import SignOutButton from "./sign-out";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  const userId = (session.user as any).id;
  const [kpis, pie, trend] = await Promise.all([
    getMonthKpis(userId),
    getCategoryBreakdown(userId),
    getDailyTrend(userId, 30),
  ]);
  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>
        <div className="flex gap-2">
          <AddTransaction />
          <SignOutButton />
        </div>
      </header>
      <KpiCards data={kpis} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryPie data={pie} />
        <TrendLine data={trend} />
      </div>
      <TransactionTable />
    </main>
  );
}
```

**Sub-step 2.7b — KPI cards** (`app/dashboard/kpi-cards.tsx`):
```tsx
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function KpiCards({ data }: { data: { totalSpend: number; topCategory: string | null; topCategoryAmount: number; transactionCount: number } }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total spend (this month)</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{fmt.format(data.totalSpend)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Top category</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold capitalize">{data.topCategory ?? "—"}</div>
          {data.topCategory && <div className="text-sm text-muted-foreground">{fmt.format(data.topCategoryAmount)}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{data.transactionCount}</div></CardContent>
      </Card>
    </div>
  );
}
```

**Sub-step 2.7c — Category pie** (`app/dashboard/category-pie.tsx`):
```tsx
"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f97316", "#8b5cf6", "#84cc16", "#ec4899", "#64748b"];

export default function CategoryPie({ data }: { data: { category: string; amount: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Spend by category</CardTitle></CardHeader>
      <CardContent className="h-[300px]">
        {data.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">No spend yet this month.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="amount" nameKey="category" innerRadius={50} outerRadius={90}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
```

**Sub-step 2.7d — Trend line** (`app/dashboard/trend-line.tsx`):
```tsx
"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export default function TrendLine({ data }: { data: { date: string; amount: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Daily spending (last 30 days)</CardTitle></CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={d => d.slice(5)} />
            <YAxis tickFormatter={v => `₹${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v)} />
            <Line type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

**Sub-step 2.7e — Transaction table** (`app/dashboard/transaction-table.tsx`):
```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ALL_CATEGORIES } from "@/lib/categorizer";
import { toast } from "sonner";

type Row = { id: string; amount: string; transactionDate: string; merchant: string; category: string; type: "DEBIT" | "CREDIT"; source: "EMAIL" | "CSV" | "MANUAL" };

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function TransactionTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ category?: string; source?: string; minAmount?: string; maxAmount?: string; from?: string; to?: string }>({});

  async function load(reset = false) {
    setLoading(true);
    const p = new URLSearchParams();
    if (filters.category && filters.category !== "all") p.set("category", filters.category);
    if (filters.source && filters.source !== "all") p.set("source", filters.source);
    if (filters.minAmount) p.set("minAmount", filters.minAmount);
    if (filters.maxAmount) p.set("maxAmount", filters.maxAmount);
    if (filters.from) p.set("from", new Date(filters.from).toISOString());
    if (filters.to) p.set("to", new Date(filters.to).toISOString());
    if (!reset && cursor) p.set("cursor", cursor);
    const r = await fetch(`/api/transactions?${p}`);
    const j = await r.json();
    setRows(reset ? j.rows : [...rows, ...j.rows]);
    setCursor(j.nextCursor);
    setLoading(false);
  }

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [JSON.stringify(filters)]);

  async function updateCategory(id: string, category: string) {
    const r = await fetch(`/api/transactions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }) });
    if (!r.ok) { toast.error("Failed to update category"); return; }
    setRows(rs => rs.map(row => row.id === id ? { ...row, category } : row));
    toast.success("Category updated");
  }

  return (
    <Card>
      <CardHeader><CardTitle>Transactions</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 md:grid-cols-6">
          <Input type="date" value={filters.from ?? ""} onChange={e => setFilters(f => ({ ...f, from: e.target.value || undefined }))} placeholder="From" />
          <Input type="date" value={filters.to ?? ""} onChange={e => setFilters(f => ({ ...f, to: e.target.value || undefined }))} placeholder="To" />
          <Select value={filters.category ?? "all"} onValueChange={v => setFilters(f => ({ ...f, category: v }))}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.source ?? "all"} onValueChange={v => setFilters(f => ({ ...f, source: v }))}>
            <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="CSV">CSV</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Input type="number" value={filters.minAmount ?? ""} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value || undefined }))} placeholder="Min ₹" />
          <Input type="number" value={filters.maxAmount ?? ""} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value || undefined }))} placeholder="Max ₹" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell>{new Date(r.transactionDate).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</TableCell>
                  <TableCell>{r.merchant}</TableCell>
                  <TableCell>
                    <Select value={r.category} onValueChange={v => updateCategory(r.id, v)}>
                      <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ALL_CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.type === "DEBIT" ? "" : "text-green-600"}`}>
                    {r.type === "DEBIT" ? "-" : "+"}{fmt.format(Number(r.amount))}
                  </TableCell>
                  <TableCell>{r.type}</TableCell>
                  <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && !loading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transactions. Add one from the top-right.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {cursor && <Button variant="outline" disabled={loading} onClick={() => load()}>Load more</Button>}
      </CardContent>
    </Card>
  );
}
```

**Sub-step 2.7f — Add transaction dialog** (`app/dashboard/add-transaction.tsx`):
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function AddTransaction() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: "", merchant: "", date: new Date().toISOString().slice(0, 10), type: "DEBIT" as "DEBIT" | "CREDIT" });

  async function submit() {
    setSubmitting(true);
    const r = await fetch("/api/transactions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(form.amount),
        merchant: form.merchant,
        transactionDate: new Date(`${form.date}T12:00:00+05:30`).toISOString(),
        type: form.type,
      }),
    });
    setSubmitting(false);
    if (!r.ok) { toast.error("Failed to add transaction"); return; }
    const j = await r.json();
    if (j.status === "duplicate") toast.info("Duplicate — logged, not inserted.");
    else toast.success("Transaction added");
    setOpen(false);
    setForm({ amount: "", merchant: "", date: new Date().toISOString().slice(0, 10), type: "DEBIT" });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Add transaction</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add transaction</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5"><Label>Amount (₹)</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
          <div className="grid gap-1.5"><Label>Merchant</Label><Input value={form.merchant} onChange={e => setForm(f => ({ ...f, merchant: e.target.value }))} /></div>
          <div className="grid gap-1.5"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
          <div className="grid gap-1.5">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(v: any) => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBIT">Debit (expense)</SelectItem>
                <SelectItem value="CREDIT">Credit (income)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !form.amount || !form.merchant}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Sub-step 2.7g — Sign out button** (`app/dashboard/sign-out.tsx`):
```tsx
"use client";
import { Button } from "@/components/ui/button";
import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return <Button variant="outline" onClick={() => signOut({ callbackUrl: "/auth/signin" })}>Sign out</Button>;
}
```

**Verify:** `pnpm dev`, sign in, click "Add transaction", enter `Amount 450, Merchant "Swiggy", today, DEBIT`. Expect:
- Toast "Transaction added"
- Dashboard refreshes with total ₹450, category pie shows "food" slice, table shows the row
- Edit category inline → toast confirms

Commit each sub-step separately, or bundle:
```bash
git add app/dashboard && git commit -m "feat: dashboard with KPIs, charts, transaction table, add dialog"
```

---

### Step 2 checkpoint

**Demonstrate:** Dashboard with 2-3 manually entered transactions, inline category edit, filters working.

**Await user approval before Step 3.**

---

## Step 3 — CSV Upload with Dedup

**Deliverable:** User uploads a CSV, maps columns, previews, imports. Duplicates are logged.

### Task 3.1: Add upload link in dashboard header

Modify `app/dashboard/page.tsx` — add a button `<Link href="/upload"><Button variant="outline">Import CSV</Button></Link>` in the header beside "Add transaction".

Commit.

### Task 3.2: Temporary upload store

**Files:** Create `lib/upload-store.ts`

```ts
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const DIR = path.join(process.cwd(), "tmp-uploads");

async function ensureDir() { await fs.mkdir(DIR, { recursive: true }); }

export async function stashCsv(buffer: Buffer): Promise<string> {
  await ensureDir();
  const token = randomBytes(16).toString("hex");
  await fs.writeFile(path.join(DIR, `${token}.csv`), buffer);
  // best-effort cleanup: drop files older than 1 hour
  try {
    const entries = await fs.readdir(DIR);
    const now = Date.now();
    for (const f of entries) {
      const st = await fs.stat(path.join(DIR, f));
      if (now - st.mtimeMs > 60 * 60 * 1000) await fs.unlink(path.join(DIR, f));
    }
  } catch {}
  return token;
}

export async function readStashed(token: string): Promise<Buffer> {
  const safe = /^[a-f0-9]{32}$/.test(token);
  if (!safe) throw new Error("Invalid token");
  return fs.readFile(path.join(DIR, `${token}.csv`));
}

export async function deleteStashed(token: string): Promise<void> {
  const safe = /^[a-f0-9]{32}$/.test(token);
  if (!safe) return;
  await fs.unlink(path.join(DIR, `${token}.csv`)).catch(() => {});
}
```

Commit.

### Task 3.3: CSV preview endpoint

**Files:** Create `app/api/upload/csv/preview/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { requireUser } from "@/lib/session";
import { stashCsv } from "@/lib/upload-store";

export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    const buf = Buffer.from(await file.arrayBuffer());
    const text = buf.toString("utf8");
    const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    if (result.errors.length > 0 && result.data.length === 0) {
      return NextResponse.json({ error: "Unable to parse CSV", details: result.errors.slice(0, 3) }, { status: 400 });
    }
    const headers = result.meta.fields ?? [];
    const token = await stashCsv(buf);
    return NextResponse.json({
      token,
      headers,
      sampleRows: result.data.slice(0, 5),
      rowCount: result.data.length,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

Commit.

### Task 3.4: CSV import endpoint

**Files:** Create `app/api/upload/csv/import/route.ts`

```ts
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { readStashed, deleteStashed } from "@/lib/upload-store";
import { normalizeMerchant, insertOrLog } from "@/lib/dedup";
import { categorize } from "@/lib/categorizer";
import { TxnSource, TxnType } from "@prisma/client";
import { parse as parseDate, isValid } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const BodySchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  mapping: z.object({
    date: z.string(),
    amount: z.string(),
    merchant: z.string(),
    type: z.string().optional(),
    account: z.string().optional(),
  }),
  defaultType: z.enum(["DEBIT", "CREDIT"]).default("DEBIT"),
});

const DATE_FORMATS = ["dd/MM/yyyy", "dd-MM-yyyy", "yyyy-MM-dd", "MM/dd/yyyy", "dd MMM yyyy"];

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₹,]/g, "").replace(/Rs\.?/i, "").trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)/);
  return m ? Math.abs(parseFloat(m[1])) : null;
}
function parseCsvDate(raw: string): Date | null {
  for (const fmt of DATE_FORMATS) {
    const d = parseDate(raw.trim(), fmt, new Date());
    if (isValid(d)) return fromZonedTime(d, "Asia/Kolkata");
  }
  return null;
}
function parseType(raw: string | undefined, fallback: TxnType): TxnType {
  if (!raw) return fallback;
  const r = raw.toLowerCase();
  if (r.includes("cr") || r.includes("credit") || r.includes("+")) return TxnType.CREDIT;
  if (r.includes("dr") || r.includes("debit") || r.includes("-")) return TxnType.DEBIT;
  return fallback;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireUser();
    const body = BodySchema.parse(await req.json());
    const buf = await readStashed(body.token);
    const parsed = Papa.parse<Record<string, string>>(buf.toString("utf8"), { header: true, skipEmptyLines: true });
    const errors: { row: number; reason: string }[] = [];
    let inserted = 0, duplicates = 0;

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rawAmount = row[body.mapping.amount];
      const rawDate = row[body.mapping.date];
      const rawMerchant = row[body.mapping.merchant];
      const amount = rawAmount ? parseAmount(rawAmount) : null;
      const txDate = rawDate ? parseCsvDate(rawDate) : null;
      if (!amount || !txDate || !rawMerchant) {
        errors.push({ row: i + 2, reason: `Unparseable: amount=${rawAmount}, date=${rawDate}, merchant=${rawMerchant}` });
        continue;
      }
      const type = parseType(body.mapping.type ? row[body.mapping.type] : undefined, body.defaultType);
      const merchantNormalized = normalizeMerchant(rawMerchant);
      const category = await categorize(userId, merchantNormalized);
      const out = await insertOrLog(userId, {
        amount, transactionDate: txDate, merchant: rawMerchant, merchantNormalized, category,
        type, source: TxnSource.CSV,
        bankAccount: body.mapping.account ? row[body.mapping.account] ?? null : null,
        referenceNumber: null,
      });
      if (out.status === "inserted") inserted++;
      else duplicates++;
    }

    await deleteStashed(body.token);
    return NextResponse.json({ inserted, duplicates, errors });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.flatten() }, { status: 400 });
    throw e;
  }
}
```

Commit.

### Task 3.5: Upload page UI

**Files:** Create `app/upload/page.tsx`

```tsx
"use client";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Preview = { token: string; headers: string[]; sampleRows: Record<string, string>[]; rowCount: number };

export default function UploadPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState({ date: "", amount: "", merchant: "", type: "__none__", account: "__none__" });
  const [defaultType, setDefaultType] = useState<"DEBIT" | "CREDIT">("DEBIT");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: any[] } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/upload/csv/preview", { method: "POST", body: fd });
    if (!r.ok) { toast.error("Preview failed"); return; }
    const j = await r.json(); setPreview(j); setMapping({ date: "", amount: "", merchant: "", type: "__none__", account: "__none__" });
  }

  async function onImport() {
    if (!preview) return;
    if (!mapping.date || !mapping.amount || !mapping.merchant) { toast.error("Map date, amount, merchant"); return; }
    setImporting(true);
    const r = await fetch("/api/upload/csv/import", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: preview.token,
        mapping: {
          date: mapping.date, amount: mapping.amount, merchant: mapping.merchant,
          type: mapping.type === "__none__" ? undefined : mapping.type,
          account: mapping.account === "__none__" ? undefined : mapping.account,
        },
        defaultType,
      }),
    });
    setImporting(false);
    if (!r.ok) { toast.error("Import failed"); return; }
    setResult(await r.json());
    toast.success("Import complete");
  }

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Import CSV</h1>

      <Card>
        <CardHeader><CardTitle>1 · Choose file</CardTitle></CardHeader>
        <CardContent>
          <Input type="file" accept=".csv,text/csv" onChange={onFile} />
          {preview && <p className="text-sm text-muted-foreground mt-2">{preview.rowCount} rows detected.</p>}
        </CardContent>
      </Card>

      {preview && (
        <>
          <Card>
            <CardHeader><CardTitle>2 · Map columns</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(["date", "amount", "merchant"] as const).map(k => (
                <div key={k} className="grid gap-1.5">
                  <Label className="capitalize">{k} *</Label>
                  <Select value={mapping[k]} onValueChange={v => setMapping(m => ({ ...m, [k]: v }))}>
                    <SelectTrigger><SelectValue placeholder={`Select ${k} column`} /></SelectTrigger>
                    <SelectContent>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              ))}
              <div className="grid gap-1.5">
                <Label>Type column (optional)</Label>
                <Select value={mapping.type} onValueChange={v => setMapping(m => ({ ...m, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None — use default</SelectItem>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Account column (optional)</Label>
                <Select value={mapping.account} onValueChange={v => setMapping(m => ({ ...m, account: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="__none__">None</SelectItem>{preview.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Default type (if no type column)</Label>
                <Select value={defaultType} onValueChange={(v: any) => setDefaultType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="DEBIT">Debit</SelectItem><SelectItem value="CREDIT">Credit</SelectItem></SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>3 · Preview</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded border">
                <Table>
                  <TableHeader><TableRow>{preview.headers.map(h => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>
                    {preview.sampleRows.map((r, i) => (
                      <TableRow key={i}>{preview.headers.map(h => <TableCell key={h}>{r[h]}</TableCell>)}</TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button className="mt-4" disabled={importing} onClick={onImport}>{importing ? "Importing..." : `Import ${preview.rowCount} rows`}</Button>
            </CardContent>
          </Card>
        </>
      )}

      {result && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p>Inserted: <b>{result.inserted}</b></p>
            <p>Duplicates skipped (logged): <b>{result.duplicates}</b></p>
            <p>Errors: <b>{result.errors.length}</b></p>
            {result.errors.length > 0 && (
              <details><summary className="cursor-pointer text-sm">Error details</summary>
                <ul className="text-xs space-y-1 mt-2">{result.errors.slice(0, 50).map((e, i) => <li key={i}>row {e.row}: {e.reason}</li>)}</ul>
              </details>
            )}
            <Button variant="outline" onClick={() => router.push("/dashboard")}>Back to dashboard</Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
```

**Verify:** Create a test CSV `test.csv` with columns `Date,Narration,Amount`:
```
Date,Narration,Amount
2026-04-01,SWIGGY ORDER,450.00
2026-04-01,SWIGGY ORDER,450.00
2026-04-02,UBER TRIP,220.50
```
Upload on `/upload`, map columns, import. Expect: inserted=2, duplicates=1.

Commit the whole step.

---

### Step 3 checkpoint

**Demonstrate:** CSV import with a real HDFC statement export. Show inserted/duplicates counts.

**Await user approval before Step 4.**

---

## Step 4 — Gmail OAuth + HDFC Parser

**Deliverable:** HDFC emails from the last day are parsed and inserted into the DB on demand via a "Sync now" button.

### Task 4.1: Parser types and registry

**Files:** Create `lib/parsers/types.ts`, `lib/parsers/index.ts`

`types.ts`:
```ts
export type Bank = "HDFC" | "SBI" | "ICICI" | "AXIS" | "KOTAK";

export type ParsedTransaction = {
  amount: number;
  type: "DEBIT" | "CREDIT";
  transactionDate: Date;
  merchant: string;
  bankAccount?: string;
  referenceNumber?: string;
  bank: Bank;
};

export interface BankParser {
  name: Bank;
  senderPatterns: RegExp[];
  parse(input: { subject: string; plainText: string; htmlText: string; fromHeader: string }): ParsedTransaction | null;
}
```

`index.ts`:
```ts
import type { BankParser, ParsedTransaction } from "./types";
import { hdfcParser } from "./hdfc";

export const PARSERS: BankParser[] = [hdfcParser /* more added in step 6 */];

export function detectBankAndParse(input: { subject: string; plainText: string; htmlText: string; fromHeader: string }): ParsedTransaction | null {
  for (const p of PARSERS) {
    if (p.senderPatterns.some(re => re.test(input.fromHeader))) {
      const result = p.parse(input);
      if (result) return result;
    }
  }
  return null;
}

export function allBankSenderQuery(): string {
  const senders: Record<string, string[]> = {
    HDFC:  ["alerts@hdfcbank.net", "emailstatements.hdfcbank@hdfcbank.net"],
    // populated fully in step 6; today we only need HDFC:
  };
  const all = Object.values(senders).flat();
  return `from:(${all.join(" OR ")}) newer_than:1d`;
}
```

Commit.

### Task 4.2: HDFC parser (first pass) with fixtures

**Files:** Create `lib/parsers/hdfc.ts`, `scripts/fixtures/hdfc-debit-1.txt`, `scripts/fixtures/hdfc-credit-1.txt`, `scripts/parse-fixture.ts`

**Sub-step 4.2a — gather fixtures:**
The user (Chocki) will provide 2-3 real HDFC alert email bodies, redacted. Save each as plain text under `scripts/fixtures/`. If you don't have them yet, use these starter templates (replace with real ones):

`scripts/fixtures/hdfc-debit-1.txt`:
```
From: alerts@hdfcbank.net
Subject: You've spent Rs. 450.00 on HDFC Bank Credit Card XX1234

Dear Customer,

Thank you for using your HDFC Bank Credit Card ending 1234 for Rs 450.00 at SWIGGY on 15-04-2026 19:32:45.
Authorization code: 012345

If you did not make this transaction, please call us immediately.
```

`scripts/fixtures/hdfc-credit-1.txt`:
```
From: alerts@hdfcbank.net
Subject: Update on your HDFC Bank Account

Dear Customer,

Rs.25000.00 has been credited to your HDFC Bank account XXXXXX5678 on 01-04-2026. Info: NEFT-ACME CORP SALARY. Avl Bal Rs.52,300.45.
```

**Sub-step 4.2b — parser:**
```ts
import type { BankParser, ParsedTransaction } from "./types";
import { parse as parseDate } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

const SENDER = [/alerts@hdfcbank\.net/i, /emailstatements\.hdfcbank@hdfcbank\.net/i];

/** HDFC credit card debit: "spent Rs 450.00 at SWIGGY on 15-04-2026 ... Card XX1234" */
const DEBIT_CC = /(?:spent|used).{0,30}?Rs\.?\s*([\d,]+(?:\.\d+)?)\s*(?:on|at)\s+(?:HDFC.*?Credit Card.*?)?(?:at\s+)?([A-Z0-9 .&'/\-]+?)\s+on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})/is;
const CARD_LAST4 = /(?:Card|ending)\s+(?:XX)?(\d{4})/i;
const AUTH_CODE = /(?:Authorization code|Auth(?:\.|orization)? code|Ref(?:erence)? no\.?)\s*:?\s*([A-Z0-9]+)/i;

/** HDFC account credit: "Rs.25000.00 has been credited to your HDFC Bank account XXXXXX5678 ... Info: XXX" */
const CREDIT_ACC = /Rs\.?\s*([\d,]+(?:\.\d+)?)\s+has been credited to your HDFC Bank account\s+X+(\d{4}).{0,200}?(?:on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})).{0,200}?Info:\s*([^.]+?)(?:\.|Avl|$)/is;

/** HDFC account debit: "Rs.1234.00 has been debited from account XXXXXX5678 ... to VPA/PAYEE XXX" */
const DEBIT_ACC = /Rs\.?\s*([\d,]+(?:\.\d+)?)\s+has been debited from (?:your\s+)?(?:HDFC Bank\s+)?account\s+X+(\d{4}).{0,200}?(?:to|VPA)\s+([A-Z0-9 .&'/@\-]+?)(?:\s+on\s+(\d{2}[-\/]\d{2}[-\/]\d{4})|\.)/is;

function toIst(ddmmyyyy: string): Date {
  const normalized = ddmmyyyy.replace(/\//g, "-");
  const d = parseDate(normalized, "dd-MM-yyyy", new Date());
  return fromZonedTime(d, "Asia/Kolkata");
}
function num(s: string): number { return parseFloat(s.replace(/,/g, "")); }
function clean(s: string): string { return s.replace(/\s+/g, " ").trim(); }

export const hdfcParser: BankParser = {
  name: "HDFC",
  senderPatterns: SENDER,
  parse({ plainText, subject }) {
    const text = `${subject}\n${plainText}`;

    let m = text.match(DEBIT_CC);
    if (m) {
      const [, amt, merchant, date] = m;
      const card = text.match(CARD_LAST4)?.[1];
      const auth = text.match(AUTH_CODE)?.[1];
      return { amount: num(amt), type: "DEBIT", transactionDate: toIst(date), merchant: clean(merchant), bankAccount: card, referenceNumber: auth, bank: "HDFC" };
    }
    m = text.match(DEBIT_ACC);
    if (m) {
      const [, amt, acc, merchant, date] = m;
      return { amount: num(amt), type: "DEBIT", transactionDate: date ? toIst(date) : new Date(), merchant: clean(merchant), bankAccount: acc, bank: "HDFC" };
    }
    m = text.match(CREDIT_ACC);
    if (m) {
      const [, amt, acc, date, info] = m;
      return { amount: num(amt), type: "CREDIT", transactionDate: toIst(date), merchant: clean(info), bankAccount: acc, bank: "HDFC" };
    }
    return null;
  },
};
```

**Sub-step 4.2c — fixture harness** (`scripts/parse-fixture.ts`):
```ts
/* eslint-disable no-console */
import { promises as fs } from "node:fs";
import path from "node:path";
import { detectBankAndParse } from "@/lib/parsers";

async function main() {
  const dir = path.join(process.cwd(), "scripts", "fixtures");
  const files = (await fs.readdir(dir)).filter(f => f.endsWith(".txt"));
  for (const f of files) {
    const raw = await fs.readFile(path.join(dir, f), "utf8");
    const [headerBlock, ...bodyParts] = raw.split(/\n\n/);
    const body = bodyParts.join("\n\n");
    const fromHeader = headerBlock.match(/^From:\s*(.*)$/im)?.[1] ?? "";
    const subject = headerBlock.match(/^Subject:\s*(.*)$/im)?.[1] ?? "";
    const result = detectBankAndParse({ fromHeader, subject, plainText: body, htmlText: "" });
    console.log(`\n=== ${f} ===`);
    console.log(result ? JSON.stringify(result, null, 2) : "NO MATCH");
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```

Add a package.json script:
```json
"scripts": {
  ...
  "parse-fixtures": "tsx scripts/parse-fixture.ts"
}
```

**Verify:**
```bash
pnpm parse-fixtures
```
Expected: each fixture prints a parsed `ParsedTransaction` JSON.

Iterate parser regex until all fixtures parse correctly. **When the user provides real emails, update fixtures and re-run until all succeed.**

Commit each iteration.

### Task 4.3: Gmail client

**Files:** Create `lib/gmail.ts`

```ts
import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "./db";
import { env } from "./env";
import { encrypt, decrypt } from "./crypto";

export async function getGmailClient(userId: string): Promise<gmail_v1.Gmail | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google", needsReauth: false },
  });
  if (!account || !account.refresh_token) return null;

  const oauth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth.setCredentials({
    refresh_token: decrypt(account.refresh_token),
    access_token: account.access_token ? decrypt(account.access_token) : undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Persist refreshed tokens (encrypted).
  oauth.on("tokens", async (tokens) => {
    const data: Record<string, unknown> = {};
    if (tokens.access_token) data.access_token = encrypt(tokens.access_token);
    if (tokens.refresh_token) data.refresh_token = encrypt(tokens.refresh_token);
    if (tokens.expiry_date) data.expires_at = Math.floor(tokens.expiry_date / 1000);
    if (Object.keys(data).length === 0) return;
    await prisma.account.update({ where: { id: account.id }, data });
  });

  return google.gmail({ version: "v1", auth: oauth });
}

export function extractPlainText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractPlainText(part);
      if (t) return t;
    }
  }
  return "";
}

export function extractHtml(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return Buffer.from(payload.body.data, "base64").toString("utf8");
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const t = extractHtml(part);
      if (t) return t;
    }
  }
  return "";
}

export function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
```

Commit.

### Task 4.4: Gmail sync function

**Files:** Create `lib/gmail-sync.ts`

```ts
import { prisma, forUser } from "./db";
import { getGmailClient, extractPlainText, extractHtml, getHeader } from "./gmail";
import { detectBankAndParse, allBankSenderQuery } from "./parsers";
import { normalizeMerchant, insertOrLog } from "./dedup";
import { categorize } from "./categorizer";
import { TxnSource } from "@prisma/client";

export type SyncResult = { userId: string; fetched: number; parsed: number; inserted: number; duplicates: number; unrecognized: number; errors: string[] };

export async function syncUserGmail(userId: string): Promise<SyncResult> {
  const result: SyncResult = { userId, fetched: 0, parsed: 0, inserted: 0, duplicates: 0, unrecognized: 0, errors: [] };
  let gmail;
  try {
    gmail = await getGmailClient(userId);
    if (!gmail) { result.errors.push("No Gmail client (not linked or needsReauth)"); return result; }
  } catch (e) {
    result.errors.push(`Gmail client error: ${(e as Error).message}`);
    return result;
  }

  let list;
  try {
    list = await gmail.users.messages.list({ userId: "me", q: allBankSenderQuery(), maxResults: 100 });
  } catch (e: any) {
    if (e?.response?.data?.error === "invalid_grant" || e?.code === 401) {
      const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
      if (account) await prisma.account.update({ where: { id: account.id }, data: { needsReauth: true } });
      result.errors.push("invalid_grant — needs reauth");
      return result;
    }
    result.errors.push(`list error: ${e.message}`);
    return result;
  }

  const ids = list.data.messages ?? [];
  result.fetched = ids.length;

  for (const m of ids) {
    if (!m.id) continue;
    const existing = await forUser(userId).transaction.findFirst({ where: { gmailMessageId: m.id } });
    if (existing) continue;
    try {
      const full = await gmail.users.messages.get({ userId: "me", id: m.id, format: "full" });
      const payload = full.data.payload;
      const subject = getHeader(payload?.headers, "Subject");
      const fromHeader = getHeader(payload?.headers, "From");
      const plainText = extractPlainText(payload);
      const htmlText = extractHtml(payload);
      const parsed = detectBankAndParse({ subject, fromHeader, plainText, htmlText });
      if (!parsed) { result.unrecognized++; continue; }
      result.parsed++;
      const merchantNormalized = normalizeMerchant(parsed.merchant);
      const category = await categorize(userId, merchantNormalized);
      const out = await insertOrLog(userId, {
        amount: parsed.amount,
        transactionDate: parsed.transactionDate,
        merchant: parsed.merchant,
        merchantNormalized,
        category,
        type: parsed.type,
        source: TxnSource.EMAIL,
        bankAccount: parsed.bankAccount ?? null,
        referenceNumber: parsed.referenceNumber ?? null,
        gmailMessageId: m.id,
        rawData: { bank: parsed.bank, subject, fromHeader },
      });
      if (out.status === "inserted") result.inserted++; else result.duplicates++;
    } catch (e) {
      result.errors.push(`msg ${m.id}: ${(e as Error).message}`);
    }
  }

  return result;
}

export async function syncAllUsers(): Promise<SyncResult[]> {
  const users = await prisma.user.findMany({
    where: { accounts: { some: { provider: "google", needsReauth: false, refresh_token: { not: null } } } },
    select: { id: true },
  });
  const results: SyncResult[] = [];
  for (const u of users) results.push(await syncUserGmail(u.id));
  return results;
}
```

Commit.

### Task 4.5: Sync API route and dashboard button

**Files:** Create `app/api/gmail/sync/route.ts`, modify `app/dashboard/page.tsx` to add a sync button

`app/api/gmail/sync/route.ts`:
```ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { syncUserGmail } from "@/lib/gmail-sync";

export async function POST() {
  try {
    const { userId } = await requireUser();
    const result = await syncUserGmail(userId);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

`app/dashboard/sync-button.tsx`:
```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true);
      const r = await fetch("/api/gmail/sync", { method: "POST" });
      setBusy(false);
      if (!r.ok) { toast.error("Sync failed"); return; }
      const j = await r.json();
      toast.success(`Sync: ${j.inserted} new, ${j.duplicates} duplicates, ${j.unrecognized} unparsed`);
      router.refresh();
    }}>{busy ? "Syncing..." : "Sync Gmail"}</Button>
  );
}
```

Add `<SyncButton />` to the dashboard header next to "Add transaction" and "Import CSV".

**Verify:** With real HDFC emails in the Gmail inbox, click "Sync Gmail". Toast reports counts; transactions appear in the table with `source=EMAIL`.

Commit.

### Task 4.6: needsReauth banner

**Files:** Modify `app/dashboard/page.tsx` — before rendering, check for `needsReauth`:

```tsx
const account = await prisma.account.findFirst({ where: { userId, provider: "google" }, select: { needsReauth: true } });
// ... then above <KpiCards />:
{account?.needsReauth && (
  <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
    Gmail access expired. <a className="underline" href="/api/auth/signin/google">Reconnect</a>.
  </div>
)}
```

Commit.

---

### Step 4 checkpoint

**Demonstrate:** Click "Sync Gmail" with HDFC emails present → transactions appear tagged EMAIL.

**Await user approval before Step 5.**

---

## Step 5 — Cron + pm2

**Deliverable:** In dev, node-cron fires every 5 min and logs a line. Prod pm2 config is ready but not deployed.

### Task 5.1: Cron registration

**Files:** Create `lib/cron.ts`

```ts
import cron from "node-cron";
import { syncAllUsers } from "./gmail-sync";

let registered = false;

export function registerCronJobs() {
  if (registered) return;
  if (process.env.CRON_DISABLED === "1") { console.log("[cron] disabled via CRON_DISABLED"); return; }
  registered = true;
  cron.schedule("*/5 * * * *", async () => {
    const start = Date.now();
    try {
      const results = await syncAllUsers();
      const totals = results.reduce((a, r) => ({ inserted: a.inserted + r.inserted, duplicates: a.duplicates + r.duplicates, errors: a.errors + r.errors.length }), { inserted: 0, duplicates: 0, errors: 0 });
      console.log(`[cron] gmail sync: users=${results.length} inserted=${totals.inserted} dup=${totals.duplicates} errors=${totals.errors} ms=${Date.now() - start}`);
    } catch (e) {
      console.error("[cron] gmail sync failed:", e);
    }
  });
  console.log("[cron] registered: gmail sync every 5 minutes");
}
```

### Task 5.2: instrumentation.ts

**Files:** Create `instrumentation.ts` at project root

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerCronJobs } = await import("./lib/cron");
  registerCronJobs();
}
```

Also add to `next.config.js`:
```js
const nextConfig = {
  experimental: { instrumentationHook: true },
};
module.exports = nextConfig;
```

**Verify:** `pnpm dev`. Within 5 min, console logs `[cron] gmail sync: users=...`. (In dev, HMR reloads should not double-register thanks to the `registered` flag.)

Commit.

### Task 5.3: pm2 config

**Files:** Create `ecosystem.config.js`

```js
module.exports = {
  apps: [{
    name: "expense-tracker",
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    instances: 1,                // node-cron is in-process; do NOT scale to >1
    exec_mode: "fork",
    env: { NODE_ENV: "production" },
    max_memory_restart: "512M",
    error_file: "/var/log/expense-tracker/err.log",
    out_file:   "/var/log/expense-tracker/out.log",
    time: true,
  }],
};
```

No verify here — this runs in prod. Commit.

---

### Step 5 checkpoint

**Demonstrate:** dev cron log line appearing every 5 min; `ecosystem.config.js` in repo.

**Await user approval before Step 6.**

---

## Step 6 — Remaining Bank Parsers

**Deliverable:** SBI, ICICI, Axis, Kotak parsers, each with 1-2 fixture files. Sender query updated.

For each bank, repeat this mini-cycle:

1. User provides 2 real (redacted) sample emails → save as `scripts/fixtures/<bank>-debit-1.txt` and `scripts/fixtures/<bank>-credit-1.txt`.
2. Create `lib/parsers/<bank>.ts` with `senderPatterns` + `parse()` implementation.
3. Register in `lib/parsers/index.ts` `PARSERS` array.
4. Update `allBankSenderQuery()` senders map.
5. Run `pnpm parse-fixtures` — iterate regex until all pass.
6. Commit per bank: `git commit -m "feat: <bank> email parser"`.

**Known sender patterns** (use as `senderPatterns`; confirm with user on first real email):

- SBI:      `/(?:onlinesbi@sbi\.co\.in|donotreply\.sbiatm@alerts\.sbi\.co\.in|creditcards@sbicard\.com|[^@]+@sbi\.co\.in)/i`
- ICICI:    `/(?:alerts@icicibank\.com|credit_cards@icicibank\.com|icicibank\.com)/i`
- Axis:     `/(?:alerts@axisbank\.com|cc\.alerts@axisbank\.com|customer\.service@axisbank\.com)/i`
- Kotak:    `/(?:kmbl\.alerts@kotak\.com|creditcardalerts@kotak\.com|noreply@kotak\.com)/i`

**Regex approach per bank:** every Indian bank has its own phrasing. Before writing regex, read the email and identify: (a) the amount with currency, (b) the debit/credit verb, (c) the merchant/beneficiary, (d) the date, (e) the account/card last 4 digits. Write one regex per "shape" (credit card debit, account debit, account credit, UPI debit at minimum). Return `null` for unrecognized shapes — the unrecognized count is visible in sync results, which tells us which templates still need coverage.

Commit: `git commit -m "feat: remaining bank parsers + extended sender query"`.

---

### Step 6 checkpoint

**Demonstrate:** `pnpm parse-fixtures` prints valid `ParsedTransaction` for every fixture across all 5 banks.

**Await user approval before Step 7.**

---

## Step 7 — Category Overrides & Refinement

**Deliverable:** Editing a category on a transaction upserts a `CategoryOverride` that auto-applies to future matching merchants. Optional override management page.

### Task 7.1: Upsert override on PATCH

Modify `app/api/transactions/[id]/route.ts` — in the `PATCH` handler, after updating the row, upsert the override using the transaction's `merchantNormalized`:

```ts
// inside PATCH, after the update succeeds:
const row = await forUser(userId).transaction.findFirst({ where: { id: ctx.params.id }, select: { merchantNormalized: true } });
if (row) {
  await forUser(userId).categoryOverride.upsert({
    where: { merchantNormalized: row.merchantNormalized },
    create: { merchantNormalized: row.merchantNormalized, category: body.category },
    update: { category: body.category },
  });
}
```

Commit.

### Task 7.2: Override list page

**Files:** Create `app/settings/categories/page.tsx` and `app/api/overrides/route.ts` + `app/api/overrides/[merchant]/route.ts`

API:
```ts
// app/api/overrides/route.ts
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
export async function GET() {
  try { const { userId } = await requireUser(); const rows = await forUser(userId).categoryOverride.findMany({ orderBy: { createdAt: "desc" } }); return NextResponse.json({ rows }); }
  catch (e) { if (e instanceof Response) return e; throw e; }
}
```

```ts
// app/api/overrides/[merchant]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { forUser } from "@/lib/db";
export async function DELETE(_req: NextRequest, ctx: { params: { merchant: string } }) {
  try {
    const { userId } = await requireUser();
    await forUser(userId).categoryOverride.delete({ where: { merchantNormalized: decodeURIComponent(ctx.params.merchant) } });
    return NextResponse.json({ ok: true });
  } catch (e) { if (e instanceof Response) return e; throw e; }
}
```

Settings page:
```tsx
"use client";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

type Row = { id: string; merchantNormalized: string; category: string; createdAt: string };

export default function CategoryOverridesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  async function load() { const r = await fetch("/api/overrides"); setRows((await r.json()).rows); }
  useEffect(() => { load(); }, []);
  async function remove(m: string) {
    const r = await fetch(`/api/overrides/${encodeURIComponent(m)}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Failed"); return; }
    toast.success("Removed"); load();
  }
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Category overrides</h1>
      <Card><CardHeader><CardTitle>Learned merchant → category</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Merchant</TableHead><TableHead>Category</TableHead><TableHead></TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map(r => <TableRow key={r.id}><TableCell className="font-mono text-xs">{r.merchantNormalized}</TableCell><TableCell className="capitalize">{r.category}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => remove(r.merchantNormalized)}>Remove</Button></TableCell></TableRow>)}
              {rows.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No overrides yet. Edit a transaction category to create one.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </main>
  );
}
```

Add a link from dashboard header: `<Link href="/settings/categories"><Button variant="ghost" size="sm">Overrides</Button></Link>`.

Commit.

**Verify:** On dashboard, change a transaction's category from "uncategorized" to "food". Visit `/settings/categories` — new row should appear. Add another transaction for the same merchant (or re-run sync) — it should auto-categorize as "food".

---

### Step 7 checkpoint

**Demonstrate:** Override created on edit, visible on settings page, applied to future insertions.

---

## Post-MVP (not in this plan)

- Deploy to Hostinger VPS (separate playbook: nginx + TLS via certbot, pm2 startup, systemd unit, prod env file at `/etc/expense-tracker.env`, DB backups).
- Vitest smoke tests for parsers (promote fixtures from scripts to `test/`).
- Retroactive re-categorization toggle.
- Budgeting & alerts.
- Data export.
