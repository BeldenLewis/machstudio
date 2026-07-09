"use client";

import { useState, useEffect, useCallback, useMemo, Suspense, type ElementType } from "react";
import { use } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Cable,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Settings2,
  Video,
} from "lucide-react";
import Link from "next/link";
import PageSetupTab from "./PageSetupTab";
import AnalyticsTab from "./AnalyticsTab";
import DeployTab from "./DeployTab";
import OperateTab, { type OperateSection } from "./OperateTab";
import { resolveWebinarStatus, WEBINAR_STATUS_META } from "@/lib/webinar-status";
import { formatKst } from "@/lib/datetime";
import { InlineError } from "@/components/ui/inline-error";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type SettingsSection = "general" | "registration" | "sessions" | "livepage";
// 새 IA: 만들기(create=설정) / 배포(deploy) / 운영(operate=콘솔+등록자) / 분석(analytics)
type Tab = "create" | "deploy" | "operate" | "analytics";
type NavigationTarget = Tab | `create-${SettingsSection}` | "operate-registrants";

const TAB_IDS: Tab[] = ["create", "deploy", "operate", "analytics"];
const CREATE_SECTIONS: SettingsSection[] = ["general", "registration", "sessions", "livepage"];
const OPERATE_SECTIONS: OperateSection[] = ["console", "registrants"];

interface WebinarSession {
  id: string;
  number: number;
  type: string;
  title: string;
  speaker: string | null;
  speakerPhotoUrl: string | null;
  description: string | null;
  startTime: string;
  endTime: string;
}

interface Webinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  statusOverride?: string | null;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
  sessions: WebinarSession[];
  project?: { id: string; name: string } | null;
  workspace?: { id: string; name: string } | null;
  _count: { registrations: number; questions: number };
}

const tabs: { id: Tab; label: string; icon: ElementType }[] = [
  { id: "create", label: "만들기", icon: Settings2 },
  { id: "deploy", label: "배포", icon: Cable },
  { id: "operate", label: "운영", icon: Activity },
  { id: "analytics", label: "분석", icon: BarChart3 },
];

function HubLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function WebinarDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = use(params);
  // useSearchParams 는 Suspense 경계가 필요 — 허브 본문을 감싼다
  return (
    <Suspense fallback={<HubLoader />}>
      <WebinarDetail id={id} />
    </Suspense>
  );
}

