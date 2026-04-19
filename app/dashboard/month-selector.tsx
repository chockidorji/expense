"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Label } from "@/components/ui/label";

type Option = { value: string; label: string };

export default function MonthSelector({
  options,
  defaultValue,
  currentValue,
}: {
  options: Option[];
  defaultValue: string;
  currentValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(value: string) {
    const sp = new URLSearchParams(params.toString());
    if (value === defaultValue) sp.delete("month");
    else sp.set("month", value);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="month-selector" className="text-sm text-muted-foreground">Viewing</Label>
      <select
        id="month-selector"
        value={currentValue}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
