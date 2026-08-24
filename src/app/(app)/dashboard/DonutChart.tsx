"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors, seriesColor } from "@/components/ui/use-chart-colors";
import { formatNumber } from "./RealtimeReport";

const OTHER_COLOR_LIGHT = "#a3a3a3";

interface DonutChartProps {
  data: Array<{ label: string; count: number; percent: number }>;
  /** 색 슬롯이 seriesColor 기준 4개(0~3)뿐이라, 나머지는 항상 "기타"로 접는다. */
  maxSlices?: number;
}

export default function DonutChart({ data, maxSlices = 4 }: DonutChartProps) {
  const colors = useChartColors();

  if (!data.length) {
    return (
      <div className="flex h-[180px] items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
        유입경로 데이터가 아직 없습니다.
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, maxSlices);
  const rest = sorted.slice(maxSlices);
  const restCount = rest.reduce((sum, row) => sum + row.count, 0);
  const total = sorted.reduce((sum, row) => sum + row.count, 0) || 1;

  const slices = [
    ...top.map((row, i) => ({ label: row.label || "(direct)", count: row.count, color: seriesColor(colors, i) ?? OTHER_COLOR_LIGHT })),
    ...(restCount > 0 ? [{ label: "기타", count: restCount, color: OTHER_COLOR_LIGHT }] : []),
  ];

  return (
    <div className="flex max-w-xs items-center gap-4">
      <div className="h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={slices.length > 1 ? 2 : 0}
              stroke="var(--background)"
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => [`${formatNumber(Number(value) || 0)}건`, name]}
              contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="min-w-0 truncate text-muted-foreground">{slice.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{Math.round((slice.count / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
