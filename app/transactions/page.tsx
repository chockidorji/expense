import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import TransactionsList from "./list";
import MobileHeader from "@/components/mobile/mobile-header";
import { AddTransactionFab } from "../dashboard/add-transaction";

function currentMonthValue(): string {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Kolkata" });
  const parts = fmt.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function monthBoundStrings(monthKey: string): { from: string; to: string } {
  const [y, m] = monthKey.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from: first, to: last };
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: { month?: string; category?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");

  const selected = searchParams.month ?? currentMonthValue();
  const bounds = monthBoundStrings(selected);

  return (
    <>
      <MobileHeader title="Transactions" showSync rightHref="/settings" />
      <main className="mx-auto max-w-5xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-4">
        <h1 className="hidden md:block text-2xl font-semibold">Transactions</h1>
        <TransactionsList
          initialFrom={bounds.from}
          initialTo={bounds.to}
          initialCategory={searchParams.category}
        />
      </main>
      <AddTransactionFab />
    </>
  );
}
