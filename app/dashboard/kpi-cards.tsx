import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

function DeltaBadge({ pct, invertColor = false, className }: { pct: number | null; invertColor?: boolean; className?: string }) {
  if (pct === null) return <span className={cn("text-xs text-muted-foreground", className)}>no prior month</span>;
  if (pct === 0) return <span className={cn("text-xs text-muted-foreground", className)}>flat vs prior</span>;
  const up = pct > 0;
  const good = invertColor ? up : !up;
  const cls = good ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500";
  const arrow = up ? "↑" : "↓";
  return <span className={cn("text-xs", cls, className)}>{arrow} {Math.abs(pct).toFixed(0)}% vs prior</span>;
}

function MobileHero({ data }: { data: KpiData }) {
  return (
    <Card className="md:hidden">
      <CardContent className="pt-4 text-center">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Spent this month</div>
        <div className="mt-1 text-4xl font-semibold tabular-nums">{fmt.format(data.totalSpend)}</div>
        <div className="mt-1 flex items-center justify-center">
          <DeltaBadge pct={data.spendDelta} />
        </div>
        {data.topCategory && (
          <div className="mt-2 text-xs text-muted-foreground capitalize">
            Top: {data.topCategory} · {fmt.format(data.topCategoryAmount)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MobileKpiTile({
  label,
  value,
  delta,
  invertDelta,
  extra,
  valueClass,
}: {
  label: string;
  value: string;
  delta: number | null;
  invertDelta?: boolean;
  extra?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <Card className="md:hidden">
      <CardContent className="pt-3 pb-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn("mt-0.5 text-xl font-semibold tabular-nums truncate", valueClass)}>{value}</div>
        <DeltaBadge pct={delta} invertColor={invertDelta} className="mt-0.5 block" />
        {extra}
      </CardContent>
    </Card>
  );
}

function DesktopKpiRow({ data }: { data: KpiData }) {
  return (
    <div className="hidden md:grid gap-4 md:grid-cols-4">
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

function MobileRow({ data }: { data: KpiData }) {
  const netClass = data.netFlow >= 0 ? "text-emerald-700 dark:text-emerald-500" : "text-red-700 dark:text-red-500";
  const netPrefix = data.netFlow >= 0 ? "+" : "";
  return (
    <>
      <MobileHero data={data} />
      <div className="grid grid-cols-2 gap-3 md:hidden">
        <MobileKpiTile label="Income" value={fmt.format(data.totalIncome)} delta={data.incomeDelta} invertDelta />
        <MobileKpiTile label="Net" value={`${netPrefix}${fmt.format(data.netFlow)}`} delta={data.netDelta} invertDelta valueClass={netClass} />
        <MobileKpiTile label="Txns" value={String(data.transactionCount)} delta={data.txnCountDelta} invertDelta />
        <MobileKpiTile
          label="Latest"
          value={data.latestTxnAmount != null ? fmt.format(data.latestTxnAmount) : "—"}
          delta={null}
          extra={
            data.latestTxnDate ? (
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{dateFmt.format(new Date(data.latestTxnDate))}</div>
            ) : null
          }
        />
      </div>
    </>
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
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground hidden md:block">Current month · {current.monthLabel}</h2>
        <div className="space-y-3">
          <MobileRow data={current} />
          <DesktopKpiRow data={current} />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground hidden md:block">Current month · {current.monthLabel}</h2>
        <div className="space-y-3 md:hidden text-center text-xs text-muted-foreground">Viewing a past month. Scroll for its numbers; current month still shows on desktop.</div>
        <div className="hidden md:block space-y-3">
          <DesktopKpiRow data={current} />
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground hidden md:block">Viewing · {selected.monthLabel}</h2>
        <div className="md:hidden text-xs text-muted-foreground">{selected.monthLabel}</div>
        <div className="space-y-3">
          <MobileRow data={selected} />
          <DesktopKpiRow data={selected} />
        </div>
      </section>
    </div>
  );
}
