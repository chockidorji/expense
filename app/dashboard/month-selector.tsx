"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type Option = { value: string; label: string };

export default function MonthSelector({ options, defaultValue, currentValue }: { options: Option[]; defaultValue: string; currentValue: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(value: string | null) {
    if (!value) return;
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
      <Select value={currentValue} onValueChange={onChange}>
        <SelectTrigger id="month-selector" className="w-56">
          <SelectValue>
            {(value: unknown) => {
              const v = typeof value === "string" ? value : currentValue;
              return options.find(o => o.value === v)?.label ?? v;
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
