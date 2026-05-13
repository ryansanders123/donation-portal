"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type MonthlyTotalsData = {
  months: string[];
  total: number[];
  byFund: Record<string, number[]>;
  funds: { id: string; name: string }[];
};

type Mode = "total" | "byFund";

// Brand-consistent palette for per-fund lines. Brand red is reserved for Total.
const FUND_COLORS = [
  "#1f6feb", // blue
  "#b45309", // amber-700
  "#047857", // emerald-700
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
  "#be185d", // pink-700
  "#4b5563", // stone-600
  "#65a30d", // lime-600
  "#ea580c", // orange-600
];

const BRAND = "#751411";

function formatMonthLabel(yyyyMm: string): string {
  // yyyyMm like "2024-03" -> "Mar '24"
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return yyyyMm;
  const date = new Date(Date.UTC(y, m - 1, 1));
  const monthShort = date.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
  const yy = String(y).slice(-2);
  return `${monthShort} '${yy}`;
}

function formatYAxisUsd(value: number): string {
  if (value === 0) return "$0";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(value)}`;
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatTooltipUsd(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  return usdFormatter.format(n);
}

export function DonationsChart({ data }: { data: MonthlyTotalsData }) {
  const [mode, setMode] = useState<Mode>("total");

  const chartData = useMemo(() => {
    return data.months.map((m, i) => {
      const row: Record<string, string | number> = {
        month: m,
        monthLabel: formatMonthLabel(m),
        Total: data.total[i] ?? 0,
      };
      for (const fund of data.funds) {
        row[fund.name] = data.byFund[fund.name]?.[i] ?? 0;
      }
      return row;
    });
  }, [data]);

  return (
    <div className="card p-4 md:p-6">
      {/* Toggle group */}
      <div
        className="flex flex-wrap items-center gap-2 mb-4"
        role="group"
        aria-label="Chart view"
      >
        <button
          type="button"
          onClick={() => setMode("total")}
          aria-pressed={mode === "total"}
          className={
            mode === "total"
              ? "chip-brand cursor-pointer select-none"
              : "chip-neutral cursor-pointer select-none hover:bg-stone-200"
          }
        >
          Total
        </button>
        <button
          type="button"
          onClick={() => setMode("byFund")}
          aria-pressed={mode === "byFund"}
          className={
            mode === "byFund"
              ? "chip-brand cursor-pointer select-none"
              : "chip-neutral cursor-pointer select-none hover:bg-stone-200"
          }
        >
          By fund
        </button>
      </div>

      <div
        role="img"
        aria-label="Monthly donation totals"
        className="h-[240px] md:h-[320px] w-full"
      >
        <ResponsiveContainer
          width="100%"
          height="100%"
          initialDimension={{ width: 800, height: 320 }}
        >
          <LineChart
            data={chartData}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" />
            <XAxis
              dataKey="monthLabel"
              stroke="#78716c"
              fontSize={12}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              stroke="#78716c"
              fontSize={12}
              tickFormatter={formatYAxisUsd}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatTooltipUsd(value)}
              labelFormatter={(label) => label as string}
              contentStyle={{
                borderRadius: "0.5rem",
                border: "1px solid #e7e5e4",
                fontSize: "0.875rem",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "0.75rem" }} />

            {/* Total is always drawn; bolder in byFund mode so it stands out */}
            <Line
              type="monotone"
              dataKey="Total"
              stroke={BRAND}
              strokeWidth={mode === "byFund" ? 2.5 : 2}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />

            {mode === "byFund" &&
              data.funds.map((fund, i) => (
                <Line
                  key={fund.id}
                  type="monotone"
                  dataKey={fund.name}
                  stroke={FUND_COLORS[i % FUND_COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                />
              ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
