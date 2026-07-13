"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, Share2, Bell } from "lucide-react";
import { buildStkCss } from "./LiveContentStk";
import { formatKst } from "@/lib/datetime";
import type { LivePageConfig } from "@/lib/webinar-config";

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
.stk-live .plw-panel .desc { margin-top:18px; padding-top:18px; border-top:1px solid var(--line); font-size:13.5px; line-height:1.7; color:var(--muted); word-break:keep-all; }
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
.stk-live .plw-who { display:flex; align-items:center; gap:8px; margin-top:8px; }
.stk-live .plw-who .av { width:26px; height:26px; border-radius:50%; overflow:hidden; background:var(--key-dim); color:var(--key); display:grid; place-items:center; font-size:11px; font-weight:750; }
.stk-live .plw-who .av img { width:100%; height:100%; object-fit:cover; }
.stk-live .plw-who small { font-size:12.5px; color:var(--muted); font-weight:600; }
`;

interface Session {
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
}

function diffParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

const AV_COLORS = ["#6D28D9", "#0EA5E9", "#F97316", "#10B981", "#E11D48"];

export default function PreLiveWaiting({
  webinar, accent, text, surface, targetIso, serverNowMs, registered = true,
  live, registrantCount, hasCalendar, onCalendar, onShare, shareCopied, onNotify, notify,
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
  const showAgenda = live.waiting.agenda && webinar.sessions.length > 0;
  const showSocial = live.waiting.social && (registrantCount ?? 0) > 0;

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
                <div className="h"><h3>세션 순서</h3><span>{webinar.sessions.length}개 세션</span></div>
                {webinar.sessions.map((sn) => {
                  const brk = sn.type === "break";
                  const kd = brk ? "Break" : sn.type === "qa" ? "Q&A" : `Session ${sn.number}`;
                  return (
                    <div className={`plw-row ${brk ? "brk" : ""}`} key={sn.id}>
                      <div className="tm">{sn.startTime}</div>
                      <span className="mk" />
                      <div>
                        <span className="kd">{kd}</span>
                        <h4>{sn.title}</h4>
                        {!brk && sn.speaker && sn.speaker !== "null" && (
                          <div className="plw-who">
                            <span className="av">{sn.speakerPhotoUrl ? <img src={sn.speakerPhotoUrl} alt={sn.speaker} /> : sn.speaker[0]}</span>
                            <small>{sn.speaker}</small>
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
