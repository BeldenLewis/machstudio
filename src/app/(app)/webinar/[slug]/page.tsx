"use client";

import { useState, useEffect, useCallback, useRef, type ElementType } from "react";
import { use } from "react";
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
import { toast } from "sonner";
import Link from "next/link";
import PageSetupTab from "./PageSetupTab";
import AnalyticsTab from "./AnalyticsTab";
import DeployTab from "./DeployTab";
import OperateTab, { type OperateSection } from "./OperateTab";
import { resolveWebinarStatus } from "@/lib/webinar-status";

type SettingsSection = "general" | "form" | "sessions" | "theme" | "embed";
// 새 IA: 만들기(create=설정) / 배포(deploy) / 운영(operate=콘솔+등록자) / 분석(analytics)
type Tab = "create" | "deploy" | "operate" | "analytics";
type NavigationTarget = Tab | `create-${SettingsSection}` | "operate-registrants";

interface WebinarSession {
  id: string;
  number: number;
  title: string;
  speaker: string | null;
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
  sessions: WebinarSession[];
  _count: { registrations: number; questions: number };
}

const tabs: { id: Tab; label: string; icon: ElementType }[] = [
  { id: "create", label: "만들기", icon: Settings2 },
  { id: "deploy", label: "배포", icon: Cable },
  { id: "operate", label: "운영", icon: Activity },
  { id: "analytics", label: "분석", icon: BarChart3 },
];

export default function WebinarDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: id } = use(params);
  const [webinar, setWebinar] = useState<Webinar | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("operate");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [operateSection, setOperateSection] = useState<OperateSection>("console");
  const [copied, setCopied] = useState(false);
  const defaultTabApplied = useRef(false);

  const fetchWebinar = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/webinars/${id}`);
      if (!res.ok) { toast.error("웨비나를 불러오지 못했어요"); return; }
      const data = await res.json();
      setWebinar(data.webinar);

      // 상태 연동 기본 진입 탭 (최초 1회): 종료→분석, 라이브/등록자 有→운영, 준비 단계→만들기
      if (!defaultTabApplied.current && data.webinar) {
        defaultTabApplied.current = true;
        const status = resolveWebinarStatus(data.webinar).status;
        if (status === "ended") setActiveTab("analytics");
        else if (status === "live" || data.webinar._count.registrations > 0) setActiveTab("operate");
        else setActiveTab("create");
      }
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => { void Promise.resolve().then(fetchWebinar); }, [fetchWebinar]);

  const activateTab = (tab: Tab) => {
    setActiveTab(tab);
  };

  const handleNavigate = (target: NavigationTarget | string) => {
    if (target.startsWith("create-")) {
      setSettingsSection(target.replace("create-", "") as SettingsSection);
      setActiveTab("create");
      return;
    }
    if (target === "operate-registrants") {
      setOperateSection("registrants");
      setActiveTab("operate");
      return;
    }

    setActiveTab(target as Tab);
  };

  const liveUrl = webinar ? `${window.location.origin}/webinar/${webinar.slug}/live` : "";

  const copyLiveUrl = () => {
    navigator.clipboard.writeText(liveUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!webinar) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Video className="w-10 h-10 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">웨비나를 찾을 수 없어요</p>
        <Link href="/webinar" className="text-xs text-violet-500 mt-2 hover:underline">목록으로</Link>
      </div>
    );
  }

  const now = new Date();
  const start = new Date(webinar.liveStartAt);
  const end = new Date(webinar.liveEndAt);
  const isLive = now >= start && now <= end;
  const isEnded = now > end;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 sm:px-6 lg:px-8 pt-6 lg:pt-8 pb-0 space-y-4">
        <Link
          href="/webinar"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          웨비나 목록
        </Link>

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
                {isLive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 font-medium">LIVE</span>}
                {isEnded && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">종료</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {start.toLocaleDateString("ko-KR")} {start.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                {" ~ "}
                {end.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                {" · "}
                등록자 {webinar._count.registrations.toLocaleString()}명
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-secondary/50 text-xs font-mono text-muted-foreground max-w-xs truncate">
              /webinar/{webinar.slug}/live
            </div>
            <button
              onClick={copyLiveUrl}
              className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors"
              title="라이브 URL 복사"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
            <a
              href={liveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors"
              title="라이브 페이지 열기"
            >
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
            </a>
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-border -mb-px overflow-x-auto">
          {tabs.map(({ id: tabId, label, icon: Icon }) => (
            <button
              key={tabId}
              onClick={() => activateTab(tabId)}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tabId
                  ? "border-violet-500 text-violet-500 font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {tabId === "operate" && webinar._count.registrations > 0 && (
                <span className="ml-1 text-[10px] bg-violet-500/10 text-violet-500 px-1.5 py-0.5 rounded-full font-medium">
                  {webinar._count.registrations}
                </span>
              )}
            </button>
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
                onSectionChange={setSettingsSection}
              />
            )}
            {activeTab === "deploy" && <DeployTab webinarId={id} />}
            {activeTab === "operate" && (
              <OperateTab
                webinarId={id}
                webinar={webinar}
                onNavigate={handleNavigate}
                section={operateSection}
                onSectionChange={setOperateSection}
              />
            )}
            {activeTab === "analytics" && <AnalyticsTab webinarId={id} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
