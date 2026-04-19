import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import MobileHeader from "@/components/mobile/mobile-header";
import UpcomingList from "./list";
import { AddTransactionFab } from "../dashboard/add-transaction";

export default async function UpcomingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");

  return (
    <>
      <MobileHeader title="Upcoming" showSync rightHref="/settings" />
      <main className="mx-auto max-w-3xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-4">
        <div className="hidden md:flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Upcoming payments</h1>
            <p className="text-sm text-muted-foreground">Predicted from your transaction history; matched when the real debit lands.</p>
          </div>
        </div>
        <UpcomingList />
      </main>
      <AddTransactionFab />
    </>
  );
}
