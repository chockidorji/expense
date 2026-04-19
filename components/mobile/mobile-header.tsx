"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function MobileHeader({
  title,
  subtitle,
  showSync = false,
  rightHref,
  className,
}: {
  title: string;
  subtitle?: string;
  showSync?: boolean;
  rightHref?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/gmail/sync", { method: "POST" });
      if (!r.ok) {
        toast.error("Sync failed");
        return;
      }
      const j = await r.json();
      toast.success(`Sync: ${j.inserted} new · ${j.duplicates} dup`);
      window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <header
      className={cn(
        "md:hidden sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border pt-safe",
        className
      )}
    >
      <div className="flex items-center justify-between px-4 h-14">
        <div className="min-w-0">
          <div className="text-base font-semibold truncate">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          {showSync && (
            <button
              type="button"
              onClick={sync}
              disabled={busy}
              aria-label={busy ? "Syncing Gmail" : "Sync Gmail"}
              className="flex items-center justify-center h-11 w-11 rounded-full hover:bg-muted active:bg-muted/80 disabled:opacity-50 cursor-pointer transition-colors"
            >
              <RefreshCw className={cn("h-5 w-5", busy && "animate-spin")} aria-hidden />
            </button>
          )}
          {rightHref && (
            <Link
              href={rightHref}
              aria-label="Account"
              className="flex items-center justify-center h-11 w-11 rounded-full hover:bg-muted cursor-pointer transition-colors"
            >
              <User className="h-5 w-5" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
