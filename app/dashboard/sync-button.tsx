"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export default function SyncButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      className="min-h-[44px] md:min-h-0"
      onClick={async () => {
        setBusy(true);
        const r = await fetch("/api/gmail/sync", { method: "POST" });
        setBusy(false);
        if (!r.ok) { toast.error("Sync failed"); return; }
        const j = await r.json();
        const errs = j.errors?.length ? ` · ${j.errors.length} errors` : "";
        toast.success(`Sync: ${j.inserted} new · ${j.duplicates} dup · ${j.unrecognized} unparsed${errs}`);
        window.dispatchEvent(new CustomEvent("expense-tracker:transaction-added"));
        router.refresh();
      }}
    >
      {busy ? "Syncing..." : "Sync Gmail"}
    </Button>
  );
}
