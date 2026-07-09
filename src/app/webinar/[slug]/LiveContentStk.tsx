"use client";

// 인증 후 라이브 시청 화면 — 탭형 "실시간 참여" 레이아웃.
// 상단바 + 플레이어 + 메타(현재 세션·연사) + 참여 독(Q&A/채팅/세션) + 하단 CTA/알림 카드.
// 색은 theme(accent/text/surface)로 구동해 전시별 테마에 맞춘다. Q&A·CTA·알림은 mach 데이터/config 로 채운다.
// buildStkCss 는 대기(PreLiveWaiting)·입장확인(EntryVerify)과 공유하는 토큰/히어로/아젠다만 담고,
// 이 화면 전용 레이아웃은 WATCH_CSS(lv-* 클래스)로 분리한다.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Send, Share2 } from "lucide-react";
import { formatKst, kstDateString } from "@/lib/datetime";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface Session {
  id: string;
  number: number;
  type?: string; // "session" | "qa" | "break"
  title: string;
  speaker: string | null;
  speakerPhotoUrl?: string | null;
  description?: string | null;
  startTime: string;
  endTime: string;
}

// 아젠다·메타에서 유형 라벨 (기본 세션은 라벨 없음)
const SES_TYPE_LABEL: Record<string, string> = { qa: "Q&A", break: "휴식" };

interface AnsweredQA {
  id: string;
  question: string;
  sessionNumber: number | null;
  name: string | null; // 서버에서 이미 마스킹됨
  voteCount?: number;
  status?: string; // "answered" 면 답변 완료 배지
}

interface ChatMessage {
  id: string;
  name: string; // 서버에서 마스킹됨 (호스트는 표시명)
  message: string;
  isHost: boolean;
}

interface ChatProps {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  isSending: boolean;
  error?: string;
}

interface CtaButton {
  label: string;
  url: string;
  style?: "white" | "ghost";
}

interface NotifyConfig {
  enabled?: boolean;
  kicker?: string;
  title?: string;
  description?: string;
  switchLabel?: string;
}

interface CtaCard {
  eyebrow?: string;
  title?: string;
  description?: string;
  benefits?: string[];
  buttons?: CtaButton[];
}

interface LivePageConfig {
  infoContact?: string;
  notice?: string;
  cta?: CtaCard; // 레거시 단일 (ctas 없을 때만 사용)
  ctas?: CtaCard[];
  notify?: NotifyConfig;
}

interface WebinarForLive {
  name: string;
  description: string | null;
  liveStartAt: string;
  liveEndAt: string;
  config: Record<string, unknown>;
  sessions: Session[];
}

interface QAProps {
  sessions: Session[];
  question: string;
  setQuestion: (v: string) => void;
  selectedSession: number | null;
  setSelectedSession: (v: number | null) => void;
  onSend: () => void;
  isSending: boolean;
  sent: boolean;
  error?: string;
  answered?: AnsweredQA[];
  onVote?: (qaId: string) => void;
  votedIds?: string[];
}

const DEFAULT_NOTICE =
  "※ 영상이 보이지 않을 경우 새로고침 후 다시 접속해주세요. 일부 브라우저에서는 자동 재생이 제한될 수 있어요.";

