"use client";

// 라이브 페이지 상태별 디자인 프리뷰 하니스 (목업 데이터).
// 실제 상태머신/인증/타이밍 없이 각 상태를 브라우저에서 바로 확인·검토하기 위한 개발용 화면.
// 공개 라우트지만 데이터는 전부 가짜다.

import { useMemo, useState } from "react";
import LiveContentStk from "@/app/webinar/[slug]/LiveContentStk";
import EntryVerify from "@/app/webinar/[slug]/EntryVerify";
import PreLiveWaiting from "@/app/webinar/[slug]/PreLiveWaiting";

type State = "waiting" | "entry" | "live" | "ended";
type ThemeKey = "dark" | "light";

const THEMES: Record<ThemeKey, { bg: string; text: string; surface: string; accent: string }> = {
  dark: { bg: "#0f0f11", text: "#f0f0f2", surface: "#17171c", accent: "#7c5cff" },
  light: { bg: "#f6f6f8", text: "#16161a", surface: "#ffffff", accent: "#6d28d9" },
};

const MOCK = {
  name: "2026 스마트테크 코리아 마케팅 웨비나",
  description: "AI 마케팅 자동화의 최신 트렌드와, 전시·웨비나 리드를 매출로 잇는 실전 전략을 소개합니다.",
  liveStartAt: "2026-08-20T19:00:00+09:00",
  liveEndAt: "2026-08-20T21:00:00+09:00",
  config: {
    livePage: {
      cta: {
        eyebrow: "세션 자료",
        title: "발표 자료·템플릿 받기",
        description: "이번 세션에서 쓴 자동화 워크플로우와 슬라이드를 지금 내려받으세요.",
        buttons: [{ label: "자료 받기 ↓", url: "#", style: "white" }],
      },
      notify: {
        enabled: true,
        kicker: "다음 세션 · 20:20",
        title: "알림 받고 이어보기",
        description: "다음 세션이 시작되면 알려드리고, 다시보기도 이메일로 보내드려요.",
        switchLabel: "세션 시작 알림 받기",
      },
    },
  },
  sessions: [
    { id: "s1", number: 1, type: "session", title: "오프닝 — 왜 지금 마케팅 자동화인가", speaker: "김민준", speakerPhotoUrl: null, description: "마하스튜디오 대표 · 마케팅 자동화 10년", startTime: "19:00", endTime: "19:30" },
    { id: "s2", number: 2, type: "session", title: "전시 리드를 매출로 전환하는 4단계", speaker: "이서연", speakerPhotoUrl: null, description: "그로스 리드 · 前 대형 전시 운영", startTime: "19:30", endTime: "20:20" },
    { id: "s3", number: 3, type: "qa", title: "라이브 Q&A", speaker: "전체 연사", speakerPhotoUrl: null, description: "참가자 질문에 실시간으로 답합니다.", startTime: "20:20", endTime: "21:00" },
  ],
};

