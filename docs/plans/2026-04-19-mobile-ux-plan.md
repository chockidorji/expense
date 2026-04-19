# Mobile UX Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a mobile-first redesign of the expense tracker: bottom-tab nav, spend-first dashboard, card-based transactions with bottom-sheet filters, PWA install support, auto dark mode. Desktop (≥ 768px) keeps today's layout.

**Architecture:** Mobile UI is built on top of existing `/dashboard` route + two new routes (`/transactions`, `/settings`). A new layout wrapper renders a bottom tab bar and FAB only on mobile. Existing shadcn-style components stay as-is; new primitives (`BottomNav`, `MobileHeader`, `Fab`, `BottomSheet`, `Chip`) live under `components/mobile/`. PWA adds `manifest.webmanifest`, icons, and Next's `viewport`/`themeColor` exports. Dark mode activates via inline pre-hydration script toggling `.dark` on `<html>`.

**Tech Stack:** Next.js 14 App Router, Tailwind, Base UI, lucide-react, Recharts, sonner.

**Reference design:** `docs/plans/2026-04-19-mobile-ux-design.md`

---

## Task 1: PWA & dark-mode foundation

**Files:**
- Modify: `app/layout.tsx` — add `viewport`, `themeColor`, `manifest`, pre-hydration dark-mode script
- Create: `app/manifest.ts` — dynamic Next manifest (icons, name, display)
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png` — stub via inline SVG → PNG
- Modify: `app/globals.css` — safe-area utilities, reduced-motion support

**Steps:**
1. Generate icon PNGs from a simple "₹" emblem using a tiny script or base64 blob.
2. Add Next 14 `viewport` export and `metadata` with `themeColor`, `manifest`, Apple meta.
3. Add pre-hydration inline script that toggles `.dark` based on `prefers-color-scheme`.
4. Verify meta tags render with `curl http://localhost:3000 | grep viewport`.
5. Commit: `feat(pwa): add manifest, icons, viewport, auto dark-mode bootstrap`.

## Task 2: Mobile primitives

**Files:**
- Create: `components/mobile/bottom-nav.tsx` — 4-tab bar, active state via `usePathname`, safe-area bottom padding, hidden at `md:`
- Create: `components/mobile/mobile-header.tsx` — title + sync icon + avatar menu, hidden at `md:`
- Create: `components/mobile/fab.tsx` — floating ⊕ button, slot for onClick
- Create: `components/ui/bottom-sheet.tsx` — wraps Base UI Dialog with bottom-anchored layout, drag handle, safe-area
- Create: `components/ui/chip.tsx` — pill with optional onRemove × icon

**Steps per component:** write → typecheck via `pnpm build` → commit.

## Task 3: Mobile layout integration

**Files:**
- Modify: `app/layout.tsx` — wrap children in a `<div className="pb-20 md:pb-0">` and render `BottomNav`
- Modify: `app/dashboard/page.tsx` — header becomes `MobileHeader` on mobile, desktop button row stays `hidden md:flex`
- Create: `app/dashboard/add-fab.tsx` — client wrapper that reuses `AddTransaction` dialog content inside the FAB + bottom-sheet
- Skip bottom nav on `/auth/signin` (sign-in layout stays centered)

**Steps:**
1. Add layout wrapper, confirm nav renders + is absent on `md:`.
2. Commit: `feat(mobile): bottom nav + FAB + mobile header`.

## Task 4: Dashboard mobile reflow

**Files:**
- Modify: `app/dashboard/kpi-cards.tsx` — hero (spend) + 2×2 for secondary KPIs on mobile, current 4-col layout on `md:`
- Create: `app/dashboard/budget-strip.tsx` — horizontal scroll of per-category chips
- Create: `app/dashboard/chart-carousel.tsx` — tabs between daily trend + category pie on mobile; desktop stays side-by-side
- Modify: `app/dashboard/page.tsx` — reorder sections, add "Recent transactions" section using existing `TransactionTable` but capped to 5 rows on mobile via a new `limit` prop (or a simpler `RecentTxns` component)
- Create: `app/dashboard/recent-txns.tsx` — 5-row card list, "See all" link

**Steps:**
1. Refactor `kpi-cards.tsx` to keep current desktop, add mobile hero + grid.
2. Add budget strip; wire empty state.
3. Add chart carousel; fall back to two-column on desktop.
4. Add recent txns card.
5. Commit: `feat(dashboard): mobile hero + budget strip + chart carousel + recent txns`.

## Task 5: /transactions route