// 공유 STK 스타일 — 대기/입장확인/시청 세 상태가 같은 디자인 토큰을 쓰도록 export.
// (토큰 + 히어로/배지 + 전체폭 아젠다만. 시청 화면 전용 레이아웃은 WATCH_CSS 로 분리)
export function buildStkCss(accent: string, text: string, surface: string) {
  return `
.stk-live { --key: ${accent}; --key-dim: color-mix(in srgb, ${accent} 12%, transparent); --key-border: color-mix(in srgb, ${accent} 36%, transparent);
  --text:${text}; --muted:color-mix(in srgb, ${text} 62%, transparent); --sub:color-mix(in srgb, ${text} 42%, transparent);
  --card:${surface}; --card-2:color-mix(in srgb, ${text} 5%, ${surface});
  --line:color-mix(in srgb, ${text} 10%, transparent); --line-md:color-mix(in srgb, ${text} 17%, transparent); --radius-sm:12px; --radius:20px; --radius-lg:28px;
  width:100%; color:var(--text); -webkit-font-smoothing:antialiased; }
.stk-live * { box-sizing:border-box; }
.stk-live .live-inner { max-width:1280px; margin:0 auto; padding:56px 24px 96px; }
.stk-live .live-hero { text-align:center; margin-bottom:44px; }
.stk-live .live-badge { display:inline-flex; align-items:center; gap:8px; padding:8px 16px 8px 12px; border:1px solid var(--key-border); border-radius:999px; background:var(--key-dim); font-size:12px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:24px; }
.stk-live .live-dot { width:7px; height:7px; border-radius:50%; background:var(--key); animation:stkPulse 2s ease-in-out infinite; flex-shrink:0; }
@keyframes stkPulse { 0%,100%{ box-shadow:0 0 0 0 var(--key-border); } 60%{ box-shadow:0 0 0 9px transparent; } }
.stk-live .live-title { font-size:clamp(30px,4.2vw,52px); line-height:1.12; font-weight:900; letter-spacing:-0.045em; word-break:keep-all; color:var(--text); margin:0; }
.stk-live .live-desc { max-width:720px; margin:20px auto 0; color:var(--muted); font-size:clamp(15px,1.7vw,18px); line-height:1.72; word-break:keep-all; }
.stk-live .ag-wrap { margin-top:72px; padding-top:72px; border-top:1px solid var(--line); }
.stk-live .ag-head { text-align:center; margin-bottom:44px; }
.stk-live .ag-kicker { display:inline-flex; align-items:center; margin-bottom:16px; padding:8px 16px; border-radius:999px; border:1px solid var(--key-border); background:var(--key-dim); font-size:12px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; }
.stk-live .ag-head h2 { font-size:clamp(28px,3.6vw,44px); line-height:1.1; font-weight:900; letter-spacing:-0.05em; color:var(--text); margin:0; }
.stk-live .ag-session { border:1px solid var(--line); border-radius:var(--radius); background:var(--card); overflow:hidden; margin-bottom:14px; transition:border-color .2s ease; }
.stk-live .ag-session:hover { border-color:var(--key-border); }
.stk-live .ag-sess-head { display:grid; grid-template-columns:90px 1fr auto; gap:16px; align-items:start; padding:20px 24px; border-bottom:1px solid var(--line); }
.stk-live .ag-sess-num { font-size:11px; font-weight:900; letter-spacing:0.06em; text-transform:uppercase; color:var(--key); padding-top:3px; }
.stk-live .ag-sess-title { font-size:15px; font-weight:750; line-height:1.42; color:var(--text); letter-spacing:-0.03em; word-break:keep-all; margin:0; }
.stk-live .ag-sess-time { font-size:12.5px; font-weight:600; color:var(--sub); white-space:nowrap; text-align:right; padding-top:3px; }
.stk-live .ag-sess-body { display:flex; gap:20px; padding:22px 24px; align-items:center; }
.stk-live .ag-avatar { flex-shrink:0; width:56px; height:56px; border-radius:50%; overflow:hidden; background:var(--key-dim); border:1px solid var(--key-border); display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:800; color:var(--key); }
.stk-live .ag-avatar img { width:100%; height:100%; object-fit:cover; object-position:top center; }
.stk-live .ag-speaker-desc { font-size:14px; line-height:1.66; color:var(--muted); margin-top:6px; word-break:keep-all; }
.stk-live .ag-speaker-name { font-size:15px; font-weight:750; color:var(--text); letter-spacing:-0.02em; }
.stk-live .ag-footer { text-align:center; padding-top:32px; font-size:13px; color:var(--sub); }
@media (max-width:720px) {
  .stk-live .live-inner { padding:40px 18px 64px; }
  .stk-live .live-hero { text-align:left; }
  .stk-live .live-desc { margin-left:0; }
  .stk-live .ag-head { text-align:left; }
  .stk-live .ag-sess-head { grid-template-columns:1fr; gap:8px; padding:16px 18px; }
  .stk-live .ag-sess-time { text-align:left; }
  .stk-live .ag-sess-body { padding:16px 18px; }
}
`;
}

