import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type KpiData = {
  totalSpend: number;
  topCategory: string | null;
  topCategoryAmount: number;
  transactionCount: number;
  monthLabel?: string;
};

export default function KpiCards({ data }: { data: KpiData }) {
  const suffix = data.monthLabel ? ` · ${data.monthLabel}` : "";
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total spend{suffix}</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{fmt.format(data.totalSpend)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Top category{suffix}</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold capitalize">{data.topCategory ?? "—"}</div>
          {data.topCategory && <div className="text-sm text-muted-foreground">{fmt.format(data.topCategoryAmount)}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Transactions{suffix}</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{data.transactionCount}</div></CardContent>
      </Card>
    </div>
  );
}
