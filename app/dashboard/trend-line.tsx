"use client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const inr = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

export default function TrendLine({
  data,
  monthLabel,
}: {
  data: { date: string; amount: number }[];
  monthLabel?: string;
}) {
  const title = monthLabel ? `Daily spending · ${monthLabel}` : "Daily spending";
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={d => d.slice(8)} /> {/* day-of-month only */}
            <YAxis tickFormatter={(v: any) => `₹${Math.round(Number(v) / 1000)}k`} />
            <Tooltip
              labelFormatter={(label: any) => new Date(String(label) + "T00:00:00+05:30").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}
              formatter={(v: any) => inr(Number(v))}
            />
            <Line type="monotone" dataKey="amount" stroke="#0ea5e9" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
