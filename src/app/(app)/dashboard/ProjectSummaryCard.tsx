"use client";

import { ArrowRight, Filter, Route, Users } from "lucide-react";
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
}

/** 요약 대시보드와 수집 소스 상세의 "수집 데이터" 탭이 함께 쓰는 압축 카드. */
export default function ProjectSummaryCard({ data, title, channelColors }: ProjectSummaryCardProps) {
  const trend = data.cumulativeTrend.slice(-14).map((point) => point.count);

  const funnelStages = data.funnel
    ? [
        { label: "홈페이지 방문", value: data.funnel.homepageVisitors, change: data.funnel.homepageVisitorsChange },
        ...(data.funnel.registrationPageVisitors !== null
          ? [
              {
                label: "사전등록 페이지 방문",
                value: data.funnel.registrationPageVisitors,
                change: data.funnel.registrationPageVisitorsChange,
              },
            ]
          : []),
        { label: "사전등록 완료", value: data.funnel.registrants, change: null as number | null },
      ]
    : [];

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

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Route className="h-3.5 w-3.5" />
            유입경로
          </div>
          <DonutChart data={data.utmBySource} channelColors={channelColors} />
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 lg:w-52">
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
            {data.performance.lastYearRangeCount > 0 && (
              <>
                <span className="text-[10px] text-muted-foreground">작년 대비</span>
                <ChangeBadge rangeChange={data.performance.lastYearRangeChange} />
              </>
            )}
          </div>
          {trend.length >= 2 && (
            <div className="mt-2">
              <Sparkline points={trend} />
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-secondary/20 px-4 py-3 lg:w-52">
          <span className="text-xs font-medium text-muted-foreground">누적 사전등록자</span>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
            {formatNumber(data.performance.cumulativeCount)}
          </div>
          {data.performance.goalProgressPercent !== null && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>작년 실적 대비</span>
                <span className="font-medium text-foreground">{Math.round(data.performance.goalProgressPercent)}%</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-violet-500"
                  style={{ width: `${Math.min(100, data.performance.goalProgressPercent)}%` }}
                />
              </div>
              <div className="mt-0.5 text-right text-[10px] text-muted-foreground">
                작년 {formatNumber(data.performance.lastYearTotalCount)}
              </div>
            </div>
          )}
        </div>
      </div>

      {funnelStages.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            주간 퍼널
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {funnelStages.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="min-w-[120px] rounded-xl border border-border bg-secondary/20 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">{stage.label}</div>
                  <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatNumber(stage.value)}</div>
                  {stage.change !== null && (
                    <div className="mt-0.5">
                      <ChangeBadge rangeChange={stage.change} />
                    </div>
                  )}
                </div>
                {i < funnelStages.length - 1 && (
                  <div className="flex flex-col items-center text-muted-foreground">
                    <ArrowRight className="h-4 w-4" />
                    <span className="text-[10px] tabular-nums">
                      {funnelStages[i].value > 0
                        ? Math.round((funnelStages[i + 1].value / funnelStages[i].value) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
