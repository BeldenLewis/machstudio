"use client";

// 인증 후 라이브 시청 화면 — STK 제공 디자인을 이식.
// 제목·설명·일정·영상·아젠다는 웨비나 데이터에서 동적으로, 정보/CTA/공지는 config.livePage 에서 편집.
// 액센트 색은 theme.accentColor 로 구동해 전시별 테마에 맞춘다. Q&A 는 mach 파이프라인 유지.

import { useMemo } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { formatKst } from "@/lib/datetime";

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

interface CtaButton {
  label: string;
  url: string;
  style?: "white" | "ghost";
}

interface LivePageConfig {
  infoMethod?: string;
  infoTopic?: string;
  infoContact?: string;
  notice?: string;
  cta?: {
    eyebrow?: string;
    title?: string;
    description?: string;
    benefits?: string[];
    buttons?: CtaButton[];
  };
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
}

const DEFAULT_NOTICE =
  "※ 영상이 보이지 않을 경우 새로고침 후 다시 접속해주세요. 일부 브라우저 환경에서는 자동 재생이 제한될 수 있으며, 이 경우 플레이어의 재생 버튼을 직접 눌러주세요.";

function buildCss(accent: string) {
  return `
.stk-live { --key: ${accent}; --key-dim: color-mix(in srgb, ${accent} 12%, transparent); --key-border: color-mix(in srgb, ${accent} 36%, transparent);
  --text:#f0f0f2; --muted:#9a9aa6; --sub:#5e5e6e; --card:rgba(18,18,22,0.88); --card-2:rgba(26,26,32,0.72);
  --line:rgba(255,255,255,0.08); --line-md:rgba(255,255,255,0.13); --radius-sm:12px; --radius:20px; --radius-lg:28px;
  width:100%; color:var(--text); -webkit-font-smoothing:antialiased; }
.stk-live * { box-sizing:border-box; }
.stk-live .live-inner { max-width:1280px; margin:0 auto; padding:56px 24px 96px; }
.stk-live .live-hero { text-align:center; margin-bottom:44px; }
.stk-live .live-badge { display:inline-flex; align-items:center; gap:8px; padding:8px 16px 8px 12px; border:1px solid var(--key-border); border-radius:999px; background:var(--key-dim); font-size:12px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:24px; }
.stk-live .live-dot { width:7px; height:7px; border-radius:50%; background:var(--key); animation:stkPulse 2s ease-in-out infinite; flex-shrink:0; }
@keyframes stkPulse { 0%,100%{ box-shadow:0 0 0 0 var(--key-border); } 60%{ box-shadow:0 0 0 9px transparent; } }
.stk-live .live-title { font-size:clamp(30px,4.2vw,52px); line-height:1.12; font-weight:900; letter-spacing:-0.045em; word-break:keep-all; color:#fff; margin:0; }
.stk-live .live-desc { max-width:720px; margin:20px auto 0; color:var(--muted); font-size:clamp(15px,1.7vw,18px); line-height:1.72; word-break:keep-all; }
.stk-live .live-layout { display:flex; flex-direction:column; gap:20px; }
.stk-live .live-bottom { display:grid; grid-template-columns:1fr 1fr; gap:20px; align-items:stretch; }
.stk-live .player-card { border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--line-md); background:var(--card); }
.stk-live .player-top { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 22px; border-bottom:1px solid var(--line); background:rgba(255,255,255,0.02); }
.stk-live .player-meta strong { display:block; font-size:14px; font-weight:700; color:var(--text); }
.stk-live .player-meta small { font-size:12px; color:var(--sub); margin-top:2px; display:block; }
.stk-live .video-wrap { position:relative; width:100%; aspect-ratio:16/9; background:#000; }
.stk-live .video-wrap iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
.stk-live .video-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:var(--sub); font-size:14px; }
.stk-live .info-card { border:1px solid var(--line-md); border-radius:var(--radius); background:var(--card); padding:22px 24px; }
.stk-live .info-card-title { font-size:13px; font-weight:800; letter-spacing:0.06em; text-transform:uppercase; color:var(--sub); margin-bottom:18px; }
.stk-live .info-row { display:grid; grid-template-columns:60px 1fr; gap:10px; padding:13px 0; border-bottom:1px solid var(--line); align-items:baseline; }
.stk-live .info-row:last-child { border-bottom:none; padding-bottom:0; }
.stk-live .info-row:first-child { padding-top:0; }
.stk-live .info-row .label { font-size:12px; font-weight:700; color:var(--sub); }
.stk-live .info-row .value { font-size:14px; font-weight:600; color:var(--text); line-height:1.5; word-break:keep-all; }
.stk-live .cta-card { border-radius:var(--radius); padding:24px; background:var(--key); position:relative; overflow:hidden; }
.stk-live .cta-eyebrow { display:inline-flex; align-items:center; margin-bottom:14px; padding:5px 10px; border-radius:999px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.18); font-size:11px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.9); }
.stk-live .cta-card h3 { font-size:21px; font-weight:900; line-height:1.3; letter-spacing:-0.04em; color:#fff; margin:0 0 10px; word-break:keep-all; }
.stk-live .cta-card p { font-size:13.5px; line-height:1.65; color:rgba(255,255,255,0.85); margin:0 0 16px; word-break:keep-all; }
.stk-live .cta-benefits { list-style:none; margin:0 0 18px; padding:0; display:flex; flex-direction:column; gap:7px; }
.stk-live .cta-benefits li { display:flex; align-items:center; gap:8px; font-size:13px; color:rgba(255,255,255,0.92); }
.stk-live .cta-benefits li::before { content:''; flex-shrink:0; width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,0.7); }
.stk-live .btn-stack { display:flex; flex-direction:column; gap:9px; }
.stk-live .stk-btn { display:flex; align-items:center; justify-content:center; width:100%; height:46px; border-radius:var(--radius-sm); text-decoration:none !important; font-size:14px; font-weight:800; transition:transform .18s ease, opacity .18s ease; cursor:pointer; }
.stk-live .stk-btn:hover { transform:translateY(-2px); opacity:0.92; }
.stk-live .btn-white { background:#fff; color:#111 !important; }
.stk-live .btn-ghost { background:rgba(0,0,0,0.18); color:#fff !important; border:1px solid rgba(255,255,255,0.24); }
.stk-live .qa-btn { display:inline-flex; align-items:center; gap:6px; padding:9px 18px; border-radius:10px; background:var(--key); color:#fff !important; font-size:13px; font-weight:800; text-decoration:none !important; flex-shrink:0; transition:opacity .18s ease; cursor:pointer; border:none; }
.stk-live .qa-btn:hover { opacity:0.88; }
.stk-live .qa-card { border:1px solid var(--line-md); border-radius:var(--radius); background:var(--card); padding:22px 24px; }
.stk-live .qa-chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
.stk-live .qa-chip { font-size:12px; padding:5px 11px; border-radius:8px; border:1px solid var(--line-md); background:transparent; color:var(--muted); cursor:pointer; }
.stk-live .qa-chip.on { background:var(--key); color:#fff; border-color:var(--key); }
.stk-live .qa-input-row { display:flex; gap:9px; align-items:stretch; }
.stk-live .qa-textarea { flex:1; min-height:52px; padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--line-md); background:rgba(255,255,255,0.04); color:var(--text); font-size:14px; resize:none; outline:none; }
.stk-live .qa-send { flex-shrink:0; width:52px; border-radius:var(--radius-sm); border:none; background:var(--key); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; }
.stk-live .qa-send:disabled { opacity:0.4; cursor:not-allowed; }
.stk-live .live-notice { margin-top:20px; padding:16px 20px; border:1px solid var(--key-border); border-radius:var(--radius-sm); background:var(--key-dim); color:rgba(255,255,255,0.65); font-size:13px; line-height:1.7; }
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
  .stk-live .live-bottom { grid-template-columns:1fr; }
  .stk-live .player-top { flex-direction:column; align-items:flex-start; gap:12px; }
  .stk-live .ag-head { text-align:left; }
  .stk-live .ag-sess-head { grid-template-columns:1fr; gap:8px; padding:16px 18px; }
  .stk-live .ag-sess-time { text-align:left; }
  .stk-live .ag-sess-body { padding:16px 18px; }
}
`;
}

