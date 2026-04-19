# Expense Tracker — Mobile-First UX Redesign

**Date:** 2026-04-19
**Owner:** chockidorji@gmail.com
**Status:** Approved, ready for implementation planning

## Goal

This app is used primarily on phones. Current UI is desktop-first: wide headers with 6 buttons, table layouts that overflow at 375px, no viewport meta, no install manifest, no bottom navigation. Redesign the UI mobile-first so the app feels native on a phone, while still scaling gracefully to desktop.

## Locked decisions (from brainstorm)

1. **Scope — Mobile-first overhaul, keep current aesthetic.** No new palette/type system. Reuse oklch token set and Inter font. Responsive: `md:` and up keeps today's desktop layout.
2. **Navigation — Bottom tab bar on mobile.** Four tabs: Dashboard, Transactions, Budgets, More (Settings). Hidden at `md:` and up; desktop keeps the existing top-right button row.
3. **Dashboard hero — Spend-first.** Big centered spend number with MoM delta + top category one-liner. KPIs for Income / Net / Txns / Latest fill a 2×2 grid below.
4. **Transactions list — Filter chips + card rows + bottom-sheet filters.** No table on mobile. Day-grouped card rows with merchant + category chip + amount. Active filters show as removable chips above the list; "Filter" button opens a bottom sheet with all controls.
5. **PWA — Full install support.** `manifest.webmanifest`, icon set, viewport meta, theme color. Standalone display removes browser chrome when launched from Home Screen. No service worker for v1.
6. **Dark mode — Auto (follow `prefers-color-scheme`) for now.** Manual toggle deferred. Add `<html class="dark">` toggle based on a tiny pre-hydration script (blocks FOUC).

## Information architecture

| Tab | Route | Purpose |
|---|---|---|
| Dashboard | `/dashboard` | Month selector, KPIs, budget strip, charts, recent txns |
| Transactions | `/transactions` (new route) | Full list, filter chips, bottom-sheet filters, infinite scroll |
| Budgets | `/settings/budgets` | Already exists; wired as a tab |
| More | `/settings` (new hub) | Overrides, Import, Sync Gmail, Sign out, account status |

**Global chrome on mobile:**
- Top: compact title bar — app name left, sync icon + avatar/menu right.
- Bottom: tab bar with icon + label per tab, safe-area padding, `env(safe-area-inset-bottom)`.
- Floating Action Button (⊕ Add) sits above the bottom bar on Dashboard and Transactions, opens full-screen sheet of the existing AddTransaction form.

**Global chrome on desktop (`md:` and up):**
- Bottom tab bar hidden.
- Current header with six buttons comes back (Add Transaction, Sync Gmail, Import statement, Budgets, Overrides, Sign out).
- Dashboard keeps today's two-column chart layout, full KPI row, inline transaction table.

## Screen-by-screen

### Dashboard (`/dashboard`)

Single scroll column on mobile, stacked:

1. **Month selector** — pill-style dropdown centered under the title. When a non-current month is selected, a dismissible "Viewing April · back to Current" banner appears below.
2. **Hero KPI** — large centered spend amount, delta badge directly beneath, then `Top: Food · ₹3,400` one-liner.
3. **KPI 2×2 grid** — Income / Net / Txns / Latest-txn. Smaller cards, tabular-nums, each with its own delta badge.
4. **Budget strip** — horizontal scroll of per-category chips (spent / budget + mini bar). Tap a chip → Budgets tab. Empty-state card if none set.
5. **Charts carousel** — one chart visible at a time (`~220px` tall on mobile). Tab toggle between *Daily trend* and *By category (pie)*.
6. **Recent transactions** — latest 5 card rows + "See all" link → Transactions tab.

Desktop: two-row KPI block (current + viewing) returns, charts side-by-side, budget bars expanded, inline transaction table.

### Transactions (`/transactions`)

- **Top:** active filter chips (month, category, source, min/max). Each chip has an × to remove. A "Filter" button on the right opens a bottom sheet with all filter inputs (date range, category, source, amount range, reset).
- **List:** day-grouped card rows. Each row: merchant (truncated), category chip (editable via tap → select), amount right-aligned and color-coded (debit default, credit green). Tap anywhere else on the row → details sheet (future).
- **Infinite scroll:** replaces "Load more" button — existing cursor API already supports it.
- **Empty state:** centered icon + "No transactions in this range" + "Reset filters" button.

Desktop: falls back to the current table with filters inline above.

### Budgets (`/settings/budgets`)

