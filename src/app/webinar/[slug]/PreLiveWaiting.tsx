"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, Share2, Bell } from "lucide-react";
import { buildStkCss } from "./LiveContentStk";
import { formatKst } from "@/lib/datetime";
import type { LivePageConfig } from "@/lib/webinar-config";
import { buildSessionNumbering, cleanSessionText, isPauseSession, parseSpeaker, sessionHasSpeaker, sessionKicker } from "@/lib/webinar-sessions";
import { sessionLogoCss } from "@/lib/webinar-logo";

/**
 * 등록 완료 ~ 라이브 오픈 전 대기 화면.
 * 히어로 + 카운트다운(주인공) + 캘린더·공유·알림 CTA + [요약·사회적증거 / 아젠다 타임라인] 2단.
 * 색·마감은 STK 토큰(테마 accent/surface/text + 소프트 섀도우) 구동. 섹션은 config 로 on/off.
 */
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const EXTRA_CSS = `
.stk-live .plw-eyebrow { font-size:11.5px; font-weight:750; letter-spacing:.14em; text-transform:uppercase; color:var(--key); }
.stk-live .cd { display:flex; justify-content:center; align-items:center; gap:10px; margin:6px auto 0; }
.stk-live .cd .cell { background:var(--card); box-shadow:var(--card-shadow); border-radius:var(--radius); padding:20px 14px; min-width:118px; text-align:center; }
@media (max-width:640px){ .stk-live .cd .cell { min-width:74px; padding:16px 8px; } }
.stk-live .cd .num { font-size:clamp(36px,6vw,58px); font-weight:840; line-height:1; letter-spacing:-.05em; color:var(--text); font-variant-numeric:tabular-nums; }
.stk-live .cd .lab { margin-top:10px; font-size:10.5px; font-weight:750; letter-spacing:.12em; text-transform:uppercase; color:var(--sub); }
.stk-live .cd .sep { font-size:30px; font-weight:300; color:var(--sub); }
.stk-live .cd-live { text-align:center; font-size:22px; font-weight:850; color:var(--key); }
.stk-live .plw-when { margin-top:20px; font-size:14px; color:var(--muted); text-align:center; }
.stk-live .plw-when b { color:var(--text); font-weight:700; }
.stk-live .plw-center-action { width:100%; max-width:440px; margin:6px auto 0; }
.stk-live .plw-entry-panel { width:100%; max-width:440px; margin:26px auto 0; }
.stk-live .plw-ctas { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:26px; }
.stk-live .plw-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:46px; padding:0 20px; border:0; border-radius:var(--radius-sm); font:inherit; font-size:14px; font-weight:700; cursor:pointer; background:var(--card); color:var(--text); box-shadow:var(--btn-shadow); transition:transform .16s ease, box-shadow .16s ease, opacity .16s ease; }
.stk-live .plw-btn:hover { transform:translateY(-2px); box-shadow:var(--btn-shadow-hover); }
.stk-live .plw-btn:disabled { opacity:.55; cursor:default; }
.stk-live .plw-btn svg { width:17px; height:17px; }
.stk-live .plw-btn.primary { background:var(--key); color:#fff; box-shadow:var(--btn-shadow-key); }
.stk-live .plw-btn.on { background:var(--key); color:#fff; box-shadow:var(--btn-shadow-key); }
.stk-live .plw-err { margin-top:10px; text-align:center; font-size:12.5px; color:#ef4444; }
.stk-live .plw-band { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin:56px 0 40px; align-items:start; }
@media (max-width:820px){ .stk-live .plw-band { grid-template-columns:1fr; } }
.stk-live .plw-panel { background:var(--card); border-radius:var(--radius); box-shadow:var(--card-shadow); padding:24px; }
.stk-live .plw-panel h3 { font-size:13px; font-weight:750; color:var(--muted); margin:0 0 4px; }
.stk-live .plw-panel .big { font-size:25px; font-weight:800; letter-spacing:-.03em; color:var(--text); }
/* pre-line 필수 — 같은 설명이 히어로(.live-desc)에서는 줄바꿈을 살리는데 이 패널에서만 한 줄로
   흘러서, 어드민이 넣은 줄바꿈이 화면 두 곳에서 다르게 보였다.
   (AGENTS 공통: "사용자 텍스트(설명 등)는 줄바꿈을 보존해 표시") */
.stk-live .plw-panel .desc { margin-top:18px; padding-top:18px; border-top:1px solid var(--line); font-size:13.5px; line-height:1.7; color:var(--muted); word-break:keep-all; white-space:pre-line; }
.stk-live .plw-proof { display:flex; align-items:center; gap:14px; margin-top:18px; }
.stk-live .plw-avatars { display:flex; }
.stk-live .plw-avatars span { width:34px; height:34px; border-radius:50%; border:2.5px solid var(--card); margin-left:-11px; display:grid; place-items:center; font-size:12px; font-weight:750; color:#fff; }
.stk-live .plw-avatars span:first-child { margin-left:0; }
.stk-live .plw-proof p { font-size:13.5px; color:var(--muted); margin:0; }
.stk-live .plw-proof b { color:var(--text); font-variant-numeric:tabular-nums; }
.stk-live .plw-ag { background:var(--card); border-radius:var(--radius); box-shadow:var(--card-shadow); padding:8px 4px 12px; }
.stk-live .plw-ag .h { display:flex; align-items:baseline; justify-content:space-between; padding:18px 22px 10px; }
.stk-live .plw-ag .h h3 { font-size:15px; font-weight:800; letter-spacing:-.02em; color:var(--text); margin:0; }
.stk-live .plw-ag .h span { font-size:12px; color:var(--sub); }
.stk-live .plw-row { position:relative; display:grid; grid-template-columns:52px 1fr; gap:28px; padding:13px 22px; }
.stk-live .plw-row::before { content:""; position:absolute; left:88px; top:0; bottom:0; width:1.5px; background:var(--line); }
.stk-live .plw-row:first-of-type::before { top:20px; } .stk-live .plw-row:last-of-type::before { bottom:calc(100% - 21px); }
.stk-live .plw-row .tm { position:relative; z-index:1; font-size:12px; font-weight:700; color:var(--muted); font-variant-numeric:tabular-nums; padding-top:3px; }
.stk-live .plw-row .mk { position:absolute; left:88px; top:16px; width:9px; height:9px; border-radius:50%; background:var(--card); box-shadow:0 0 0 3px var(--key-dim), 0 0 0 1.5px var(--key); transform:translateX(-50%); z-index:1; }
.stk-live .plw-row.brk .mk { box-shadow:0 0 0 3px color-mix(in srgb,var(--text) 6%,transparent), 0 0 0 1.5px var(--sub); }
.stk-live .plw-row .kd { display:inline-block; font-size:10px; font-weight:750; letter-spacing:.06em; text-transform:uppercase; color:var(--key); background:var(--key-dim); padding:2px 7px; border-radius:6px; margin-bottom:6px; }
.stk-live .plw-row.brk .kd { color:var(--sub); background:color-mix(in srgb,var(--text) 6%,transparent); }
.stk-live .plw-row h4 { font-size:14.5px; font-weight:700; letter-spacing:-.01em; line-height:1.35; color:var(--text); margin:0; }
/* 로고 규격은 webinar-logo.ts 한 곳에서 온다 — 랜딩·대기·시청이 같은 크기여야 한다
   (예전엔 22/132 · 22/140 · 20/120 으로 갈라져 같은 로고가 면마다 다르게 보였다). */
${sessionLogoCss(".stk-live .plw-logo", { plate: true })}
/* 로고는 이름 **바로 오른쪽**에 붙인다 — margin-left:auto 로 패널 끝까지 밀면 목록이 넓을 때
   이름과 수십~수백 px 떨어져 서로 무관한 요소처럼 보인다(랜딩 팝업은 블록이 좁아 끝 정렬이 맞다). */
.stk-live .plw-logo { margin-left:4px; }
.stk-live .plw-who { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; }
.stk-live .plw-who .av { width:26px; height:26px; border-radius:50%; overflow:hidden; background:var(--key-dim); color:var(--key); display:grid; place-items:center; font-size:11px; font-weight:750; }
.stk-live .plw-who .av img { width:100%; height:100%; object-fit:cover; }
/* 연사 이름 — 12.5px 은 로고 옆에서 작아 보여 위계가 뒤집혔다(로고가 이름보다 먼저 읽힘). */
/* "이름 | 소속·직책" — 랜딩 타임테이블과 같은 위계. 이름을 더 진하게 둬서 구분자가 흐려도
   어디까지가 이름인지 읽힌다. gap 은 세로 0(줄바꿈 시 붙게), 가로 6px. */
.stk-live .plw-who small { font-size:14px; color:var(--text); font-weight:650; }
.stk-live .plw-who .who { display:flex; align-items:baseline; flex-wrap:wrap; gap:0 6px; }
.stk-live .plw-who .who b { font-weight:750; }
.stk-live .plw-who .who .sep { opacity:.38; font-weight:400; }
.stk-live .plw-who .who .co { color:var(--muted); font-weight:600; }
`;

