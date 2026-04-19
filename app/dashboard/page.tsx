import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getMonthKpis,
  getCategoryBreakdown,
  getDailyTrend,
  getMonthsWithActivity,
  getBudgetProgress,
  parseMonthParam,
} from "@/lib/dashboard";
import KpiCards from "./kpi-cards";
import CategoryPie from "./category-pie";
import TrendLine from "./trend-line";
import TransactionTable from "./transaction-table";
import BudgetProgress from "./budget-progress";
import BudgetStrip from "./budget-strip";
import CategoryList from "./category-list";
import ChartCarousel from "./chart-carousel";
import RecentTxns from "./recent-txns";
import AddTransaction, { AddTransactionFab } from "./add-transaction";
import SignOutButton from "./sign-out";
import SyncButton from "./sync-button";
import MonthSelector from "./month-selector";
import MobileHeader from "@/components/mobile/mobile-header";
import { prisma } from "@/lib/db";

function currentMonthValue(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  const userId = (session.user as any).id;
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { needsReauth: true },
  });

  const currentValue = currentMonthValue();
  const selectedValue = searchParams.month ?? currentValue;
  const selectedAnchor = parseMonthParam(selectedValue) ?? undefined;

  function monthBoundStrings(monthKey: string): { from: string; to: string } {
    const [y, m] = monthKey.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from: first, to: last };
  }
  const monthBounds = monthBoundStrings(selectedValue);
  // ISO bounds for the category breakdown API (IST-aware).
  const fromISO = new Date(monthBounds.from + "T00:00:00+05:30").toISOString();
  const toISO = new Date(monthBounds.to + "T23:59:59+05:30").toISOString();

  const [kpis, currentKpis, pie, trend, monthsWithActivity, budgetRows] = await Promise.all([
    getMonthKpis(userId, selectedAnchor),
    getMonthKpis(userId),
    getCategoryBreakdown(userId, selectedAnchor),
    getDailyTrend(userId, undefined, selectedAnchor),
    getMonthsWithActivity(userId),
    getBudgetProgress(userId, selectedAnchor),
  ]);

  const seen = new Set<string>();
  const options: { value: string; label: string }[] = [];
  const pushIfNew = (o: { value: string; label: string }) => {
    if (seen.has(o.value)) return;
    seen.add(o.value);
    options.push(o);
  };
  pushIfNew({ value: currentValue, label: currentKpis.monthLabel + " (current)" });
  for (const m of monthsWithActivity) pushIfNew(m);

  return (
    <>
      <MobileHeader title="Dashboard" subtitle={session.user.email ?? undefined} showSync rightHref="/settings" />
      <main className="mx-auto max-w-7xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-5 md:space-y-6">
        <header className="hidden md:flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
          </div>
          <div className="flex gap-2">
            <AddTransaction />
            <SyncButton />
            <Link href="/upload">
              <Button variant="outline">Import statement</Button>
            </Link>
            <Link href="/settings/budgets">
              <Button variant="ghost" size="sm">
                Budgets
              </Button>
            </Link>
            <Link href="/settings/categories">
              <Button variant="ghost" size="sm">
                Overrides
              </Button>
            </Link>
            <SignOutButton />
          </div>
        </header>
        {account?.needsReauth && (
          <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
            Gmail access expired.{" "}
            <a className="underline" href="/api/auth/signin/google">
              Reconnect
            </a>
            .
          </div>
        )}
        <div className="flex items-center justify-center md:justify-between gap-3 flex-wrap">
          <MonthSelector options={options} defaultValue={currentValue} currentValue={selectedValue} />
        </div>
        <KpiCards selected={kpis} current={currentKpis} />

        {/* Mobile stack */}
        <BudgetStrip rows={budgetRows} monthLabel={kpis.monthLabel} fromISO={fromISO} toISO={toISO} monthKey={selectedValue} />
        <ChartCarousel trend={trend} pie={pie} monthLabel={kpis.monthLabel} />
        <div className="md:hidden">
          <CategoryList data={pie} monthLabel={kpis.monthLabel} fromISO={fromISO} toISO={toISO} monthKey={selectedValue} />
        </div>
        <RecentTxns from={monthBounds.from} to={monthBounds.to} />

        {/* Desktop charts + budget + table */}
        <div className="hidden md:grid gap-6 lg:grid-cols-2">
          <CategoryPie data={pie} monthLabel={kpis.monthLabel} />
          <TrendLine data={trend} monthLabel={kpis.monthLabel} />
        </div>
        <div className="hidden md:block">
          <CategoryList data={pie} monthLabel={kpis.monthLabel} fromISO={fromISO} toISO={toISO} monthKey={selectedValue} title="All categories" />
        </div>
        <div className="hidden md:block">
          <BudgetProgress rows={budgetRows} monthLabel={kpis.monthLabel} fromISO={fromISO} toISO={toISO} monthKey={selectedValue} />
        </div>
        <div className="hidden md:block">
          <TransactionTable initialFrom={monthBounds.from} initialTo={monthBounds.to} monthLabel={kpis.monthLabel} />
        </div>
      </main>
      <AddTransactionFab />
    </>
  );
}
