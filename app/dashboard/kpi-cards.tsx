import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const fmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

type KpiData = {
  totalSpend: number;
  totalIncome: number;
  netFlow: number;
  transactionCount: number;
  topCategory: string | null;
  topCategoryAmount: number;
  topIncomeSource: string | null;
  topIncomeSourceAmount: number;
  latestTxnAmount?: number | null;
  latestTxnMerchant?: string | null;
  latestTxnDate?: Date | string | null;
  spendDelta: number | null;
  incomeDelta: number | null;
  netDelta: number | null;
  txnCountDelta: number | null;
  previousSpend: number;
  previousIncome: number;
  monthLabel?: string;
};

function DeltaBadge({ pct, invertColor = false }: { pct: number | null; invertColor?: boolean }) {
  if (pct === null) return <span className="text-xs text-muted-foreground">no prior month</span>;
  if (pct === 0) return <span className="text-xs text-muted-foreground">flat vs prior</span>;
  const up = pct > 0;
  // Default: up=red (spend), down=green. invertColor flips (for income/net where up is good).
  const good = invertColor ? up : !up;
  const cls = good ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500";
  const arrow = up ? "↑" : "↓";
  return <span className={`text-xs ${cls}`}>{arrow} {Math.abs(pct).toFixed(0)}% vs prior</span>;
}

function KpiRow({ data }: { data: KpiData }) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Spend</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{fmt.format(data.totalSpend)}</div>
          {data.topCategory && <div className="text-sm text-muted-foreground capitalize">Top: {data.topCategory} · {fmt.format(data.topCategoryAmount)}</div>}
          <DeltaBadge pct={data.spendDelta} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Income</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{fmt.format(data.totalIncome)}</div>
          {data.topIncomeSource && (
            <div className="text-sm text-muted-foreground truncate" title={data.topIncomeSource}>
              Top: {data.topIncomeSource.length > 24 ? data.topIncomeSource.slice(0, 24) + "…" : data.topIncomeSource} · {fmt.format(data.topIncomeSourceAmount)}
            </div>
          )}
          <DeltaBadge pct={data.incomeDelta} invertColor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Net</CardTitle></CardHeader>
        <CardContent>
          <div className={`text-3xl font-semibold ${data.netFlow >= 0 ? "text-emerald-700 dark:text-emerald-500" : "text-red-700 dark:text-red-500"}`}>
            {data.netFlow >= 0 ? "+" : ""}{fmt.format(data.netFlow)}
          </div>
          <div className="text-sm text-muted-foreground">Income − Spend</div>
          <DeltaBadge pct={data.netDelta} invertColor />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-muted-foreground">Transactions</CardTitle></CardHeader>
        <CardContent>
          <div className="text-3xl font-semibold">{data.transactionCount}</div>
          {data.latestTxnAmount != null && (
            <div className="text-sm text-muted-foreground">
              Latest: {fmt.format(data.latestTxnAmount)}
              {data.latestTxnDate && <span> · {dateFmt.format(new Date(data.latestTxnDate))}</span>}
            </div>
          )}
          <DeltaBadge pct={data.txnCountDelta} invertColor />
        </CardContent>
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
