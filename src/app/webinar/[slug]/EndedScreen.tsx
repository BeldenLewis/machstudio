"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Check, Play, ClipboardCheck, FileText, Download, Share2, Link2 } from "lucide-react";
import { buildStkCss } from "./LiveContentStk";
import { DEFAULT_ENDED_DESCRIPTION, DEFAULT_ENDED_TITLE, type LivePageConfig } from "@/lib/webinar-config";

/**
 * 라이브 종료 화면 — 감사 + 다음 스텝 전환.
 * 다시보기 / 만족도 설문 / 자료 다운로드 / 다음 웨비나 / 공유. 각 섹션은 config 및 데이터 유무로 표시.
 * (리캡 통계는 표시하지 않음)
 */
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const EXTRA_CSS = `
.stk-live .en-hero { text-align:center; display:flex; flex-direction:column; align-items:center; gap:16px; padding:8px 0 4px; }
.stk-live .en-check { width:60px; height:60px; border-radius:50%; background:color-mix(in srgb,#12B76A 14%,transparent); color:#12B76A; display:grid; place-items:center; box-shadow:0 0 0 8px color-mix(in srgb,#12B76A 6%,transparent); }
.stk-live .en-check svg { width:30px; height:30px; }
.stk-live .en-actions { display:grid; gap:16px; margin:40px 0 32px; }
.stk-live .en-actions.two { grid-template-columns:1fr 1fr; }
@media (max-width:680px){ .stk-live .en-actions.two { grid-template-columns:1fr; } }
.stk-live .en-act { background:var(--card); border-radius:var(--radius); box-shadow:var(--card-shadow); padding:24px; display:flex; flex-direction:column; gap:6px; }
.stk-live .en-act .ic { width:40px; height:40px; border-radius:11px; background:var(--key-dim); color:var(--key); display:grid; place-items:center; margin-bottom:8px; }
.stk-live .en-act .ic svg { width:20px; height:20px; }
.stk-live .en-act h3 { font-size:16.5px; font-weight:780; letter-spacing:-.02em; color:var(--text); margin:0; }
.stk-live .en-act p { font-size:13.5px; line-height:1.6; color:var(--muted); margin:0 0 8px; flex:1; word-break:keep-all; }
.stk-live .en-btn { display:flex; align-items:center; justify-content:center; gap:7px; width:100%; height:44px; border:0; border-radius:var(--radius-sm); font:inherit; font-size:14px; font-weight:750; cursor:pointer; text-decoration:none; transition:transform .16s ease, box-shadow .16s ease, opacity .16s ease; }
.stk-live .en-btn.primary { background:var(--key); color:#fff; box-shadow:var(--btn-shadow-key); }
.stk-live .en-btn.soft { background:var(--card-2); color:var(--text); box-shadow:var(--btn-shadow); }
.stk-live .en-btn:hover { transform:translateY(-2px); }
.stk-live .en-btn:disabled { opacity:.6; cursor:default; transform:none; }
.stk-live .en-res { background:var(--card); border-radius:var(--radius); box-shadow:var(--card-shadow); padding:8px 4px; margin-bottom:30px; }
.stk-live .en-res .rh { padding:16px 20px 6px; font-size:13px; font-weight:750; color:var(--muted); }
.stk-live .en-res a { display:flex; align-items:center; gap:13px; padding:13px 20px; text-decoration:none; color:var(--text); transition:background .15s ease; }
.stk-live .en-res a+a { border-top:1px solid var(--line); }
.stk-live .en-res a:hover { background:color-mix(in srgb,var(--text) 3%,transparent); }
.stk-live .en-res .fi { width:34px; height:34px; border-radius:9px; background:var(--key-dim); color:var(--key); display:grid; place-items:center; flex-shrink:0; }
.stk-live .en-res .fi svg { width:17px; height:17px; }
.stk-live .en-res .nm { font-size:14px; font-weight:650; flex:1; }
.stk-live .en-res .mt { font-size:12px; color:var(--sub); }
.stk-live .en-res .dl { color:var(--sub); display:grid; place-items:center; }
.stk-live .en-res .dl svg { width:18px; height:18px; }
.stk-live .en-next { display:flex; align-items:center; gap:20px; flex-wrap:wrap; padding:24px; margin-bottom:24px; border-radius:var(--radius); box-shadow:var(--card-shadow); background:linear-gradient(120deg, var(--key-dim), var(--card)); }
.stk-live .en-next .tx { flex:1; min-width:220px; }
.stk-live .en-next .eb { font-size:11.5px; font-weight:750; letter-spacing:.12em; text-transform:uppercase; color:var(--key); }
.stk-live .en-next h3 { font-size:20px; font-weight:800; letter-spacing:-.03em; color:var(--text); margin:6px 0 4px; }
.stk-live .en-next p { font-size:13.5px; color:var(--muted); margin:0; }
.stk-live .en-next .en-btn { width:auto; padding:0 22px; }
.stk-live .en-share { display:flex; align-items:center; justify-content:center; gap:10px; padding:22px 0 40px; color:var(--sub); font-size:13px; }
.stk-live .en-sbtn { width:40px; height:40px; border-radius:999px; border:0; background:var(--card); box-shadow:var(--btn-shadow); color:var(--muted); cursor:pointer; display:grid; place-items:center; transition:transform .15s ease, color .15s ease; }
.stk-live .en-sbtn:hover { transform:translateY(-2px); color:var(--key); }
.stk-live .en-sbtn svg { width:16px; height:16px; }
`;

