"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { use } from "react";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

interface WebinarSession {
  id: string;
  number: number;
  title: string;
  speaker: string | null;
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
  sessions: WebinarSession[];
  _count: { registrations: number };
}

interface Announcement {
  id: string;
  type: string;
  message: string;
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
    submitLabel: raw?.submitLabel ?? "사전 등록 완료",
  };
}

export default function LivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [webinar, setWebinar] = useState<WebinarInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<PageView>("signup");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [registrationId, setRegistrationId] = useState<string | null>(null);
  const [authMethod, setAuthMethod] = useState<AuthMethod>("phone");
  const [authValue, setAuthValue] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  // 등록 폼 상태
  const [form, setForm] = useState({
    name: "", phone: "", email: "", company: "", department: "",
    jobTitle: "", industry: "", agreeMarketing: false, agreePrivacy: true,
  });
  const [customFields, setCustomFields] = useState<Record<string, string | boolean>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);

  // Q&A 상태
  const [question, setQuestion] = useState("");
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [isSendingQA, setIsSendingQA] = useState(false);
  const [qaSent, setQaSent] = useState(false);

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

      const now = new Date();
      const start = new Date(data.webinar.liveStartAt);
      const end = new Date(data.webinar.liveEndAt);
      const requestedView = new URLSearchParams(window.location.search).get("view");
      if (requestedView === "signup" && now <= end) setView("signup");
      else if (now >= start && now <= end) setView("live");
      else if (now > end) setView("ended");
      else setView("signup");
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  const fetchAnnouncements = useCallback(async () => {
    const res = await fetch(`/api/webinar/${slug}/announcements`);
    if (!res.ok) return;
    const data = await res.json();
    setAnnouncements(data.announcements ?? []);
  }, [slug]);

  useEffect(() => {
    fetchWebinar();
  }, [fetchWebinar]);

  // 라이브 중 공지 폴링 (30초마다)
  useEffect(() => {
    if (view !== "live") return;
    void Promise.resolve().then(fetchAnnouncements);
    const interval = setInterval(fetchAnnouncements, 30000);
    return () => clearInterval(interval);
  }, [view, fetchAnnouncements]);

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
    if (!form.agreePrivacy) {
      alert(registrationForm.privacyText || "개인정보 수집 및 이용 동의가 필요합니다.");
      return;
    }

    for (const field of registrationForm.fields) {
      if (!field.required) continue;
      const value = field.system
        ? form[field.key as keyof typeof form]
        : customFields[field.key];
      const isEmpty = field.type === "checkbox" ? !value : !String(value ?? "").trim();
      if (isEmpty) {
        alert(`${field.label} 항목을 입력해주세요.`);
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
        alert(data.error ?? "등록에 실패했어요. 다시 시도해주세요.");
        return;
      }
      setRegistrationId(data.registration.id);
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

  const handleSendQA = async () => {
    if (!question.trim()) return;
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
        alert("질문 전송에 실패했어요.");
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
      {/* 공지 배너 */}
      {announcements.length > 0 && (
        <div
          style={{ backgroundColor: accent }}
          className="px-4 py-2.5 text-center text-sm font-medium"
        >
          {announcements[0].message}
        </div>
      )}

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
            {new Date(webinar.liveStartAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}{" "}
            {new Date(webinar.liveStartAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            {" ~ "}
            {new Date(webinar.liveEndAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
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
          <div style={{ backgroundColor: surface, borderRadius: radius }} className="p-6 md:p-8">
            {registered ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: accent }} />
                <h3 className="text-lg font-semibold mb-1">사전 등록 완료!</h3>
                <p className="text-sm opacity-60">웨비나 시작 시 이 페이지를 다시 방문하시면 라이브를 시청하실 수 있어요.</p>
                {calendarUrl && (
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-4 px-4 py-2 text-sm font-medium"
                    style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                  >
                    캘린더에 추가하기
                  </a>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-5">사전 등록</h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
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

                  <button
                    onClick={handleRegister}
                    disabled={isRegistering}
                    className="w-full py-3 font-semibold text-white transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
                  >
                    {isRegistering ? "등록 중..." : registrationForm.submitLabel}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 뷰: 라이브 */}
        {view === "live" && !registrationId && (
          <div style={{ backgroundColor: surface, borderRadius: radius }} className="p-6 md:p-8">
            <div className="max-w-md mx-auto">
              <h2 className="text-lg font-semibold mb-2">입장 확인</h2>
              <p className="text-sm opacity-60 mb-5">사전등록 시 입력한 전화번호 또는 이메일로 입장할 수 있습니다.</p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                {(["phone", "email"] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => {
                      setAuthMethod(method);
                      setAuthValue("");
                      setVerifyError("");
                    }}
                    className="px-3 py-2 text-sm font-medium transition-colors"
                    style={{
                      borderRadius: `calc(${radius} * 0.6)`,
                      backgroundColor: authMethod === method ? accent : "rgba(255,255,255,0.08)",
                      color: text,
                    }}
                  >
                    {method === "phone" ? "전화번호" : "이메일"}
                  </button>
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

              <button
                onClick={handleVerifyEntry}
                disabled={isVerifying}
                className="w-full mt-4 py-3 font-semibold text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
              >
                {isVerifying ? "확인 중..." : "웨비나 입장하기"}
              </button>

              <button
                type="button"
                onClick={() => setView("signup")}
                className="w-full mt-3 py-2 text-sm opacity-60 hover:opacity-100 transition-opacity"
              >
                아직 등록하지 않았다면 사전등록하기
              </button>
            </div>
          </div>
        )}

        {view === "live" && registrationId && (
          <div className="space-y-6">
            {/* 유튜브 영상 */}
            {webinar.config?.youtubeId ? (
              <div
                className="relative overflow-hidden"
                style={{ borderRadius: radius, paddingTop: "56.25%" }}
              >
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${webinar.config.youtubeId}?autoplay=1&rel=0`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div
                className="flex items-center justify-center h-40 text-center"
                style={{ backgroundColor: surface, borderRadius: radius }}
              >
                <p className="opacity-40 text-sm">라이브 영상이 연결되지 않았어요</p>
              </div>
            )}

            {/* Q&A 입력 */}
            <div style={{ backgroundColor: surface, borderRadius: radius }} className="p-5">
              <h3 className="font-semibold mb-3 text-sm">질문하기</h3>
              {webinar.sessions.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="text-xs opacity-50 py-1">세션:</span>
                  {webinar.sessions.map((s) => (
                    <button
                      key={s.number}
                      onClick={() => setSelectedSession(selectedSession === s.number ? null : s.number)}
                      className="text-xs px-2.5 py-1 transition-colors"
                      style={{
                        borderRadius: `calc(${radius} * 0.5)`,
                        backgroundColor: selectedSession === s.number ? accent : "rgba(255,255,255,0.08)",
                        color: text,
                      }}
                    >
                      세션 {s.number}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  rows={2}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="질문을 입력하세요..."
                  className="flex-1 px-3 py-2.5 text-sm bg-transparent resize-none focus:outline-none"
                  style={{ border: "1px solid rgba(255,255,255,0.1)", borderRadius: `calc(${radius} * 0.6)`, color: text }}
                />
                <button
                  onClick={handleSendQA}
                  disabled={!question.trim() || isSendingQA}
                  className="px-4 py-2 text-white transition-opacity disabled:opacity-40 self-end"
                  style={{ backgroundColor: qaSent ? "#22c55e" : accent, borderRadius: `calc(${radius} * 0.6)` }}
                >
                  {qaSent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
              {qaSent && <p className="text-xs mt-2" style={{ color: "#22c55e" }}>질문이 전달됐어요!</p>}
            </div>
          </div>
        )}

        {/* 뷰: 종료 */}
        {view === "ended" && (
          <div
            className="text-center py-12"
            style={{ backgroundColor: surface, borderRadius: radius }}
          >
            <p className="text-lg font-semibold mb-2">웨비나가 종료됐어요</p>
            <p className="text-sm opacity-50">참여해주셔서 감사합니다.</p>
            {surveyUrl && (
              <a
                href={surveyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-5 px-5 py-2.5 font-medium text-sm"
                style={{ backgroundColor: accent, borderRadius: `calc(${radius} * 0.6)` }}
              >
                만족도 조사 참여하기
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