// 시청 화면 전용 레이아웃 (lv-*). 토큰은 buildStkCss 것을 그대로 사용.
const WATCH_CSS = `
.stk-live .lv-wrap { max-width:1240px; margin:0 auto; padding:14px 16px 40px; }
.stk-live .lv-live { --live:#e5484d; }
/* 상단바 */
.stk-live .lv-top { display:flex; align-items:center; gap:14px; padding:10px 4px 18px; }
.stk-live .lv-livepill { display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:999px; background:color-mix(in srgb,var(--live) 14%,transparent); color:var(--live); font-weight:800; font-size:12px; letter-spacing:0.04em; }
.stk-live .lv-livepill i { width:7px; height:7px; border-radius:50%; background:var(--live); animation:lvPulse 1.6s infinite; }
.stk-live .lv-soonpill { display:inline-flex; align-items:center; gap:7px; padding:5px 11px; border-radius:999px; background:var(--key-dim); color:var(--key); border:1px solid var(--key-border); font-weight:800; font-size:12px; letter-spacing:0.04em; }
@keyframes lvPulse { 0%,100%{ box-shadow:0 0 0 0 color-mix(in srgb,var(--live) 55%,transparent);} 60%{ box-shadow:0 0 0 6px transparent; } }
.stk-live .lv-evname { font-weight:750; font-size:15px; letter-spacing:-0.01em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text); }
.stk-live .lv-sp { flex:1; }
.stk-live .lv-share { display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 14px; border-radius:10px; border:1px solid var(--line-md); background:var(--card); color:var(--muted); font:inherit; font-size:13px; font-weight:650; cursor:pointer; transition:color .15s ease, border-color .15s ease; }
.stk-live .lv-share:hover { color:var(--text); border-color:var(--key-border); }
.stk-live .lv-share svg { width:15px; height:15px; }
/* 스테이지 — 기본 단일 컬럼(모바일), 941px↑에서만 2컬럼+배치 (경계 소수 픽셀 깨짐 방지) */
.stk-live .lv-stage { display:grid; grid-template-columns:1fr; gap:16px; align-items:start; }
@media (min-width:941px) {
  .stk-live .lv-stage { grid-template-columns:minmax(0,1fr) 372px; grid-template-rows:auto auto; }
  .stk-live .lv-player { grid-column:1; grid-row:1; }
  .stk-live .lv-meta { grid-column:1; grid-row:2; }
  .stk-live .lv-dock { grid-column:2; grid-row:1; }
}
/* 플레이어 */
.stk-live .lv-player { position:relative; aspect-ratio:16/9; border-radius:18px; overflow:hidden; background:#0b0d12; border:1px solid var(--line); }
.stk-live .lv-player iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
.stk-live .lv-poster { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.55); font-size:14px;
  background:radial-gradient(120% 90% at 20% 0%, color-mix(in srgb,var(--key) 45%,#0b0d12), transparent 55%), radial-gradient(120% 120% at 100% 100%, color-mix(in srgb,var(--key) 26%,#0b0d12), transparent 60%), #0b0d12; }
.stk-live .lv-plive { position:absolute; top:14px; left:14px; z-index:2; display:inline-flex; align-items:center; gap:7px; padding:6px 10px; border-radius:8px; background:var(--live); color:#fff; font-size:11.5px; font-weight:800; letter-spacing:0.04em; pointer-events:none; }
.stk-live .lv-plive i { width:7px; height:7px; border-radius:50%; background:#fff; animation:lvPulse 1.6s infinite; }
/* 메타 */
.stk-live .lv-meta { margin-top:18px; }
.stk-live .lv-kicker { font-size:12px; font-weight:750; color:var(--key); letter-spacing:0.01em; display:inline-flex; align-items:center; gap:7px; }
.stk-live .lv-kicker .d { width:7px; height:7px; border-radius:50%; background:var(--key); animation:lvPulse 1.9s infinite; }
.stk-live .lv-title { font-size:clamp(23px,3.1vw,34px); font-weight:820; letter-spacing:-0.03em; line-height:1.14; margin:12px 0 0; word-break:keep-all; color:var(--text); }
.stk-live .lv-desc { margin:14px 0 0; color:var(--muted); font-size:15px; line-height:1.65; max-width:62ch; word-break:keep-all; }
.stk-live .lv-hosts { display:flex; flex-wrap:wrap; gap:8px; margin-top:18px; }
.stk-live .lv-host { display:inline-flex; align-items:center; gap:10px; padding:6px 14px 6px 6px; border-radius:999px; border:1px solid var(--line); background:var(--card); font-size:13px; font-weight:650; color:var(--text); }
.stk-live .lv-host .av { width:27px; height:27px; border-radius:50%; overflow:hidden; display:grid; place-items:center; font-size:12px; font-weight:800; background:var(--key-dim); color:var(--key); }
.stk-live .lv-host .av img { width:100%; height:100%; object-fit:cover; object-position:top center; }
.stk-live .lv-host small { color:var(--sub); font-weight:500; }
/* 독 (높이는 JS 로 플레이어와 동기화) */
.stk-live .lv-dock { min-height:0; }
.stk-live .lv-card { border:1px solid var(--line); border-radius:var(--radius); background:var(--card); overflow:hidden; display:flex; flex-direction:column; min-height:0; height:100%; }
.stk-live .lv-docktitle { padding:14px 16px 0; font-size:13px; font-weight:750; color:var(--muted); flex:0 0 auto; }
.stk-live .lv-tabs { display:grid; gap:4px; padding:5px; position:relative; margin-top:10px; border-bottom:1px solid var(--line); flex:0 0 auto; }
.stk-live .lv-tab { position:relative; z-index:1; padding:9px 0; border:0; background:none; cursor:pointer; border-radius:10px; font:inherit; font-size:13px; font-weight:700; color:var(--muted); transition:color .15s ease; }
.stk-live .lv-tab[aria-selected="true"] { color:var(--text); }
.stk-live .lv-tab .cnt { color:var(--sub); font-weight:600; font-size:11px; margin-left:3px; }
.stk-live .lv-ind { position:absolute; top:5px; bottom:5px; border-radius:10px; background:var(--card-2); border:1px solid var(--line); z-index:0; }
.stk-live .lv-panel { display:flex; flex-direction:column; flex:1 1 auto; min-height:0; padding:14px; }
/* Q&A */
.stk-live .lv-ask { display:flex; gap:8px; margin-bottom:12px; flex:0 0 auto; }
.stk-live .lv-ask input { flex:1; min-width:0; height:40px; padding:0 13px; border-radius:11px; border:1px solid var(--line); background:var(--card-2); color:var(--text); font:inherit; font-size:14px; outline:none; transition:border-color .15s ease; }
.stk-live .lv-ask input:focus { border-color:var(--key); }
.stk-live .lv-ask button { flex-shrink:0; width:44px; border-radius:11px; border:0; background:var(--key); color:#fff; cursor:pointer; display:grid; place-items:center; }
.stk-live .lv-ask button:disabled { opacity:0.4; cursor:not-allowed; }
.stk-live .lv-ask button svg { width:17px; height:17px; }
.stk-live .lv-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; flex:0 0 auto; }
.stk-live .lv-chip { font-size:12px; padding:5px 11px; border-radius:8px; border:1px solid var(--line-md); background:transparent; color:var(--muted); cursor:pointer; }
.stk-live .lv-chip.on { background:var(--key); color:#fff; border-color:var(--key); }
.stk-live .lv-hint { font-size:12px; margin-top:2px; }
.stk-live .lv-list { display:flex; flex-direction:column; gap:8px; flex:1 1 auto; min-height:0; overflow-y:auto; }
.stk-live .lv-q { display:flex; gap:11px; padding:12px; border:1px solid var(--line); border-radius:13px; background:var(--card-2); }
.stk-live .lv-q > div { flex:1; min-width:0; }
.stk-live .lv-vote { display:flex; flex-direction:column; align-items:center; gap:1px; flex-shrink:0; align-self:flex-start; min-width:42px; padding:6px 0; border-radius:10px; border:1px solid var(--line-md); background:var(--card); color:var(--muted); cursor:pointer; font:inherit; transition:border-color .14s ease, color .14s ease, background .14s ease; }
.stk-live .lv-vote span { font-size:10px; line-height:1; }
.stk-live .lv-vote b { font-size:13px; font-variant-numeric:tabular-nums; }
.stk-live .lv-vote:hover:not(:disabled) { border-color:var(--key-border); color:var(--text); }
.stk-live .lv-vote.on { border-color:var(--key); background:var(--key-dim); color:var(--key); }
.stk-live .lv-vote:disabled { cursor:default; }
.stk-live .lv-q p { margin:0; font-size:14px; line-height:1.5; word-break:keep-all; color:var(--text); }
.stk-live .lv-q .m { display:flex; align-items:center; gap:8px; margin-top:6px; font-size:12px; color:var(--sub); }
.stk-live .lv-ans { color:#2f9e63; font-weight:700; font-size:11px; padding:2px 7px; border-radius:6px; background:color-mix(in srgb,#2f9e63 14%,transparent); }
.stk-live .lv-empty { flex:1 1 auto; display:flex; align-items:center; justify-content:center; text-align:center; color:var(--sub); font-size:13px; line-height:1.6; padding:20px; word-break:keep-all; }
/* 채팅 */
.stk-live .lv-soon { flex:1 1 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; text-align:center; color:var(--sub); font-size:13px; padding:20px; word-break:keep-all; }
.stk-live .lv-soon b { color:var(--muted); font-size:14px; font-weight:750; }
.stk-live .lv-feed { display:flex; flex-direction:column; gap:9px; flex:1 1 auto; min-height:0; overflow-y:auto; }
.stk-live .lv-msg { font-size:13.5px; line-height:1.45; word-break:keep-all; }
.stk-live .lv-msg .who { font-weight:700; margin-right:6px; color:var(--key); }
.stk-live .lv-msg .txt { color:var(--text); }
.stk-live .lv-msg.host .who { color:#e5484d; }
.stk-live .lv-msg.host .tag { font-size:10px; font-weight:700; color:#e5484d; border:1px solid color-mix(in srgb,#e5484d 40%,transparent); border-radius:5px; padding:1px 5px; margin-right:6px; }
.stk-live .lv-chatbar { display:flex; gap:8px; margin-top:12px; flex:0 0 auto; }
.stk-live .lv-chatbar input { flex:1; min-width:0; height:38px; padding:0 13px; border-radius:11px; border:1px solid var(--line); background:var(--card-2); color:var(--text); font:inherit; font-size:14px; outline:none; transition:border-color .15s ease; }
.stk-live .lv-chatbar input:focus { border-color:var(--key); }
.stk-live .lv-chatbar button { flex-shrink:0; width:40px; border-radius:11px; border:0; background:var(--key); color:#fff; cursor:pointer; display:grid; place-items:center; }
.stk-live .lv-chatbar button:disabled { opacity:0.4; cursor:not-allowed; }
.stk-live .lv-chatbar button svg { width:17px; height:17px; }
/* 세션(아젠다) */
.stk-live .lv-agscroll { flex:1 1 auto; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:8px; }
.stk-live .lv-ses { display:flex; gap:12px; padding:13px; border-radius:13px; border:1px solid var(--line); background:var(--card-2); }
.stk-live .lv-ses.now { border-color:var(--key-border); background:var(--key-dim); }
.stk-live .lv-ses.done { opacity:0.5; }
.stk-live .lv-ses .tc { font-size:12px; color:var(--sub); padding-top:2px; white-space:nowrap; }
.stk-live .lv-ses.now .tc { color:var(--key); font-weight:650; }
.stk-live .lv-ses h4 { margin:0; font-size:14px; font-weight:700; letter-spacing:-0.01em; word-break:keep-all; color:var(--text); }
.stk-live .lv-setype { margin-left:6px; font-size:10px; font-weight:700; padding:1px 6px; border-radius:6px; background:var(--key-dim); color:var(--key); vertical-align:middle; white-space:nowrap; }
.stk-live .lv-ses small { color:var(--sub); font-size:12px; }
.stk-live .lv-ses .st { margin-left:auto; align-self:center; font-size:11px; font-weight:700; color:var(--sub); white-space:nowrap; }
.stk-live .lv-ses.now .st { color:var(--key); display:inline-flex; align-items:center; gap:5px; }
.stk-live .lv-ses.now .st .d { width:6px; height:6px; border-radius:50%; background:var(--key); animation:lvPulse 1.9s infinite; }
.stk-live .lv-prog { height:4px; border-radius:3px; background:var(--line); margin-top:9px; overflow:hidden; }
.stk-live .lv-prog span { display:block; height:100%; background:var(--key); }
/* 하단 카드 (CTA / 알림) */
.stk-live .lv-foot { margin-top:16px; display:grid; gap:16px; }
.stk-live .lv-fc { border:1px solid var(--line); border-radius:var(--radius); background:var(--card); padding:18px; }
.stk-live .lv-fk { font-size:11.5px; font-weight:700; color:var(--sub); letter-spacing:0.01em; }
.stk-live .lv-fc h3 { margin:8px 0 4px; font-size:17px; font-weight:800; letter-spacing:-0.02em; color:var(--text); }
.stk-live .lv-fc p { margin:0 0 14px; color:var(--muted); font-size:13.5px; line-height:1.6; word-break:keep-all; }
.stk-live .lv-fbenefits { list-style:none; margin:0 0 14px; padding:0; display:flex; flex-direction:column; gap:6px; }
.stk-live .lv-fbenefits li { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted); }
.stk-live .lv-fbenefits li::before { content:''; flex-shrink:0; width:5px; height:5px; border-radius:50%; background:var(--key); }
.stk-live .lv-fbtns { display:flex; flex-direction:column; gap:8px; }
.stk-live .lv-fbtn { display:flex; align-items:center; justify-content:center; height:40px; border-radius:11px; font-size:14px; font-weight:750; text-decoration:none !important; cursor:pointer; transition:transform .16s ease, opacity .16s ease; }
.stk-live .lv-fbtn:hover { transform:translateY(-1px); opacity:0.94; }
.stk-live .lv-fbtn.primary { background:var(--key); color:#fff !important; }
.stk-live .lv-fbtn.ghost { background:transparent; color:var(--text) !important; border:1px solid var(--line-md); }
.stk-live .lv-switchrow { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.stk-live .lv-swlabel { font-size:14px; font-weight:650; color:var(--text); }
.stk-live .lv-switch { flex-shrink:0; width:46px; height:27px; padding:0; border-radius:999px; cursor:pointer; position:relative; border:1px solid var(--line-md); background:var(--card-2); transition:background .2s ease, border-color .2s ease; }
.stk-live .lv-switch .knob { position:absolute; top:2px; left:2px; width:21px; height:21px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,0.3); transition:transform .22s cubic-bezier(.2,.8,.2,1); }
.stk-live .lv-switch[aria-checked="true"] { background:var(--key); border-color:transparent; }
.stk-live .lv-switch[aria-checked="true"] .knob { transform:translateX(19px); }
.stk-live .lv-notice { margin-top:16px; padding:14px 18px; border:1px solid var(--key-border); border-radius:var(--radius-sm); background:var(--key-dim); color:var(--muted); font-size:12.5px; line-height:1.7; word-break:keep-all; }
@media (max-width:940px) {
  .stk-live .lv-card { height:auto !important; }
  .stk-live .lv-list, .stk-live .lv-feed, .stk-live .lv-agscroll { max-height:60vh; }
}
@media (max-width:720px) {
  .stk-live .lv-wrap { padding:8px 14px 40px; }
  .stk-live .lv-foot.two { grid-template-columns:1fr !important; }
}
@media (prefers-reduced-motion: reduce) {
  .stk-live .lv-livepill i, .stk-live .lv-plive i, .stk-live .lv-kicker .d, .stk-live .lv-ses.now .st .d { animation:none !important; }
}
`;

