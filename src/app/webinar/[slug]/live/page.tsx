"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import LivePushLayer from "../LivePushLayer";
import LiveContentStk from "../LiveContentStk";
import { formatKst } from "@/lib/datetime";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface WebinarSession {
  id: string;
  number: number;
  type?: string;
  title: string;
  speaker: string | null;
  speakerPhotoUrl?: string | null;
  description?: string | null;
  startTime: string;
  endTime: string;
}

interface WebinarInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  signupDeadline: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  components?: Record<string, unknown> | null;
  sessions: WebinarSession[];
}

interface Announcement {
  id: string;
  type: string;
  message: string;
}

interface AnsweredQA {
  id: string;
  question: string;
  sessionNumber: number | null;
  name: string | null;
  voteCount: number;
  status: string;
}

interface ChatMessage {
  id: string;
  name: string;
  message: string;
  isHost: boolean;
  createdAt: string;
}

type PageView = "signup" | "live" | "ended";
type FieldType = "text" | "email" | "tel" | "select" | "checkbox";
type AuthMethod = "phone" | "email";

interface RegistrationField {
  id?: string;
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  options?: string[];
  system?: boolean;
}

interface RegistrationFormConfig {
  fields: RegistrationField[];
  privacyText: string;
  marketingText: string;
  submitLabel: string;
}

const defaultRegistrationFields: RegistrationField[] = [
  { id: "name", key: "name", label: "이름", type: "text", placeholder: "홍길동", required: true, enabled: true, system: true },
  { id: "phone", key: "phone", label: "연락처", type: "tel", placeholder: "010-0000-0000", required: false, enabled: true, system: true },
  { id: "email", key: "email", label: "이메일", type: "email", placeholder: "hong@example.com", required: false, enabled: true, system: true },
  { id: "company", key: "company", label: "회사명", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "department", key: "department", label: "부서", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "jobTitle", key: "jobTitle", label: "직함", type: "text", placeholder: "", required: false, enabled: true, system: true },
  { id: "industry", key: "industry", label: "업종", type: "text", placeholder: "", required: false, enabled: true, system: true },
];

function normalizeRegistrationForm(config: Record<string, unknown>): RegistrationFormConfig {
  const raw = config.registrationForm as Partial<RegistrationFormConfig> | undefined;
  const savedFields = Array.isArray(raw?.fields) ? raw.fields : [];
  const merged = defaultRegistrationFields.map((field) => ({
    ...field,
    ...savedFields.find((item) => item?.key === field.key),
    id: field.id,
    key: field.key,
    system: true,
  }));
  const customFields = savedFields
    .filter((item) => item && !defaultRegistrationFields.some((field) => field.key === item.key))
    .map((item) => ({
      id: String(item.id ?? item.key),
      key: String(item.key),
      label: String(item.label ?? item.key),
      type: (["text", "email", "tel", "select", "checkbox"].includes(String(item.type)) ? item.type : "text") as FieldType,
      placeholder: String(item.placeholder ?? ""),
      required: Boolean(item.required),
      enabled: item.enabled !== false,
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      system: false,
    }));

  return {
    fields: [...merged, ...customFields].filter((field) => field.enabled !== false),
    privacyText: raw?.privacyText ?? "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: raw?.marketingText ?? "[선택] 마케팅 정보 수신에 동의합니다",
    submitLabel: raw?.submitLabel ?? "사전 등록하기",
  };
}

