"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors, resolveChannelColor } from "@/components/ui/use-chart-colors";
import { formatNumber } from "./RealtimeReport";

const OTHER_COLOR_LIGHT = "#a3a3a3";

/** <input type="color"> 는 3자리 축약 hex 를 안 받아 검게 리셋한다 — 표시용으로만 6자리로 편다. */
export function toColorInputValue(hex: string): string {
  const short = /^#([0-9a-f]{3})$/i.exec(hex.trim());
  if (short) return "#" + short[1].split("").map((c) => c + c).join("");
  return /^#[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim() : "#000000";
}

interface DonutChartProps {
  data: Array<{ label: string; count: number; percent: number }>;
  /** 접히기 전 보여줄 조각 수 — 나머지는 "기타"로 접는다. 기본 5(+기타 1 = 총 6조각). */
  maxSlices?: number;
  /** 워크스페이스가 채널별로 직접 지정한 색 — 브랜드 근사·해시 폴백보다 우선한다. */
  channelColors?: Record<string, string> | null;
  /**
   * 범례의 색 점을 눌러 그 채널 색을 바로 바꿀 수 있게 한다 — 실제 이 차트에 찍힌 라벨
   * 그대로 넘어오므로(브랜드 이름 짐작이 아니라) 지금 들어오는 UTM 값과 항상 정확히
   * 매칭된다. 없으면(공개 페이지 등) 점은 그냥 표시만 한다. "기타"는 여러 채널이 섞인
   * 묶음이라 색을 지정할 대상이 없어 항상 제외한다.
   */
  onColorChange?: (label: string, hex: string) => void;
}

export default function DonutChart({ data, maxSlices = 5, channelColors, onColorChange }: DonutChartProps) {
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

  // 같은 차트 안에서 라벨 해시가 겹쳐도 색이 겹치지 않게(entityColor 참고) — 차트 하나당 새로 만든다.
  const usedSlots = new Set<number>();
  const slices = [
    ...top.map((row) => {
      const label = row.label || "(direct)";
      return { label, count: row.count, color: resolveChannelColor(colors, label, channelColors, usedSlots) ?? OTHER_COLOR_LIGHT };
    }),
    ...(restCount > 0 ? [{ label: "기타", count: restCount, color: OTHER_COLOR_LIGHT }] : []),
  ];

  return (
    // 인쇄에서는 부모가 격자 칸이라(ProjectSummaryCard의 print:grid-cols-2) 이 칸 하나가
    // 넉넉한 폭을 갖는다 — max-w-xs(320px) 제한만 풀고(print:max-w-none) 칸 폭을 그대로 쓴다.
    <div className="flex max-w-xs items-center gap-4 print:max-w-none print:w-full print:gap-2">
      <div className="h-[140px] w-[140px] shrink-0 print:h-[85px] print:w-[85px]">
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
      <ul className="min-w-0 space-y-1.5 print:space-y-0.5">
        {slices.map((slice) => {
          const editable = !!onColorChange && slice.label !== "기타";
          return (
            <li key={slice.label} className="flex items-center gap-2 text-xs print:gap-1 print:text-[8px]">
              {editable ? (
                <label
                  className="relative h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full ring-offset-1 ring-offset-background transition-shadow hover:ring-2 hover:ring-violet-400 print:h-1.5 print:w-1.5"
                  style={{ backgroundColor: slice.color }}
                  title={`${slice.label} 색 바꾸기`}
                >
                  <input
                    type="color"
                    value={toColorInputValue(slice.color)}
                    onChange={(e) => onColorChange(slice.label, e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label={`${slice.label} 색 바꾸기`}
                  />
                </label>
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full print:h-1.5 print:w-1.5" style={{ backgroundColor: slice.color }} />
              )}
              {/* 화면에서는 한 줄로 잘라 보여주지만, 인쇄본은 보고 자료라 라벨을 잘라내지 않는다 */}
              <span className="min-w-0 truncate text-muted-foreground print:overflow-visible print:whitespace-normal print:break-words">
                {slice.label}
              </span>
              <span className="shrink-0 font-medium tabular-nums">{Math.round((slice.count / total) * 100)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
