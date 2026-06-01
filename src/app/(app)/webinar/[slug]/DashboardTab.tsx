"use client";

import { useCallback, useEffect, useState, type ElementType } from "react";
import { motion } from "framer-motion";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;
import {
  Activity,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Code2,
  HelpCircle,
  ListChecks,
  Loader2,
  MailCheck,
  RefreshCw,
  Radio,
  UserCheck,
  Users,
} from "lucide-react";

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

interface Viewer {
  id: string;
  name: string;
  company: string | null;
  department: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  enteredAt: string | null;
  lastPingAt: string | null;
  currentStayMinutes: number;
  isLive: boolean;
}

interface Question {
  id: string;
  question: string;
  sessionNumber: number | null;
  status: string;
  name: string | null;
  company: string | null;
  createdAt: string;
}

interface WebinarForDashboard {
  sessions: { id: string }[];
  config: Record<string, unknown>;
}

interface DashboardData {
  summary: Summary;
  currentViewers: Viewer[];
  latestQuestions: Question[];
  generatedAt: string;
}

type DashboardNavTarget =
  | "registrations"
  | "qa"
  | "announcements"
  | "settings-general"
  | "settings-form"
  | "settings-sessions"
  | "settings-theme"
  | "settings-embed"
  | "settings"
  | "analytics";

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

function formatAgo(value: string | null) {
  if (!value) return "-";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 전`;
}

function formatTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function StatusPill({ status }: { status: string }) {
  if (status === "answered") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">답변 완료</span>;
  }
  if (status === "dismissed") {
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">미채택</span>;
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">대기</span>;
}

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  meta,
  tone = "violet",
}: {
  icon: ElementType;
  label: string;
  value: string | number;
  unit?: string;
  meta: string;
  tone?: "violet" | "green" | "amber" | "blue";
}) {
  const toneClass = {
    violet: "bg-violet-500/10 text-violet-500",
    green: "bg-green-500/10 text-green-600 dark:text-green-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  }[tone];

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${toneClass}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{meta}</p>
    </div>
  );
}

function NextStepCard({
  done,
  label,
  desc,
  icon: Icon,
  onClick,
}: {
  done: boolean;
  label: string;
  desc: string;
  icon: ElementType;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -1, borderColor: "rgba(139, 92, 246, 0.18)" }}
      whileTap={{ scale: 0.98 }}
      transition={spring}
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:bg-secondary/40"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
        done ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-violet-500/10 text-violet-500"
      }`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-muted-foreground">{desc}</span>
      </span>
    </motion.button>
  );
}