export default function LivePreviewPage() {
  const [state, setState] = useState<State>("waiting");
  const [themeKey, setThemeKey] = useState<ThemeKey>("dark");
  const t = THEMES[themeKey];

  // EntryVerify 로컬 상태
  const [authMethod, setAuthMethod] = useState<"phone" | "email">("phone");
  const [authValue, setAuthValue] = useState("");
  // LiveContentStk QA 로컬 상태
  const [question, setQuestion] = useState("");
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [chatOn, setChatOn] = useState(true);

  const target = useMemo(() => new Date(Date.now() + (2 * 86400 + 5 * 3600 + 37 * 60) * 1000).toISOString(), []);
  // 라이브 프리뷰에선 세션 2 진행 중으로 보이게 서버시각을 행사 중으로 고정
  const liveNowMs = useMemo(() => new Date("2026-08-20T19:45:00+09:00").getTime(), []);
  const ANSWERED = useMemo(
    () => [
      { id: "a1", question: "레코드가 흩어져 있을 때 중복은 어떤 기준으로 잡나요?", sessionNumber: 2, name: "박*훈", voteCount: 24, status: "answered" },
      { id: "a2", question: "아임웹 폼 없이 바로 CRM 으로 넘길 수 있나요?", sessionNumber: null, name: "정*아", voteCount: 18, status: "pending" },
      { id: "a3", question: "노쇼를 줄이는 리마인드 시퀀스 예시가 궁금해요.", sessionNumber: 2, name: "최*", voteCount: 7, status: "pending" },
    ],
    [],
  );
  const [chatText, setChatText] = useState("");
  const CHAT = useMemo(
    () => [
      { id: "c1", name: "윤*재", message: "방금 4단계 정리 너무 좋네요 👏", isHost: false },
      { id: "c2", name: "이서연", message: "질문은 Q&A 탭에 남겨주세요!", isHost: true },
      { id: "c3", name: "소*민", message: "자료도 받을 수 있나요?", isHost: false },
      { id: "c4", name: "대*현", message: "이 파트 다시 듣고 싶어요", isHost: false },
    ],
    [],
  );

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text }}>
      {/* 프리뷰 툴바 */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "10px 16px", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", opacity: 0.7 }}>LIVE PREVIEW</span>
        <div style={{ display: "flex", gap: 4 }}>
          {(["waiting", "entry", "live", "ended"] as State[]).map((s) => (
            <button key={s} onClick={() => setState(s)}
              style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", fontSize: 12, fontWeight: 700, cursor: "pointer", background: state === s ? t.accent : "transparent", color: "#fff" }}>
              {s === "waiting" ? "대기" : s === "entry" ? "입장확인" : s === "live" ? "라이브시청" : "종료"}
            </button>
          ))}
        </div>
        <button onClick={() => setChatOn((v) => !v)}
          style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", fontSize: 12, fontWeight: 700, cursor: "pointer", background: chatOn ? t.accent : "transparent", color: "#fff" }}>
          채팅 {chatOn ? "ON" : "OFF"}
        </button>
        <div style={{ display: "flex", gap: 4 }}>
          {(["dark", "light"] as ThemeKey[]).map((k) => (
            <button key={k} onClick={() => setThemeKey(k)}
              style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", fontSize: 12, fontWeight: 700, cursor: "pointer", background: themeKey === k ? t.accent : "transparent", color: "#fff" }}>
              {k === "dark" ? "다크" : "라이트"}
            </button>
          ))}
        </div>
      </div>

      {state === "waiting" && (
        <PreLiveWaiting webinar={MOCK} accent={t.accent} text={t.text} surface={t.surface} targetIso={target} registered onCalendar={() => {}} />
      )}
      {state === "entry" && (
        <EntryVerify
          webinar={MOCK} accent={t.accent} text={t.text} surface={t.surface}
          authMethod={authMethod} authValue={authValue} verifyError="" isVerifying={false}
          onAuthMethod={setAuthMethod} onAuthValueChange={setAuthValue} onVerify={() => {}} onGoSignup={() => {}}
        />
      )}
      {state === "live" && (
        <LiveContentStk
          webinar={MOCK} accent={t.accent} text={t.text} surface={t.surface} youtubeId={null}
          serverNowMs={liveNowMs} chatEnabled={chatOn}
          qa={{ sessions: MOCK.sessions, question, setQuestion, selectedSession, setSelectedSession, onSend: () => {}, isSending: false, sent: false, answered: ANSWERED, onVote: () => {}, votedIds: [] }}
          chat={chatOn ? { messages: CHAT, input: chatText, setInput: setChatText, onSend: () => setChatText(""), isSending: false } : undefined}
        />
      )}
      {state === "ended" && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "120px 24px", textAlign: "center" }}>
          <p style={{ fontSize: 22, fontWeight: 800 }}>웨비나가 종료됐어요</p>
          <p style={{ opacity: 0.6, marginTop: 8 }}>(종료 화면은 아직 개선 전 — 이번 라운드 대상 아님)</p>
        </div>
      )}
    </div>
  );
}
