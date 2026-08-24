"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useChartColors } from "@/components/ui/use-chart-colors";

interface SparklineProps {
  points: number[];
  height?: number;
}

/** 지표 카드에 붙는 미니 추이선 — 축/격자/툴팁 없이 형태만 보여준다. */
export default function Sparkline({ points, height = 28 }: SparklineProps) {
  const colors = useChartColors();
  if (points.length < 2) return null;

  const data = points.map((count, i) => ({ i, count }));

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.viewers} stopOpacity={0.25} />
              <stop offset="100%" stopColor={colors.viewers} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={colors.viewers}
            strokeWidth={1.5}
            fill="url(#sparkline-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
