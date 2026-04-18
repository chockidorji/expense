import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function KpiCards({ data }: { data: { totalSpend: number; topCategory: string | null; topCategoryAmount: number; transactionCount: number } }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total spend (this month)</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{fmt.format(data.totalSpend)}</div></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Top category</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold capitalize">{data.topCategory ?? "—"}</div>
          {data.topCategory && <div className="text-sm text-muted-foreground">{fmt.format(data.topCategoryAmount)}</div>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle></CardHeader>
        <CardContent><div className="text-3xl font-semibold">{data.transactionCount}</div></CardContent>
      </Card>
    </div>
  );
}
