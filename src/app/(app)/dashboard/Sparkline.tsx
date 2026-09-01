"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { useId } from "react";
import { useChartColors } from "@/components/ui/use-chart-colors";

interface SparklineProps {
  points: number[];
}

/**
 * 지표 카드에 붙는 미니 추이선 — 축/격자/툴팁 없이 형태만 보여준다.
 * 화면·인쇄가 같은 recharts 컴포넌트를 쓴다 — 크기만 print: 클래스로 줄인다.
 * 예전엔 인쇄용으로 별도 SVG 꺾은선을 JS 분기로 그렸는데, 같은 데이터인데도
 * 화면과 인쇄에서 곡선 모양이 달라 보인다는 리포트가 있었다(재현 없이 유지보수
 * 부담만 남는 이중 구현) — 하나로 합쳐 애초에 다르게 보일 여지를 없앤다.
 */
export default function Sparkline({ points }: SparklineProps) {
  const colors = useChartColors();
  const gradientId = useId().replace(/:/g, "");
  if (points.length < 2) return null;

  const data = points.map((count, i) => ({ i, count }));

  return (
    <div className="h-7 w-full min-w-0 overflow-hidden print:h-4">
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
