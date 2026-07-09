"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CalendarPlus, CheckCircle2 } from "lucide-react";
import { buildStkCss } from "./LiveContentStk";
import { formatKst } from "@/lib/datetime";

/**
 * 등록 완료 ~ 라이브 오픈 전 대기 화면 (프레젠테이션 전용).
 * 히어로 + 시작까지 카운트다운 + 아젠다 미리보기 + 캘린더. STK 톤 공유.
 */
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const EXTRA_CSS = `
.stk-live .cd-wrap { display:flex; justify-content:center; gap:10px; margin:8px auto 4px; flex-wrap:wrap; }
.stk-live .cd-cell { min-width:78px; padding:16px 10px; border:1px solid var(--line-md); border-radius:var(--radius-sm); background:var(--card); text-align:center; }
.stk-live .cd-num { font-size:34px; font-weight:900; line-height:1; letter-spacing:-0.04em; color:var(--text); font-variant-numeric:tabular-nums; }
.stk-live .cd-label { margin-top:8px; font-size:11px; font-weight:700; letter-spacing:0.04em; color:var(--sub); text-transform:uppercase; }
.stk-live .cd-when { text-align:center; margin-top:22px; font-size:13.5px; color:var(--muted); }
.stk-live .cd-live { text-align:center; font-size:20px; font-weight:850; color:var(--key); }
.stk-live .plw-affirm { display:inline-flex; align-items:center; gap:8px; margin-bottom:18px; padding:8px 16px; border-radius:999px; border:1px solid var(--key-border); background:var(--key-dim); font-size:12.5px; font-weight:750; color:var(--text); }
.stk-live .plw-cta { display:flex; justify-content:center; margin-top:32px; }
.stk-live .plw-cal { display:inline-flex; align-items:center; gap:8px; padding:12px 22px; border-radius:var(--radius-sm); border:1px solid var(--line-md); background:var(--card); color:var(--text); font-size:14px; font-weight:750; cursor:pointer; }
.stk-live .plw-cal:hover { border-color:var(--key-border); }
`;

interface Session {
  id: string;
  number: number;
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
  targetIso: string;      // 카운트다운 목표 (입장 오픈 또는 라이브 시작)
  serverNowMs?: number;   // 서버 기준 현재(없으면 로컬)
  registered?: boolean;
  onCalendar?: () => void;
}

function diffParts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
}

export default function PreLiveWaiting({
  webinar, accent, text, surface, targetIso, serverNowMs, registered = true, onCalendar,
}: PreLiveWaitingProps) {
  const css = useMemo(() => buildStkCss(accent || "#FE5816", text || "#f0f0f2", surface || "#121216") + EXTRA_CSS, [accent, text, surface]);
  const targetMs = useMemo(() => new Date(targetIso).getTime(), [targetIso]);

  // 시간 의존 렌더는 마운트 후에만 — SSR/클라 하이드레이션 불일치(Date.now·로케일 AM/PM) 방지
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
  const cells = [
    { n: d, l: "Days" },
    { n: h, l: "Hours" },
    { n: m, l: "Min" },
    { n: s, l: "Sec" },
  ];

  return (
    <div className="stk-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="live-inner">
        <div className="live-hero">
          {registered && (
            <div className="plw-affirm"><CheckCircle2 style={{ width: 15, height: 15 }} /> 사전등록 완료</div>
          )}
          <h1 className="live-title">{webinar.name}</h1>
          {webinar.description && <p className="live-desc">{webinar.description}</p>}
        </div>

        {!mounted ? (
          <div style={{ minHeight: 120 }} />
        ) : started ? (
          <p className="cd-live">곧 시작합니다 — 잠시만 기다려주세요</p>
        ) : (
          <>
            <div className="cd-wrap">
              {cells.map((c) => (
                <div className="cd-cell" key={c.l}>
                  <div className="cd-num">{String(c.n).padStart(2, "0")}</div>
                  <div className="cd-label">{c.l}</div>
                </div>
              ))}
            </div>
            <p className="cd-when">
              {formatKst(webinar.liveStartAt, { month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })} 라이브 시작
            </p>
          </>
        )}

        {onCalendar && (
          <div className="plw-cta">
            <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }} transition={spring} onClick={onCalendar} className="plw-cal">
              <CalendarPlus style={{ width: 16, height: 16 }} /> 캘린더에 추가
            </motion.button>
          </div>
        )}

        {webinar.sessions.length > 0 && (
          <div className="ag-wrap">
            <div className="ag-head">
              <span className="ag-kicker">Agenda</span>
              <h2>세션 순서</h2>
            </div>
            {webinar.sessions.map((s) => (
              <div className="ag-session" key={s.id}>
                <div className="ag-sess-head">
                  <span className="ag-sess-num">SESSION {s.number}</span>
                  <h3 className="ag-sess-title">{s.title}</h3>
                  <span className="ag-sess-time">{s.startTime} ~ {s.endTime}</span>
                </div>
                {(s.speaker || s.description) && (
                  <div className="ag-sess-body">
                    <div className="ag-avatar">
                      {s.speakerPhotoUrl ? <img src={s.speakerPhotoUrl} alt={s.speaker ?? ""} /> : (s.speaker?.[0] ?? "?")}
                    </div>
                    <div>
                      {s.speaker && <div className="ag-speaker-name">{s.speaker}</div>}
                      {s.description && <div className="ag-speaker-desc">{s.description}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