interface EndedScreenProps {
  webinar: { name: string; description: string | null };
  accent: string;
  text: string;
  surface: string;
  live: LivePageConfig;
  surveyUrl?: string;
  onReplay?: () => void;
  replayRequested?: boolean;
  replayPending?: boolean;
  onShare?: () => void;
  shareCopied?: boolean;
}

export default function EndedScreen({
  webinar, accent, text, surface, live, surveyUrl,
  onReplay, replayRequested, replayPending, onShare, shareCopied,
}: EndedScreenProps) {
  const css = useMemo(() => buildStkCss(accent || "#6D28D9", text || "#141320", surface || "#FFFFFF") + EXTRA_CSS, [accent, text, surface]);

  const showReplay = live.ended.replay && !!onReplay;
  const showSurvey = live.ended.survey && !!surveyUrl;
  const showResources = live.ended.resources && live.resources.length > 0;
  const showNext = live.ended.nextWebinar && !!live.nextWebinar;
  const showShare = live.ended.share && !!onShare;
  const actionCount = (showReplay ? 1 : 0) + (showSurvey ? 1 : 0);

  return (
    <div className="stk-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="live-inner">
        <div className="en-hero">
          <div className="en-check"><Check strokeWidth={2.6} /></div>
          {/* 어드민이 입력한 문구 우선, 비어 있으면 기본값. 줄바꿈은 pre-line 으로 살린다
              (제목의 줄바꿈 위치를 직접 정할 수 있어야 해서 <br /> 대신 실제 개행을 쓴다). */}
          <h1 className="live-title" style={{ whiteSpace: "pre-line" }}>
            {live.ended.title.trim() || DEFAULT_ENDED_TITLE}
          </h1>
          <p className="live-desc" style={{ whiteSpace: "pre-line" }}>
            {live.ended.description.trim() || DEFAULT_ENDED_DESCRIPTION}
          </p>
        </div>

        {actionCount > 0 && (
          <div className={`en-actions ${actionCount === 2 ? "two" : ""}`}>
            {showReplay && (
              <div className="en-act">
                <span className="ic"><Play /></span>
                <h3>다시보기</h3>
                <p>놓친 세션이 있어도 괜찮아요. 편집본 다시보기 링크를 이메일로 보내드립니다.</p>
                <motion.button whileTap={{ scale: 0.97 }} transition={spring} onClick={onReplay} disabled={replayRequested || replayPending} className="en-btn primary">
                  {replayRequested ? "신청 완료 ✓" : replayPending ? "신청 중…" : "다시보기 신청"}
                </motion.button>
              </div>
            )}
            {showSurvey && (
              <div className="en-act">
                <span className="ic"><ClipboardCheck /></span>
                <h3>1분 만족도 설문</h3>
                <p>오늘 어떠셨나요? 짧은 피드백이 다음 웨비나를 더 좋게 만들어요.</p>
                <a href={surveyUrl} target="_blank" rel="noopener noreferrer" className="en-btn soft">설문 참여하기</a>
              </div>
            )}
          </div>
        )}

        {showResources && (
          <div className="en-res">
            <div className="rh">받아가세요</div>
            {live.resources.map((r, i) => (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer">
                <span className="fi"><FileText /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="nm" style={{ display: "block" }}>{r.title}</span>
                  {r.meta && <span className="mt">{r.meta}</span>}
                </span>
                <span className="dl"><Download /></span>
              </a>
            ))}
          </div>
        )}

        {showNext && live.nextWebinar && (
          <div className="en-next">
            <div className="tx">
              <div className="eb">Next Webinar</div>
              <h3>{live.nextWebinar.title}</h3>
              {live.nextWebinar.when && <p>{live.nextWebinar.when}</p>}
            </div>
            {live.nextWebinar.url
              ? <a href={live.nextWebinar.url} target="_blank" rel="noopener noreferrer" className="en-btn primary">사전등록하고 알림 받기</a>
              : <span className="en-btn primary" style={{ opacity: .7 }}>준비 중</span>}
          </div>
        )}

        {showShare && (
          <div className="en-share">
            함께 들으면 좋은 동료에게 공유해요
            <button type="button" onClick={onShare} className="en-sbtn" aria-label="링크 복사"><Link2 /></button>
            {shareCopied && <span style={{ color: "var(--key)", fontWeight: 600 }}>복사됨 ✓</span>}
          </div>
        )}
        {!showShare && <div style={{ paddingBottom: 40 }} />}
      </div>
    </div>
  );
}
