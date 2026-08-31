"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors, resolveChannelColor } from "@/components/ui/use-chart-colors";
import { usePrintMode } from "@/components/ui/use-print-mode";
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
  /**
   * CSS `print:` display 토글은 인쇄 미리보기에서 화면용 recharts 도넛(고정 140px)이
   * 그대로 새어나오는 걸 반복해서 재현했다 — @media print 캐스케이드에 기대지 않고
   * 실제 렌더링할 마크업 자체를 JS 로 나눈다. 인쇄 시엔 화면용 마크업이 DOM에 아예 없다.
   */
  const isPrinting = usePrintMode();

  if (!data.length) {
    return isPrinting ? (
      <div className="flex min-h-[60px] w-full min-w-0 items-center justify-center rounded-lg border border-dashed border-border p-1 text-center text-[7px] leading-tight text-muted-foreground">
        유입경로 데이터가 아직 없습니다.
      </div>
    ) : (
      <div className="flex h-[180px] min-w-0 items-center justify-center rounded-2xl border border-dashed border-border p-2 text-center text-sm text-muted-foreground">
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
  if (isPrinting) {
    /*
      인쇄 칸은 폭이 140px 안팎이라 원형+세로 범례(SVG)는 라벨이 잘리거나 링이 깨져
      보였다(사용자 리포트) — 폭에 좌우되지 않는 가로 막대(각 조각을 %폭으로 나눔)로
      바꾸고, 범례는 줄바꿈 가능한 태그 형태로 둬 칸을 넘지 않고 아래로 자연히 쌓이게 한다.
      SVG 기하 계산이 아니라 % 너비/flex-wrap 뿐이라 어떤 폭에서도 넘치지 않는다.
    */
    return (
      <div className="flex w-full min-w-0 flex-col gap-1 overflow-hidden">
        <div className="flex h-2 w-full min-w-0 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          {slices.map((slice) => (
            <span key={slice.label} style={{ width: `${(slice.count / total) * 100}%`, backgroundColor: slice.color }} className="h-full" />
          ))}
        </div>
        <ul className="flex w-full min-w-0 flex-wrap gap-x-1.5 gap-y-0.5 overflow-hidden text-[6.5px] leading-tight">
          {slices.map((slice) => (
            <li key={slice.label} className="flex max-w-full items-center gap-0.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="max-w-[42px] truncate text-muted-foreground">{slice.label}</span>
              <span className="shrink-0 font-medium tabular-nums">{Math.round((slice.count / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex max-w-xs items-center gap-4">
      <div className="h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="var(--background)" strokeWidth={2}>
              {slices.map((slice) => <Cell key={slice.label} fill={slice.color} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [`${formatNumber(Number(value) || 0)}건`, name]} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <DonutLegend slices={slices} total={total} onColorChange={onColorChange} />
    </div>
  );
}

function DonutLegend({ slices, total, onColorChange }: {
  slices: Array<{ label: string; count: number; color: string }>;
  total: number;
  onColorChange?: (label: string, hex: string) => void;
}) {
  return (
    <ul className="min-w-0 space-y-1.5">
      {slices.map((slice) => {
        const editable = !!onColorChange && slice.label !== "기타";
        return (
          <li key={slice.label} className="flex min-w-0 items-center gap-2 text-xs">
            {editable ? (
              <label className="relative h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full ring-offset-1 ring-offset-background transition-shadow hover:ring-2 hover:ring-violet-400" style={{ backgroundColor: slice.color }} title={`${slice.label} 색 바꾸기`}>
                <input type="color" value={toColorInputValue(slice.color)} onChange={(e) => onColorChange?.(slice.label, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${slice.label} 색 바꾸기`} />
              </label>
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{slice.label}</span>
            <span className="shrink-0 font-medium tabular-nums">{Math.round((slice.count / total) * 100)}%</span>
          </li>
        );
      })}
    </ul>
  );
}
