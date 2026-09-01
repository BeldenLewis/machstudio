"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
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
      <div className="flex h-[180px] min-w-0 items-center justify-center rounded-2xl border border-dashed border-border p-2 text-center text-sm text-muted-foreground print:h-auto print:min-h-[60px] print:rounded-lg print:p-1 print:text-[7px] print:leading-tight">
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
  /*
    화면·인쇄가 서로 다른 마크업을 렌더링하도록 JS(usePrintMode)로 나눴다가 계속
    실패했다 — 인쇄 미리보기가 그 전환을 반영하지 않고 화면용 마크업을 그대로
    보여줘 범례가 통째로 잘려 나갔다(사용자 리포트). @media print CSS 는 이 페이지
    다른 곳(그리드 5칸, 폰트 크기 등)에서 매번 확실히 먹혔으므로, 컴포넌트를 하나만
    남기고 크기만 print: 클래스로 줄인다 — 갈아 끼울 게 없으니 어긋날 수도 없다.
    도넛+범례 줄이 화면에서는 flex-wrap 으로 좁을 때 범례를 아래로 접지만, 인쇄에서는
    print:flex-nowrap 으로 항상 도넛 옆에 붙인다 — 인쇄 칸 폭이 빠듯할 때 줄바꿈
    계산에 맡기면 범례 자체가 통째로 안 그려지는 문제가 있었다(부모 grid 열도
    유입경로 칸만 1.37fr 로 넓히고, 다섯 칸 전부 minmax(0, ...) 로 감싸 다른 칸이
    자기 콘텐츠 최소 폭으로 이 칸의 몫을 빼앗지 못하게 한다 — ProjectSummaryCard 참고).

    도넛 크기 자체도 같은 부류의 함정이 있었다: ResponsiveContainer(width="100%")는
    ResizeObserver 로 컨테이너 픽셀 크기를 재서 <svg> 크기를 JS 로 정하는데, 브라우저
    인쇄 미리보기는 이 리사이즈 관찰이 제때 안 돌아 화면 크기(140px)로 그린 도넛을
    인쇄에서도 그대로 유지해버렸다(범례를 다 덮어버림 — 사용자 스크린샷). 그래서
    ResponsiveContainer 를 버리고 PieChart 를 항상 고정 140x140 으로 그린 뒤, 인쇄에서는
    순수 CSS transform:scale() 로 시각적으로만 축소한다 — JS 계산이 필요 없으니
    인쇄 렌더링 타이밍과 무관하게 항상 맞다. 바깥 div(overflow-hidden)가 축소된
    도넛 밖으로 남는 원래 140px 여백을 잘라내 실제 차지 폭을 120px 로 만든다.

    배치(도넛이 왼쪽, 범례가 그 오른쪽)는 화면과 인쇄가 같아야 한다 — 범례가 잘리는
    걸 고치겠다고 인쇄에서만 도넛을 위로 쌓는 시도를 했더니 화면 레이아웃과 달라져
    사용자가 반려했다. 배치는 그대로 두고, 대신 위에서 언급한 유입경로 칸 fr 비율을
    올리는 쪽으로만 여유 폭을 확보한다.
  */
  return (
    <div className="flex max-w-xs flex-wrap items-center gap-4 print:max-w-none print:flex-nowrap print:gap-1.5">
      <div className="h-[140px] w-[140px] shrink-0 overflow-hidden print:h-[120px] print:w-[120px]">
        <div className="h-[140px] w-[140px] origin-top-left print:scale-[0.857]">
          <PieChart width={140} height={140}>
            <Pie data={slices} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="var(--background)" strokeWidth={2}>
              {slices.map((slice) => <Cell key={slice.label} fill={slice.color} />)}
            </Pie>
            <Tooltip formatter={(value, name) => [`${formatNumber(Number(value) || 0)}건`, name]} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12 }} />
          </PieChart>
        </div>
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
    <ul className="min-w-0 flex-1 space-y-1.5 print:space-y-0.5">
      {slices.map((slice) => {
        const editable = !!onColorChange && slice.label !== "기타";
        return (
          <li key={slice.label} className="flex min-w-0 items-center gap-2 text-xs print:gap-0 print:text-[9px]">
            <svg className="hidden h-2 w-2 shrink-0 print:block" viewBox="0 0 8 8" aria-hidden="true">
              <circle cx="4" cy="4" r="4" fill={slice.color} />
            </svg>
            {editable ? (
              <label className="relative h-2.5 w-2.5 shrink-0 cursor-pointer rounded-full ring-offset-1 ring-offset-background transition-shadow hover:ring-2 hover:ring-violet-400 print:hidden" style={{ backgroundColor: slice.color }} title={`${slice.label} 색 바꾸기`}>
                <input type="color" value={toColorInputValue(slice.color)} onChange={(e) => onColorChange?.(slice.label, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={`${slice.label} 색 바꾸기`} />
              </label>
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full print:hidden" style={{ backgroundColor: slice.color }} />
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground print:ml-1 print:flex-none">{slice.label}</span>
            <span className="shrink-0 font-medium tabular-nums print:ml-2">{Math.round((slice.count / total) * 100)}%</span>
          </li>
        );
      })}
    </ul>
  );
}
