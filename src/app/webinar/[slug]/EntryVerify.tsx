"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { buildStkCss } from "./LiveContentStk";

/**
 * 라이브 중 · 미인증 입장 확인 화면 (프레젠테이션 전용).
 * STK 디자인 시스템(buildStkCss)을 공유해 시청 화면과 톤을 맞춘다.
 */
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

const EXTRA_CSS = `
.stk-live .ev-wrap { max-width:460px; margin:0 auto; }
.stk-live .ev-card { border:1px solid var(--line-md); border-radius:var(--radius); background:var(--card); padding:28px 26px; }
.stk-live .ev-title { font-size:19px; font-weight:850; letter-spacing:-0.03em; color:var(--text); margin:0 0 6px; }
.stk-live .ev-sub { font-size:13.5px; line-height:1.6; color:var(--muted); margin:0 0 20px; word-break:keep-all; }
.stk-live .ev-seg { display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:4px; border-radius:var(--radius-sm); background:var(--key-dim); margin-bottom:12px; }
.stk-live .ev-seg-btn { position:relative; padding:9px 0; border:0; background:transparent; border-radius:9px; font-size:13px; font-weight:750; color:var(--muted); cursor:pointer; }
.stk-live .ev-seg-btn.on { color:#fff; }
.stk-live .ev-input { width:100%; padding:13px 15px; border-radius:var(--radius-sm); border:1px solid var(--line-md); background:rgba(127,127,127,0.06); color:var(--text); font-size:15px; outline:none; transition:border-color .15s ease; }
.stk-live .ev-input:focus { border-color:var(--key); }
.stk-live .ev-err { font-size:12.5px; color:#f87171; margin-top:8px; }
.stk-live .ev-primary { display:flex; align-items:center; justify-content:center; width:100%; height:48px; margin-top:16px; border:0; border-radius:var(--radius-sm); background:var(--key); color:#fff; font-size:14.5px; font-weight:800; cursor:pointer; }
.stk-live .ev-primary:disabled { opacity:0.5; cursor:not-allowed; }
.stk-live .ev-ghost { display:block; width:100%; margin-top:10px; padding:8px; border:0; background:transparent; color:var(--sub); font-size:13px; cursor:pointer; }
.stk-live .ev-ghost:hover { color:var(--muted); }
`;

interface EntryVerifyProps {
  webinar: { name: string; description: string | null };
  accent: string;
  text: string;
  surface: string;
  authMethod: "phone" | "email";
  authValue: string;
  verifyError: string;
  isVerifying: boolean;
  onAuthMethod: (m: "phone" | "email") => void;
  onAuthValueChange: (v: string) => void;
  onVerify: () => void;
  onGoSignup: () => void;
}

export default function EntryVerify({
  webinar, accent, text, surface,
  authMethod, authValue, verifyError, isVerifying,
  onAuthMethod, onAuthValueChange, onVerify, onGoSignup,
}: EntryVerifyProps) {
  const css = useMemo(() => buildStkCss(accent || "#FE5816", text || "#f0f0f2", surface || "#121216") + EXTRA_CSS, [accent, text, surface]);

  return (
    <div className="stk-live">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="live-inner">
        <div className="live-hero">
          <span className="live-badge"><span className="live-dot" />LIVE</span>
          <h1 className="live-title">{webinar.name}</h1>
          {webinar.description && <p className="live-desc">{webinar.description}</p>}
        </div>

        <div className="ev-wrap">
          <div className="ev-card">
            <h2 className="ev-title">웨비나 입장</h2>
            <p className="ev-sub">사전등록 시 입력한 전화번호 또는 이메일로 입장할 수 있어요.</p>

            <div className="ev-seg">
              {(["phone", "email"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onAuthMethod(m)}
                  className={`ev-seg-btn ${authMethod === m ? "on" : ""}`}
                >
                  {authMethod === m && (
                    <motion.span layoutId="ev-seg-bg" transition={spring}
                      className="absolute inset-0 rounded-[9px]" style={{ background: "var(--key)", zIndex: 0 }} />
                  )}
                  <span className="relative z-10">{m === "phone" ? "전화번호" : "이메일"}</span>
                </button>
              ))}
            </div>

            <input
              type={authMethod === "phone" ? "tel" : "email"}
              value={authValue}
              onChange={(e) => onAuthValueChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onVerify(); }}
              placeholder={authMethod === "phone" ? "01012345678" : "name@company.com"}
              className="ev-input"
            />
            {verifyError && <p className="ev-err">{verifyError}</p>}

            <motion.button whileTap={{ scale: 0.97 }} transition={spring}
              onClick={onVerify} disabled={isVerifying} className="ev-primary">
              {isVerifying ? "확인 중..." : "웨비나 입장하기"}
            </motion.button>
            <button type="button" onClick={onGoSignup} className="ev-ghost">
              아직 등록하지 않았다면 사전등록하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
