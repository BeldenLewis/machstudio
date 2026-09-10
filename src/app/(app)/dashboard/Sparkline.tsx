"use client";

import { useId } from "react";
import { useChartColors } from "@/components/ui/use-chart-colors";

interface SparklineProps {
  points: number[];
}

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;

/**
 * 지표 카드에 붙는 미니 추이선 — 축/격자/툴팁 없이 형태만 보여준다.
 * 화면·인쇄가 같은 마크업을 쓴다 — 크기는 부모의 print: 클래스로만 줄인다.
 *
 * recharts ResponsiveContainer는 ResizeObserver로 실측 폭을 잰 뒤에야 그리는데,
 * window.print() 는 그 콜백이 돌기 전에 페인트 스냅샷을 찍어버려 인쇄 칸 폭이
 * 바뀌는 순간(lg:w-52 → print:flex-1) 스파크라인이 카드마다 비결정적으로
 * 사라졌다 — 화면·인쇄 컴포넌트를 하나로 합친 것만으론(#43fe9b1) 안 없어졌다,
 * 실측 자체가 recharts 내부에 남아 있었기 때문이다. SVG viewBox 스케일링은
 * JS 측정이 필요 없어 화면·인쇄 어디서나 항상, 그리고 같은 모양으로 그려진다.
 */
export default function Sparkline({ points }: SparklineProps) {
  const colors = useChartColors();
  const gradientId = useId().replace(/:/g, "");
  if (points.length < 2) return null;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = VIEW_WIDTH / (points.length - 1);
  const toY = (value: number) => VIEW_HEIGHT - ((value - min) / range) * VIEW_HEIGHT;

  const linePath = points.map((value, i) => `${i === 0 ? "M" : "L"}${i * stepX},${toY(value)}`).join(" ");
  const areaPath = `${linePath} L${VIEW_WIDTH},${VIEW_HEIGHT} L0,${VIEW_HEIGHT} Z`;

  return (
    <div className="h-7 w-full min-w-0 overflow-hidden print:h-4">
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-full w-full"
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
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
