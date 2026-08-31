"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useId } from "react";
import { useChartColors } from "@/components/ui/use-chart-colors";
import { usePrintMode } from "@/components/ui/use-print-mode";

interface SparklineProps {
  points: number[];
  height?: number;
  printHeight?: number;
}

/** 지표 카드에 붙는 미니 추이선 — 축/격자/툴팁 없이 형태만 보여준다. */
export default function Sparkline({ points, height = 28, printHeight }: SparklineProps) {
  const colors = useChartColors();
  const gradientId = useId().replace(/:/g, "");
  const isPrinting = usePrintMode();
  if (points.length < 2) return null;

  if (isPrinting) {
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const printPoints = points
      .map((count, index) => {
        const x = 2 + (index / (points.length - 1)) * 96;
        const y = 20 - ((count - min) / range) * 16;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    return (
      <svg
        aria-hidden="true"
        style={{ width: 80, height: printHeight ?? 16, margin: "0 auto", overflow: "hidden" }}
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
      >
        <polyline
          points={printPoints}
          fill="none"
          stroke={colors.viewers}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const data = points.map((count, i) => ({ i, count }));

  return (
    <div className="w-full min-w-0 overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.viewers} stopOpacity={0.25} />
              <stop offset="100%" stopColor={colors.viewers} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="count"
            stroke={colors.viewers}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
