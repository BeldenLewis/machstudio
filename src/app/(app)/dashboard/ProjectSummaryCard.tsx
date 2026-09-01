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
          yoyChange: data.funnel.homepageVisitorsYoyChange,
          daily: data.funnel.homepageVisitorsDaily,
        },
        ...(data.funnel.registrationPageVisitors !== null
          ? [
              {
                label: "사전등록 페이지 방문",
                icon: MousePointerClick,
                value: data.funnel.registrationPageVisitors,
                change: data.funnel.registrationPageVisitorsChange,
                yoyChange: data.funnel.registrationPageVisitorsYoyChange,
                daily: data.funnel.registrationPageVisitorsDaily,
              },
            ]
          : []),
      ]
    : [];
  const conversionRate = (from: number, to: number) => (from > 0 ? Math.round((to / from) * 100) : 0);

  /**
   * 화면에서는 그대로, PDF 인쇄에서는 한 프로젝트 = 한 행(유입경로·홈페이지 방문·사전등록
   * 페이지 방문·주간 사전등록자·누적 사전등록자 총 5칸)에 다 들어가야 한 페이지에 3개
   * 프로젝트가 쌓인다. flex-wrap 은 폭이 좁으면 줄이 갈려 화살표가 허공을 가리키는 문제가
   * 났었다 — print:flex-nowrap + 각 칸 flex-1 min-w-0 로 항상 한 줄에서 균등하게
   * 줄어들게 한다(칸 개수가 4개든 5개든 자동으로 폭을 나눠 가져 격자보다 안전하다).
   */
  const statBoxClass = "flex min-h-[174px] min-w-[190px] flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-secondary/20 px-3 py-3 print:h-full print:min-h-0 print:min-w-0 print:rounded-xl print:px-1.5 print:py-1.5";

  return (
    <div className="rounded-2xl border border-border bg-background p-5 print:rounded-xl print:p-2.5">
      {/*
        **캡처되는 화면이다.** 이 카드는 주간 보고에 그대로 붙는다. 기간이 안 적혀 있으면
        일주일 뒤 그 이미지가 "언제 것인지 / +102% 가 무엇 대비인지" 를 답할 수 없다 —
        숫자만 있고 근거가 없는 그림이 된다. 제목 옆에 조회 구간과 비교 구간을 함께 적는다.
      */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold print:text-[12px]">{title ?? data.project.name}</h3>
        <p className="text-[11px] tabular-nums text-muted-foreground print:text-[8px]">
          {formatRange(data.range.from, data.range.to)}
          <span className="mx-1.5 opacity-50">·</span>
          직전 {formatRange(data.range.previousFrom, data.range.previousTo)} 대비
        </p>
      </div>

      {/*
        인쇄 5칸: fr 비율·grid-flow-col·contents 로 트랙 수를 맞추던 방식은 칸 개수가
        4개/5개로 데이터마다 달라 트랙 계산이 어긋나기 쉬웠다 — 고정 5열로 바꿔 항상 폭
        계산이 같게 한다. 칸이 4개뿐이면 5번째 칸이 비지만(구멍) 그게 트랙이 어긋나
        겹치는 것보다 훨씬 안전하다. 첫 열(유입경로)은 1.35fr, 방문 두 칸은 0.85fr,
        사전등록 두 칸은 0.875fr — 도넛+범례를
        인쇄에서 세로로 쌓아도(DonutChart 참고) 유입경로 칸 자체가 좁으면 범례 폭이
        빠듯해 라벨이 잘리므로, 나머지 네 칸(라벨·숫자만 있어 이미 충분히 압축됨)을 더
        줄여 유입경로 칸에 폭을 몰아준다. 다섯 칸 전부 minmax(0, ...) 로 감싸는 게
        핵심이다 — 그냥 fr 값만 쓰면 내용이 많은 칸(예: 누적 사전등록자의
        D-day 박스+진행바)이 자기 콘텐츠 최소 폭을 그대로 요구해 fr 비율보다 더 가져가
        버리고, print:min-w-0 가 걸린 유입경로 칸만 그 압박을 흡수해 범례(자기도
        min-w-0)가 0 폭까지 눌려 통째로 사라졌다(사용자 스크린샷: 도넛만 남고 범례가 안
        보임). minmax(0, Nfr) 는 콘텐츠 최소 폭을 0으로 고정해 다섯 칸이 항상 비율대로만
        나뉘게 한다.
      */}
      <div className="mt-4 flex min-w-0 flex-nowrap items-stretch gap-3 overflow-x-auto pb-1 print:mt-1.5 print:grid print:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.875fr)_minmax(0,0.875fr)] print:gap-1 print:overflow-visible print:pb-0">
        {/* overflow-hidden 을 안 둔다 — 도넛 옆 범례가 폭이 좁아 아래로 줄바꿈될 수 있는데, 잘라내면 범례가 통째로 사라진다. */}
        <div className="min-w-[210px] flex-[1.15_1_0%] print:min-w-0">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground print:mb-1 print:text-[9px]">
            <Route className="h-3.5 w-3.5 print:h-2.5 print:w-2.5" />
            유입경로
          </div>
          <DonutChart data={data.utmBySource} channelColors={channelColors} onColorChange={onChannelColorChange} />
        </div>

        {/*
          홈페이지 방문 → 사전등록 페이지 방문 → (화살표) → 주간 사전등록자.
          마지막 단계는 별도 박스가 아니라 바로 아래 "주간 사전등록자" 박스로 흘러들어가는
          화살표로 그린다 — 그 박스 숫자와 사전등록 완료 숫자가 원래 같은 값이라 중복 표시하지 않는다.
          인쇄에서는 화살표를 빼고(한 줄에 5칸을 채워야 해서 자리가 없다) 전환율을 박스 안
          텍스트로 옮긴다 — 이 래퍼가 print:block 으로 grid-cols-5 의 한 칸이 되고, 화살표는
          print:hidden 으로 사라져 트랙을 차지하지 않는다.
        */}
        {funnelPreStages.map((stage, i) => {
          const nextValue = i < funnelPreStages.length - 1 ? funnelPreStages[i + 1].value : data.performance.rangeCount;
          const Icon = stage.icon;
          return (
            <div key={stage.label} className="relative flex min-w-[190px] flex-1 items-stretch print:block print:min-w-0">
              <div className={statBoxClass}>
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground print:gap-1 print:text-[8px]">
                  <Icon className="h-3.5 w-3.5 print:h-2.5 print:w-2.5" />
                  {stage.label}
                </span>
                <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight print:mt-0.5 print:text-[14px]">
                  {formatNumber(stage.value)}
                </div>
                <ComparisonRows weekly={stage.change} yearly={stage.yoyChange} />
                <p className="hidden print:block print:mt-0.5 print:text-[8px] print:text-muted-foreground">
                  다음 단계 전환 {conversionRate(stage.value, nextValue)}%
                </p>
                {stage.daily && stage.daily.length >= 2 && (
                  <div className="mt-auto min-w-0 overflow-hidden pt-3 print:mx-2 print:mt-1 print:rounded-md print:bg-secondary/40 print:pt-1">
                    <Sparkline points={stage.daily} />
                  </div>
                )}
              </div>
              <div className="absolute -right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center rounded-full bg-background px-0.5 text-muted-foreground shadow-sm print:hidden">
                <ArrowRight className="h-4 w-4" />
                <span className="text-[10px] tabular-nums">{conversionRate(stage.value, nextValue)}%</span>
              </div>
            </div>
          );
        })}

        <div className={statBoxClass}>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground print:gap-1 print:text-[8px]">
              <Users className="h-3.5 w-3.5 print:h-2.5 print:w-2.5" />
              주간 사전등록자
            </span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight print:mt-0.5 print:text-[14px]">
            {formatNumber(data.performance.rangeCount)}
          </div>
          <ComparisonRows weekly={data.performance.rangeChange} yearly={previousYear?.rangeChange ?? null} />
          {trend.length >= 2 && (
            <div className="mt-auto min-w-0 overflow-hidden pt-3 print:mx-2 print:mt-1 print:rounded-md print:bg-secondary/40 print:pt-1">
              <Sparkline points={trend} />
            </div>
          )}
        </div>

        <div className={statBoxClass}>
          <span className="text-xs font-medium text-muted-foreground print:text-[8px]">누적 사전등록자</span>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight print:mt-0.5 print:text-[14px]">
            {formatNumber(data.performance.cumulativeCount)}
          </div>
          {previousYear && (
            <div className="mt-2 space-y-2 print:mt-1 print:space-y-1">
              {previousYear.paceCount !== null && previousYear.dDay !== null && (
                <div className="rounded-xl bg-background px-2.5 py-2 shadow-sm print:px-1.5 print:py-1">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground print:text-[8px]">
                    <span>{formatDday(previousYear.dDay)} 동일 시점</span>
                    <span>{previousYear.eventYear ?? "전년"}년 {formatNumber(previousYear.paceCount)}명</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium print:text-[9px]">등록 속도</span>
                    <ChangeBadge rangeChange={previousYear.paceChange} />
                  </div>
                </div>
              )}
              {finalProgress !== null && (
                <div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground print:text-[9px]">
                    <span>전년 최종 실적 대비</span>
                    <span className="font-medium text-foreground">{Math.round(finalProgress)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.min(100, finalProgress)}%` }}
                    />
                  </div>
                  <div className="mt-0.5 text-right text-[10px] text-muted-foreground print:text-[8px]">
                    {previousYear.sourceName} · {formatNumber(previousYear.totalCount)}명
                  </div>
                </div>
              )}
              {finalProgress === null && previousYear.paceCount === null && (
                <p className="text-right text-[10px] text-muted-foreground print:text-[8px]">
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

function ComparisonRows({ weekly, yearly }: { weekly: number | null; yearly: number | null }) {
  return (
    <dl className="mt-2 grid gap-1 print:mt-0.5 print:gap-0.5">
      <ComparisonRow label="전주 대비" value={weekly} />
      <ComparisonRow label="전년 동일 D구간" value={yearly} />
    </dl>
  );
}

function ComparisonRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-1.5">
      <dt className="min-w-0 truncate text-[10px] text-muted-foreground print:text-[7px]">{label}</dt>
      <dd className="shrink-0">
        <ChangeBadge rangeChange={value} />
      </dd>
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
