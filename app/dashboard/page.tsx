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
  parseMonthParam,
} from "@/lib/dashboard";
import KpiCards from "./kpi-cards";
import CategoryPie from "./category-pie";
import TrendLine from "./trend-line";
import TransactionTable from "./transaction-table";
import AddTransaction from "./add-transaction";
import SignOutButton from "./sign-out";
import SyncButton from "./sync-button";
import MonthSelector from "./month-selector";
import { prisma } from "@/lib/db";

function currentMonthValue(): string {
  const now = new Date();
  // Asia/Kolkata month key. Using en-CA gives yyyy-mm-dd style.
  const fmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" });
  const parts = fmt.formatToParts(now);
  const y = parts.find(p => p.type === "year")?.value ?? "2026";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
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

  // Compute the IST start/end-of-month as YYYY-MM-DD strings for the table's
  // default date filter.
  function monthBoundStrings(monthKey: string): { from: string; to: string } {
    const [y, m] = monthKey.split("-").map(Number);
    const first = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from: first, to: last };
  }
  const monthBounds = monthBoundStrings(selectedValue);

  const [kpis, currentKpis, pie, trend, monthsWithActivity] = await Promise.all([
    getMonthKpis(userId, selectedAnchor),
    getMonthKpis(userId),                 // no anchor = current IST month
    getCategoryBreakdown(userId, selectedAnchor),
    getDailyTrend(userId, undefined, selectedAnchor),
    getMonthsWithActivity(userId),
  ]);

  // Build the selector options: current month always at top, then months with
  // debits in descending order (may include current month already).
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
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Signed in as {session.user.email}</p>
        </div>
        <div className="flex gap-2">
          <AddTransaction />
          <SyncButton />
          <Link href="/upload"><Button variant="outline">Import statement</Button></Link>
          <Link href="/settings/categories"><Button variant="ghost" size="sm">Overrides</Button></Link>
          <SignOutButton />
        </div>
      </header>
      {account?.needsReauth && (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
          Gmail access expired. <a className="underline" href="/api/auth/signin/google">Reconnect</a>.
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <MonthSelector options={options} defaultValue={currentValue} currentValue={selectedValue} />
      </div>
      <KpiCards selected={kpis} current={currentKpis} />
      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryPie data={pie} monthLabel={kpis.monthLabel} />
        <TrendLine data={trend} monthLabel={kpis.monthLabel} />
      </div>
      <TransactionTable
        initialFrom={monthBounds.from}
        initialTo={monthBounds.to}
        monthLabel={kpis.monthLabel}
      />
    </main>
  );
}