export default function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [webinar, setWebinar] = useState<WebinarInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<PageView>("signup");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [answeredQA, setAnsweredQA] = useState<AnsweredQA[]>([]);
  const [serverNowMs, setServerNowMs] = useState<number | undefined>(undefined);
  const [isTrulyLive, setIsTrulyLive] = useState(false); // status === "live" (입장오픈 전 창과 구분)
  // 채팅 상태
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [votedQa, setVotedQa] = useState<Set<string>>(() => new Set()); // 세션 내 추천한 질문
  const [activeTab, setActiveTab] = useState<string>("qa");
  const chatCursorRef = useRef<string | null>(null);
  const chatTickRef = useRef(0);
  // 알림 구독 ("알림 받고 이어보기")
  const [notifySubscribed, setNotifySubscribed] = useState(false);
  const [notifyError, setNotifyError] = useState("");
  const [notifyPending, setNotifyPending] = useState(false);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  // youtubeId 는 /info 로 공개하지 않고 verify 통과 시에만 받아 영상 게이팅
  const [videoId, setVideoId] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone");
  const [authValue, setAuthValue] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // 등록 폼 상태
  const [form, setForm] = useState({
    name: "", phone: "", email: "", company: "", department: "",
    jobTitle: "", industry: "", agreeMarketing: false, agreePrivacy: false,
  });
  const [customFields, setCustomFields] = useState<Record<string, string | boolean>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [formError, setFormError] = useState("");

  // Q&A 상태
  const [question, setQuestion] = useState("");
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [isSendingQA, setIsSendingQA] = useState(false);
  const [qaSent, setQaSent] = useState(false);
  const [qaError, setQaError] = useState("");

  const pingRef = useRef<NodeJS.Timeout | null>(null);

  // iframe 높이 자동 전달 (아임웹 임베드 시 사용)
  useEffect(() => {
    const sendHeight = () => {
      if (window.parent !== window) {
        window.parent.postMessage({ type: "mach-resize", height: document.body.scrollHeight }, "*");
      }
    };
    sendHeight();
    const ro = new ResizeObserver(sendHeight);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, []);

  const fetchWebinar = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinar/${slug}/info`);
      if (!res.ok) return;
      const data = await res.json();
      setWebinar(data.webinar);
      if (typeof data.serverNow === "string") setServerNowMs(new Date(data.serverNow).getTime());

      // 서버 상태머신 판정 사용 — statusOverride(운영 콘솔 수동 전환)·입장오픈 윈도 반영
      const status: string = data.status;
      const entryOpen: boolean = data.entryOpen;
      setIsTrulyLive(status === "live"); // 입장오픈(라이브 전) 창에선 false → LIVE 칩 대신 '곧 시작'
      const requestedView = new URLSearchParams(window.location.search).get("view");
      if (requestedView === "signup" && status !== "ended") setView("signup");
      else if (status === "ended") setView("ended");
      else if (status === "live" || entryOpen) setView("live");
      else setView("signup");
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinar/${slug}/announcements`);
      if (!res.ok) return;
      const data = await res.json();
      setAnnouncements(data.announcements ?? []);
    } catch {
      /* 폴링 중 일시적 네트워크 오류는 다음 주기에 재시도 */
    }
  }, [slug]);

  // 답변 완료된 Q&A (이름은 서버에서 마스킹됨) — 참여 독 Q&A 탭에 노출
  const fetchAnsweredQA = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinar/${slug}/qa`);
      if (!res.ok) return;
      const data = await res.json();
      setAnsweredQA(data.questions ?? []);
    } catch {
      /* 폴링 중 일시적 네트워크 오류는 다음 주기에 재시도 */
    }
  }, [slug]);

  // 채팅 — 증분(after 커서, 신규만) 또는 전체 재동기화(full). 최근 100개 유지. 이름은 서버 마스킹.
  const fetchChat = useCallback(async (full = false) => {
    try {
      const after = full ? null : chatCursorRef.current;
      const res = await fetch(`/api/webinar/${slug}/chat${after ? `?after=${encodeURIComponent(after)}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      const incoming: ChatMessage[] = data.messages ?? [];
      if (!after) {
        // 초기/전체 재동기화 — 서버 현재 상태로 교체(모더레이션 삭제 반영)
        const trimmed = incoming.slice(-100);
        chatCursorRef.current = trimmed.length ? trimmed[trimmed.length - 1].createdAt : null;
        setChatMessages(trimmed);
        return;
      }
      if (incoming.length === 0) return;
      chatCursorRef.current = incoming[incoming.length - 1].createdAt ?? chatCursorRef.current;
      setChatMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = incoming.filter((m) => !seen.has(m.id));
        if (fresh.length === 0) return prev; // gte 로 재조회된 경계 메시지뿐 → 변화 없음, 리렌더 스킵
        return [...prev, ...fresh].slice(-100);
      });
    } catch {
      /* 폴링 중 일시적 네트워크 오류는 다음 주기에 재시도 */
    }
  }, [slug]);

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || isSendingChat) return;
    setIsSendingChat(true);
    setChatError("");
    try {
      const res = await fetch(`/api/webinar/${slug}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, registrationId, name: form.name || null }),
      });
      if (res.ok) {
        setChatInput("");
        await fetchChat();
      } else {
        const d = await res.json().catch(() => ({}));
        setChatError(d.error ?? "메시지 전송에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } finally {
      setIsSendingChat(false);
    }
  };

  // 알림 스위치 토글 — ON: 구독(등록 이메일 저장), OFF: 해제. 낙관적 업데이트 + 실패 시 이전 상태로 복원.
  const handleNotifyToggle = async () => {
    if (notifyPending) return; // 연타 방지 (진행 중 중복 요청 차단)
    const prev = notifySubscribed;
    const next = !prev;
    setNotifyError("");
    setNotifyPending(true);
    setNotifySubscribed(next);
    try {
      const res = await fetch(`/api/webinar/${slug}/reminder`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setNotifyError(d.error ?? "알림 설정에 실패했어요.");
        setNotifySubscribed(prev); // 실패 → 이전 상태로 복원
      }
    } catch {
      setNotifyError("알림 설정에 실패했어요. 잠시 후 다시 시도해주세요.");
      setNotifySubscribed(prev);
    } finally {
      setNotifyPending(false);
    }
  };

  useEffect(() => {
    fetchWebinar();
  }, [fetchWebinar]);

  // 라이브 중 공지·답변 Q&A 폴링 (30초마다, 탭 비활성 시 스킵)
  useEffect(() => {
    if (view !== "live") return;
    const tick = () => {
      if (document.hidden) return;
      void fetchAnnouncements();
      // 답변 Q&A는 인증된 시청자(LiveContentStk 마운트)에게만 노출 — 그 전엔 폴링하지 않아 egress 낭비 방지
      if (registrationId) void fetchAnsweredQA();
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [view, registrationId, fetchAnnouncements, fetchAnsweredQA]);

  // 채팅 폴링 — 라이브 + 채팅 탭 활성 + 인증 시에만 12초 주기(탭 숨김 스킵). egress 최소화.
  const chatEnabled = (webinar?.components ?? {})["chatEnabled"] === true;
  useEffect(() => {
    if (view !== "live" || !registrationId || !chatEnabled || activeTab !== "chat") return;
    chatTickRef.current = 0;
    void fetchChat(true); // 진입 시 전체 동기화(최신·삭제 반영)
    const interval = setInterval(() => {
      if (document.hidden) return;
      chatTickRef.current += 1;
      // 5주기(약 60초)마다 전체 재동기화 → 모더레이션 삭제가 세션 중에도 반영됨
      void fetchChat(chatTickRef.current % 5 === 0);
    }, 12000);
    return () => clearInterval(interval);
  }, [view, registrationId, chatEnabled, activeTab, fetchChat]);

  // presence ping
  useEffect(() => {
    if (view !== "live" || !registrationId) return;

    fetch(`/api/webinar/${slug}/ping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, event: "enter" }),
    });

    // 60초 ± 10초 jitter — 동시 입장한 시청자들의 heartbeat 가 같은 초에 몰리지 않게 분산
    pingRef.current = setInterval(() => {
      fetch(`/api/webinar/${slug}/ping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, event: "ping" }),
      });
    }, 50_000 + Math.floor(Math.random() * 20_000));

    const handleLeave = () => {
      if (!registrationId) return;
      navigator.sendBeacon(`/api/webinar/${slug}/ping`, JSON.stringify({ registrationId, event: "leave" }));
    };
    window.addEventListener("beforeunload", handleLeave);

    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
      window.removeEventListener("beforeunload", handleLeave);
    };
  }, [view, registrationId, slug]);

  const handleRegister = async () => {
    setFormError("");
    if (!form.agreePrivacy) {
      setFormError(registrationForm.privacyText || "개인정보 수집 및 이용 동의가 필요합니다.");
      return;
    }

    for (const field of registrationForm.fields) {
      if (!field.required) continue;
      const value = field.system
        ? form[field.key as keyof typeof form]
        : customFields[field.key];
      const isEmpty = field.type === "checkbox" ? !value : !String(value ?? "").trim();
      if (isEmpty) {
        setFormError(`${field.label} 항목을 입력해주세요.`);
        return;
      }
    }

    setIsRegistering(true);
    try {
      const res = await fetch(`/api/webinar/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, customFields }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error ?? "등록에 실패했어요. 다시 시도해주세요.");
        return;
      }
      setRegistrationId(data.registration.id);
      if (typeof data.youtubeId === "string") setVideoId(data.youtubeId);
      setRegistered(true);

      // 라이브 중이면 바로 이동
      const now = new Date();
      if (webinar && now >= new Date(webinar.liveStartAt) && now <= new Date(webinar.liveEndAt)) {
        setView("live");
      }
    } finally {
      setIsRegistering(false);
    }
  };

  const handleVerifyEntry = async () => {
    const value = authMethod === "phone" ? authValue.replace(/[^0-9]/g, "") : authValue.trim().toLowerCase();
    if (!value || (authMethod === "phone" && value.length < 10) || (authMethod === "email" && !value.includes("@"))) {
      setVerifyError(authMethod === "phone" ? "올바른 연락처를 입력해주세요." : "올바른 이메일을 입력해주세요.");
      return;
    }

    setIsVerifying(true);
    setVerifyError("");
    try {
      const res = await fetch(`/api/webinar/${slug}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: authMethod, value }),
      });
      const data = await res.json();
      if (!res.ok || !data.found || !data.registration) {
        setVerifyError("등록 내역을 찾지 못했습니다. 다른 인증 방법으로도 시도해보세요.");
        return;
      }

      const registration = data.registration as {
        id: string;
        name?: string | null;
        phone?: string | null;
        email?: string | null;
        company?: string | null;
        department?: string | null;
        jobTitle?: string | null;
        industry?: string | null;
      };

      setRegistrationId(registration.id);
      if (typeof data.youtubeId === "string") setVideoId(data.youtubeId);
      if (typeof data.reminderSubscribed === "boolean") setNotifySubscribed(data.reminderSubscribed);
      setForm((prev) => ({
        ...prev,
        name: registration.name ?? prev.name,
        phone: registration.phone ?? prev.phone,
        email: registration.email ?? prev.email,
        company: registration.company ?? prev.company,
        department: registration.department ?? prev.department,
        jobTitle: registration.jobTitle ?? prev.jobTitle,
        industry: registration.industry ?? prev.industry,
      }));
      setAuthValue("");
    } finally {
      setIsVerifying(false);
    }
  };

  // 세션에 저장된 추천 이력 복원 (버튼 비활성 유지)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`mach_qavote_${slug}`);
      if (raw) setVotedQa(new Set(JSON.parse(raw) as string[]));
    } catch { /* 스토리지 차단 무시 */ }
  }, [slug]);

  const handleVoteQA = async (qaId: string) => {
    if (votedQa.has(qaId)) return;
    const persist = (set: Set<string>) => {
      try { sessionStorage.setItem(`mach_qavote_${slug}`, JSON.stringify([...set])); } catch { /* 무시 */ }
    };
    // 낙관적 — 추천 표시 + 카운트 +1
    setVotedQa((prev) => { const n = new Set(prev); n.add(qaId); persist(n); return n; });
    setAnsweredQA((prev) => prev.map((q) => (q.id === qaId ? { ...q, voteCount: (q.voteCount ?? 0) + 1 } : q)));
    // 실패 시 되돌리기 — 표가 기록 안 됐는데 버튼이 잠기는 것 방지 (handleNotifyToggle 패턴)
    const rollback = () => {
      setVotedQa((prev) => { const n = new Set(prev); n.delete(qaId); persist(n); return n; });
      setAnsweredQA((prev) => prev.map((q) => (q.id === qaId ? { ...q, voteCount: Math.max(0, (q.voteCount ?? 1) - 1) } : q)));
    };
    try {
      const res = await fetch(`/api/webinar/${slug}/qa/${qaId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId }),
      });
      if (res.ok) {
        const d = await res.json();
        setAnsweredQA((prev) => prev.map((q) => (q.id === qaId ? { ...q, voteCount: d.voteCount } : q))); // 서버 값(중복 포함)으로 보정
      } else {
        rollback();
      }
    } catch {
      rollback();
    }
  };

  const handleSendQA = async () => {
    if (!question.trim()) return;
    setQaError("");
    setIsSendingQA(true);
    try {
      const res = await fetch(`/api/webinar/${slug}/qa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          sessionNumber: selectedSession,
          name: form.name || null,
          company: form.company || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setQaError(data.error ?? "질문 전송에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      setQuestion("");
      setQaSent(true);
      setTimeout(() => setQaSent(false), 3000);
    } finally {
      setIsSendingQA(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f0f0f" }}>
        <Loader2 className="w-8 h-8 animate-spin text-white/30" />
      </div>
    );
  }

  if (!webinar) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f0f0f" }}>
        <p className="text-white/50">웨비나를 찾을 수 없어요</p>
      </div>
    );
  }

  const theme = webinar.theme;
  const bg = theme.bgColor ?? "#0f0f0f";
  const surface = theme.surfaceColor ?? "#1a1a1a";
  const accent = theme.accentColor ?? "#6d28d9";
  const text = theme.textColor ?? "#ffffff";
  const font = theme.font ?? "Pretendard";
  const radius = theme.borderRadius ?? "16px";
  const registrationForm = normalizeRegistrationForm(webinar.config ?? {});
  const visibleFields = registrationForm.fields;
  const inputStyle = { border: "1px solid rgba(255,255,255,0.1)", borderRadius: `calc(${radius} * 0.6)`, color: text };
  const calendarUrl = typeof webinar.config?.calendarUrl === "string" ? webinar.config.calendarUrl : "";
  const surveyUrl = typeof webinar.config?.surveyUrl === "string" ? webinar.config.surveyUrl : "";

  const renderRegistrationField = (field: RegistrationField) => {
    const commonLabel = `${field.label}${field.required ? " *" : ""}`;
    const value = field.system
      ? String(form[field.key as keyof typeof form] ?? "")
      : customFields[field.key] ?? "";
    const setValue = (next: string | boolean) => {
      if (field.system) {
        setForm((prev) => ({ ...prev, [field.key]: next }));
      } else {
        setCustomFields((prev) => ({ ...prev, [field.key]: next }));
      }
    };

    if (field.type === "checkbox") {
      return (
        <label key={field.key} className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => setValue(e.target.checked)}
            className="mt-0.5"
            style={{ accentColor: accent }}
          />
          <span className="text-xs opacity-60">{commonLabel}</span>
        </label>
      );
    }

    return (
      <div key={field.key} className={field.type === "select" ? "col-span-2" : ""}>
        <label className="text-xs opacity-50 mb-1 block">{commonLabel}</label>
        {field.type === "select" ? (
          <select
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none"
            style={inputStyle}
          >
            <option value="">선택해주세요</option>
            {(field.options ?? []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            type={field.type}
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-2.5 text-sm bg-transparent focus:outline-none"
            style={inputStyle}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: bg, color: text, fontFamily: `${font}, sans-serif` }}
    >
      {/* 팝업·Tally 푸시 — 운영 콘솔에서 ON 한 항목이 시청 중 화면에 뜬다 */}
      <LivePushLayer slug={slug} active={view === "live" && !!registrationId} registrationId={registrationId} accentColor={accent} />

      {/* 공지 배너 */}
      {announcements.length > 0 && (
        <div
          style={{ backgroundColor: accent }}
          className="px-4 py-2.5 text-center text-sm font-medium"
        >
          {announcements[0].message}
        </div>
      )}

      {view === "live" && registrationId ? (
        <LiveContentStk
          webinar={webinar}
          accent={accent}
          text={text}
          surface={surface}
          youtubeId={videoId}
          serverNowMs={serverNowMs}
          isLive={isTrulyLive}
          chatEnabled={chatEnabled}
          onTabChange={setActiveTab}
          qa={{
            sessions: webinar.sessions,
            question,
            setQuestion,
            selectedSession,
            setSelectedSession,
            onSend: handleSendQA,
            isSending: isSendingQA,
            sent: qaSent,
            error: qaError,
            answered: answeredQA,
            onVote: handleVoteQA,
            votedIds: [...votedQa],
          }}
          chat={chatEnabled ? {
            messages: chatMessages,
            input: chatInput,
            setInput: setChatInput,
            onSend: handleSendChat,
            isSending: isSendingChat,
            error: chatError,
          } : undefined}
          notifyState={{ subscribed: notifySubscribed, onToggle: handleNotifyToggle, error: notifyError, pending: notifyPending }}
        />
      ) : (
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* 헤더 */}
        <div className="text-center mb-10">
          <div
            className="w-14 h-14 mx-auto mb-4 flex items-center justify-center"
            style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
          >
            <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.9L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{webinar.name}</h1>
          {webinar.description && <p className="opacity-60 text-sm">{webinar.description}</p>}
          <p className="opacity-50 text-xs mt-2">
            {formatKst(webinar.liveStartAt, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            {" ~ "}
            {formatKst(webinar.liveEndAt, { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* 세션 목록 */}
        {webinar.sessions.length > 0 && (
          <div className="mb-10 space-y-2">
            <h2 className="text-sm font-semibold opacity-50 uppercase tracking-wider mb-3">세션</h2>
            {webinar.sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-start gap-3 p-4"
                style={{ backgroundColor: surface, borderRadius: radius }}
              >
                <div
                  className="w-7 h-7 shrink-0 flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.5)` }}
                >
                  {session.number}
                </div>
                <div>
                  <p className="font-medium">{session.title}</p>
                  {session.speaker && <p className="text-sm opacity-50 mt-0.5">{session.speaker}</p>}
                  <p className="text-xs opacity-40 mt-1">{session.startTime} ~ {session.endTime}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 뷰: 사전등록 */}
        {view === "signup" && (
          <motion.div
            style={{ backgroundColor: surface, borderRadius: radius }}
            className="p-6 md:p-8"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {registered ? (
              <div className="text-center py-8">
                <motion.div
                  className="w-12 h-12 mx-auto mb-3"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={spring}
                >
                  <CheckCircle2 className="w-12 h-12" style={{ color: accent }} />
                </motion.div>
                <h3 className="text-lg font-semibold mb-1">사전 등록 완료!</h3>
                <p className="text-sm opacity-60">웨비나 시작 시 이 페이지를 다시 방문하시면 라이브를 시청하실 수 있어요.</p>
                {calendarUrl && (
                  <motion.a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-4 px-4 py-2 text-sm font-medium"
                    style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                  >
                    캘린더에 추가하기
                  </motion.a>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-1">사전 등록</h2>
                <p className="text-xs opacity-50 mb-5">
                  등록 마감 {formatKst(webinar.signupDeadline, { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleFields.map(renderRegistrationField)}
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.agreePrivacy}
                        onChange={(e) => setForm((f) => ({ ...f, agreePrivacy: e.target.checked }))}
                        className="mt-0.5"
                        style={{ accentColor: accent }}
                      />
                      <span className="text-xs opacity-60">{registrationForm.privacyText}</span>
                    </label>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.agreeMarketing}
                        onChange={(e) => setForm((f) => ({ ...f, agreeMarketing: e.target.checked }))}
                        style={{ accentColor: accent }}
                      />
                      <span className="text-xs opacity-60">{registrationForm.marketingText}</span>
                    </label>
                  </div>

                  {formError && (
                    <p className="text-xs text-red-400 pt-1" role="alert">{formError}</p>
                  )}

                  <motion.button
                    onClick={handleRegister}
                    disabled={isRegistering}
                    className="w-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                  >
                    {isRegistering ? "등록 중..." : registrationForm.submitLabel}
                  </motion.button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* 뷰: 라이브 */}
        {view === "live" && !registrationId && (
          <motion.div
            style={{ backgroundColor: surface, borderRadius: radius }}
            className="p-6 md:p-8"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="max-w-md mx-auto">
              <h2 className="text-lg font-semibold mb-2">입장 확인</h2>
              <p className="text-sm opacity-60 mb-5">사전등록 시 입력한 전화번호 또는 이메일로 입장할 수 있습니다.</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["phone", "email"] as const).map((method) => (
                  <motion.button
                    key={method}
                    type="button"
                    onClick={() => {
                      setAuthMethod(method);
                      setAuthValue("");
                      setVerifyError("");
                    }}
                    className="relative px-3 py-2 text-sm font-medium"
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                    style={{
                      borderRadius: `calc(${radius} * 0.6)`,
                      backgroundColor: authMethod === method ? "transparent" : "rgba(255,255,255,0.08)",
                      color: text,
                    }}
                  >
                    {authMethod === method && (
                      <motion.span
                        layoutId="entry-auth-seg"
                        className="absolute inset-0"
                        style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)`, zIndex: 0 }}
                        transition={spring}
                      />
                    )}
                    <span className="relative" style={{ zIndex: 1 }}>
                      {method === "phone" ? "전화번호" : "이메일"}
                    </span>
                  </motion.button>
                ))}
              </div>

              <input
                type={authMethod === "phone" ? "tel" : "email"}
                value={authValue}
                onChange={(e) => setAuthValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleVerifyEntry(); }}
                placeholder={authMethod === "phone" ? "01012345678" : "name@company.com"}
                className="w-full px-3 py-3 text-sm bg-transparent focus:outline-none"
                style={inputStyle}
              />

              {verifyError && <p className="text-xs mt-2 text-red-400">{verifyError}</p>}

              <motion.button
                onClick={handleVerifyEntry}
                disabled={isVerifying}
                className="w-full mt-4 py-3 font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
              >
                {isVerifying ? "확인 중..." : "웨비나 입장하기"}
              </motion.button>

              <motion.button
                type="button"
                onClick={() => setView("signup")}
                className="w-full mt-3 py-2 text-sm opacity-60 hover:opacity-100 transition-opacity"
                whileTap={{ scale: 0.96 }}
                transition={spring}
              >
                아직 등록하지 않았다면 사전등록하기
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* 뷰: 종료 */}
        {view === "ended" && (
          <motion.div
            className="text-center py-12"
            style={{ backgroundColor: surface, borderRadius: radius }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            <p className="text-lg font-semibold mb-2">웨비나가 종료됐어요</p>
            <p className="text-sm opacity-50">참여해주셔서 감사합니다.</p>
            {surveyUrl && (
              <motion.a
                href={surveyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-5 px-5 py-2.5 font-medium text-sm"
                style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
              >
                만족도 조사 참여하기
              </motion.a>
            )}
          </motion.div>
        )}
      </div>
      )}
    </div>
  );
}
