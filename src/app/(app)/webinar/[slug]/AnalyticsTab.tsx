"use client";

import { useCallback, useEffect, useState, type ElementType } from "react";
import { motion } from "framer-motion";
import { Activity, HelpCircle, Loader2, RefreshCw, TrendingUp, UserCheck, Users } from "lucide-react";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Summary {
  totalRegistered: number;
  attended: number;
  activeViewers: number;
  presenceViewers: number;
  marketingAgreed: number;
  pendingQuestions: number;
  answeredQuestions: number;
  dismissedQuestions: number;
  totalQuestions: number;
  attendRate: number;
  marketingRate: number;
  avgStayMinutes: number;
  maxStayMinutes: number;
  stay30: number;
  stay60: number;
  stay30Rate: number;
  stay60Rate: number;
}

interface AnalyticsData {
  summary: Summary;
  generatedAt: string;
}

const emptySummary: Summary = {
  totalRegistered: 0,
  attended: 0,
  activeViewers: 0,
  presenceViewers: 0,
  marketingAgreed: 0,
  pendingQuestions: 0,
  answeredQuestions: 0,
  dismissedQuestions: 0,
  totalQuestions: 0,
  attendRate: 0,
  marketingRate: 0,
  avgStayMinutes: 0,
  maxStayMinutes: 0,
  stay30: 0,
  stay60: 0,
  stay30Rate: 0,
  stay60Rate: 0,
};

function StatCard({
  icon: Icon,
  label,
  value,
  meta,
}: {
  icon: ElementType;
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <motion.div
      whileHover={{ borderColor: "rgba(139, 92, 246, 0.18)" }}
      transition={spring}
      className="rounded-2xl border border-border bg-background p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{meta}</p>
    </motion.div>
  );
}

function BarRow({ label, value, total, color = "#8b5cf6" }: { label: string; value: number; total: number; color?: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toLocaleString()}명 · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function AnalyticsTab({ webinarId }: { webinarId: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchAnalytics = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/webinars/${webinarId}/dashboard`);
      if (!res.ok) return;
      setData(await res.json());
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [webinarId]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchAnalytics());
  }, [fetchAnalytics]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary ?? emptySummary;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">분석</h2>
          <p className="text-sm text-muted-foreground mt-1">
            등록부터 입장, 체류, 질문까지 핵심 전환만 간결하게 봅니다.
          </p>
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => fetchAnalytics(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          새로고침
        </motion.button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard icon={Users} label="총 등록" value={`${summary.totalRegistered.toLocaleString()}명`} meta={`마케팅 동의 ${summary.marketingRate}%`} />
        <StatCard icon={UserCheck} label="입장 전환" value={`${summary.attendRate}%`} meta={`${summary.attended.toLocaleString()}명 입장`} />
        <StatCard icon={Activity} label="30분 유지" value={`${summary.stay30Rate}%`} meta={`${summary.stay30.toLocaleString()}명`} />
        <StatCard icon={HelpCircle} label="질문 참여" value={`${summary.totalQuestions.toLocaleString()}개`} meta={`대기 ${summary.pendingQuestions}개 · 답변 ${summary.answeredQuestions}개`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-border bg-background p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold">참가 전환 흐름</h3>
            <p className="text-xs text-muted-foreground mt-1">등록자를 기준으로 주요 단계를 비교합니다.</p>
          </div>
          <div className="space-y-4">
            <BarRow label="사전 등록" value={summary.totalRegistered} total={summary.totalRegistered || 1} />
            <BarRow label="실제 입장" value={summary.attended} total={summary.totalRegistered} color="#2563eb" />
            <BarRow label="30분 이상 체류" value={summary.stay30} total={summary.attended} color="#16a34a" />
            <BarRow label="60분 이상 체류" value={summary.stay60} total={summary.attended} color="#f97316" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-background p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold">운영 신호</h3>
            <p className="text-xs text-muted-foreground mt-1">라이브 운영 중 빠르게 확인할 수 있는 값입니다.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground">현재 시청자</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{summary.activeViewers}명</p>
            </div>
            <div className="rounded-xl bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground">접속 유지</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{summary.presenceViewers}명</p>
            </div>
            <div className="rounded-xl bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground">평균 체류</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{summary.avgStayMinutes}분</p>
            </div>
            <div className="rounded-xl bg-secondary/40 p-4">
              <p className="text-xs text-muted-foreground">최대 체류</p>
              <p className="mt-2 text-xl font-semibold tabular-nums">{summary.maxStayMinutes}분</p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-background p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold">해석 가이드</h3>
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-6">
          입장 전환율이 낮으면 리마인드 메시지와 입장 인증 흐름을, 체류율이 낮으면 세션 시간표와 중간 공지를 먼저 점검하세요.
          질문 수가 적다면 라이브 운영에서 Q&A 안내 공지를 푸시하는 것이 좋습니다.
        </p>
      </section>
    </div>
  );
}
