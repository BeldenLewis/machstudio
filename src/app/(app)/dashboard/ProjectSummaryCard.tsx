"use client";

import { ArrowRight, Globe, MousePointerClick, Route, Users } from "lucide-react";
import type { RealtimeReportData } from "./RealtimeReport";
import { ChangeBadge, formatNumber } from "./RealtimeReport";
import DonutChart from "./DonutChart";
import Sparkline from "./Sparkline";

interface ProjectSummaryCardProps {
  data: RealtimeReportData;
  /** 기본은 data.project.name — 소스 단위로 좁혀 쓸 때(수집 소스 상세) 소스명으로 덮어써 구분한다. */
  title?: string;
  /**
   * 워크스페이스가 채널별로 직접 지정한 색 — 호출부가 넘긴다(WorkspaceProvider 컨텍스트에
   * 직접 기대지 않는다. 컨텍스트의 workspace 는 초기 로드 시 목록 API 응답만 들고 있어
   * channelColors 처럼 상세 API 전용 필드가 비어 있을 수 있다).
   */
  channelColors?: Record<string, string> | null;
  /** 도넛 범례의 색 점을 눌러 그 채널 색을 바로 바꿀 수 있게 한다 — 없으면 점은 표시만. */
  onChannelColorChange?: (label: string, hex: string) => void;
}

