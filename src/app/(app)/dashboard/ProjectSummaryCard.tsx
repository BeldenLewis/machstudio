"use client";

import { ArrowRight, Filter, Route, Users } from "lucide-react";
import type { RealtimeReportData } from "./RealtimeReport";
import { ChangeBadge, formatNumber } from "./RealtimeReport";
import DonutChart from "./DonutChart";
import Sparkline from "./Sparkline";

interface ProjectSummaryCardProps {
  data: RealtimeReportData;
}

/** 프로젝트 상세 대시보드의 "요약" 탭과 전체 요약 대시보드가 함께 쓰는 압축 카드. */
export default function ProjectSummaryCard({ data }: ProjectSummaryCardProps) {
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
      <h3 className="text-base font-semibold">{data.project.name}</h3>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Route className="h-3.5 w-3.5" />
            유입경로
          </div>
          <DonutChart data={data.utmBySource} />
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