function WebinarDetail({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<"notfound" | "forbidden" | "error" | null>(null);
  const [copied, setCopied] = useState(false);

  // ── 위치는 URL 이 단일 소스: ?tab=&sec= 에서 파생 (새로고침·뒤로가기·딥링크·공유 복원) ──
  const tabParam = searchParams.get("tab");
  const secParam = searchParams.get("sec");

  const computedDefaultTab = useMemo<Tab | null>(() => {
    if (!webinar) return null;
    // 상태 연동 기본 진입: 종료→분석, 라이브→운영, 그 외(준비·등록중)→만들기.
    // 등록자 수는 진입 탭을 바꾸지 않는다 — 셋업 중 첫 등록자가 들어와도 만들기에 머문다.
    const status = resolveWebinarStatus(webinar).status;
    if (status === "ended") return "analytics";
    if (status === "live") return "operate";
    return "create";
  }, [webinar]);

  const activeTab: Tab = TAB_IDS.includes(tabParam as Tab) ? (tabParam as Tab) : (computedDefaultTab ?? "operate");
  const settingsSection: SettingsSection = CREATE_SECTIONS.includes(secParam as SettingsSection)
    ? (secParam as SettingsSection)
    : "general";
  const operateSection: OperateSection = OPERATE_SECTIONS.includes(secParam as OperateSection)
    ? (secParam as OperateSection)
    : "console";

  const navigate = useCallback(
    (tab: Tab, sec?: SettingsSection | OperateSection, opts?: { replace?: boolean }) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", tab);
      if (sec) sp.set("sec", sec);
      else sp.delete("sec");
      const url = `${pathname}?${sp.toString()}`;
      // 탭 전환은 push(뒤로가기로 이전 탭 복귀), 서브섹션은 replace(히스토리 소음 방지)
      if (opts?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const fetchWebinar = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/webinars/${id}`);
      if (res.status === 404) { setLoadError("notfound"); return; }
      // 401/403 은 재시도해도 조건이 불변 — 재시도 버튼 없는 안내로 분기
      if (res.status === 401 || res.status === 403) { setLoadError("forbidden"); return; }
      if (!res.ok) { setLoadError("error"); return; }
      const data = await res.json();
      setWebinar(data.webinar);
    } catch {
      // 네트워크 실패 — 빈 상태로 위장하지 않고 재시도 경로 제공
      setLoadError("error");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void Promise.resolve().then(fetchWebinar); }, [fetchWebinar]);

  // tab 쿼리가 없으면 계산된 기본 탭을 URL 에 명시(replace) — 위치를 URL 단일 소스로 고정
  useEffect(() => {
    if (!webinar || !computedDefaultTab) return;
    if (!TAB_IDS.includes(searchParams.get("tab") as Tab)) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", computedDefaultTab);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    }
  }, [webinar, computedDefaultTab, searchParams, pathname, router]);

  const handleNavigate = (target: NavigationTarget | string) => {
    if (target.startsWith("create-")) {
      navigate("create", target.replace("create-", "") as SettingsSection);
      return;
    }
    if (target === "operate-registrants") {
      navigate("operate", "registrants");
      return;
    }
    navigate(target as Tab);
  };

  const liveUrl = webinar ? `${window.location.origin}/webinar/${webinar.slug}/live` : "";

  const copyLiveUrl = () => {
    navigator.clipboard.writeText(liveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) return <HubLoader />;

  // 로드 실패(네트워크·5xx)는 재시도 가능 — '찾을 수 없음'과 구분
  if (loadError === "error") {
    return (
      <div className="p-8">
        <InlineError message="웨비나를 불러오지 못했어요" onRetry={() => void fetchWebinar()} />
      </div>
    );
  }

  if (loadError === "forbidden") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Video className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">이 웨비나에 접근할 권한이 없어요</p>
        <Link href="/webinar" className="text-xs text-violet-500 mt-2 hover:underline">목록으로</Link>
      </div>
    );
  }

  if (loadError === "notfound" || !webinar) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Video className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">웨비나를 찾을 수 없어요</p>
        <Link href="/webinar" className="text-xs text-violet-500 mt-2 hover:underline">목록으로</Link>
      </div>
    );
  }

  // 상태 머신 기준 — statusOverride(수동 전환) 반영. 헤더 배지/아이콘 색이 운영 콘솔과 일치.
  const status = resolveWebinarStatus(webinar).status;
  const isLive = status === "live";
  const isEnded = status === "ended";
  const statusMeta = WEBINAR_STATUS_META[status];

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 lg:px-8 pt-6 lg:pt-8 pb-0 space-y-4">
        {/* 브레드크럼 — 목록 + 소속 프로젝트 맥락 (딥링크/복제 진입 시 어느 프로젝트인지) */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
          <Link
            href="/webinar"
            className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            웨비나 목록
          </Link>
          {webinar.project && (
            <span className="text-muted-foreground/60">
              · {webinar.workspace ? `${webinar.workspace.name} / ` : ""}{webinar.project.name}
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isLive ? "bg-red-500/10 text-red-500" : isEnded ? "bg-secondary text-muted-foreground" : "bg-violet-500/10 text-violet-500"
            }`}>
              <Video className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold">{webinar.name}</h1>
                {(isLive || isEnded) && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusMeta.tone}`}>{statusMeta.label}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatKst(webinar.liveStartAt, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                {" ~ "}
                {formatKst(webinar.liveEndAt, { hour: "2-digit", minute: "2-digit" })}
                {" · "}
                등록자 {webinar._count.registrations.toLocaleString()}명
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-secondary/50 text-xs font-mono text-muted-foreground max-w-xs truncate">
              /webinar/{webinar.slug}/live
            </div>
            <motion.button
              onClick={copyLiveUrl}
              whileTap={{ scale: 0.9 }}
              transition={spring}
              className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors"
              title="라이브 URL 복사"
            >
              {copied ? (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring} className="inline-flex">
                  <Check className="w-3.5 h-3.5 text-green-500" />
                </motion.span>
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </motion.button>
            <motion.a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              whileTap={{ scale: 0.9 }}
              transition={spring}
              className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors"
              title="라이브 페이지 열기"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </motion.a>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-border -mb-px overflow-x-auto" role="tablist">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <motion.button
              key={tabId}
              role="tab"
              aria-selected={activeTab === tabId}
              onClick={() => navigate(tabId)}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              className={`relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 border-transparent transition-colors whitespace-nowrap ${
                activeTab === tabId
                  ? "text-violet-500 font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {tabId === "operate" && webinar._count.registrations > 0 && (
                <span className="ml-1 text-[10px] bg-violet-500/10 text-violet-500 px-1.5 py-0.5 rounded-full font-medium">
                  {webinar._count.registrations}
                </span>
              )}
              {activeTab === tabId && (
                <motion.span
                  layoutId="webinar-hub-tab-underline"
                  className="absolute left-0 right-0 -bottom-px h-0.5 bg-violet-500 rounded-full"
                  transition={spring}
                />
              )}
            </motion.button>
          ))}
        </div>
      </div>

      <div className={`flex-1 ${activeTab === "create" ? "overflow-hidden" : "overflow-auto"}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {activeTab === "create" && (
              <PageSetupTab
                webinar={webinar}
                onUpdate={fetchWebinar}
                section={settingsSection}
                onSectionChange={(section) => navigate("create", section, { replace: true })}
              />
            )}
            {activeTab === "deploy" && <DeployTab webinarId={id} />}
            {activeTab === "operate" && (
              <OperateTab
                webinarId={id}
                webinar={webinar}
                onNavigate={handleNavigate}
                section={operateSection}
                onSectionChange={(section) => navigate("operate", section, { replace: true })}
              />
            )}
            {activeTab === "analytics" && <AnalyticsTab webinarId={id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