Minimal reflow — inputs stack to single column on mobile with a save button per row. Total target shown at the top. No structural change; just mobile spacing (full-width inputs, 44px min touch targets).

### More / Settings hub (`/settings`)

New screen on mobile, grouped list:

- **Account** — email + `needsReauth` banner (if set) with Reconnect link.
- **Actions** — Sync Gmail, Import statement.
- **Data** — Category overrides → `/settings/categories`, Budgets → `/settings/budgets` (also reachable as tab).
- **Sign out** — at the bottom, destructive style.

### Import (`/upload`)

Same four-step flow, but cards stack full-width, "Map columns" grid collapses to single column, preview table gets `overflow-x-auto` wrapper (already present).

### Auth (`/auth/signin`)

Already mobile-friendly (`max-w-sm` centered card). No change beyond adding viewport meta globally.

## Components to add

| Component | Path | Purpose |
|---|---|---|
| `BottomNav` | `components/mobile/bottom-nav.tsx` | Tab bar, active-state highlight, hidden at `md:` |
| `MobileHeader` | `components/mobile/mobile-header.tsx` | Title + sync icon; only on mobile |
| `Fab` | `components/mobile/fab.tsx` | Floating add button |
| `BottomSheet` | `components/ui/bottom-sheet.tsx` | Slide-up sheet for filters + add-transaction; wraps `Dialog` with mobile styling |
| `Chip` | `components/ui/chip.tsx` | Removable filter chip + category chip |
| `TxnRow` | `app/transactions/txn-row.tsx` | Mobile card row for a transaction |
| `ChartCarousel` | `app/dashboard/chart-carousel.tsx` | Swipe/tab between daily trend and pie |
| `BudgetStrip` | `app/dashboard/budget-strip.tsx` | Horizontal scroll chips |

## Component reuse (no change needed)

- `Card`, `Button`, `Input`, `Select`, `Label`, `Badge`, `Table` — keep, used on desktop paths.
- `KpiCards` — internals restructured (hero + 2×2) but component stays.
- `MonthSelector`, `AddTransaction`, `SyncButton`, `BudgetProgress` — move or wrap, don't rewrite.

## PWA assets

- `app/manifest.webmanifest` served at `/manifest.webmanifest`, with `name`, `short_name: "Expenses"`, `display: "standalone"`, `theme_color`, `background_color`, `start_url: "/dashboard"`, `icons` (192, 512, maskable 512).
- Icons under `public/icons/` — generated once; favicon stays at `app/favicon.ico`.
- Meta in `app/layout.tsx`: `viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" }`, `themeColor`, manifest link.
- Apple-specific: `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`.

## Dark mode wiring

Current CSS already has full `:root` and `.dark` token sets. Missing piece is toggling `.dark` on `<html>`.

- Tiny pre-hydration inline script in `app/layout.tsx` reads `prefers-color-scheme` and sets `document.documentElement.classList.toggle("dark", …)` before React paints. Prevents flash.
- No user preference persisted yet; manual toggle is a v2 task.

## Accessibility & touch

- **44×44px minimum** touch targets. Audit `Button size="sm"` usages — bump to default on mobile, or add a `min-h-[44px]` shim.
- **Focus rings** visible on all interactive elements (current tokens already define `--ring`).
- **`cursor-pointer`** on every clickable row/chip (baseline-ui rule).
- **`prefers-reduced-motion`** respected for the chart carousel transition and bottom-sheet slide.
- **Alt text / aria** — icon-only buttons in bottom nav and FAB need `aria-label`.

## Responsive breakpoints

- Mobile: default styles (≤ 767px).
- Tablet/desktop: `md:` (≥ 768px) restores current desktop layout.
- Nothing targeting `lg:` changes in direction — the current `lg:grid-cols-2` charts still hold.

## Non-goals (explicitly out of scope)

- Service worker / offline support.
- Manual dark-mode toggle.
- Transaction detail/edit screen beyond category edit (tap-to-details is a stub for future).
- Swipe-to-delete / swipe-to-categorize on rows.
- Redesigning the import wizard beyond mobile-safe layout.
- New visual identity (colors, type, illustration).

## Testing / validation

No automated UI tests in this repo. Validation plan:

1. Build + `next lint` clean.
2. Manual walk-through on iPhone (Safari) at 375×812 — all tabs, FAB, bottom sheet, filter chips, dark mode auto.
3. Desktop check at 1440px — desktop layout unchanged.
4. Check `needsReauth` banner still renders.
5. Add-transaction event (`expense-tracker:transaction-added`) still refreshes list.
