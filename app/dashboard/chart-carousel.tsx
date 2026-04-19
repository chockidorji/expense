"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { LineChart, Line, XAxis, YAxis, Tooltip as LineTooltip, ResponsiveContainer as LineContainer, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#f97316", "#8b5cf6", "#84cc16", "#ec4899", "#64748b"];

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

export default function ChartCarousel({
  trend,
  pie,
  monthLabel,
}: {
  trend: { date: string; amount: number }[];
  pie: { category: string; amount: number }[];
  monthLabel?: string;
}) {
  const [tab, setTab] = useState<"trend" | "pie">("trend");

  return (
    <Card className="md:hidden">
      <div className="px-4 pt-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{monthLabel ?? "This month"}</h3>
        <div role="tablist" aria-label="Chart view" className="flex gap-1 rounded-full bg-muted p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "trend"}
            onClick={() => setTab("trend")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors",
              tab === "trend" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            Daily
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pie"}
            onClick={() => setTab("pie")}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded-full cursor-pointer transition-colors",
              tab === "pie" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            By category
          </button>
        </div>
      </div>
      <div className="px-3 pb-3 h-[220px]">
        {tab === "trend" ? (
          trend.length === 0 ? (
            <div className="h-full grid place-items-center text-xs text-muted-foreground">No data yet.</div>
          ) : (
            <LineContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: any) => `₹${Math.round(Number(v) / 1000)}k`} tick={{ fontSize: 11 }} width={40} />
                <LineTooltip
                  labelFormatter={(label: any) =>
                    new Date(String(label) + "T00:00:00+05:30").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
                  }
                  formatter={(v: any) => inr(Number(v))}
                />
                <Line type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} dot={false} />
              </LineChart>
            </LineContainer>
          )
        ) : pie.length === 0 ? (
          <div className="h-full grid place-items-center text-xs text-muted-foreground">No spend in this month.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pie} dataKey="amount" nameKey="category" innerRadius={45} outerRadius={80}>
                {pie.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => inr(Number(v))} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
      {tab === "pie" && pie.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-2">
          {pie.slice(0, 6).map((p, i) => (
            <span key={p.category} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              <span className="capitalize">{p.category}</span>
              <span className="tabular-nums text-foreground/70">{inr(p.amount)}</span>
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