/** 요약 대시보드와 수집 소스 상세의 "수집 데이터" 탭이 함께 쓰는 압축 카드. */
export default function ProjectSummaryCard({ data, title, channelColors, onChannelColorChange }: ProjectSummaryCardProps) {
  const trend = data.cumulativeTrend.slice(-14).map((point) => point.count);
  const previousYear = data.performance.previousYear;
  const finalProgress = previousYear && previousYear.totalCount > 0
    ? (data.performance.cumulativeCount / previousYear.totalCount) * 100
    : null;

  /**
   * 퍼널의 마지막 단계(사전등록 완료)는 "주간 사전등록자" 박스의 숫자와 같다
   * (둘 다 data.funnel.registrants === data.performance.rangeCount) — 그래서 별도 박스로
   * 안 만들고, 마지막 화살표가 그 박스로 바로 이어지는 것처럼 그린다. 중복 숫자를 없애고
   * "방문 → 방문 → 이번 주 등록자"라는 하나의 흐름으로 읽히게 한다.
   */
  const funnelPreStages = data.funnel
    ? [
        {
          label: "홈페이지 방문",
          icon: Globe,
          value: data.funnel.homepageVisitors,
          change: data.funnel.homepageVisitorsChange,
          daily: data.funnel.homepageVisitorsDaily,
        },
        ...(data.funnel.registrationPageVisitors !== null
          ? [
              {
                label: "사전등록 페이지 방문",
                icon: MousePointerClick,
                value: data.funnel.registrationPageVisitors,
                change: data.funnel.registrationPageVisitorsChange,
                daily: data.funnel.registrationPageVisitorsDaily,
              },
            ]
          : []),
      ]
    : [];
  const conversionRate = (from: number, to: number) => (from > 0 ? Math.round((to / from) * 100) : 0);

  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      {/*
        **캡처되는 화면이다.** 이 카드는 주간 보고에 그대로 붙는다. 기간이 안 적혀 있으면
        일주일 뒤 그 이미지가 "언제 것인지 / +102% 가 무엇 대비인지" 를 답할 수 없다 —
        숫자만 있고 근거가 없는 그림이 된다. 제목 옆에 조회 구간과 비교 구간을 함께 적는다.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold">{title ?? data.project.name}</h3>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {formatRange(data.range.from, data.range.to)}
          <span className="mx-1.5 opacity-50">·</span>
          직전 {formatRange(data.range.previousFrom, data.range.previousTo)} 대비
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-stretch gap-3">
        <div className="min-w-[200px] flex-1">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Route className="h-3.5 w-3.5" />
            유입경로
          </div>
          <DonutChart data={data.utmBySource} channelColors={channelColors} onColorChange={onChannelColorChange} />
        </div>

        {/*
          홈페이지 방문 → 사전등록 페이지 방문 → (화살표) → 주간 사전등록자.
          마지막 단계는 별도 박스가 아니라 바로 아래 "주간 사전등록자" 박스로 흘러들어가는
          화살표로 그린다 — 그 박스 숫자와 사전등록 완료 숫자가 원래 같은 값이라 중복 표시하지 않는다.
        */}
        {funnelPreStages.map((stage, i) => {
          const nextValue = i < funnelPreStages.length - 1 ? funnelPreStages[i + 1].value : data.performance.rangeCount;
          const Icon = stage.icon;
          return (
            <div key={stage.label} className="flex shrink-0 items-stretch gap-2">
              <div className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 lg:w-52">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                  {stage.label}
                </span>
                <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
                  {formatNumber(stage.value)}
                </div>
                {stage.change !== null && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[10px] text-muted-foreground">전주 대비</span>
                    <ChangeBadge rangeChange={stage.change} />
                  </div>
                )}
                {stage.daily && stage.daily.length >= 2 && (
                  <div className="mt-2">
                    <Sparkline points={stage.daily} />
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center text-muted-foreground">
                <ArrowRight className="h-4 w-4" />
                <span className="text-[10px] tabular-nums">{conversionRate(stage.value, nextValue)}%</span>
              </div>
            </div>
          );
        })}

        <div className="shrink-0 rounded-2xl border border-border bg-secondary/20 px-4 py-3 lg:w-52">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              주간 사전등록자
            </span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {formatNumber(data.performance.rangeCount)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[10px] text-muted-foreground">전주 대비</span>
            <ChangeBadge rangeChange={data.performance.rangeChange} />
            {previousYear?.rangeCount !== null && previousYear?.rangeCount !== undefined && (
              <>
                <span className="text-[10px] text-muted-foreground">전년 동일 D구간</span>
                <ChangeBadge rangeChange={previousYear.rangeChange} />
              </>
            )}
          </div>
          {trend.length >= 2 && (
            <div className="mt-2">
              <Sparkline points={trend} />
            </div>
          )}
        </div>

        <div className="shrink-0 rounded-2xl border border-border bg-secondary/20 px-4 py-3 lg:w-52">
          <span className="text-xs font-medium text-muted-foreground">누적 사전등록자</span>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {formatNumber(data.performance.cumulativeCount)}
          </div>
          {previousYear && (
            <div className="mt-2 space-y-2">
              {previousYear.paceCount !== null && previousYear.dDay !== null && (
                <div className="rounded-xl bg-background px-2.5 py-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                    <span>{formatDday(previousYear.dDay)} 동일 시점</span>
                    <span>{previousYear.eventYear ?? "전년"}년 {formatNumber(previousYear.paceCount)}명</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium">등록 속도</span>
                    <ChangeBadge rangeChange={previousYear.paceChange} />
                  </div>
                </div>
              )}
              {finalProgress !== null && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>전년 최종 실적 대비</span>
                    <span className="font-medium text-foreground">{Math.round(finalProgress)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.min(100, finalProgress)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                    {previousYear.sourceName} · {formatNumber(previousYear.totalCount)}명
                  </div>
                </div>
              )}
              {finalProgress === null && previousYear.paceCount === null && (
                <p className="text-right text-[10px] text-muted-foreground">
                  {previousYear.sourceName} · 최종 {formatNumber(previousYear.totalCount)}명
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDday(day: number): string {
  if (day === 0) return "D-day";
  return day > 0 ? `D-${day}` : `D+${Math.abs(day)}`;
}

/**
 * 조회 구간을 한 줄로. **KST 달력일**로 적는다 — 집계가 KST 하루 경계로 세므로
 * 화면도 같은 기준이어야 "이 날짜까지 센 것" 이 맞는 말이 된다.
 * 끝 시각은 배타적 경계(다음 구간의 시작)라 하루를 빼서 마지막 날을 보여 준다.
 */
function formatRange(fromIso: string, toIso: string): string {
  const KST = 9 * 60 * 60 * 1000;
  const day = (iso: string, shiftMs = 0) => {
    const d = new Date(new Date(iso).getTime() + shiftMs + KST);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  };
  return `${day(fromIso)} – ${day(toIso)}`;
}