**Files:**
- Create: `app/transactions/page.tsx` — server page, reads session, renders client list
- Create: `app/transactions/list.tsx` — client component with filter chips, bottom-sheet filter, infinite-scroll cards (mobile) or current table (desktop via `hidden md:block`)
- Create: `app/transactions/txn-row.tsx` — card row with merchant, category chip, amount
- Create: `app/transactions/filter-sheet.tsx` — bottom sheet with full filter form (reuse current inputs)
- Modify: `app/dashboard/page.tsx` — drop full transaction table from dashboard; replace with `RecentTxns`

**Steps:**
1. Page + server session check + initial month bounds.
2. Client list with chips + cards + sheet.
3. Desktop table branch (reuse existing table).
4. Update dashboard to drop full table.
5. Commit: `feat(transactions): dedicated page with card list + filter sheet`.

## Task 6: /settings hub

**Files:**
- Create: `app/settings/page.tsx` — list with Account, Actions, Data, Sign out
- Modify: `app/settings/budgets/page.tsx` — add "← Settings" link on mobile, widen inputs to `w-full`
- Modify: `app/settings/categories/page.tsx` — same breadcrumb tweak
- Modify: `components/mobile/bottom-nav.tsx` — "More" tab points here
- Reuse: existing `SyncButton`, `SignOutButton`

**Steps:**
1. Build hub.
2. Confirm links.
3. Commit: `feat(settings): hub page + mobile-friendly tweaks`.

## Task 7: Import + sign-in mobile polish

**Files:**
- Modify: `app/upload/page.tsx` — stack to 1 column on mobile (`md:grid-cols-2` → default 1), full-width buttons, shorter labels
- Modify: `app/auth/signin/page.tsx` — already centered, just add safe-area padding

**Steps:**
1. Adjust grids + button width.
2. Commit: `feat(mobile): polish import + sign-in screens`.

## Task 8: Touch-target + a11y audit

**Files:**
- Grep for `size="sm"` and `size="xs"` in app folder — bump to default where user-tappable on mobile
- Modify any Button with < 44px intrinsic height on mobile
- Add `aria-label` to icon-only buttons (bottom nav, FAB, sync icon)
- Add `@media (prefers-reduced-motion: reduce)` rule to disable chart carousel transition

**Steps:**
1. Audit list from grep.
2. Patch each site.
3. Commit: `fix(a11y): touch targets, aria-labels, reduced-motion`.

## Task 9: Build + lint verification

**Commands:**
```bash
pnpm lint
pnpm build
```

Expected: zero TypeScript errors, zero lint errors.

If errors: fix → re-run → only move on when clean.

Commit any fixups: `fix(build): <what>`.

## Task 10: Visual verification

**Steps:**
1. Ensure Docker Postgres is up (`docker compose up -d` or check `docker ps`).
2. Ensure Prisma migrations are applied (`pnpm prisma migrate deploy` or `pnpm prisma db push`).
3. Start dev server `pnpm dev` (background).
4. Use Chrome MCP to open `http://localhost:3000/dashboard` at 375×812 and at 1440×900.
5. Screenshot:
   - Mobile: Dashboard, Transactions, Budgets, More, Add-Txn bottom sheet, Filter sheet.
   - Desktop: Dashboard (unchanged layout check).
6. Save screenshots under `docs/plans/2026-04-19/screenshots/`.
7. Check dark mode by toggling OS preference or temporarily forcing `.dark` class.

If sign-in blocks access: use the seed/fixture flow (check `scripts/` for a seed) or temporarily seed a session via Prisma.

## Task 11: Finalize

**Steps:**
1. Final commit if any (screenshots + any polish).
2. Create Gmail draft to `chockidorji@gmail.com` with: summary, list of changes, PR-ready commit list, deploy note, known gaps.
3. Send PushNotification.
4. Telegram message if chat_id received.

---

## Commit hygiene

One commit per task (or sub-task). Prefix:
- `feat(pwa|dashboard|transactions|settings|mobile): …`
- `fix(build|a11y): …`

## Known risks / watch-outs

- **Dialog → bottom sheet**: Base UI Dialog positioning is centered; bottom-sheet variant needs custom `className` on `DialogPrimitive.Popup` with `fixed inset-x-0 bottom-0 translate-x-0 translate-y-0` and slide-up animation. Test on 375px.
- **Infinite scroll**: IntersectionObserver — easy to overfetch; debounce with a single in-flight flag.
- **Dark mode FOUC**: pre-hydration script must be the first thing inside `<head>`; Next's `<Script strategy="beforeInteractive">` may inject after, so use a plain `<script dangerouslySetInnerHTML>` in `app/layout.tsx`.
- **Visual verification without auth**: may need to stub auth or run with a real Google sign-in. If blocked, seed a test session row in the DB directly.
