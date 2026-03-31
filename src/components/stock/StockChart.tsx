"use client";

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { StockDataPoint } from "@/src/types/stock";

interface StockChartProps {
  data: StockDataPoint[];
}

/** X軸の日付を MM/DD 形式にフォーマット */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** Y軸の株価を日本円表記にフォーマット */
function formatYen(value: number): string {
  return `¥${value.toLocaleString()}`;
}

/** 出来高を短縮表記にフォーマット */
function formatVolume(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

/** ツールチップの値を安全にフォーマット */
function fmtTip(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString();
}

/** カスタムツールチップ */
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const row = (key: string) => payload.find((p) => p.dataKey === key);
  const close = row("close");
  const volume = row("volume");
  const ma5 = row("ma5");
  const ma25 = row("ma25");
  const ma75 = row("ma75");
  const ma200 = row("ma200");

  return (
    <div
      style={{
        backgroundColor: "rgba(255,255,255,0.96)",
        border: "1px solid #ccc",
        borderRadius: 6,
        padding: "0.5rem 0.75rem",
        fontSize: "0.82rem",
        lineHeight: 1.6,
        color: "#333",
      }}
    >
      <p style={{ fontWeight: 600, marginBottom: 2 }}>{label}</p>
      <p>終値: ¥{fmtTip(close?.value)}</p>
      <p>出来高: {fmtTip(volume?.value)}</p>
      <p style={{ color: "#ff6b6b" }}>5日MA: ¥{fmtTip(ma5?.value)}</p>
      <p style={{ color: "#ffa726" }}>25日MA: ¥{fmtTip(ma25?.value)}</p>
      <p style={{ color: "#66bb6a" }}>75日MA: ¥{fmtTip(ma75?.value)}</p>
      <p style={{ color: "#42a5f5" }}>200日MA: ¥{fmtTip(ma200?.value)}</p>
    </div>
  );
}

export default function StockChart({ data }: StockChartProps) {
  if (!data.length) return null;

  return (
    <section aria-label="株価チャート">
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
        >
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis
            yAxisId="price"
            orientation="left"
            tickFormatter={formatYen}
            tick={{ fontSize: 11 }}
            domain={["auto", "auto"]}
            width={72}
          />
          <YAxis
            yAxisId="volume"
            orientation="right"
            tickFormatter={formatVolume}
            tick={{ fontSize: 11 }}
            domain={[0, (max: number) => max * 3]}
            width={56}
          />

          <Tooltip content={<ChartTooltip />} />
          <Legend />

          {/* 出来高バー */}
          <Bar
            yAxisId="volume"
            dataKey="volume"
            name="出来高"
            fill="#90caf9"
            opacity={0.35}
            isAnimationActive={false}
          />

          {/* 終値ライン */}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="close"
            name="終値"
            stroke="#333"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />

          {/* 移動平均線 */}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma5"
            name="5日MA"
            stroke="#ff6b6b"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma25"
            name="25日MA"
            stroke="#ffa726"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma75"
            name="75日MA"
            stroke="#66bb6a"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="ma200"
            name="200日MA"
            stroke="#42a5f5"
            strokeWidth={1}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </section>
  );
}
