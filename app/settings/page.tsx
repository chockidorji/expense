import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ChevronRight, Upload, Mail, Tags, PiggyBank, LogOut, UserCircle } from "lucide-react";
import MobileHeader from "@/components/mobile/mobile-header";
import SignOutButton from "../dashboard/sign-out";
import SyncButton from "../dashboard/sync-button";
import { prisma } from "@/lib/db";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/signin");
  const userId = (session.user as any).id;
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { needsReauth: true },
  });

  return (
    <>
      <MobileHeader title="Settings" />
      <main className="mx-auto max-w-2xl px-4 md:p-6 pt-4 md:pt-6 pb-6 space-y-5">
        <h1 className="hidden md:block text-2xl font-semibold">Settings</h1>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Account</h2>
          <Card>
            <div className="flex items-center gap-3 px-4 py-4">
              <div className="h-10 w-10 rounded-full bg-muted grid place-items-center shrink-0">
                <UserCircle className="h-6 w-6 text-muted-foreground" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{session.user.name || "Signed in"}</div>
                <div className="text-xs text-muted-foreground truncate">{session.user.email}</div>
              </div>
            </div>
            {account?.needsReauth && (
              <div className="mx-4 mb-4 rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs">
                Gmail access expired.{" "}
                <a className="underline font-medium" href="/api/auth/signin/google">
                  Reconnect
                </a>
              </div>
            )}
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</h2>
          <Card>
            <div className="divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-3">
                <Mail className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Sync Gmail now</div>
                  <div className="text-xs text-muted-foreground">Pull latest transaction emails into your tracker.</div>
                </div>
                <SyncButton />
              </div>
              <Link href="/upload" className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Import statement</div>
                  <div className="text-xs text-muted-foreground">Upload a bank CSV or Excel file.</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
              </Link>
            </div>
          </Card>
        </section>

        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">Data</h2>
          <Card>
            <div className="divide-y divide-border">
              <Link href="/settings/budgets" className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <PiggyBank className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Monthly budgets</div>
                  <div className="text-xs text-muted-foreground">Set per-category caps.</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
              </Link>
              <Link href="/settings/categories" className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                <Tags className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">Category overrides</div>
                  <div className="text-xs text-muted-foreground">Edit learned merchant → category mappings.</div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
              </Link>
            </div>
          </Card>
        </section>

        <section className="space-y-2">
          <Card>
            <div className="flex items-center gap-3 px-4 py-3">
              <LogOut className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0" aria-hidden />
              <div className="flex-1 text-sm font-medium text-red-600 dark:text-red-500">Sign out</div>
              <SignOutButton />
            </div>
          </Card>
        </section>

        <p className="text-center text-[11px] text-muted-foreground pt-2">Expense Tracker</p>
      </main>
    </>
  );
}