export default function LiveContentStk({
  webinar,
  accent,
  youtubeId: youtubeIdProp,
  qa,
}: {
  webinar: WebinarForLive;
  accent: string;
  youtubeId?: string | null;
  qa: QAProps;
}) {
  const css = useMemo(() => buildCss(accent || "#FE5816"), [accent]);
  const config = (webinar.config ?? {}) as Record<string, unknown>;
  // youtubeId 는 verify 통과 후 prop 으로 전달됨 (config 에는 더 이상 공개 노출 안 함)
  const youtubeId = youtubeIdProp || (typeof config.youtubeId === "string" ? config.youtubeId : "");
  const live = (config.livePage ?? {}) as LivePageConfig;
  const cta = live.cta;
  const hasCta = !!(cta && (cta.title || (cta.buttons && cta.buttons.length)));

  const dateStr = `${formatKst(webinar.liveStartAt, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })} · ${formatKst(webinar.liveStartAt, { hour: "2-digit", minute: "2-digit" })} – ${formatKst(webinar.liveEndAt, { hour: "2-digit", minute: "2-digit" })}`;

  const infoRows: { label: string; value: string }[] = [
    { label: "일시", value: dateStr },
    { label: "방식", value: live.infoMethod || "온라인 라이브 스트리밍" },
    { label: "주제", value: live.infoTopic || webinar.name },
    ...(live.infoContact ? [{ label: "문의", value: live.infoContact }] : []),
  ];

  return (
    <section className="stk-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="live-inner">
        {/* HERO */}
        <div className="live-hero">
          <div className="live-badge"><span className="live-dot" /> Live Webinar</div>
          <h1 className="live-title">{webinar.name}</h1>
          {webinar.description && <p className="live-desc">{webinar.description}</p>}
        </div>

        <div className="live-layout">
          {/* PLAYER */}
          <div className="player-card">
            <div className="player-top">
              <div className="player-meta">
                <strong>Live Streaming</strong>
                <small>실시간 송출 화면입니다. 재생 버튼을 눌러 시청해주세요.</small>
              </div>
              <a href="#stk-qa" className="qa-btn">💬 Q&amp;A 질문하기</a>
            </div>
            <div className="video-wrap">
              {youtubeId ? (
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1`}
                  title="Live"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <div className="video-empty">라이브 영상이 연결되지 않았어요</div>
              )}
            </div>
          </div>

          {/* INFO + CTA */}
          <div className="live-bottom">
            <div className="info-card">
              <div className="info-card-title">Webinar Info</div>
              <div className="info-rows">
                {infoRows.map((row) => (
                  <div className="info-row" key={row.label}>
                    <span className="label">{row.label}</span>
                    <strong className="value">{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            {hasCta && (
              <div className="cta-card">
                {cta!.eyebrow && <div className="cta-eyebrow">{cta!.eyebrow}</div>}
                {cta!.title && <h3>{cta!.title}</h3>}
                {cta!.description && <p>{cta!.description}</p>}
                {cta!.benefits && cta!.benefits.length > 0 && (
                  <ul className="cta-benefits">
                    {cta!.benefits.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                )}
                {cta!.buttons && cta!.buttons.length > 0 && (
                  <div className="btn-stack">
                    {cta!.buttons.map((btn, i) => (
                      <a key={i} href={btn.url} target="_blank" rel="noopener noreferrer" className={`stk-btn ${btn.style === "ghost" ? "btn-ghost" : "btn-white"}`}>
                        {btn.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Q&A (mach 파이프라인) */}
          <div className="qa-card" id="stk-qa">
            <div className="info-card-title">Q&amp;A 질문하기</div>
            {qa.sessions.length > 1 && (
              <div className="qa-chips">
                {qa.sessions.map((s) => (
                  <button
                    key={s.number}
                    type="button"
                    className={`qa-chip ${qa.selectedSession === s.number ? "on" : ""}`}
                    onClick={() => qa.setSelectedSession(qa.selectedSession === s.number ? null : s.number)}
                  >
                    세션 {s.number}
                  </button>
                ))}
              </div>
            )}
            <div className="qa-input-row">
              <textarea
                className="qa-textarea"
                rows={2}
                value={qa.question}
                onChange={(e) => qa.setQuestion(e.target.value)}
                placeholder="연사에게 궁금한 점을 남겨주세요…"
              />
              <button className="qa-send" onClick={qa.onSend} disabled={!qa.question.trim() || qa.isSending}
                style={qa.sent ? { background: "#22c55e" } : undefined}>
                {qa.sent ? <CheckCircle2 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {qa.sent && <p style={{ color: "#22c55e", fontSize: 12, marginTop: 8 }}>질문이 전달됐어요!</p>}
            {qa.error && <p style={{ color: "#f87171", fontSize: 12, marginTop: 8 }}>{qa.error}</p>}
          </div>
        </div>

        {/* NOTICE */}
        <div className="live-notice">{live.notice || DEFAULT_NOTICE}</div>

        {/* AGENDA */}
        {webinar.sessions.length > 0 && (
          <div className="ag-wrap">
            <div className="ag-head">
              <div className="ag-kicker">Program Agenda</div>
              <h2>프로그램 순서</h2>
            </div>
            {webinar.sessions.map((s) => (
              <div className="ag-session" key={s.id}>
                <div className="ag-sess-head">
                  <span className="ag-sess-num">Session {s.number}</span>
                  <h3 className="ag-sess-title">{s.title}</h3>
                  <span className="ag-sess-time">{s.startTime} – {s.endTime}</span>
                </div>
                {(s.speaker || s.description) && (
                  <div className="ag-sess-body">
                    {s.speaker && (
                      <div className="ag-avatar">
                        {s.speakerPhotoUrl ? (
                          <img src={s.speakerPhotoUrl} alt={s.speaker} />
                        ) : (
                          s.speaker.trim().charAt(0)
                        )}
                      </div>
                    )}
                    <div>
                      {s.description && <div className="ag-speaker-desc">{s.description}</div>}
                      {s.speaker && <div className="ag-speaker-name">{s.speaker}</div>}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div className="ag-footer">* 세션 및 연사는 주최 측 사정에 따라 변경될 수 있습니다.</div>
          </div>
        )}
      </div>
    </section>
  );
}
