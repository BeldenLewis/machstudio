"use client";

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { use } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import LivePushLayer, { type LivePopup, type LiveTallyPush, type LivePoll } from "../LivePushLayer";
import LiveContentStk from "../LiveContentStk";
import PreLiveWaiting from "../PreLiveWaiting";
import { formatKst } from "@/lib/datetime";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

// 소유자 미리보기 진입 여부 — ?preview 파라미터. 이 tab 에선 폴링·ping·제출 등 모든 부작용을 정지시킨다.
const isPreviewUrl = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("preview");

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

// 통합 라이브 상태 응답 — 여러 폴링 엔드포인트를 대체 (/api/webinar/[slug]/live-state)
interface LiveStateResponse {
  status: string;
  entryOpen: boolean;
  serverNow: string;
  chatEnabled?: boolean;
  youtubeId?: string | null;
  viewerCount?: number | null;
  announcements: Announcement[];
  answeredQA?: AnsweredQA[];
  chat?: { messages: ChatMessage[] };
  poll: LivePoll | null;
  popup: LivePopup | null;
  tally: LiveTallyPush | null;
  pushedQuestion?: { id: string; question: string; name: string | null } | null;
  pinnedMessage?: { id: string; name: string; message: string; isHost: boolean; createdAt: string } | null;
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
  // ── 소유자 미리보기 — ?preview=<상태>. 4개 상태를 강제 렌더(부작용 차단). null = 일반 시청자 뷰.
  const [previewState, setPreviewState] = useState<null | "registration" | "entry" | "live" | "ended">(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const previewMode = previewState !== null;
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [answeredQA, setAnsweredQA] = useState<AnsweredQA[]>([]);
  const [pushedQuestion, setPushedQuestion] = useState<{ id: string; question: string; name: string | null } | null>(null);
  const [pinnedMessage, setPinnedMessage] = useState<{ id: string; name: string; message: string; isHost: boolean } | null>(null);
  const [serverNowMs, setServerNowMs] = useState<number | undefined>(undefined);
  const [viewerCount, setViewerCount] = useState<number | null>(null); // 실시간 동시 시청자 수(라이브)
  const [isTrulyLive, setIsTrulyLive] = useState(false); // status === "live" (입장오픈 전 창과 구분)
  // 채팅 상태
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [chatEnabledLive, setChatEnabledLive] = useState<boolean | null>(null); // 라이브 중 /live-state 로 동기화
  const [votedQa, setVotedQa] = useState<Set<string>>(() => new Set()); // 세션 내 추천한 질문
  const [activeTab, setActiveTab] = useState<string>("qa");
  const chatCursorRef = useRef<string | null>(null);
  const liveTickRef = useRef(0);
  // 푸시(팝업·Tally·실시간 투표) — 통합 /live-state 폴링 결과를 LivePushLayer 로 내려준다
  const [pushPopup, setPushPopup] = useState<LivePopup | null>(null);
  const [pushTally, setPushTally] = useState<LiveTallyPush | null>(null);
  const [pushPoll, setPushPoll] = useState<LivePoll | null>(null);
  // 알림 구독 ("알림 받고 이어보기")
  const [notifySubscribed, setNotifySubscribed] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
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
  const [canRegister, setCanRegister] = useState(true); // 서버 상태머신 판정 — 마감(upcoming) 시 폼 대신 안내
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

  // 재접속 유지 — 인증한 registrationId·영상을 브라우저에 저장해 새로고침해도 입장 확인부터 다시 하지 않게
  useEffect(() => {
    if (isPreviewUrl()) return;
    try {
      const raw = localStorage.getItem(`mach_reg_${slug}`);
      if (raw) {
        const s = JSON.parse(raw) as { registrationId?: string; videoId?: string | null };
        if (s.registrationId) setRegistrationId(s.registrationId);
        if (typeof s.videoId === "string") setVideoId(s.videoId);
      }
    } catch { /* 스토리지 차단 무시 */ }
  }, [slug]);
  useEffect(() => {
    if (isPreviewUrl()) return;
    try {
      if (registrationId) localStorage.setItem(`mach_reg_${slug}`, JSON.stringify({ registrationId, videoId }));
    } catch { /* 무시 */ }
  }, [slug, registrationId, videoId]);

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
      if (typeof data.canRegister === "boolean") setCanRegister(data.canRegister);
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

  // 라이브 전 상태 전환 감지용 경량 폴 — /status(상태만) 를 받아 view/serverNow/isTrulyLive 갱신.
  // 세션·테마·config 를 30초마다 다시 받지 않아 대기 시청자 egress 를 줄인다(정적 콘텐츠는 최초 /info 1회).
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/webinar/${slug}/status`);
      if (!res.ok) return;
      const data = await res.json();
      const status: string = data.status;
      const entryOpen: boolean = data.entryOpen;
      if (typeof data.canRegister === "boolean") setCanRegister(data.canRegister);
      if (typeof data.serverNow === "string") setServerNowMs(new Date(data.serverNow).getTime());
      setIsTrulyLive(status === "live");
      const requestedView = new URLSearchParams(window.location.search).get("view");
      if (requestedView === "signup" && status !== "ended") setView("signup");
      else if (status === "ended") setView("ended");
      else if (status === "live" || entryOpen) setView("live");
      else setView("signup");
    } catch { /* 폴링 중 일시적 오류는 다음 주기에 재시도 */ }
  }, [slug]);

  // 채팅 활성 여부 — 초기값은 /info(components.chatEnabled), 라이브 중엔 /live-state 의 chatEnabled 로 동기화
  const chatEnabled = chatEnabledLive ?? ((webinar?.components ?? {})["chatEnabled"] === true);

  // 통합 라이브 폴링 — 공지·답변 Q&A·채팅·투표·팝업·Tally·상태를 한 번의 요청으로 받아 egress 절감.
  // 예전엔 announcements/qa/chat 3개 + LivePushLayer 자체 3개로 분산 폴링했다.
  // fullChat=true 면 채팅 전체 재동기화(모더레이션 삭제 반영), 아니면 커서 이후 증분만. 최근 100개 유지.
  const liveReqRef = useRef(0); // 인플라이트 응답 펜스 — 늦게 온 전체 재동기화가 최신 상태(방금 보낸 채팅·커서)를 덮지 않게
  const videoCheckedRef = useRef(false); // 영상 복구는 최초 1회만 요청 — 영상 없는 웨비나에서 매 폴 config 조회하는 egress 회귀 방지
  const fetchLiveState = useCallback(async (fullChat = false) => {
    const gen = ++liveReqRef.current;
    try {
      const useChat = chatEnabled && activeTab === "chat" && !!registrationId;
      const useQa = activeTab === "qa" && !!registrationId; // Q&A 탭 볼 때만 보드 100행 요청(egress 절감)
      const needVideo = !!registrationId && !videoId && !videoCheckedRef.current; // 미확보 + 아직 미조회일 때만(1회) 복구 요청
      const after = useChat && !fullChat ? chatCursorRef.current : null;
      const params = new URLSearchParams();
      if (registrationId) params.set("registrationId", registrationId);
      if (needVideo) params.set("needVideo", "1");
      if (useQa) params.set("qa", "1");
      if (useChat) {
        params.set("chat", "1");
        if (after) params.set("chatAfter", after);
      }
      const qs = params.toString();
      const res = await fetch(`/api/webinar/${slug}/live-state${qs ? `?${qs}` : ""}`);
      if (!res.ok) return;
      const data = (await res.json()) as LiveStateResponse;
      if (gen !== liveReqRef.current) return; // 더 새로운 요청이 출발함 — 이 응답 폐기(방금 보낸 채팅·커서 보호)
      if (needVideo) videoCheckedRef.current = true; // 1회 조회 완료 — 영상 유무와 무관하게 재요청 중단(egress)
      if (typeof data.youtubeId === "string" && !videoId) setVideoId(data.youtubeId); // 라이브 중 영상 복구(등록 후 설정된 경우)
      setViewerCount(data.viewerCount ?? null);

      setAnnouncements(data.announcements ?? []);
      if (data.answeredQA) setAnsweredQA(data.answeredQA);
      setPushedQuestion(data.pushedQuestion ?? null);
      setPinnedMessage(data.pinnedMessage ?? null);
      setPushPopup(data.popup ?? null);
      setPushTally(data.tally ?? null);
      setPushPoll(data.poll ?? null);
      if (typeof data.serverNow === "string") setServerNowMs(new Date(data.serverNow).getTime());
      setIsTrulyLive(data.status === "live");
      // 채팅 on/off 를 라이브 중에도 반영 — 호스트가 세션 중 토글하면 다음 폴에서 탭 노출/숨김이 갱신됨
      if (typeof data.chatEnabled === "boolean") setChatEnabledLive(data.chatEnabled);
      // 라이브 중 종료 전환 — 종료되면 종료 화면으로. view!=="live" 가 되어 이 폴링도 자동 중단된다.
      if (data.status === "ended") setView("ended");

      // 채팅 병합 — 요청 시 보낸 after 와 동일한 기준으로 처리(교체 vs 증분)
      if (data.chat) {
        const incoming = data.chat.messages ?? [];
        if (!after) {
          const trimmed = incoming.slice(-100);
          chatCursorRef.current = trimmed.length ? trimmed[trimmed.length - 1].createdAt : null;
          setChatMessages(trimmed);
        } else if (incoming.length > 0) {
          chatCursorRef.current = incoming[incoming.length - 1].createdAt ?? chatCursorRef.current;
          setChatMessages((prev) => {
            const seen = new Set(prev.map((m) => m.id));
            const fresh = incoming.filter((m) => !seen.has(m.id));
            if (fresh.length === 0) return prev; // gte 경계 메시지뿐 → 변화 없음, 리렌더 스킵
            return [...prev, ...fresh].slice(-100);
          });
        }
      }
    } catch {
      /* 폴링 중 일시적 네트워크 오류는 다음 주기에 재시도 */
    }
  }, [slug, registrationId, chatEnabled, activeTab, videoId]);

  const handleSendChat = async () => {
    if (isPreviewUrl()) return;
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
        await fetchLiveState();
      } else {
        const d = await res.json().catch(() => ({}));
        setChatError(d.error ?? "메시지 전송에 실패했어요. 잠시 후 다시 시도해주세요.");
      }
    } catch {
      setChatError("메시지 전송에 실패했어요. 연결 상태를 확인하고 다시 시도해주세요.");
    } finally {
      setIsSendingChat(false);
    }
  };

  // 알림 스위치 토글 — ON: 구독(등록 이메일 저장), OFF: 해제. 낙관적 업데이트 + 실패 시 이전 상태로 복원.
  const handleNotifyToggle = async () => {
    if (isPreviewUrl()) return;
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
    // 미리보기(소유자)는 아래 /preview 로더가 데이터를 세팅하고, 인증 실패자는 로더가 ?preview 를 떼고 재이동한다.
    // 여기서 /info 를 함께 돌리면 프리뷰 드라이버가 세팅한 view/isTrulyLive 를 덮어써 초기 화면이 잘못 뜬다(레이스).
    if (isPreviewUrl()) return;
    fetchWebinar();
  }, [fetchWebinar]);

  // 미리보기 진입 — ?preview 있으면 소유자 인증 후 데이터 로드. 실패(비소유자·비로그인) 시 조용히 폴백(일반 뷰).
  useEffect(() => {
    if (!isPreviewUrl()) return;
    const p = new URLSearchParams(window.location.search).get("preview");
    const init = (["registration", "entry", "live", "ended"] as const).find((s) => s === p) ?? "registration";
    // 인증 실패(비소유자·세션 만료)면 ?preview 를 떼고 깨끗한 URL 로 재이동 → 일반 시청 화면으로 완전 복구.
    // (부작용 가드가 URL 기준이라, 파라미터를 남기면 등록·입장·ping 이 아무 표시 없이 죽는다.)
    const fallbackToClean = () => {
      const u = new URL(window.location.href);
      u.searchParams.delete("preview");
      window.location.replace(u.toString());
    };
    let alive = true;
    (async () => {
      // 인증 실패(401/403)는 즉시 폴백, 일시적 오류(5xx·네트워크)는 짧게 2회 재시도 후 폴백 —
      // 소유자가 서버 블립 한 번에 소리없이 공개 등록 화면으로 튕겨나가지 않게.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch(`/api/webinar/${slug}/preview`);
          if (!alive) return;
          if (res.ok) {
            const data = await res.json();
            if (!alive) return; // json 파싱 대기 중 slug 변경/언마운트 — stale 데이터로 새 상태를 덮지 않게
            setWebinar(data.webinar);
            if (typeof data.serverNow === "string") setServerNowMs(new Date(data.serverNow).getTime());
            setPreviewVideoId(typeof data.youtubeId === "string" ? data.youtubeId : null);
            setPreviewState(init);
            setIsLoading(false);
            return;
          }
          if (res.status === 401 || res.status === 403 || res.status === 404) break; // 권한 문제 — 재시도 무의미
        } catch { /* 네트워크 블립 — 재시도 */ }
        if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      }
      if (alive) fallbackToClean();
    })();
    return () => { alive = false; };
  }, [slug]);

  // 미리보기 상태 → view/registrationId/videoId 강제. 부작용 이펙트는 isPreviewUrl 가드로 정지돼 있어 덮이지 않는다.
  // useLayoutEffect — 스위처 클릭 후 페인트 전에 view 를 확정해 이전 화면 1프레임 깜빡임을 없앤다.
  useLayoutEffect(() => {
    if (!previewState) return;
    setView(previewState === "ended" ? "ended" : previewState === "registration" ? "signup" : "live");
    setRegistrationId(previewState === "live" ? "preview" : null);
    setRegistered(false);
    setVideoId(previewState === "live" ? previewVideoId : null);
    setIsTrulyLive(previewState === "live");
  }, [previewState, previewVideoId]);

  // 라이브 전(사전등록·입장 대기) 상태 폴링 — 서버 status 가 live 로 바뀌면 fetchStatus 가
  // view/isTrulyLive/serverNowMs 를 갱신해 대기 중이던 시청자가 자동 전환된다. (30초, 탭 비활성 시 스킵)
  // 경량 /status 만 받아 정적 콘텐츠 재수신 egress 를 없앤다.
  useEffect(() => {
    if (isPreviewUrl()) return;
    if (view === "live" || view === "ended") return; // 종료 후에도 30초 상태 폴링이 계속 돌던 것 중단
    const interval = setInterval(() => {
      if (document.hidden) return;
      void fetchStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [view, fetchStatus]);

  // 라이브 중 통합 폴링 — 12초 주기(탭 비활성 시 스킵). 공지·답변 Q&A·채팅·투표·팝업·Tally·상태를
  // 한 번의 요청으로 받는다. fetchLiveState 가 activeTab/채팅 여부를 반영하므로 탭 전환 시 이 이펙트가
  // 재실행되어 즉시 재동기화된다. 5주기(약 60초)마다 채팅 전체 재동기화(모더레이션 삭제 반영).
  // registrationId 없는 입장 확인 화면 시청자도 공지 배너·상태 전환은 받아야 하므로 view=live 면 폴링한다
  // (Q&A·채팅·푸시는 서버/JSX 에서 registrationId 로 게이팅되어 인증 전엔 조회/표시되지 않음).
  useEffect(() => {
    if (isPreviewUrl()) return;
    if (view !== "live") return;
    liveTickRef.current = 0;
    void fetchLiveState(true);
    const interval = setInterval(() => {
      if (document.hidden) return;
      liveTickRef.current += 1;
      void fetchLiveState(liveTickRef.current % 5 === 0);
    }, 12000);
    return () => clearInterval(interval);
  }, [view, registrationId, fetchLiveState]);

  // presence ping
  useEffect(() => {
    if (isPreviewUrl()) return;
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
      // 라이브→종료 전환·SPA 이탈 등 beforeunload 가 안 뜨는 경로에서도 퇴장 기록(sendBeacon은 언로드에도 안전).
      handleLeave();
    };
  }, [view, registrationId, slug]);

  const handleRegister = async () => {
    if (isPreviewUrl()) return;
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

      // 라이브 중이면 바로 이동 — 클라이언트 시계 대신 서버 상태(status/serverNow)로 판정
      void fetchWebinar();
    } catch {
      setFormError("등록 중 오류가 났어요. 연결 상태를 확인하고 다시 시도해주세요.");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleVerifyEntry = async () => {
    if (isPreviewUrl()) return;
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
    } catch {
      setVerifyError("확인 중 오류가 났어요. 연결 상태를 확인하고 다시 시도해주세요.");
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
    if (isPreviewUrl()) return;
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
    if (isPreviewUrl()) return;
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
          registrationId,
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
    } catch {
      setQaError("질문 전송에 실패했어요. 연결 상태를 확인하고 다시 시도해주세요.");
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

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/webinar/${slug}/live` : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: webinar?.name ?? "웨비나", url });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch { /* 공유 취소·미지원 무시 */ }
  };
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
      {/* 소유자 미리보기 — 상태 전환 바(대기·입장확인·라이브·종료). 실제 부작용은 모두 정지. */}
      {previewMode && (
        <div
          className="sticky top-0 z-[70] flex flex-wrap items-center gap-2 border-b border-white/10 bg-neutral-900/90 px-3 py-2 text-white backdrop-blur"
          style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
        >
          <span className="rounded-md bg-violet-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">미리보기</span>
          <div className="flex flex-wrap gap-1">
            {(([["registration", "대기화면"], ["entry", "입장확인"], ["live", "라이브 시청"], ["ended", "종료화면"]]) as const).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPreviewState(k)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${previewState === k ? "bg-white text-neutral-900" : "bg-white/10 text-white/80 hover:bg-white/20"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto hidden text-[11px] text-white/50 sm:inline">실제 전송·입장·집계 없음 · 팝업·투표 등 라이브 푸시는 표시되지 않아요</span>
        </div>
      )}

      {/* 팝업·Tally·투표 푸시 — 운영 콘솔에서 ON 한 항목이 시청 중 화면에 뜬다 (통합 폴링 결과 전달) */}
      <LivePushLayer
        slug={slug}
        registrationId={registrationId}
        accentColor={accent}
        popup={view === "live" && registrationId ? pushPopup : null}
        tally={view === "live" && registrationId ? pushTally : null}
        poll={view === "live" && registrationId ? pushPoll : null}
      />

      {/* 공지 배너 */}
      {announcements.length > 0 && (
        <div
          style={{ backgroundColor: accent }}
          className="px-4 py-2.5 text-center text-sm font-medium"
        >
          {announcements[0].message}
        </div>
      )}

      {/* 진행자가 화면에 띄운 Q&A — 지금 답변 중인 질문 (등록 시청자에게만) */}
      <AnimatePresence>
        {view === "live" && registrationId && pushedQuestion && (
          <motion.div
            key="pushed-q"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
            style={{ borderBottom: `1px solid ${accent}` }}
          >
            <div className="mx-auto max-w-3xl px-4 py-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: accent }}>지금 답변 중인 질문</div>
              <p className="text-sm font-medium" style={{ color: text }}>{pushedQuestion.question}</p>
              {pushedQuestion.name && <p className="mt-0.5 text-xs opacity-60" style={{ color: text }}>— {pushedQuestion.name}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 진행자가 고정한 채팅 메시지 (등록 시청자에게만) */}
      <AnimatePresence>
        {view === "live" && registrationId && pinnedMessage && (
          <motion.div
            key="pinned-msg"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden border-b border-black/10 dark:border-white/10"
          >
            <div className="mx-auto flex max-w-3xl items-start gap-2 px-4 py-2.5">
              <span className="mt-0.5 shrink-0 text-xs" style={{ color: accent }}>📌</span>
              <p className="min-w-0 text-sm" style={{ color: text }}>
                <b className="font-semibold">{pinnedMessage.isHost ? `${pinnedMessage.name} · 진행자` : pinnedMessage.name}</b>{" "}
                <span className="opacity-90">{pinnedMessage.message}</span>
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {view === "live" && registrationId ? (
        <LiveContentStk
          webinar={webinar}
          accent={accent}
          text={text}
          surface={surface}
          youtubeId={videoId}
          serverNowMs={serverNowMs}
          isLive={isTrulyLive}
          viewerCount={viewerCount}
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

        {/* 뷰: 사전등록 — 등록/재방문자는 대기 화면(카운트다운·아젠다), 신규 방문자는 등록 폼 */}
        {view === "signup" && ((registered || registrationId) ? (
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="space-y-5">
            <PreLiveWaiting
              webinar={{ name: webinar.name, description: webinar.description ?? null, liveStartAt: webinar.liveStartAt, sessions: webinar.sessions }}
              accent={accent}
              text={text}
              surface={surface}
              targetIso={webinar.liveStartAt}
              serverNowMs={serverNowMs}
              registered
              onCalendar={calendarUrl ? () => window.open(calendarUrl, "_blank", "noopener,noreferrer") : undefined}
            />
            {/* 알림 옵트인 + 공유 — 재방문 유도·유입 확대 */}
            <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2.5 px-4">
              <button
                type="button"
                onClick={handleNotifyToggle}
                disabled={notifyPending}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-opacity disabled:opacity-50"
                style={{ border: `1px solid ${accent}`, color: notifySubscribed ? "#fff" : accent, backgroundColor: notifySubscribed ? accent : "transparent" }}
              >
                {notifySubscribed ? "알림 받는 중 ✓" : "🔔 알림 받고 이어보기"}
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium opacity-80 transition-opacity hover:opacity-100"
                style={{ border: `1px solid ${text}33`, color: text }}
              >
                {shareCopied ? "링크 복사됨 ✓" : "공유하기"}
              </button>
            </div>
            {notifyError && <p className="text-center text-xs text-red-400">{notifyError}</p>}
          </motion.div>
        ) : (
          <motion.div
            style={{ backgroundColor: surface, borderRadius: radius }}
            className="p-6 md:p-8"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {!canRegister ? (
              <div className="py-10 text-center">
                <h2 className="text-lg font-semibold mb-1">등록이 마감되었어요</h2>
                <p className="text-sm opacity-60">사전 등록 기간이 종료됐어요.<br />시작 시각에 맞춰 다시 방문해 주세요.</p>
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
        ))}

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
                onClick={() => (previewMode ? setPreviewState("registration") : setView("signup"))}
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