interface Session {
  id: string;
  number: number;
  type?: string;
  title: string;
  speaker: string | null;
  speakerCompany?: string | null;
  speakerPhotoUrl?: string | null;
  logoUrl?: string | null;
  description?: string | null;
  startTime: string;
  endTime: string;
}

interface PreLiveWaitingProps {
  webinar: { name: string; description: string | null; liveStartAt: string; sessions: Session[] };
  accent: string;
  text: string;
  surface: string;
  targetIso: string;
  serverNowMs?: number;
  registered?: boolean;
  live: LivePageConfig;
  registrantCount?: number;
  hasCalendar?: boolean;
  onCalendar?: () => void;
  onShare?: () => void;
  shareCopied?: boolean;
  onNotify?: () => void;
  notify?: { subscribed: boolean; pending: boolean; error: string };
  /** 입장 확인처럼 카운트다운과 같은 레이아웃을 공유하는 화면의 주요 행동 카드. */
  centerAction?: ReactNode;
  /** 수동 라이브 전환도 카운트다운 대신 주요 행동 카드를 보여준다. */
  replaceCountdown?: boolean;
}

function diffParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const AV_COLORS = ["#6D28D9", "#0EA5E9", "#F97316", "#10B981", "#E11D48"];

export default function PreLiveWaiting({
  webinar, accent, text, surface, targetIso, serverNowMs, registered = true,
  live, registrantCount, hasCalendar, onCalendar, onShare, shareCopied, onNotify, notify, centerAction, replaceCountdown = false,
}: PreLiveWaitingProps) {
  const css = useMemo(() => buildStkCss(accent || "#6D28D9", text || "#141320", surface || "#FFFFFF") + EXTRA_CSS, [accent, text, surface]);
  const targetMs = useMemo(() => new Date(targetIso).getTime(), [targetIso]);

  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => serverNowMs ?? 0);
  useEffect(() => {
    setMounted(true);
    const base = serverNowMs ?? Date.now();
    const startedAt = Date.now();
    setNow(base);
    const id = setInterval(() => setNow(base + (Date.now() - startedAt)), 1000);
    return () => clearInterval(id);
  }, [serverNowMs]);

  const remaining = targetMs - now;
  const started = remaining <= 0;
  const { d, h, m, s } = diffParts(remaining);
  const cells = [{ n: d, l: "Days" }, { n: h, l: "Hours" }, { n: m, l: "Min" }, { n: s, l: "Sec" }];

  const showCalendar = live.waiting.calendar && hasCalendar && !!onCalendar;
  const showShare = live.waiting.share && !!onShare;
  const showNotify = live.waiting.notify && !!onNotify;
  const agendaNumbering = useMemo(() => buildSessionNumbering(webinar.sessions), [webinar.sessions]);
  const showAgenda = live.waiting.agenda && webinar.sessions.length > 0;
  const showSocial = live.waiting.social && (registrantCount ?? 0) > 0;
  const showCenterAction = Boolean(centerAction) && (started || replaceCountdown);

  return (
    <div className="stk-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="live-inner">
        <div className="live-hero">
          <div className="plw-eyebrow">Live Webinar</div>
          <h1 className="live-title" style={{ marginTop: 12 }}>{webinar.name}</h1>
          {webinar.description && <p className="live-desc">{webinar.description}</p>}
        </div>

        {!mounted ? (
          <div style={{ minHeight: 120 }} />
        ) : showCenterAction ? (
          <div className="plw-center-action">{centerAction}</div>
        ) : started ? (
          <p className="cd-live">곧 시작합니다 — 잠시만 기다려주세요</p>
        ) : (
          <>
            <div className="cd" aria-label="시작까지 남은 시간">
              {cells.map((c, i) => (
                <div key={c.l} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="cell"><div className="num">{String(c.n).padStart(2, "0")}</div><div className="lab">{c.l}</div></div>
                  {i < cells.length - 1 && <div className="sep">:</div>}
                </div>
              ))}
            </div>
            <p className="plw-when">
              <b>{formatKst(webinar.liveStartAt, { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}</b> 라이브 시작
            </p>
          </>
        )}

        {mounted && centerAction && !showCenterAction && <div className="plw-entry-panel">{centerAction}</div>}

        {(showCalendar || showShare || showNotify) && (
          <div className="plw-ctas">
            {showCalendar && (
              <motion.button whileTap={{ scale: 0.97 }} transition={spring} onClick={onCalendar} className="plw-btn primary">
                <CalendarPlus /> 캘린더에 추가
              </motion.button>
            )}
            {showShare && (
              <motion.button whileTap={{ scale: 0.97 }} transition={spring} onClick={onShare} className="plw-btn">
                <Share2 /> {shareCopied ? "링크 복사됨 ✓" : "초대 공유"}
              </motion.button>
            )}
            {showNotify && (
              <motion.button whileTap={{ scale: 0.97 }} transition={spring} onClick={onNotify} disabled={notify?.pending} className={`plw-btn ${notify?.subscribed ? "on" : ""}`}>
                <Bell /> {notify?.subscribed ? "알림 받는 중 ✓" : "시작 알림 받기"}
              </motion.button>
            )}
          </div>
        )}
        {notify?.error && <p className="plw-err">{notify.error}</p>}

        {(showSocial || showAgenda) && (
          <div className="plw-band">
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div className="plw-panel">
                <h3>이 웨비나는</h3>
                <div className="big">{webinar.name}</div>
                {webinar.description && <div className="desc">{webinar.description}</div>}
                {showSocial && (
                  <div className="plw-proof">
                    <div className="plw-avatars">
                      {[0, 1, 2, 3].map((i) => <span key={i} style={{ background: AV_COLORS[i] }}>{"김박이최"[i]}</span>)}
                      <span style={{ background: "color-mix(in srgb, var(--text) 8%, var(--card))", color: "var(--muted)" }}>+</span>
                    </div>
                    <p><b>{(registrantCount ?? 0).toLocaleString()}명</b>이 함께 기다리고 있어요</p>
                  </div>
                )}
              </div>
            </div>

            {showAgenda ? (
              <div className="plw-ag">
                {/* 개수는 실제 세션만 — 휴식·Q&A 를 세면 "3개 세션"이 "5개 세션"으로 부풀었다 */}
                <div className="h"><h3>세션 순서</h3><span>{agendaNumbering.realCount}개 세션</span></div>
                {webinar.sessions.map((sn) => {
                  /**
                   * 종류 표기는 유형 표가 만든다(sessionKicker). 예전엔 여기서 삼항 체인이었고,
                   * 표에 없는 유형이 else 로 떨어져 `Session ${displayNumber ?? sn.number}` 가 됐다 —
                   * 세션이 아니면 displayNumber 가 null 이라 폴백이 **DB 진행 순서 원본**을 찍어서
                   * 오프닝(number 1)과 첫 세션(표시번호 1)이 한 화면에 둘 다 "Session 1" 이 됐다.
                   */
                  const kd = sessionKicker(sn.type, agendaNumbering.displayNumber(sn.number));
                  // 톤다운은 **빈 시간(휴식)에만**. 오프닝·클로징은 세션으로 세지 않지만 콘텐츠다.
                  const muted = isPauseSession(sn.type);
                  /* 랜딩 타임테이블과 같은 표기 — "이름 | 소속·직책".
                     parseSpeaker 를 거치는 이유: 레거시 speaker 가 "이름 | 회사" 결합형이라
                     raw 로 쓰면 구분자가 두 번 나오거나 소속이 이름 안에 박혀 나온다. */
                  const sp = parseSpeaker(cleanSessionText(sn.speaker), cleanSessionText(sn.speakerCompany));
                  const hasWho = Boolean(sp.name || sp.company);
                  return (
                    <div className={`plw-row ${muted ? "brk" : ""}`} key={sn.id}>
                      <div className="tm">{sn.startTime}</div>
                      <span className="mk" />
                      <div>
                        <span className="kd">{kd}</span>
                        <h4>{sn.title}</h4>
                        {/**
                          * 연사 이름 줄 오른쪽에 로고 — 랜딩 상세 팝업과 같은 배치다.
                          * 예전엔 제목과 연사 사이에 로고가 끼어서 제목→누가 흐름이 끊겼고,
                          * 줄마다 로고 유무에 따라 세로 리듬이 달라졌다.
                          *
                          * 로고만 있고 연사가 없는 세션(오프닝·클로징)에서도 줄을 그린다 —
                          * 게이트에서 로고를 빼면 그 세션의 로고가 통째로 사라진다.
                          */}
                        {(sn.logoUrl || (sessionHasSpeaker(sn.type) && hasWho)) && (
                          <div className="plw-who">
                            {sessionHasSpeaker(sn.type) && hasWho && (
                              <>
                                {/* 아바타 이니셜은 이름에서 — 소속만 있는 세션에서는 그리지 않는다(빈 원 방지). */}
                                {Boolean(sp.name) && (
                                  <span className="av">{sn.speakerPhotoUrl ? <img src={sn.speakerPhotoUrl} alt={sp.name} /> : sp.name[0]}</span>
                                )}
                                <small className="who">
                                  {Boolean(sp.name) && <b>{sp.name}</b>}
                                  {Boolean(sp.name && sp.company) && <span className="sep" aria-hidden="true">|</span>}
                                  {Boolean(sp.company) && <span className="co">{sp.company}</span>}
                                </small>
                              </>
                            )}
                            {sn.logoUrl && <img className="plw-logo" src={sn.logoUrl} alt="" />}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <div />}
          </div>
        )}
      </div>
    </div>
  );
}