function FunnelStep({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">{value.toLocaleString()}명 · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function DashboardTab({
  webinarId,
  webinar,
  onNavigate,
}: {
  webinarId: string;
  webinar?: WebinarForDashboard;
  onNavigate?: (target: DashboardNavTarget) => void;
}) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchDashboard = useCallback(async (quiet = false) => {
    if (quiet) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch(`/api/webinars/${webinarId}/dashboard`);
      if (!res.ok) return;
      const next = await res.json();
      setData(next);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [webinarId]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchDashboard());
    const interval = setInterval(() => fetchDashboard(true), 15000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const summary = data?.summary ?? emptySummary;
  const viewers = data?.currentViewers ?? [];
  const questions = data?.latestQuestions ?? [];
  const hasRegistrationForm = Boolean(webinar?.config?.registrationForm);
  const hasVideo = typeof webinar?.config?.youtubeId === "string" && Boolean(webinar.config.youtubeId);
  const hasSessions = Boolean(webinar?.sessions?.length);
  const navigate = (target: DashboardNavTarget) => onNavigate?.(target);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold">운영 대시보드</h2>
          <p className="text-sm text-muted-foreground mt-1">등록, 입장, 체류, Q&A 상태를 한 화면에서 확인합니다.</p>
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => fetchDashboard(true)}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          새로고침
        </motion.button>
      </div>

      <section className="rounded-2xl border border-border bg-secondary/20 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">다음 단계</h3>
            <p className="text-xs text-muted-foreground mt-1">처음 운영하는 사람도 이 순서대로 준비하면 됩니다.</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
          <NextStepCard
            done={hasRegistrationForm}
            icon={ClipboardList}
            label="등록 폼 정리"
            desc="수집 항목과 동의 문구를 확인합니다."
            onClick={() => navigate("settings-form")}
          />
          <NextStepCard
            done={summary.totalRegistered > 0}
            icon={Users}
            label="등록자 준비"
            desc="직접 등록하거나 CSV로 일괄 등록합니다."
            onClick={() => navigate("registrations")}
          />
          <NextStepCard
            done={hasSessions}
            icon={ListChecks}
            label="세션 구성"
            desc="라이브 페이지에 보일 아젠다를 정리합니다."
            onClick={() => navigate("settings-sessions")}
          />
          <NextStepCard
            done={hasVideo}
            icon={Code2}
            label="페이지 확인"
            desc="영상, 배너, 라이브 페이지를 미리 봅니다."
            onClick={() => navigate(hasVideo ? "settings-embed" : "settings-general")}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <KpiCard icon={Radio} label="현재 시청자" value={summary.activeViewers} unit="명" meta={`최근 접속 유지 ${summary.presenceViewers}명`} tone="green" />
        <KpiCard icon={Users} label="사전 등록" value={summary.totalRegistered.toLocaleString()} unit="명" meta={`마케팅 동의 ${summary.marketingRate}%`} />
        <KpiCard icon={UserCheck} label="누적 입장" value={summary.attended.toLocaleString()} unit="명" meta={`입장 전환율 ${summary.attendRate}%`} tone="blue" />
        <KpiCard icon={Clock3} label="평균 체류" value={summary.avgStayMinutes} unit="분" meta={`최대 ${summary.maxStayMinutes}분`} tone="amber" />
        <KpiCard icon={HelpCircle} label="대기 질문" value={summary.pendingQuestions} unit="개" meta={`전체 ${summary.totalQuestions}개 · 답변 ${summary.answeredQuestions}개`} />
        <KpiCard icon={MailCheck} label="마케팅 동의" value={summary.marketingAgreed.toLocaleString()} unit="명" meta={`${summary.marketingRate}% 수신 동의`} tone="green" />
        <KpiCard icon={Activity} label="30분 이상 체류" value={summary.stay30} unit="명" meta={`${summary.stay30Rate}% 유지`} tone="blue" />
        <KpiCard icon={Activity} label="60분 이상 체류" value={summary.stay60} unit="명" meta={`${summary.stay60Rate}% 유지`} tone="violet" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
        <section className="rounded-2xl border border-border bg-background overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">현재 접속자</h3>
              <p className="text-xs text-muted-foreground mt-0.5">최근 5분 안에 신호가 들어온 참가자</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">{viewers.length}명</span>
          </div>
          {viewers.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">아직 접속자가 없어요</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">이름 / 회사</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">부서 / 직함</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">입장</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">체류</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">마지막 신호</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {viewers.map((viewer) => (
                    <tr key={viewer.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{viewer.name}</div>
                        <div className="text-xs text-muted-foreground">{viewer.company ?? viewer.email ?? viewer.phone ?? "-"}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[viewer.department, viewer.jobTitle].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums">{formatTime(viewer.enteredAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">{viewer.currentStayMinutes}분</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatAgo(viewer.lastPingAt)}</td>
                      <td className="px-4 py-3">
                        {viewer.isLive ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">LIVE</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">대기</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-background p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold">참가 Funnel</h3>
            <p className="text-xs text-muted-foreground mt-0.5">등록 기준 전환 흐름</p>
          </div>
          <div className="space-y-4">
            <FunnelStep label="사전 등록" value={summary.totalRegistered} total={summary.totalRegistered || 1} color="#8b5cf6" />
            <FunnelStep label="실제 입장" value={summary.attended} total={summary.totalRegistered} color="#2563eb" />
            <FunnelStep label="30분 이상" value={summary.stay30} total={summary.totalRegistered} color="#16a34a" />
            <FunnelStep label="60분 이상" value={summary.stay60} total={summary.totalRegistered} color="#f97316" />
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">최신 Q&A</h3>
            <p className="text-xs text-muted-foreground mt-0.5">최근 등록된 질문 6개</p>
          </div>
          <span className="text-xs px-2 py-1 rounded-lg bg-secondary text-muted-foreground">{summary.totalQuestions}개</span>
        </div>
        {questions.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">아직 질문이 없어요</div>
        ) : (
          <div className="divide-y divide-border">
            {questions.map((question) => (
              <article key={question.id} className="px-4 py-3 hover:bg-secondary/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-6">{question.question}</p>
                  <StatusPill status={question.status} />
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {question.name && <span>{question.name}</span>}
                  {question.company && <span>· {question.company}</span>}
                  {question.sessionNumber && <span className="px-1.5 py-0.5 rounded-full bg-secondary">세션 {question.sessionNumber}</span>}
                  <span>{new Date(question.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
