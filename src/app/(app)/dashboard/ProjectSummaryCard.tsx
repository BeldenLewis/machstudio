"use client";

import { Route, Users } from "lucide-react";
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
          <div className="mt-1">
            <ChangeBadge rangeChange={data.performance.rangeChange} />
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
        </div>
      </div>
    </div>
  );
}
