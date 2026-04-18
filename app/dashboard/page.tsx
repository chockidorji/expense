import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
          <Link href="/upload"><Button variant="outline">Import CSV</Button></Link>
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
