"use client";

import { useId } from "react";
import { useChartColors } from "@/components/ui/use-chart-colors";

interface SparklineProps {
  points: number[];
  height?: number;
}

const VIEW_WIDTH = 100;

/**
 * 지표 카드에 붙는 미니 추이선 — 축/격자/툴팁 없이 형태만 보여준다.
 *
 * recharts의 ResponsiveContainer는 ResizeObserver로 부모 폭을 재서 그리는데,
 * window.print() 는 그 콜백이 돌기 전에 페인트 스냅샷을 찍어버려 인쇄에서
 * 카드마다 스파크라인이 보였다 안 보였다 했다(폭 측정 타이밍에 따라 비결정적).
 * SVG 자체 viewBox 스케일링은 JS 측정 없이 CSS만으로 늘어나므로 화면·인쇄
 * 어디서나 항상 그려진다.
 */
export default function Sparkline({ points, height = 28 }: SparklineProps) {
  const colors = useChartColors();
  const gradientId = useId();
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = VIEW_WIDTH / (points.length - 1);
  const toY = (value: number) => height - ((value - min) / range) * height;

  const linePath = points.map((value, i) => `${i === 0 ? "M" : "L"}${i * stepX},${toY(value)}`).join(" ");
  const areaPath = `${linePath} L${VIEW_WIDTH},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colors.viewers} stopOpacity={0.25} />
          <stop offset="100%" stopColor={colors.viewers} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={linePath}
        fill="none"
        stroke={colors.viewers}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