function hhmmToMs(dayStr: string, hhmm: string): number {
  if (!/^\d{1,2}:\d{2}$/.test(hhmm ?? "")) return NaN;
  return new Date(`${dayStr}T${hhmm.padStart(5, "0")}:00+09:00`).getTime();
}

export default function LiveContentStk({
  webinar,
  accent,
  text,
  surface,
  youtubeId: youtubeIdProp,
  serverNowMs,
  chatEnabled = false,
  isLive = true,
  qa,
  chat,
  onTabChange,
  notifyState,
}: {
  webinar: WebinarForLive;
  accent: string;
  text?: string;
  surface?: string;
  youtubeId?: string | null;
  serverNowMs?: number;
  chatEnabled?: boolean;
  isLive?: boolean;
  qa: QAProps;
  chat?: ChatProps;
  onTabChange?: (tab: string) => void;
  notifyState?: { subscribed: boolean; onToggle: () => void; error?: string; pending?: boolean };
}) {
  const css = useMemo(
    () => buildStkCss(accent || "#FE5816", text || "#f0f0f2", surface || "#121216") + WATCH_CSS,
    [accent, text, surface],
  );

  const config = (webinar.config ?? {}) as Record<string, unknown>;
  const youtubeId = youtubeIdProp || (typeof config.youtubeId === "string" ? config.youtubeId : "");
  const live = (config.livePage ?? {}) as LivePageConfig;
  // CTA 카드 여러 장 — 신규 ctas[] 우선, 없으면 레거시 단일 cta. 내용 있는 카드만.
  const ctaList: CtaCard[] = (Array.isArray(live.ctas) ? live.ctas : live.cta ? [live.cta] : [])
    .filter((c) => !!c && (!!c.title || (Array.isArray(c.buttons) && c.buttons.length > 0)));
  const notify = live.notify;
  const hasNotify = !!notify?.enabled;
  const footCount = ctaList.length + (hasNotify ? 1 : 0);
  const answered = qa.answered ?? [];

  // 세션 상태 계산용 시계 — 클라이언트 전용 렌더라 Date.now() 초기화 안전. 30초 틱.
  const [now, setNow] = useState<number>(() => serverNowMs ?? Date.now());
  useEffect(() => {
    const base = serverNowMs ?? Date.now();
    const t0 = Date.now();
    setNow(base);
    const id = setInterval(() => setNow(base + (Date.now() - t0)), 30_000);
    return () => clearInterval(id);
  }, [serverNowMs]);

  const dayStr = useMemo(() => kstDateString(webinar.liveStartAt), [webinar.liveStartAt]);
  const sessions = useMemo(() => {
    const list = webinar.sessions.map((s) => {
      const startMs = hhmmToMs(dayStr, s.startTime);
      const endMs = hhmmToMs(dayStr, s.endTime);
      const valid = !Number.isNaN(startMs) && !Number.isNaN(endMs);
      let status: "done" | "now" | "upcoming" | "none" = "none";
      if (valid) status = now >= endMs ? "done" : now >= startMs ? "now" : "upcoming";
      return { ...s, startMs, endMs, valid, status };
    });
    return list;
  }, [webinar.sessions, dayStr, now]);

  const activeSession = sessions.find((s) => s.status === "now") ?? null;
  const nextSession = sessions.find((s) => s.status === "upcoming") ?? null;
  // 지금/다음 세션이 있을 때만 focus — 모든 세션 종료 후엔 끝난 세션을 "다음"으로 잘못 표기하지 않는다
  const focus = activeSession ?? nextSession ?? null;

  const metaKind = focus?.type === "break" ? "휴식" : focus?.type === "qa" ? "Q&A" : "세션";
  const metaKicker = focus
    ? `${activeSession ? "지금" : "다음"} ${metaKind} · ${focus.number}/${sessions.length}`
    : null;
  const metaTitle = focus?.title || webinar.name;
  const metaDesc = focus?.description || webinar.description;

  // 탭 구성 — 채팅은 chatEnabled 일 때만 노출(오프하면 탭 자체가 사라짐)
  const tabs = useMemo(
    () => [
      { key: "qa", label: "Q&A", count: answered.length || undefined },
      ...(chatEnabled ? [{ key: "chat", label: "채팅", count: undefined as number | undefined }] : []),
      { key: "agenda", label: "세션", count: undefined as number | undefined },
    ],
    [chatEnabled, answered.length],
  );
  const [tab, setTab] = useState<string>("qa");
  // 채팅이 꺼지면 채팅 탭에 머물지 않게 방어
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab("qa");
  }, [tabs, tab]);
  // 컨테이너가 활성 탭을 알도록 통지 — 채팅 폴링을 탭 활성 시에만 돌리기 위함
  useEffect(() => { onTabChange?.(tab); }, [tab, onTabChange]);

  // 독 높이 = 플레이어 높이(데스크톱). 탭 전환 시 높이가 흔들리지 않도록 고정.
  const playerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const p = playerRef.current;
    const c = cardRef.current;
    if (!p || !c) return;
    const sync = () => {
      if (window.matchMedia("(min-width:941px)").matches) {
        c.style.height = `${Math.round(p.getBoundingClientRect().height)}px`;
      } else {
        c.style.height = "";
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(p);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  // 채팅 피드 자동 스크롤 — 탭 진입/새 메시지 시 최신(하단)으로
  useEffect(() => {
    if (tab !== "chat") return;
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [tab, chat?.messages]);

  const [shared, setShared] = useState(false);
  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const title = webinar.name;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
    } catch {
      return; // 사용자가 공유 시트를 닫음
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      /* 클립보드 차단 무시 */
    }
  };

  const [notifyOnLocal, setNotifyOnLocal] = useState(false);
  const notifyLabel = notify?.switchLabel?.trim() || "세션 시작 알림 받기";
  const notifyOn = notifyState ? notifyState.subscribed : notifyOnLocal;
  const toggleNotify = notifyState ? notifyState.onToggle : () => setNotifyOnLocal((v) => !v);

  const canSend = !!qa.question.trim() && !qa.isSending;

  return (
    <section className="stk-live lv-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="lv-wrap">
        {/* 상단바 */}
        <div className="lv-top">
          {isLive
            ? <span className="lv-livepill"><i />LIVE</span>
            : <span className="lv-soonpill">곧 시작</span>}
          <span className="lv-evname">{webinar.name}</span>
          <span className="lv-sp" />
          <motion.button whileTap={{ scale: 0.96 }} transition={spring} className="lv-share" onClick={handleShare}>
            <Share2 />{shared ? "복사됨" : "공유"}
          </motion.button>
        </div>

        {/* 스테이지: 플레이어 + 메타 + 참여 독 */}
        <div className="lv-stage">
          <div className="lv-player" ref={playerRef}>
            {isLive && <span className="lv-plive"><i />LIVE</span>}
            {youtubeId ? (
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1`}
                title="Live"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="lv-poster">라이브 영상이 연결되지 않았어요</div>
            )}
          </div>

          <div className="lv-meta">
            {metaKicker && <span className="lv-kicker"><span className="d" />{metaKicker}</span>}
            <h1 className="lv-title">{metaTitle}</h1>
            {metaDesc && <p className="lv-desc">{metaDesc}</p>}
            {focus?.speaker && (
              <div className="lv-hosts">
                <span className="lv-host">
                  <span className="av">
                    {focus.speakerPhotoUrl ? <img src={focus.speakerPhotoUrl} alt={focus.speaker} /> : focus.speaker.trim().charAt(0)}
                  </span>
                  {focus.speaker}
                </span>
              </div>
            )}
          </div>

          <aside className="lv-dock">
            <div className="lv-card" ref={cardRef}>
              <div className="lv-docktitle">실시간 참여</div>
              <div className="lv-tabs" role="tablist" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
                {tabs.map((t) => (
                  <button
                    key={t.key}
                    role="tab"
                    id={`lv-tab-${t.key}`}
                    aria-selected={tab === t.key}
                    aria-controls={`lv-panel-${t.key}`}
                    className="lv-tab"
                    onClick={() => setTab(t.key)}
                  >
                    {tab === t.key && (
                      <motion.span layoutId="lv-dock-ind" className="lv-ind" transition={spring} style={{ left: 0, right: 0 }} />
                    )}
                    <span style={{ position: "relative", zIndex: 1 }}>
                      {t.label}
                      {t.count != null && <span className="cnt">{t.count}</span>}
                    </span>
                  </button>
                ))}
              </div>

              {/* Q&A */}
              {tab === "qa" && (
                <div className="lv-panel" role="tabpanel" id="lv-panel-qa" aria-labelledby="lv-tab-qa">
                  {(() => {
                    // 질문 대상 칩은 "세션" 유형만 (Q&A·브레이크 제외)
                    const chipSessions = qa.sessions.filter((s) => (s.type ?? "session") === "session");
                    return chipSessions.length > 1 ? (
                      <div className="lv-chips">
                        {chipSessions.map((s) => (
                          <motion.button
                            key={s.number}
                            type="button"
                            whileTap={{ scale: 0.96 }}
                            transition={spring}
                            className={`lv-chip ${qa.selectedSession === s.number ? "on" : ""}`}
                            onClick={() => qa.setSelectedSession(qa.selectedSession === s.number ? null : s.number)}
                          >
                            세션 {s.number}
                          </motion.button>
                        ))}
                      </div>
                    ) : null;
                  })()}
                  <div className="lv-ask">
                    <input
                      value={qa.question}
                      onChange={(e) => qa.setQuestion(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && canSend) qa.onSend(); }}
                      placeholder="궁금한 걸 질문해보세요"
                      aria-label="질문 입력"
                    />
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      transition={spring}
                      onClick={qa.onSend}
                      disabled={!canSend}
                      aria-label="질문 전송"
                      style={qa.sent ? { background: "#2f9e63" } : undefined}
                    >
                      {qa.sent ? <CheckCircle2 /> : <Send />}
                    </motion.button>
                  </div>
                  <div aria-live="polite">
                    {qa.sent && <p className="lv-hint" style={{ color: "#2f9e63" }}>질문이 전달됐어요!</p>}
                    {qa.error && <p className="lv-hint" role="alert" style={{ color: "#f87171" }}>{qa.error}</p>}
                  </div>
                  {answered.length > 0 ? (
                    <div className="lv-list" tabIndex={0} aria-label="질문 목록">
                      {answered.map((q) => {
                        const voted = qa.votedIds?.includes(q.id);
                        return (
                          <div className="lv-q" key={q.id}>
                            <button
                              type="button"
                              className={`lv-vote ${voted ? "on" : ""}`}
                              onClick={() => qa.onVote?.(q.id)}
                              disabled={voted || !qa.onVote}
                              aria-pressed={voted}
                              aria-label="이 질문 추천"
                            >
                              <span aria-hidden>▲</span>
                              <b>{q.voteCount ?? 0}</b>
                            </button>
                            <div>
                              <p>{q.question}</p>
                              <div className="m">
                                {q.name && <span>{q.name}</span>}
                                {q.sessionNumber != null && <span>· 세션 {q.sessionNumber}</span>}
                                {q.status === "answered" && <span className="lv-ans">답변 완료</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="lv-empty">아직 질문이 없어요.<br />궁금한 점을 먼저 남겨보세요.</div>
                  )}
                </div>
              )}

              {/* 채팅 */}
              {tab === "chat" && (
                <div className="lv-panel" role="tabpanel" id="lv-panel-chat" aria-labelledby="lv-tab-chat">
                  {chat ? (
                    <>
                      {chat.messages.length > 0 ? (
                        <div className="lv-feed" ref={feedRef} tabIndex={0} aria-label="채팅 메시지">
                          {chat.messages.map((m) => (
                            <div className={`lv-msg${m.isHost ? " host" : ""}`} key={m.id}>
                              {m.isHost && <span className="tag">HOST</span>}
                              <span className="who">{m.name}</span>
                              <span className="txt">{m.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="lv-empty">아직 메시지가 없어요.<br />먼저 인사를 건네보세요.</div>
                      )}
                      <div className="lv-chatbar">
                        <input
                          value={chat.input}
                          onChange={(e) => chat.setInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && chat.input.trim() && !chat.isSending) chat.onSend(); }}
                          placeholder="메시지 보내기…"
                          aria-label="채팅 입력"
                        />
                        <motion.button whileTap={{ scale: 0.9 }} transition={spring} onClick={chat.onSend} disabled={!chat.input.trim() || chat.isSending} aria-label="채팅 전송">
                          <Send />
                        </motion.button>
                      </div>
                      {chat.error && <p className="lv-hint" role="alert" style={{ color: "#f87171", marginTop: 6 }}>{chat.error}</p>}
                    </>
                  ) : (
                    <div className="lv-soon">
                      <b>실시간 채팅이 곧 열려요</b>
                      준비되면 이 탭에서 다른 참가자들과 대화할 수 있어요.
                    </div>
                  )}
                </div>
              )}

              {/* 세션(아젠다) */}
              {tab === "agenda" && (
                <div className="lv-panel" role="tabpanel" id="lv-panel-agenda" aria-labelledby="lv-tab-agenda">
                  {sessions.length > 0 ? (
                    <div className="lv-agscroll" tabIndex={0} aria-label="세션 순서">
                      {sessions.map((s) => {
                        const isNext = s.id === nextSession?.id && s.status === "upcoming";
                        const label = s.status === "done" ? "완료" : s.status === "now" ? "진행 중" : isNext ? "다음" : s.status === "upcoming" ? "예정" : "";
                        const pct = s.status === "now" && s.endMs > s.startMs
                          ? Math.min(100, Math.max(0, ((now - s.startMs) / (s.endMs - s.startMs)) * 100))
                          : 0;
                        return (
                          <div className={`lv-ses ${s.status}`} key={s.id}>
                            <span className="tc">{s.startTime}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <h4>
                                {s.title}
                                {s.type && s.type !== "session" && <span className="lv-setype">{SES_TYPE_LABEL[s.type] ?? s.type}</span>}
                              </h4>
                              {s.speaker && <small>{s.speaker}</small>}
                              {s.status === "now" && (
                                <div className="lv-prog"><span style={{ width: `${pct}%` }} /></div>
                              )}
                            </div>
                            {label && (
                              <span className="st">
                                {s.status === "now" && <span className="d" />}{label}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="lv-empty">등록된 세션 순서가 없어요.</div>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* 하단 카드: CTA(여러 장) + 알림 */}
        {footCount > 0 && (
          <div className={`lv-foot ${footCount > 1 ? "two" : ""}`} style={{ gridTemplateColumns: footCount > 1 ? "repeat(2, minmax(0,1fr))" : "1fr" }}>
            {ctaList.map((c, i) => (
              <div className="lv-fc" key={`cta-${i}`}>
                {c.eyebrow && <div className="lv-fk">{c.eyebrow}</div>}
                {c.title && <h3>{c.title}</h3>}
                {c.description && <p>{c.description}</p>}
                {c.benefits && c.benefits.length > 0 && (
                  <ul className="lv-fbenefits">{c.benefits.map((b, j) => <li key={j}>{b}</li>)}</ul>
                )}
                {c.buttons && c.buttons.length > 0 && (
                  <div className="lv-fbtns">
                    {c.buttons.map((btn, j) => (
                      <motion.a
                        key={j}
                        whileTap={{ scale: 0.97 }}
                        transition={spring}
                        href={btn.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`lv-fbtn ${btn.style === "ghost" ? "ghost" : "primary"}`}
                      >
                        {btn.label}
                      </motion.a>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {hasNotify && (
              <div className="lv-fc">
                {(notify!.kicker || "다음 세션") && <div className="lv-fk">{notify!.kicker || "다음 세션"}</div>}
                <h3>{notify!.title || "알림 받고 이어보기"}</h3>
                <p>{notify!.description || "다음 세션이 시작되면 알려드리고, 다시보기도 이메일로 보내드려요."}</p>
                <div className="lv-switchrow">
                  <span className="lv-swlabel">{notifyOn ? "알림이 켜졌어요" : notifyLabel}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={notifyOn}
                    aria-label={notifyLabel}
                    aria-busy={notifyState?.pending || undefined}
                    disabled={notifyState?.pending}
                    className="lv-switch"
                    onClick={toggleNotify}
                  >
                    <span className="knob" />
                  </button>
                </div>
                {notifyState?.error && <p className="lv-hint" role="alert" style={{ color: "#f87171", marginTop: 8 }}>{notifyState.error}</p>}
              </div>
            )}
          </div>
        )}

        {/* 안내 문구 */}
        <div className="lv-notice">{live.notice || DEFAULT_NOTICE}</div>
      </div>
    </section>
  );
}
