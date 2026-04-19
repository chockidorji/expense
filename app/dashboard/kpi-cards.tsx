import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

type KpiData = {
  totalSpend: number;
  topCategory: string | null;
  topCategoryAmount: number;
  transactionCount: number;
  monthLabel?: string;
};

function KpiRow({ data }: { data: KpiData }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Total spend</CardTitle></CardHeader>
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

export default function KpiCards({
  selected,
  current,
}: {
  selected: KpiData;
  current: KpiData;
}) {
  const sameMonth = selected.monthLabel === current.monthLabel;

  if (sameMonth) {
    return (
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Current month · {current.monthLabel}</h2>
        <KpiRow data={current} />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Current month · {current.monthLabel}</h2>
        <KpiRow data={current} />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Viewing · {selected.monthLabel}</h2>
        <KpiRow data={selected} />
      </section>
    </div>
  );
}
