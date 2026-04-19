"use client";
import { useState } from "react";
import { BottomSheet, BottomSheetContent, BottomSheetFooter } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_CATEGORIES } from "@/lib/categorizer";

export type Filters = {
  category?: string;
  source?: string;
  minAmount?: string;
  maxAmount?: string;
  from?: string;
  to?: string;
};

export default function FilterSheet({
  open,
  onOpenChange,
  filters,
  onApply,
  onReset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: Filters;
  onApply: (f: Filters) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState<Filters>(filters);

  // When sheet opens, sync draft with current filters
  if (open && JSON.stringify(draft) === "{}" && JSON.stringify(filters) !== "{}") {
    setDraft(filters);
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setDraft(filters);
      }}
    >
      <BottomSheetContent title="Filters">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="f-from">From</Label>
              <Input
                id="f-from"
                type="date"
                value={draft.from ?? ""}
                onChange={(e) => setDraft((f) => ({ ...f, from: e.target.value || undefined }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-to">To</Label>
              <Input
                id="f-to"
                type="date"
                value={draft.to ?? ""}
                onChange={(e) => setDraft((f) => ({ ...f, to: e.target.value || undefined }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>Category</Label>
            <Select
              value={draft.category ?? "all"}
              onValueChange={(v: any) => setDraft((f) => ({ ...f, category: v === "all" ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {ALL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c} className="capitalize">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Source</Label>
            <Select
              value={draft.source ?? "all"}
              onValueChange={(v: any) => setDraft((f) => ({ ...f, source: v === "all" ? undefined : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="CSV">CSV</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="f-min">Min ₹</Label>
              <Input
                id="f-min"
                type="number"
                inputMode="numeric"
                value={draft.minAmount ?? ""}
                onChange={(e) => setDraft((f) => ({ ...f, minAmount: e.target.value || undefined }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-max">Max ₹</Label>
              <Input
                id="f-max"
                type="number"
                inputMode="numeric"
                value={draft.maxAmount ?? ""}
                onChange={(e) => setDraft((f) => ({ ...f, maxAmount: e.target.value || undefined }))}
              />
            </div>
          </div>
        </div>
        <BottomSheetFooter>
          <Button
            variant="outline"
            onClick={() => {
              setDraft({});
              onReset();
              onOpenChange(false);
            }}
          >
            Reset
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </BottomSheetFooter>
      </BottomSheetContent>
    </BottomSheet>
  );
}
