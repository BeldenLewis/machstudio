"use client";

import { useState, useEffect, useMemo, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Copy, Check, Code2, Monitor, Smartphone, ExternalLink,
  FileCode, ChevronDown, GripVertical,
} from "lucide-react";
import { toast } from "sonner";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface WebinarSession {
  id: string; number: number; title: string; speaker: string | null;
  startTime: string; endTime: string;
}

interface Webinar {
  slug: string; name: string; description: string | null;
  liveStartAt: string; liveEndAt: string; signupDeadline: string;
  theme: Record<string, string>; config: Record<string, unknown>;
  sessions: WebinarSession[];
}

interface BannerConfig {
  preText: string; liveText: string; endedText: string;
  registerLabel: string; enterLabel: string;
  calendarUrl: string; showCalendar: boolean;
  surveyUrl: string; surveyLabel: string;
  showVerify: boolean;
  icsTitle: string; icsDesc: string; icsLocation: string;
}

type RegistrationFieldType = "text" | "email" | "tel" | "select" | "checkbox";

interface RegistrationFieldConfig {
  id: string;
  key: string;
  label: string;
  type: RegistrationFieldType;
  placeholder?: string;
  required: boolean;
  enabled: boolean;
  options?: string[];
  system?: boolean;
}

interface RegistrationFormConfig {
  fields: RegistrationFieldConfig[];
  privacyText: string;
  marketingText: string;
  submitLabel: string;
}

type EmbedType = "banner" | "live-page";
type PreviewDevice = "desktop" | "mobile";
type BannerMode = "auto" | "pre" | "live" | "ended";

function Sect({
  id,
  title,
  current,
  onChange,
  children,
}: {
  id: string;
  title: string;
  current: string;
  onChange: (id: string) => void;
  children: ReactNode;
}) {
  const open = current === id;
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(open ? "" : id)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-secondary/50 transition-colors"
      >
        {title}
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-secondary/10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Fld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-0.5 py-1.5 select-none">
      <motion.button
        whileTap={{ scale: 0.94 }}
        transition={spring}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/30 ${checked ? "bg-violet-500" : "bg-secondary border border-border"}`}
      >
        <motion.span
          layout
          transition={spring}
          className={`block h-5 w-5 rounded-full bg-white shadow-sm ${checked ? "translate-x-5" : "translate-x-0"}`}
        />
      </motion.button>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className="min-w-0 text-left text-sm leading-5 text-foreground"
      >
        {label}
      </button>
    </div>
  );
}

// ─── 색상 유틸 ─────────────────────────────────────────────────────
function hexToRgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}
function lightenHex(hex: string, pct: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const m = (v: number) => Math.min(255, Math.round(v + (255 - v) * pct));
  return `#${m(r).toString(16).padStart(2, "0")}${m(g).toString(16).padStart(2, "0")}${m(b).toString(16).padStart(2, "0")}`;
}
function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const defaultRegistrationFieldsForEmbed: RegistrationFieldConfig[] = [
  { id: "name", key: "name", label: "이름", type: "text", placeholder: "홍길동", required: true, enabled: true, system: true },
  { id: "phone", key: "phone", label: "연락처", type: "tel", placeholder: "01012345678", required: false, enabled: true, system: true },
  { id: "email", key: "email", label: "이메일", type: "email", placeholder: "name@company.com", required: false, enabled: true, system: true },
  { id: "company", key: "company", label: "회사명", type: "text", placeholder: "(주)회사명", required: false, enabled: true, system: true },
  { id: "department", key: "department", label: "부서", type: "text", placeholder: "마케팅팀", required: false, enabled: true, system: true },
  { id: "jobTitle", key: "jobTitle", label: "직함", type: "text", placeholder: "팀장", required: false, enabled: true, system: true },
  { id: "industry", key: "industry", label: "업종", type: "text", placeholder: "이커머스", required: false, enabled: true, system: true },
];

function normalizeRegistrationFormForEmbed(config: Record<string, unknown>): RegistrationFormConfig {
  const raw = config.registrationForm as Partial<RegistrationFormConfig> | undefined;
  const savedFields = Array.isArray(raw?.fields) ? raw.fields : [];
  const validTypes = ["text", "email", "tel", "select", "checkbox"];
  const merged = defaultRegistrationFieldsForEmbed.map((field) => ({
    ...field,
    ...savedFields.find((item) => item && item.key === field.key),
    id: field.id,
    key: field.key,
    system: true,
    type: (validTypes.includes(String(savedFields.find((item) => item && item.key === field.key)?.type ?? field.type))
      ? savedFields.find((item) => item && item.key === field.key)?.type ?? field.type
      : field.type) as RegistrationFieldType,
  }));
  const customFields = savedFields
    .filter((item) => item && !defaultRegistrationFieldsForEmbed.some((field) => field.key === item.key))
    .map((item, index) => ({
      id: String(item.id ?? item.key ?? `custom_${index}`),
      key: String(item.key ?? `custom_${index}`),
      label: String(item.label ?? "커스텀 필드"),
      type: (validTypes.includes(String(item.type)) ? item.type : "text") as RegistrationFieldType,
      placeholder: String(item.placeholder ?? ""),
      required: Boolean(item.required),
      enabled: item.enabled !== false,
      options: Array.isArray(item.options) ? item.options.map(String) : [],
      system: false,
    }));

  return {
    fields: [...merged, ...customFields],
    privacyText: raw?.privacyText ?? "[필수] 개인정보 수집 및 이용에 동의합니다",
    marketingText: raw?.marketingText ?? "[선택] 마케팅 정보 수신에 동의합니다",
    submitLabel: raw?.submitLabel ?? "사전 등록 완료",
  };
}

// ─── 배너 HTML 생성 ────────────────────────────────────────────────
function generateBannerHtml(
  webinar: Webinar,
  cfg: BannerConfig,
  apiBase: string,
  liveUrl: string,
  registerUrl: string,
  forceMode?: "pre" | "live" | "ended"
): string {
  const accent  = webinar.theme?.accentColor  ?? "#6d28d9";
  const font    = webinar.theme?.font         ?? "Pretendard";
  const radius  = webinar.theme?.borderRadius ?? "16px";

  const accentHover = lightenHex(accent, 0.18);
  const accentGlow  = hexToRgba(accent, 0.28);
  const accentDim   = hexToRgba(accent, 0.14);
  const accentBdr   = hexToRgba(accent, 0.24);
  const registrationForm = normalizeRegistrationFormForEmbed(webinar.config ?? {});

  const liveStart = new Date(webinar.liveStartAt).toISOString();
  const liveEnd   = new Date(webinar.liveEndAt).toISOString();
  const signupDdl = new Date(webinar.signupDeadline).toISOString();

  // ICS datetime format: 20260521T140000Z
  const toICSDate = (iso: string) => iso.replace(/[-:]/g, "").split(".")[0] + "Z";
  const previewMode = forceMode ?? null;
  const previewSubText = (() => {
    if (!previewMode) return "불러오는 중...";
    if (previewMode === "live") return "지금 라이브 진행 중";
    if (previewMode === "ended") return "웨비나가 종료되었습니다";
    const diff = new Date(webinar.signupDeadline).getTime() - Date.now();
    if (diff <= 0) return "사전등록이 마감되었습니다";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    return days > 0 ? `사전등록 마감까지 D-${days}` : `마감까지 ${hours}시간`;
  })();
  const previewText = previewMode === "pre" ? cfg.preText : previewMode === "live" ? cfg.liveText : previewMode === "ended" ? cfg.endedText : "";
  const previewSubStyle = previewMode === "live"
    ? " style=\"color:#4ade80\""
    : previewMode === "ended"
      ? " style=\"color:#a5b4fc\""
      : "";
  const previewDotStyle = previewMode === "live"
    ? " style=\"background:#22c55e\""
    : previewMode === "ended"
      ? " style=\"background:#6366f1;animation:none\""
      : "";
  const previewCtas = (() => {
    if (!previewMode) return "";
    if (previewMode === "ended") {
      return cfg.surveyUrl
        ? `<a class="xf-btn xf-btn-primary" href="${escapeHtml(cfg.surveyUrl)}" target="_blank" rel="noopener noreferrer">${cfg.surveyLabel || "만족도 조사 참여하기"}</a>`
        : "";
    }
    if (previewMode === "live") {
      return `<a class="xf-btn xf-btn-secondary" href="javascript:void(0)" data-xf-open-register="true">${cfg.registerLabel}</a><a class="xf-btn xf-btn-primary" href="${cfg.showVerify ? "javascript:void(0)" : escapeHtml(liveUrl)}"${cfg.showVerify ? ' data-xf-open-verify="true"' : ""}>${cfg.enterLabel}</a>`;
    }
    return `${cfg.showCalendar ? '<a class="xf-btn xf-btn-secondary" href="javascript:void(0)" data-xf-calendar="true">캘린더 추가</a>' : ""}<a class="xf-btn xf-btn-primary" href="javascript:void(0)" data-xf-open-register="true">${cfg.registerLabel}</a>`;
  })();

  return `<!-- mach 웨비나 배너 (${webinar.slug}) -->
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.min.css');

.xf-banner,.xf-banner *,.xf-banner *::before,.xf-banner *::after,
.xf-overlay,.xf-overlay *,.xf-overlay *::before,.xf-overlay *::after{box-sizing:border-box;}

/* ── 배너 ── */
.xf-banner{
  position:fixed!important;left:50%!important;
  bottom:calc(24px + env(safe-area-inset-bottom))!important;
  transform:translate3d(-50%,120%,0)!important;
  width:720px;max-width:calc(100vw - 48px);
  border-radius:18px;
  background:linear-gradient(180deg,rgba(24,24,28,.93),rgba(14,14,18,.9));
  border:1px solid ${accentBdr};
  color:#fff;font-family:'${font}',Pretendard,-apple-system,sans-serif;
  box-shadow:0 18px 54px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.04) inset;
  backdrop-filter:blur(24px) saturate(1.5);-webkit-backdrop-filter:blur(24px) saturate(1.5);
  z-index:999900!important;overflow:hidden;
  -webkit-font-smoothing:antialiased;will-change:transform;
  transition:transform .55s cubic-bezier(.34,1.3,.64,1);
}
.xf-banner.xf-visible{transform:translate3d(-50%,0,0)!important;}

.xf-banner::before{
  content:'';position:absolute;left:16px;right:16px;top:0;height:1px;
  background:linear-gradient(90deg,transparent,${accent},transparent);
  opacity:.55;pointer-events:none;
}

.xf-inner{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 14px 14px 22px;}
.xf-text-area{display:flex;flex-direction:column;gap:5px;min-width:0;}
.xf-text{margin:0;color:rgba(255,255,255,.94);font-size:15px;font-weight:700;line-height:1.42;letter-spacing:-.25px;word-break:keep-all;}
.xf-accent{color:${accent};font-weight:900;}

.xf-sub{display:inline-flex;align-items:center;gap:6px;color:#ffb84d;font-size:12px;font-weight:700;letter-spacing:-.05px;}
.xf-dot{width:6px;height:6px;border-radius:50%;background:${accent};flex:0 0 auto;animation:xf-pulse 1.8s ease-in-out infinite;}
@keyframes xf-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.32;transform:scale(.74);}}

.xf-live-badge{
  display:inline-flex;align-items:center;gap:6px;margin-right:6px;
  padding:3px 9px;border-radius:7px;
  background:rgba(34,197,94,.14);border:1px solid rgba(34,197,94,.3);
  color:#4ade80;font-size:11px;font-weight:900;letter-spacing:.04em;
}
.xf-live-dot{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:xf-pulse 1.4s ease-in-out infinite;}

.xf-ctas{display:flex;align-items:center;gap:8px;flex:0 0 auto;}

.xf-btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;
  min-height:44px;padding:11px 18px;border-radius:12px;border:none;
  font-family:'${font}',Pretendard,sans-serif;font-size:13px;font-weight:800;letter-spacing:-.15px;
  text-decoration:none;white-space:nowrap;cursor:pointer;
  transition:transform .18s ease,background .18s ease,box-shadow .18s ease,opacity .1s;
  user-select:none;-webkit-user-select:none;
}
.xf-btn:active{transform:scale(.955)!important;opacity:.88;}

.xf-btn-primary{
  background:${accent};color:#fff!important;
  box-shadow:0 6px 20px ${accentGlow};
  animation:xf-nudge 3.2s ease-in-out infinite;
}
@keyframes xf-nudge{
  0%,62%,100%{transform:translateY(0);}
  72%{transform:translateY(-4px);}
  82%{transform:translateY(0);}
  90%{transform:translateY(-2px);}
}
.xf-btn-primary:hover{background:${accentHover};transform:translateY(-2px);box-shadow:0 10px 28px ${accentGlow};animation:none;}

.xf-btn-secondary{
  background:rgba(255,255,255,.075);color:rgba(255,255,255,.88)!important;
  border:1px solid rgba(255,255,255,.14);
}
.xf-btn-secondary:hover{background:rgba(255,255,255,.13);transform:translateY(-2px);}

.xf-btn-icon{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:0 0 auto;}

/* ── 모달 ── */
.xf-overlay{
  display:none;position:fixed!important;inset:0;
  z-index:1000002!important;align-items:center;justify-content:center;padding:22px;
  background:rgba(0,0,0,0);
  backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);
  font-family:'${font}',Pretendard,-apple-system,sans-serif;
  transition:background .25s,backdrop-filter .25s;
}
.xf-overlay.xf-open{display:flex;background:rgba(0,0,0,.70);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}

.xf-modal{
  position:relative;width:100%;max-width:420px;padding:32px 28px 26px;
  border-radius:${radius};
  background:radial-gradient(circle at 50% 0%,${accentDim},transparent 34%),#1a1a1f;
  border:1px solid rgba(255,255,255,.11);color:#fff;
  box-shadow:0 28px 70px rgba(0,0,0,.55);overflow:hidden;
  transform:scale(.93) translateY(18px);opacity:0;
  transition:transform .3s cubic-bezier(.34,1.4,.64,1),opacity .25s ease;
}
.xf-overlay.xf-open .xf-modal{transform:scale(1) translateY(0);opacity:1;}

.xf-modal::before{
  content:'';position:absolute;top:0;left:18%;right:18%;
  height:2px;border-radius:999px;
  background:linear-gradient(90deg,transparent,${accent},transparent);
}

.xf-modal-close{
  position:absolute;top:14px;right:14px;width:30px;height:30px;
  display:flex;align-items:center;justify-content:center;
  border-radius:8px;border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);
  font-size:18px;cursor:pointer;transition:background .15s,color .15s,transform .12s;
}
.xf-modal-close:hover{background:rgba(255,255,255,.14);color:#fff;}
.xf-modal-close:active{transform:scale(.9);}

.xf-modal-title{margin:0 34px 7px 0;font-size:20px;font-weight:900;letter-spacing:-.4px;}
.xf-modal-desc{margin:0 0 20px;color:rgba(255,255,255,.60);font-size:13px;line-height:1.6;word-break:keep-all;}

.xf-tabs{display:flex;gap:4px;margin-bottom:14px;padding:4px;border-radius:10px;background:rgba(255,255,255,.06);position:relative;overflow:hidden;}
.xf-tabs::before{
  content:'';position:absolute;top:4px;bottom:4px;left:4px;
  width:calc((100% - 12px)/2);border-radius:8px;
  background:rgba(255,255,255,.14);
  box-shadow:0 8px 18px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.04) inset;
  transform:translateX(0);
  transition:transform .28s cubic-bezier(.2,.8,.2,1),background .2s;
}
.xf-tabs[data-active="email"]::before{transform:translateX(calc(100% + 4px));}
.xf-tab{
  position:relative;z-index:1;
  flex:1;padding:10px 0;border:none;border-radius:8px;
  background:transparent;color:rgba(255,255,255,.45);
  font-family:inherit;font-size:13px;font-weight:800;
  cursor:pointer;transition:color .2s,transform .12s;
}
.xf-tab:active{transform:scale(.96);}
.xf-tab.xf-tab-on{color:#fff;}
.xf-auth-field{
  transform:translateY(0);opacity:1;
  transition:opacity .18s ease,transform .18s ease;
}
.xf-auth-field.xf-switching{opacity:0;transform:translateY(6px);}

.xf-input{
  width:100%;height:47px;padding:13px 15px;
  border-radius:10px;border:1px solid rgba(255,255,255,.13);
  background:rgba(255,255,255,.06);color:#fff;
  font-family:inherit;font-size:14px;outline:none;
  transition:border-color .2s,background .2s,box-shadow .2s;
}
.xf-input::placeholder{color:rgba(255,255,255,.28);}
.xf-input:focus{
  border-color:${accent}cc;background:rgba(255,255,255,.09);
  box-shadow:0 0 0 3px ${accentDim};
}

.xf-submit{
  width:100%;min-height:48px;margin-top:11px;padding:13px 0;
  border:none;border-radius:10px;background:${accent};
  color:#fff;font-family:inherit;font-size:14px;font-weight:900;
  cursor:pointer;transition:background .18s,transform .18s,box-shadow .18s;
}
.xf-submit:hover{background:${accentHover};transform:translateY(-1px);box-shadow:0 8px 22px ${accentGlow};}
.xf-submit:active{transform:scale(.97);box-shadow:none;}
.xf-submit:disabled{background:rgba(255,255,255,.08);color:rgba(255,255,255,.28);cursor:not-allowed;transform:none;box-shadow:none;}

.xf-msg{display:none;margin-top:13px;padding:12px 15px;border-radius:10px;font-size:13px;font-weight:500;line-height:1.55;}
.xf-msg.xf-ok{display:block;background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.25);color:#4ade80;}
.xf-msg.xf-err{display:block;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.25);color:#f87171;}

.xf-enter-link{
  display:inline-flex;align-items:center;justify-content:center;
  margin-top:10px;padding:11px 20px;border-radius:9px;
  background:${accent};color:#fff!important;text-decoration:none;
  font-size:14px;font-weight:900;
  transition:background .18s,transform .18s;
}
.xf-enter-link:hover{background:${accentHover};transform:translateY(-1px);}
.xf-enter-link:active{transform:scale(.97);}

.xf-register-modal{max-width:520px;max-height:min(720px,calc(100vh - 44px));overflow:auto;}
.xf-reg-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.xf-reg-field{min-width:0;}
.xf-reg-field.xf-full{grid-column:1/-1;}
.xf-reg-label{display:block;margin:0 0 6px;color:rgba(255,255,255,.58);font-size:12px;font-weight:800;letter-spacing:-.05px;}
.xf-reg-check{
  display:flex;align-items:flex-start;gap:9px;margin-top:10px;
  color:rgba(255,255,255,.66);font-size:12px;line-height:1.55;cursor:pointer;word-break:keep-all;
}
.xf-reg-check input{width:auto;height:auto;margin-top:3px;accent-color:${accent};flex:0 0 auto;}
.xf-reg-note{margin:0 0 16px;color:rgba(255,255,255,.55);font-size:12px;line-height:1.55;word-break:keep-all;}

/* ── 반응형 ── */
@media(max-width:600px){
  .xf-banner{
    left:12px!important;right:12px!important;
    bottom:calc(12px + env(safe-area-inset-bottom))!important;
    width:auto!important;max-width:none!important;
    transform:translate3d(0,120%,0)!important;
    border-radius:16px;
  }
  .xf-banner.xf-visible{transform:translate3d(0,0,0)!important;}
  .xf-inner{flex-direction:column;align-items:stretch;gap:12px;padding:16px 14px 15px;}
  .xf-text{font-size:14px;white-space:normal;}
  .xf-ctas{width:100%;display:grid;grid-template-columns:1fr 1.25fr;gap:7px;}
  .xf-btn{width:100%;min-height:46px;font-size:13px;}
  .xf-reg-grid{grid-template-columns:1fr;}
  .xf-reg-field{grid-column:1/-1;}
}
</style>

<!-- 배너 -->
<div id="xf-banner" class="xf-banner${forceMode ? " xf-visible" : ""}">
  <div class="xf-inner">
    <div class="xf-text-area">
      <p class="xf-text" id="xf-text">${previewText}</p>
      <div class="xf-sub" id="xf-sub"${previewSubStyle}>
        <span class="xf-dot"${previewDotStyle}></span><span id="xf-sub-text">${previewSubText}</span>
      </div>
    </div>
    <div class="xf-ctas" id="xf-ctas">${previewCtas}</div>
  </div>
</div>

<!-- 인증 모달 -->
<div id="xf-overlay" class="xf-overlay">
  <div class="xf-modal">
    <button class="xf-modal-close" id="xf-modal-close">×</button>
    <div class="xf-modal-title">웨비나 입장 확인</div>
    <p class="xf-modal-desc">사전 등록 시 입력하신 연락처 또는 이메일을 입력해주세요.</p>
    <div class="xf-tabs" data-active="phone">
      <button class="xf-tab xf-tab-on" data-tab="phone">연락처</button>
      <button class="xf-tab" data-tab="email">이메일</button>
    </div>
    <div id="xf-phone-field" class="xf-auth-field"><input type="tel" class="xf-input" id="xf-phone" placeholder="01012345678" maxlength="11"></div>
    <div id="xf-email-field" class="xf-auth-field" style="display:none"><input type="email" class="xf-input" id="xf-email" placeholder="example@email.com"></div>
    <button class="xf-submit" id="xf-submit">확인하기</button>
    <div class="xf-msg" id="xf-msg"></div>
  </div>
</div>

<!-- 사전등록 모달 -->
<div id="xf-register-overlay" class="xf-overlay">
  <div class="xf-modal xf-register-modal">
    <button class="xf-modal-close" id="xf-register-close">×</button>
    <div class="xf-modal-title">사전등록</div>
    <p class="xf-reg-note">${escapeHtml(webinar.name)} 참여 정보를 입력해주세요.</p>
    <div class="xf-reg-grid" id="xf-register-fields"></div>
    <label class="xf-reg-check"><input type="checkbox" id="xf-reg-privacy"><span id="xf-reg-privacy-text"></span></label>
    <label class="xf-reg-check"><input type="checkbox" id="xf-reg-marketing"><span id="xf-reg-marketing-text"></span></label>
    <button class="xf-submit" id="xf-register-submit">사전등록하기</button>
    <div class="xf-msg" id="xf-register-msg"></div>
  </div>
</div>

<script>
(function(){
  'use strict';
  if(window.__XF_BANNER_INIT__)return;
  window.__XF_BANNER_INIT__=true;

  var SLUG     = "${webinar.slug}";
  var API      = "${apiBase}";
  var LIVE_URL = "${liveUrl}";
  var REGISTER_URL = "${registerUrl}";
  var FORCE_MODE = ${forceMode ? `"${forceMode}"` : "null"};

  var TIMES = {
    liveStart:   new Date("${liveStart}").getTime(),
    liveEnd:     new Date("${liveEnd}").getTime(),
    signupClose: new Date("${signupDdl}").getTime()
  };

  var ICS = {
    title:    ${JSON.stringify(cfg.icsTitle    || webinar.name)},
    desc:     ${JSON.stringify(cfg.icsDesc     || webinar.description || "")},
    location: ${JSON.stringify(cfg.icsLocation || "Online")},
    dtstart:  "${toICSDate(liveStart)}",
    dtend:    "${toICSDate(liveEnd)}"
  };

  var TEXT = {
    pre:       ${JSON.stringify(cfg.preText)},
    live:      ${JSON.stringify(cfg.liveText)},
    ended:     ${JSON.stringify(cfg.endedText)},
    register:  ${JSON.stringify(cfg.registerLabel)},
    enter:     ${JSON.stringify(cfg.enterLabel)},
    survey:    ${JSON.stringify(cfg.surveyLabel || "만족도 조사 참여하기")},
    surveyUrl: ${JSON.stringify(cfg.surveyUrl || "")},
    calUrl:    ${JSON.stringify(cfg.calendarUrl || "")},
    showCal:   ${cfg.showCalendar},
    showVerify:${cfg.showVerify},
  };
  var REG_FORM = ${JSON.stringify(registrationForm)};

  /* ── DOM ── */
  var banner   =document.getElementById('xf-banner');
  var textEl   =document.getElementById('xf-text');
  var subEl    =document.getElementById('xf-sub');
  var subText  =document.getElementById('xf-sub-text');
  var ctasEl   =document.getElementById('xf-ctas');
  var overlay  =document.getElementById('xf-overlay');
  var closeBtn =document.getElementById('xf-modal-close');
  var submitBtn=document.getElementById('xf-submit');
  var msgEl    =document.getElementById('xf-msg');
  var phoneInp =document.getElementById('xf-phone');
  var emailInp =document.getElementById('xf-email');
  var phoneField=document.getElementById('xf-phone-field');
  var emailField=document.getElementById('xf-email-field');
  var tabs     =document.querySelectorAll('.xf-tab');
  var registerOverlay=document.getElementById('xf-register-overlay');
  var registerClose=document.getElementById('xf-register-close');
  var registerFields=document.getElementById('xf-register-fields');
  var registerSubmit=document.getElementById('xf-register-submit');
  var registerMsg=document.getElementById('xf-register-msg');
  var registerPrivacy=document.getElementById('xf-reg-privacy');
  var registerMarketing=document.getElementById('xf-reg-marketing');
  var activeTab='phone';

  if(banner&&banner.parentElement!==document.body)document.body.appendChild(banner);
  if(overlay&&overlay.parentElement!==document.body)document.body.appendChild(overlay);
  if(registerOverlay&&registerOverlay.parentElement!==document.body)document.body.appendChild(registerOverlay);

  function getMode(){
    if(FORCE_MODE)return FORCE_MODE;
    var now=Date.now();
    if(now>TIMES.liveEnd)return'ended';
    if(now>=TIMES.liveStart)return'live';
    return'pre';
  }

  /* ── ICS 다운로드 ── */
  function downloadICS(){
    var lines=[
      'BEGIN:VCALENDAR','VERSION:2.0',
      'PRODID:-//mach//Webinar//KR',
      'CALSCALE:GREGORIAN','METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:'+SLUG+'@mach.app',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z',
      'DTSTART:'+ICS.dtstart,
      'DTEND:'+ICS.dtend,
      'SUMMARY:'+ICS.title,
      'DESCRIPTION:'+ICS.desc,
      'LOCATION:'+ICS.location,
      'BEGIN:VALARM','TRIGGER:-PT60M','ACTION:DISPLAY','DESCRIPTION:1시간 후 시작','END:VALARM',
      'END:VEVENT','END:VCALENDAR'
    ];
    var blob=new Blob([lines.join('\\r\\n')],{type:'text/calendar;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=SLUG+'.ics';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ── CTA 버튼 생성 ── */
  function btn(type){
    var b=document.createElement('button');
    b.type='button';
    b.className='xf-btn xf-btn-'+type;
    return b;
  }

  function showPreviewAction(action){
    var box=document.getElementById('xf-preview-state');
    var title=document.getElementById('xf-preview-title');
    var desc=document.getElementById('xf-preview-desc');
    if(!box||!title||!desc)return false;
    if(action==='register'){
      title.textContent='사전등록 화면';
      desc.textContent='실제 임베드에서는 라이브 페이지의 사전등록 폼으로 이동합니다.';
    }else if(action==='live'){
      title.textContent='라이브 페이지';
      desc.textContent='실제 임베드에서는 웨비나 라이브 페이지로 이동합니다.';
    }else{
      title.textContent='만족도 조사';
      desc.textContent='실제 임베드에서는 설정한 설문 링크로 이동합니다.';
    }
    box.classList.add('xf-on');
    return true;
  }

  function buildCtas(mode){
    ctasEl.innerHTML='';

    if(mode==='ended'){
      if(TEXT.surveyUrl){
        var s=document.createElement('a');
        s.className='xf-btn xf-btn-primary';
        s.innerHTML=svgEdit()+TEXT.survey;
        s.href=TEXT.surveyUrl;s.target='_blank';s.rel='noopener noreferrer';
        ctasEl.appendChild(s);
      }
      return;
    }

    if(mode==='live'){
      var r=btn('secondary');r.textContent=TEXT.register;
      r.setAttribute('data-xf-open-register','true');
      ctasEl.appendChild(r);
      var e2=btn('primary');
      e2.innerHTML=svgPlay()+TEXT.enter;
      if(TEXT.showVerify)e2.setAttribute('data-xf-open-verify','true');
      else e2.setAttribute('data-xf-open-live','true');
      ctasEl.appendChild(e2);
      return;
    }

    /* pre */
    if(TEXT.showCal){
      var c=btn('secondary');
      c.innerHTML=svgCal()+'캘린더 추가';
      c.addEventListener('click',function(ev){
        ev.preventDefault();
        if(window.innerWidth<=1024){
          downloadICS();
        } else if(TEXT.calUrl){
          window.open(TEXT.calUrl,'_blank');
        } else {
          downloadICS();
        }
      });
      ctasEl.appendChild(c);
    }
    var r2=btn('primary');r2.textContent=TEXT.register;
    r2.setAttribute('data-xf-open-register','true');
    ctasEl.appendChild(r2);
  }

  /* ── 카운트다운 ── */
  function updateSub(mode){
    if(mode==='live'){
      subEl.style.color='#4ade80';
      var d=subEl.querySelector('.xf-dot');if(d)d.style.background='#22c55e';
      subText.textContent='지금 라이브 진행 중';return;
    }
    if(mode==='ended'){
      subEl.style.color='#a5b4fc';
      var d2=subEl.querySelector('.xf-dot');if(d2){d2.style.background='#6366f1';d2.style.animation='none';}
      subText.textContent='웨비나가 종료되었습니다';return;
    }
    var diff=TIMES.signupClose-Date.now();
    if(diff<=0){subText.textContent='사전등록이 마감되었습니다';return;}
    var days=Math.floor(diff/86400000),hrs=Math.floor(diff%86400000/3600000);
    subText.textContent=days>0?('사전등록 마감까지 D-'+days):('마감까지 '+hrs+'시간');
  }

  /* ── 사전등록 모달 ── */
  function renderRegisterFields(){
    if(!registerFields)return;
    var fields=(REG_FORM.fields||[]).filter(function(f){return f.enabled!==false;});
    registerFields.innerHTML=fields.map(function(f){
      var req=f.required?' *':'';
      var full=(f.type==='checkbox'||f.type==='select')?' xf-full':'';
      var system=f.system!==false?'1':'0';
      var label=esc(f.label||'필드')+req;
      var placeholder=escAttr(f.placeholder||'');
      var key=escAttr(f.key||'');
      if(f.type==='checkbox'){
        return '<label class="xf-reg-check xf-reg-field xf-full"><input type="checkbox" data-reg-key="'+key+'" data-reg-system="'+system+'" data-reg-type="checkbox"><span>'+label+'</span></label>';
      }
      if(f.type==='select'){
        var options=(f.options||[]).map(function(opt){return '<option value="'+escAttr(opt)+'">'+esc(opt)+'</option>';}).join('');
        return '<div class="xf-reg-field'+full+'"><label class="xf-reg-label">'+label+'</label><select class="xf-input" data-reg-key="'+key+'" data-reg-system="'+system+'" data-reg-type="select"><option value="">'+esc(f.placeholder||'선택해주세요')+'</option>'+options+'</select></div>';
      }
      var inputType=f.type==='email'?'email':f.type==='tel'?'tel':'text';
      var inputMode=f.type==='tel'?' inputmode="tel"':'';
      return '<div class="xf-reg-field'+full+'"><label class="xf-reg-label">'+label+'</label><input class="xf-input" type="'+inputType+'"'+inputMode+' data-reg-key="'+key+'" data-reg-system="'+system+'" data-reg-type="'+escAttr(f.type||'text')+'" placeholder="'+placeholder+'"></div>';
    }).join('');

    var privacyText=document.getElementById('xf-reg-privacy-text');
    var marketingText=document.getElementById('xf-reg-marketing-text');
    if(privacyText)privacyText.textContent=REG_FORM.privacyText||'[필수] 개인정보 수집 및 이용에 동의합니다';
    if(marketingText)marketingText.textContent=REG_FORM.marketingText||'[선택] 마케팅 정보 수신에 동의합니다';
    if(registerSubmit)registerSubmit.textContent=REG_FORM.submitLabel||TEXT.register;
  }

  function openRegister(){
    renderRegisterFields();
    if(registerPrivacy)registerPrivacy.checked=false;
    if(registerMarketing)registerMarketing.checked=false;
    if(registerMsg){registerMsg.className='xf-msg';registerMsg.innerHTML='';}
    if(registerSubmit){registerSubmit.disabled=false;registerSubmit.textContent=REG_FORM.submitLabel||TEXT.register;}
    if(registerOverlay)registerOverlay.classList.add('xf-open');
    setTimeout(function(){
      var first=registerFields&&registerFields.querySelector('input:not([type="checkbox"]),select');
      if(first)first.focus();
    },120);
  }

  function closeRegister(){
    if(registerOverlay)registerOverlay.classList.remove('xf-open');
  }

  function collectRegisterPayload(){
    var payload={customFields:{},agreePrivacy:registerPrivacy&&registerPrivacy.checked,agreeMarketing:registerMarketing&&registerMarketing.checked};
    var fields=(REG_FORM.fields||[]).filter(function(f){return f.enabled!==false;});
    fields.forEach(function(f){
      var el=findRegElement(registerFields,f.key||'');
      if(!el)return;
      var value=f.type==='checkbox'?!!el.checked:String(el.value||'').trim();
      if(f.required&&(f.type==='checkbox'?!value:!value)){
        throw new Error((f.label||'필수 항목')+' 항목을 입력해주세요.');
      }
      if(f.system!==false){
        payload[f.key]=value;
      }else{
        payload.customFields[f.key]=value;
      }
    });
    if(!payload.name)throw new Error('이름 항목을 입력해주세요.');
    if(!payload.agreePrivacy)throw new Error(REG_FORM.privacyText||'개인정보 수집 및 이용 동의가 필요합니다.');
    return payload;
  }

  function submitRegister(){
    if(!registerSubmit||registerSubmit.disabled)return;
    var payload;
    try{
      payload=collectRegisterPayload();
    }catch(err){
      showRegisterMsg('err',esc(err&&err.message?err.message:'필수 항목을 확인해주세요.'));
      return;
    }
    registerSubmit.disabled=true;
    registerSubmit.textContent='등록 중...';
    if(registerMsg)registerMsg.className='xf-msg';
    fetch(API+'/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json().then(function(d){return{ok:r.ok,data:d};});})
    .then(function(res){
      if(res.ok&&res.data&&res.data.registration){
        showRegisterMsg('ok','사전등록이 완료되었습니다. 입장 확인에서 전화번호 또는 이메일로 입장할 수 있습니다.');
        setTimeout(closeRegister,1400);
      }else{
        showRegisterMsg('err',esc(res.data&&res.data.error?res.data.error:'등록에 실패했습니다.'));
      }
    })
    .catch(function(){showRegisterMsg('err','일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');})
    .finally(function(){
      registerSubmit.disabled=false;
      registerSubmit.textContent=REG_FORM.submitLabel||TEXT.register;
    });
  }

  function showRegisterMsg(t,h){
    if(!registerMsg)return;
    registerMsg.className='xf-msg xf-'+t;
    registerMsg.innerHTML=h;
  }

  function findRegElement(root,key){
    var all=root?root.querySelectorAll('[data-reg-key]'):[];
    for(var i=0;i<all.length;i++){
      if(all[i].getAttribute('data-reg-key')===String(key))return all[i];
    }
    return null;
  }

  /* ── 초기화 ── */
  function init(){
    var mode=getMode();
    var modeText=mode==='pre'?TEXT.pre:mode==='live'?TEXT.live:TEXT.ended;
    if(textEl)textEl.innerHTML=modeText;
    updateSub(mode);
    buildCtas(mode);
    if(banner)banner.classList.add('xf-visible');
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
  setInterval(function(){
    if(FORCE_MODE)return;
    var m=getMode();
    updateSub(m);
    buildCtas(m);
    textEl.innerHTML=m==='pre'?TEXT.pre:m==='live'?TEXT.live:TEXT.ended;
  },60000);

  /* ── 인증 모달 ── */
  function openVerify(){
    overlay.classList.add('xf-open');resetModal();
    setTimeout(function(){phoneInp&&phoneInp.focus();},120);
  }
  function closeVerify(){overlay.classList.remove('xf-open');resetModal();}
  function resetModal(){
    if(phoneInp)phoneInp.value='';if(emailInp)emailInp.value='';
    msgEl.className='xf-msg';msgEl.innerHTML='';
    submitBtn.style.display='block';submitBtn.disabled=false;submitBtn.textContent='확인하기';
  }

  closeBtn&&closeBtn.addEventListener('click',closeVerify);
  overlay&&overlay.addEventListener('click',function(e){if(e.target===overlay)closeVerify();});
  registerClose&&registerClose.addEventListener('click',closeRegister);
  registerOverlay&&registerOverlay.addEventListener('click',function(e){if(e.target===registerOverlay)closeRegister();});
  registerSubmit&&registerSubmit.addEventListener('click',submitRegister);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeVerify();closeRegister();}});
  document.addEventListener('click',function(e){
    var target=e.target&&e.target.closest?e.target:null;
    if(!target)return;
    if(target.closest('[data-xf-open-register]')){
      e.preventDefault();
      openRegister();
      return;
    }
    if(target.closest('[data-xf-open-verify]')){
      e.preventDefault();
      openVerify();
      return;
    }
    if(target.closest('[data-xf-open-live]')){
      e.preventDefault();
      window.location.href=LIVE_URL;
      return;
    }
    if(target.closest('[data-xf-calendar]')){
      e.preventDefault();
      TEXT.calUrl?window.open(TEXT.calUrl,'_blank'):downloadICS();
    }
  });
  document.querySelectorAll('[data-xf-preview-action]').forEach(function(el){
    el.addEventListener('click',function(e){
      var action=this.getAttribute('data-xf-preview-action');
      e.preventDefault();
      showPreviewAction(action);
    });
  });
  var previewClose=document.getElementById('xf-preview-close');
  previewClose&&previewClose.addEventListener('click',function(){
    var box=document.getElementById('xf-preview-state');
    if(box)box.classList.remove('xf-on');
  });

  tabs.forEach(function(tab){
    tab.addEventListener('click',function(){
      activeTab=this.dataset.tab;
      var tabsWrap=this.parentElement;
      if(tabsWrap)tabsWrap.setAttribute('data-active',activeTab);
      tabs.forEach(function(t){t.classList.remove('xf-tab-on');});
      this.classList.add('xf-tab-on');
      var showField=activeTab==='phone'?phoneField:emailField;
      var hideField=activeTab==='phone'?emailField:phoneField;
      if(hideField)hideField.classList.add('xf-switching');
      setTimeout(function(){
        if(hideField)hideField.style.display='none';
        if(showField){
          showField.style.display='block';
          showField.classList.add('xf-switching');
          requestAnimationFrame(function(){showField.classList.remove('xf-switching');});
        }
      },120);
      msgEl.className='xf-msg';
      submitBtn.style.display='block';submitBtn.disabled=false;submitBtn.textContent='확인하기';
      setTimeout(function(){(activeTab==='phone'?phoneInp:emailInp).focus();},180);
    });
  });

  [phoneInp,emailInp].forEach(function(el){
    if(!el)return;
    el.addEventListener('keydown',function(e){if(e.key==='Enter')submitBtn.click();});
  });

  submitBtn&&submitBtn.addEventListener('click',function(){
    if(submitBtn.disabled)return;
    var value,type;
    if(activeTab==='phone'){
      value=phoneInp.value.replace(/[^0-9]/g,'');type='phone';
      if(!value||value.length<10){showMsg('err','올바른 연락처를 입력해주세요.');return;}
    }else{
      value=emailInp.value.trim();type='email';
      if(!value||!value.includes('@')){showMsg('err','올바른 이메일을 입력해주세요.');return;}
    }
    submitBtn.disabled=true;submitBtn.textContent='확인 중...';msgEl.className='xf-msg';

    fetch(API+'/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,value:value})})
    .then(function(r){return r.json();})
    .then(function(d){
      if(d.found&&d.registration){
        var name=d.registration.name||'참가자';
        showMsg('ok','<strong>'+esc(name)+'</strong>님, 환영합니다! 🎉<br>아래 버튼을 눌러 웨비나에 입장해주세요.<br><a href="'+LIVE_URL+'" class="xf-enter-link">▶ 웨비나 입장하기</a>');
        submitBtn.style.display='none';
      }else{
        showMsg('err','신청 내역을 찾을 수 없습니다.<br>다른 방법(연락처/이메일)으로도 시도해보세요.');
        submitBtn.disabled=false;submitBtn.textContent='확인하기';
      }
    })
    .catch(function(){
      showMsg('err','일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      submitBtn.disabled=false;submitBtn.textContent='확인하기';
    });
  });

  function showMsg(t,h){msgEl.className='xf-msg xf-'+t;msgEl.innerHTML=h;}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function escAttr(s){return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function svgPlay(){return'<svg class="xf-btn-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21"/></svg>';}
  function svgCal(){return'<svg class="xf-btn-icon" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';}
  function svgEdit(){return'<svg class="xf-btn-icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg>';}
})();
<\/script>`;
}

// ─── 전체 라이브 코드 생성 ─────────────────────────────────────────
function generateFullHtml(webinar: Webinar, apiBase: string): string {
  const accent = webinar.theme?.accentColor ?? "#FF4713";
  const surface = webinar.theme?.surfaceColor ?? "#141417";
  const bg = webinar.theme?.bgColor ?? "#080809";
  const textColor = webinar.theme?.textColor ?? "#f2f2f5";
  const font = webinar.theme?.font ?? "Pretendard";
  const radius = webinar.theme?.borderRadius ?? "10px";
  const youtubeId = typeof webinar.config?.youtubeId === "string" ? webinar.config.youtubeId : "";
  const surveyUrl = typeof webinar.config?.surveyUrl === "string" ? webinar.config.surveyUrl : "";
  const registrationForm = normalizeRegistrationFormForEmbed(webinar.config ?? {});
  const accentSoft = hexToRgba(accent, 0.12);
  const accentBorder = hexToRgba(accent, 0.24);
  const accentGlow = hexToRgba(accent, 0.28);
  const name = escapeHtml(webinar.name);
  const desc = escapeHtml(webinar.description ?? "등록하신 정보로 입장 후 라이브 웨비나에 참여하세요.");
  const liveStartLabel = new Date(webinar.liveStartAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fmtTime = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return escapeHtml(value);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  };
  const sessionOptions = webinar.sessions.length
    ? webinar.sessions.map(s => `<option value="${s.number}">Session ${s.number} · ${escapeHtml(s.title)}</option>`).join("")
    : "";
  const sessionsHtml = webinar.sessions.length
    ? webinar.sessions.map(s => `
          <article class="xf-session-card">
            <div class="xf-session-label">SESSION ${s.number}</div>
            <h3>${escapeHtml(s.title)}</h3>
            ${s.speaker ? `<p>${escapeHtml(s.speaker)}</p>` : ""}
            <div class="xf-session-time">${fmtTime(s.startTime)} - ${fmtTime(s.endTime)}</div>
          </article>`).join("")
    : `<article class="xf-session-card xf-session-empty">
          <div class="xf-session-label">AGENDA</div>
          <h3>세션 정보가 준비 중입니다</h3>
          <p>관리자 페이지에서 세션을 추가하면 이 영역에 자동 표시됩니다.</p>
          <div class="xf-session-time">${liveStartLabel}</div>
        </article>`;
  const surveyCardHtml = surveyUrl
    ? `<div class="xf-card">
          <div class="xf-card-head"><div class="xf-card-title">만족도 조사</div></div>
          <div class="xf-card-body">
            <p>웨비나 종료 후 만족도 조사에 참여해주세요.</p>
            <a class="xf-btn xf-btn-primary" href="${escapeHtml(surveyUrl)}" target="_blank" rel="noopener noreferrer">만족도 조사 참여하기</a>
          </div>
        </div>`
    : "";
  const registrationFieldsHtml = registrationForm.fields
    .filter((field) => field.enabled)
    .map((field) => {
      const required = field.required ? " *" : "";
      const full = field.type === "checkbox" || field.type === "select" ? " full" : "";
      const system = field.system === false ? "0" : "1";
      if (field.type === "checkbox") {
        return `<label class="checkbox-row reg-dynamic-field full"><input type="checkbox" data-reg-key="${escapeHtml(field.key)}" data-reg-system="${system}" data-reg-type="checkbox"> ${escapeHtml(field.label)}${required}</label>`;
      }
      if (field.type === "select") {
        const options = (field.options ?? [])
          .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
          .join("");
        return `<div class="xf-field reg-dynamic-field${full}"><label>${escapeHtml(field.label)}${required}</label><select data-reg-key="${escapeHtml(field.key)}" data-reg-system="${system}" data-reg-type="select"><option value="">${escapeHtml(field.placeholder || "선택해주세요")}</option>${options}</select></div>`;
      }
      const inputType = field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
      const inputMode = field.type === "tel" ? ` inputmode="tel"` : "";
      return `<div class="xf-field reg-dynamic-field${full}"><label>${escapeHtml(field.label)}${required}</label><input type="${inputType}"${inputMode} data-reg-key="${escapeHtml(field.key)}" data-reg-system="${system}" data-reg-type="${field.type}" placeholder="${escapeHtml(field.placeholder ?? "")}"></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${name}</title>
  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.min.css" rel="stylesheet">
  <style>
    :root{--accent:${accent};--accent-soft:${accentSoft};--accent-border:${accentBorder};--accent-glow:${accentGlow};--bg:${bg};--bg2:#0e0e11;--surface:${surface};--card:#1a1a1f;--card2:#1f1f25;--border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.12);--text:${textColor};--text2:rgba(242,242,245,.64);--text3:rgba(242,242,245,.36);--font:'${font}',Pretendard,-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif;--radius:${radius};}
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:var(--font);background:var(--bg);color:var(--text);min-height:100vh;-webkit-font-smoothing:antialiased;}
    button,input,textarea,select{font-family:var(--font);}
    a{color:inherit;}
    #announce-bar{display:none;position:sticky;top:0;z-index:120;width:100%;min-height:52px;padding:14px 24px;background:#172b17;border-bottom:2px solid var(--accent);color:#d4f5c4;font-size:14px;font-weight:700;line-height:1.45;box-shadow:0 2px 24px rgba(0,0,0,.45);}
    .page{display:none;min-height:100vh;}
    .page.active{display:flex;}
    .xf-auth-page{align-items:center;justify-content:center;padding:20px;background:radial-gradient(circle at 50% 0, var(--accent-soft), transparent 36%),var(--bg);}
    .xf-gate-box{width:100%;max-width:404px;position:relative;overflow:hidden;background:var(--surface);border:1px solid var(--border2);border-radius:16px;padding:36px 32px;box-shadow:0 24px 72px rgba(0,0,0,.45);}
    .xf-gate-box::before,.xf-modal::before,.popup-box::before{content:'';position:absolute;left:18%;right:18%;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);}
    .xf-badge{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:6px;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);font-size:10px;font-weight:900;letter-spacing:1.2px;}
    .xf-dot{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:xf-blink 1.6s ease-in-out infinite;}
    @keyframes xf-blink{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.25;transform:scale(.65)}}
    .xf-gate-title{font-size:22px;font-weight:900;letter-spacing:-.5px;margin:17px 0 7px;}
    .xf-gate-desc{font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:22px;word-break:keep-all;}
    .xf-auth-tabs{display:flex;gap:4px;margin-bottom:14px;padding:4px;border-radius:8px;background:rgba(255,255,255,.05);position:relative;overflow:hidden;}
    .xf-auth-tabs::before{content:'';position:absolute;top:4px;bottom:4px;left:4px;width:calc((100% - 12px)/2);border-radius:6px;background:rgba(255,255,255,.11);box-shadow:0 8px 18px rgba(0,0,0,.18),0 0 0 1px rgba(255,255,255,.04) inset;transform:translateX(0);transition:transform .28s cubic-bezier(.2,.8,.2,1),background .2s;}
    .xf-auth-tabs[data-active="email"]::before{transform:translateX(calc(100% + 4px));}
    .xf-auth-tab{position:relative;z-index:1;flex:1;min-height:36px;border:0;border-radius:6px;background:transparent;color:var(--text2);font-size:13px;font-weight:850;cursor:pointer;transition:color .18s,transform .12s;}
    .xf-auth-tab:active{transform:scale(.96);}
    .xf-auth-tab.on{color:var(--text);}
    label{display:block;font-size:11px;font-weight:800;color:var(--text2);letter-spacing:.2px;margin-bottom:6px;}
    input,textarea,select{width:100%;background:rgba(255,255,255,.055);border:1px solid var(--border2);border-radius:9px;color:var(--text);font-size:14px;padding:12px 14px;outline:none;transition:border-color .15s,background .15s;}
    textarea{resize:none;min-height:118px;line-height:1.6;}
    input:focus,textarea:focus,select:focus{border-color:var(--accent);background:rgba(255,255,255,.075);}
    input::placeholder,textarea::placeholder{color:var(--text3);}
    .xf-field{margin-bottom:13px;}
    .reg-dynamic-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px;}
    .reg-dynamic-field.full{grid-column:1/-1;}
    .xf-gate-auth-field{transform:translateY(0);opacity:1;transition:opacity .18s ease,transform .18s ease;}
    .xf-gate-auth-field.switching{opacity:0;transform:translateY(6px);}
    .checkbox-row{display:flex;align-items:flex-start;gap:8px;margin:9px 0 0;font-size:12px;color:var(--text2);line-height:1.5;cursor:pointer;}
    .checkbox-row input{width:auto;margin-top:2px;accent-color:var(--accent);flex:0 0 auto;}
    .error-msg{display:none;margin:10px 0 0;padding:11px 13px;border-radius:8px;background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.22);color:#fca5a5;font-size:12px;line-height:1.5;}
    .xf-btn,.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:42px;padding:12px 14px;border:1px solid transparent;border-radius:9px;font-size:14px;font-weight:900;text-decoration:none;cursor:pointer;transition:all .15s;}
    .xf-btn-primary,.btn{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 2px 14px var(--accent-glow);}
    .xf-btn-secondary,.btn-outline{background:rgba(255,255,255,.07);border-color:var(--border2);color:#fff;box-shadow:none;}
    .xf-btn:hover,.btn:hover{transform:translateY(-1px);}
    .xf-btn-primary:hover,.btn:hover{filter:brightness(1.08);}
    .xf-btn:disabled,.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;filter:none;}
    .divider{display:flex;align-items:center;gap:12px;margin:18px 0 12px;color:var(--text3);font-size:12px;font-weight:700;line-height:1;white-space:nowrap;}
    .divider::before,.divider::after{content:'';height:1px;background:var(--border);flex:1;}
    #page-live{display:none;flex-direction:column;background:var(--bg);}
    #page-live.active{display:flex;}
    .xf-header{position:sticky;top:0;z-index:90;background:rgba(8,8,9,.86);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border);}
    .xf-header-in{max-width:1500px;margin:0 auto;padding:12px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
    .xf-header-left{display:flex;align-items:center;gap:12px;min-width:0;}
    .xf-header-title{font-size:15px;font-weight:900;letter-spacing:-.25px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .xf-header-sub{font-size:11px;color:var(--text2);font-weight:600;margin-top:2px;}
    .xf-header-right{display:flex;align-items:center;gap:8px;flex-shrink:0;}
    .xf-user-pill{display:none;padding:5px 10px;border-radius:6px;background:var(--card);border:1px solid var(--border);font-size:12px;color:var(--text2);font-weight:700;}
    .xf-main{max-width:1500px;width:100%;margin:0 auto;padding:20px 28px 60px;}
    .xf-grid{display:grid;grid-template-columns:minmax(0,1040px) minmax(300px,340px);grid-template-rows:auto auto;gap:16px;align-items:start;justify-content:center;}
    .xf-video-wrap,.xf-sessions-wrap{grid-column:1;min-width:0;width:100%;}
    .xf-sidebar{grid-column:2;grid-row:1 / 3;display:flex;flex-direction:column;gap:12px;min-width:0;}
    .xf-video{border-radius:var(--radius);overflow:hidden;background:#000;border:1px solid var(--border);position:relative;}
    .xf-video-ratio{position:relative;width:100%;aspect-ratio:16/9;background:#000;}
    .xf-video-ratio iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}
    .xf-video-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:13px;background:linear-gradient(160deg,rgba(255,71,19,.09),#080809 58%);text-align:center;padding:24px;}
    .xf-video-placeholder-title{font-size:40px;font-weight:950;letter-spacing:-1px;color:var(--accent);text-shadow:0 0 32px var(--accent-glow);}
    .xf-video-placeholder-sub{font-size:14px;color:var(--text2);font-weight:600;}
    .xf-video-placeholder-time{display:inline-flex;align-items:center;gap:7px;background:var(--accent-soft);border:1px solid var(--accent-border);padding:6px 14px;border-radius:6px;font-size:13px;font-weight:800;color:var(--accent);}
    .xf-live-title{margin:15px 2px 0;font-size:20px;font-weight:900;letter-spacing:-.4px;line-height:1.35;word-break:keep-all;}
    .xf-live-desc{margin:6px 2px 0;color:var(--text2);font-size:13px;line-height:1.6;word-break:keep-all;}
    .xf-sessions{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
    .xf-session-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;transition:border-color .2s;}
    .xf-session-card:hover{border-color:var(--accent-border);}
    .xf-session-label{display:inline-block;margin-bottom:10px;padding:2px 8px;border-radius:4px;background:var(--accent-soft);border:1px solid var(--accent-border);color:var(--accent);font-size:9px;font-weight:900;letter-spacing:1.1px;}
    .xf-session-card h3{font-size:14px;font-weight:850;line-height:1.45;letter-spacing:-.2px;word-break:keep-all;}
    .xf-session-card p{margin-top:5px;color:var(--text2);font-size:12px;line-height:1.55;word-break:keep-all;}
    .xf-session-time{display:inline-flex;align-items:center;gap:5px;margin-top:10px;padding:3px 9px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:850;}
    .xf-card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;}
    .xf-card-head{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .xf-card-title{font-size:12px;font-weight:850;letter-spacing:.2px;}
    .xf-card-body{padding:16px;}
    .xf-card-body p{font-size:13px;color:var(--text2);line-height:1.65;margin-bottom:14px;word-break:keep-all;}
    .qa-list{display:flex;flex-direction:column;gap:8px;max-height:250px;overflow:auto;}
    .qa-item{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:11px 12px;font-size:12px;line-height:1.55;color:rgba(242,242,245,.78);word-break:keep-all;}
    .qa-name{color:var(--accent);font-weight:900;font-size:11px;margin-bottom:4px;}
    .qa-empty{padding:14px 12px;border-radius:9px;background:rgba(255,255,255,.035);color:var(--text3);font-size:12px;line-height:1.5;text-align:center;}
    .xf-modal-bg,#popup-overlay{display:none;position:fixed;inset:0;z-index:200;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
    .xf-modal-bg.on{display:flex;}
    #popup-overlay.show{display:flex;}
    .xf-modal,.popup-box{width:100%;max-width:460px;position:relative;overflow:hidden;background:linear-gradient(180deg,rgba(26,26,31,.98),rgba(16,16,20,.98));border:1px solid var(--border2);border-radius:14px;padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.58);}
    .xf-modal-close,.popup-close{position:absolute;top:14px;right:14px;width:30px;height:30px;border-radius:7px;border:1px solid var(--border2);background:rgba(255,255,255,.07);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
    .xf-modal-title,.popup-title{font-size:19px;font-weight:900;letter-spacing:-.4px;margin-bottom:6px;}
    .xf-modal-desc,.popup-message{font-size:13px;color:var(--text2);line-height:1.65;margin-bottom:16px;word-break:keep-all;}
    .xf-modal-count{font-size:11px;color:var(--text3);text-align:right;margin-top:5px;}
    .xf-modal-success{display:none;margin-top:13px;padding:13px;border-radius:8px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.22);color:#4ade80;font-size:13px;font-weight:800;text-align:center;}
    .popup-actions{display:grid;grid-template-columns:1fr;gap:8px;}
    .popup-actions a,.popup-actions button{display:flex;align-items:center;justify-content:center;min-height:44px;padding:12px 14px;border-radius:9px;font-size:14px;font-weight:900;text-decoration:none;cursor:pointer;border:1px solid transparent;}
    .popup-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 2px 14px var(--accent-glow);}
    .popup-btn-secondary{background:rgba(255,255,255,.07);border-color:var(--border2);color:#fff;}
    .spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:8px;}
    @keyframes spin{to{transform:rotate(360deg);}}
    @media(max-width:1024px){.xf-grid{display:flex;flex-direction:column;gap:14px}.xf-video-wrap,.xf-sidebar,.xf-sessions-wrap{width:100%}.xf-sidebar{order:2}.xf-sessions-wrap{order:3}.xf-main{padding:16px 20px 48px}.xf-header-in{padding:11px 20px}.xf-sessions{grid-template-columns:1fr 1fr}}
    @media(max-width:768px){.xf-video-wrap{position:sticky;top:52px;z-index:80}}
    @media(max-width:640px){.xf-header-in{padding:10px 14px}.xf-header-sub,.xf-user-pill{display:none!important}.xf-main{padding:12px 12px 40px}.xf-sessions{grid-template-columns:1fr;margin-top:0}.xf-gate-box{padding:28px 20px}.xf-live-title{font-size:17px}.xf-badge{padding:3px 8px;font-size:9px}.xf-btn,.btn{font-size:13px}.xf-modal,.popup-box{padding:26px 20px}.reg-dynamic-grid{grid-template-columns:1fr}.reg-dynamic-field{grid-column:1/-1}}
  </style>
</head>
<body>
<div id="announce-bar"></div>
<div id="page-gate" class="page xf-auth-page active">
  <div class="xf-gate-box">
    <div class="xf-badge"><span class="xf-dot"></span>LIVE</div>
    <h2 class="xf-gate-title">웨비나 입장 확인</h2>
    <p class="xf-gate-desc">${name}<br>사전 등록 시 입력하신 연락처 또는 이메일을 입력해주세요.</p>
    <div class="xf-auth-tabs" role="tablist" aria-label="인증 방법" data-active="phone">
      <button class="xf-auth-tab on" type="button" data-gate-auth="phone">전화번호</button>
      <button class="xf-auth-tab" type="button" data-gate-auth="email">이메일</button>
    </div>
    <div class="xf-field xf-gate-auth-field" id="gate-phone-field"><label>전화번호</label><input type="tel" id="gate-phone" placeholder="01012345678 (숫자만)" autocomplete="tel" inputmode="numeric"></div>
    <div class="xf-field xf-gate-auth-field" id="gate-email-field" style="display:none;"><label>이메일</label><input type="email" id="gate-email" placeholder="name@email.com" autocomplete="email"></div>
    <div id="gate-error" class="error-msg" style="display:none"></div>
    <button class="btn" id="gate-btn" onclick="verifyGate()">입장하기</button>
    <div class="divider">처음 오셨나요?</div>
    <button class="btn btn-outline" onclick="showPage('register')">사전등록하기</button>
  </div>
</div>
<div id="page-register" class="page xf-auth-page">
  <div class="xf-gate-box">
    <div class="xf-badge"><span class="xf-dot"></span>REGISTER</div>
    <h2 class="xf-gate-title">사전등록</h2><p class="xf-gate-desc">${name}</p>
    <div class="reg-dynamic-grid">${registrationFieldsHtml}</div>
    <label class="checkbox-row"><input type="checkbox" id="reg-privacy"> ${escapeHtml(registrationForm.privacyText)}</label>
    <label class="checkbox-row"><input type="checkbox" id="reg-marketing"> ${escapeHtml(registrationForm.marketingText)}</label>
    <div id="reg-error" class="error-msg" style="display:none"></div>
    <button class="btn" id="reg-btn" onclick="submitRegister()">${escapeHtml(registrationForm.submitLabel)}</button>
    <div class="divider">이미 등록하셨나요?</div>
    <button class="btn btn-outline" onclick="showPage('gate')">입장하기</button>
  </div>
</div>
<div id="page-live" class="page">
  <header class="xf-header">
    <div class="xf-header-in">
      <div class="xf-header-left">
        <div class="xf-badge"><span class="xf-dot"></span>LIVE</div>
        <div style="min-width:0;">
          <div class="xf-header-title">${name}</div>
          <div class="xf-header-sub" id="live-meta">${liveStartLabel}</div>
        </div>
      </div>
      <div class="xf-header-right">
        <span class="xf-user-pill" id="live-user"></span>
        <button class="xf-btn xf-btn-secondary" style="width:auto;min-height:34px;padding:8px 13px;font-size:12px;" onclick="showPage('gate')">입장 확인</button>
      </div>
    </div>
  </header>
  <main class="xf-main">
    <div class="xf-grid">
      <section class="xf-video-wrap">
        <div class="xf-video">
          <div class="xf-video-ratio">
            ${youtubeId
              ? `<iframe src="https://www.youtube.com/embed/${escapeHtml(youtubeId)}?autoplay=1&rel=0&modestbranding=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`
              : `<div class="xf-video-placeholder"><div class="xf-video-placeholder-title">LIVE</div><div class="xf-video-placeholder-sub">YouTube ID가 설정되지 않았어요</div><div class="xf-video-placeholder-time">${liveStartLabel}</div></div>`}
          </div>
        </div>
        <h1 class="xf-live-title">${name}</h1>
        <p class="xf-live-desc">${desc}</p>
      </section>
      <section class="xf-sessions-wrap">
        <div class="xf-sessions">${sessionsHtml}
        </div>
      </section>
      <aside class="xf-sidebar">
        <div class="xf-card">
          <div class="xf-card-head"><div class="xf-card-title">Q&amp;A</div></div>
          <div class="xf-card-body">
            <p>연사에게 궁금한 점을 남겨주세요. Q&amp;A 시간에 선정하여 답변드립니다.</p>
            <button class="xf-btn xf-btn-primary" id="qa-open" type="button">질문하기</button>
          </div>
        </div>
        ${surveyCardHtml}
        <div class="xf-card">
          <div class="xf-card-head"><div class="xf-card-title">공개된 질문</div></div>
          <div class="xf-card-body">
            <div class="qa-list" id="qa-list"><div class="qa-empty">아직 공개된 질문이 없습니다.</div></div>
          </div>
        </div>
        <div class="xf-card">
          <div class="xf-card-head"><div class="xf-card-title">웨비나 정보</div></div>
          <div class="xf-card-body">
            <p><strong style="color:var(--accent);">LIVE</strong><br>${liveStartLabel}</p>
            <p style="margin-bottom:0;">공지와 팝업은 관리자 페이지에서 활성화하면 이 페이지에 자동 표시됩니다.</p>
          </div>
        </div>
      </aside>
    </div>
  </main>
</div>
<div id="page-ended" class="page xf-auth-page">
  <div class="xf-gate-box" style="text-align:center;">
    <div class="xf-badge"><span class="xf-dot"></span>ENDED</div>
    <h2 class="xf-gate-title">웨비나가 종료됐어요</h2>
    <p class="xf-gate-desc">참여해주셔서 감사합니다.</p>
    ${surveyUrl ? `<a class="xf-btn xf-btn-primary" href="${escapeHtml(surveyUrl)}" target="_blank" rel="noopener noreferrer">만족도 조사 참여하기</a>` : ""}
  </div>
</div>
<div class="xf-modal-bg" id="qa-modal">
  <div class="xf-modal" role="dialog" aria-modal="true" aria-labelledby="qa-modal-title">
    <button class="xf-modal-close" type="button" id="qa-close">×</button>
    <div class="xf-modal-title" id="qa-modal-title">질문하기</div>
    <div class="xf-modal-desc">연사에게 궁금한 점을 남겨주시면 Q&amp;A 시간에 선정하여 답변드립니다.</div>
    <div class="xf-field">
      <label>어느 세션에 대한 질문인가요?</label>
      <select id="qa-session">
        <option value="">세션 선택 (선택사항)</option>
        ${sessionOptions}
      </select>
    </div>
    <div class="xf-field">
      <label>질문 내용</label>
      <textarea id="qa-input" maxlength="500" placeholder="질문 내용을 입력해주세요..."></textarea>
      <div class="xf-modal-count"><span id="qa-count">0</span> / 500</div>
    </div>
    <button class="xf-btn xf-btn-primary" id="qa-submit" type="button">질문 전송하기</button>
    <div class="xf-modal-success" id="qa-success">질문이 전송됐습니다.</div>
  </div>
</div>
<div id="popup-overlay">
  <div class="popup-box">
    <button class="popup-close" onclick="closePopup()">×</button>
    <div class="popup-title" id="popup-title"></div>
    <div class="popup-message" id="popup-message"></div>
    <div class="popup-actions" id="popup-actions"></div>
  </div>
</div>
<script>
  var SLUG="${escapeHtml(webinar.slug)}",API="${escapeHtml(apiBase)}";
  var REG_KEY="mach_reg_"+SLUG,POPUPS_KEY="mach_popups_"+SLUG;
  var LEGACY_REG_KEY=("x"+"flow_reg_")+SLUG,LEGACY_POPUPS_KEY=("x"+"flow_popups_")+SLUG;
  function readStoredJSON(primaryKey,legacyKey,fallback){try{var raw=localStorage.getItem(primaryKey);if(raw==null){raw=localStorage.getItem(legacyKey);if(raw!=null){localStorage.setItem(primaryKey,raw);localStorage.removeItem(legacyKey);}}return JSON.parse(raw==null?fallback:raw);}catch(e){return JSON.parse(fallback);}}
  function writeStoredJSON(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(e){}}
  var state={reg:readStoredJSON(REG_KEY,LEGACY_REG_KEY,"null"),pingTimer:null,announceTimer:null,popupTimer:null,qaPolling:null,shownPopups:readStoredJSON(POPUPS_KEY,LEGACY_POPUPS_KEY,"[]"),popupQueue:[],liveReady:false};
  var gateAuthType="phone";
  function showPage(n){document.querySelectorAll(".page").forEach(function(e){e.classList.remove("active");});var page=document.getElementById("page-"+n);if(page)page.classList.add("active");}
  window.addEventListener("DOMContentLoaded",function(){
    bindGateAuth();
    bindQA();
    fetch(API+"/info").then(function(r){return r.json();}).then(function(d){
      var w=d.webinar;if(!w){return;}
      var now=new Date(),start=new Date(w.liveStartAt),end=new Date(w.liveEndAt);
      var m=document.getElementById("live-meta");
      if(m)m.textContent=start.toLocaleDateString("ko-KR")+" "+start.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})+" - "+end.toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"});
      if(now>end){showPage("ended");return;}
      if(state.reg){enterLive();}else{showPage("gate");}
    }).catch(function(){if(state.reg)enterLive();});
  });
  function bindGateAuth(){document.querySelectorAll("[data-gate-auth]").forEach(function(tab){tab.addEventListener("click",function(){gateAuthType=this.getAttribute("data-gate-auth")||"phone";var tabsWrap=this.parentElement;if(tabsWrap)tabsWrap.setAttribute("data-active",gateAuthType);document.querySelectorAll("[data-gate-auth]").forEach(function(t){t.classList.toggle("on",t===tab);});var phoneField=document.getElementById("gate-phone-field"),emailField=document.getElementById("gate-email-field"),err=document.getElementById("gate-error");var showField=gateAuthType==="phone"?phoneField:emailField;var hideField=gateAuthType==="phone"?emailField:phoneField;if(hideField)hideField.classList.add("switching");setTimeout(function(){if(hideField)hideField.style.display="none";if(showField){showField.style.display="block";showField.classList.add("switching");requestAnimationFrame(function(){showField.classList.remove("switching");});}},120);if(err)err.style.display="none";setTimeout(function(){var input=document.getElementById(gateAuthType==="phone"?"gate-phone":"gate-email");if(input)input.focus();},180);});});["gate-phone","gate-email"].forEach(function(id){var el=document.getElementById(id);if(el)el.addEventListener("keydown",function(e){if(e.key==="Enter")verifyGate();});});}
  function verifyGate(){var input=document.getElementById(gateAuthType==="phone"?"gate-phone":"gate-email");var val=input?input.value.trim():"";if(gateAuthType==="phone"){val=val.replace(/[^0-9]/g,"");if(!val||val.length<10){showErr("gate","올바른 전화번호를 입력해주세요.");return;}}else{if(!val||val.indexOf("@")===-1){showErr("gate","올바른 이메일을 입력해주세요.");return;}}var btn=document.getElementById("gate-btn");btn.disabled=true;btn.innerHTML='<span class="spinner"></span>확인 중...';fetch(API+"/verify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:gateAuthType,value:val})}).then(function(r){return r.json();}).then(function(d){if(d.found&&d.registration){state.reg=d.registration;writeStoredJSON(REG_KEY,state.reg);enterLive();}else{showErr("gate","신청 내역을 찾을 수 없습니다. 다른 인증 방법으로도 시도해보세요.");}}).catch(function(){showErr("gate","오류가 발생했어요.");}).finally(function(){btn.disabled=false;btn.innerHTML="입장하기";});}
  function submitRegister(){var privacy=document.getElementById("reg-privacy").checked;if(!privacy){showErr("reg","개인정보 수집 동의가 필요해요");return;}var payload={customFields:{},agreePrivacy:true,agreeMarketing:document.getElementById("reg-marketing").checked};var fields=${JSON.stringify(registrationForm.fields.filter((field) => field.enabled))};try{fields.forEach(function(f){var el=findRegElement(f.key||"");if(!el)return;var value=f.type==="checkbox"?!!el.checked:String(el.value||"").trim();if(f.required&&(f.type==="checkbox"?!value:!value)){throw new Error((f.label||"필수 항목")+" 항목을 입력해주세요.");}if(f.system!==false){payload[f.key]=value;}else{payload.customFields[f.key]=value;}});if(!payload.name)throw new Error("이름 항목을 입력해주세요.");}catch(err){showErr("reg",err&&err.message?err.message:"필수 항목을 확인해주세요.");return;}var btn=document.getElementById("reg-btn");btn.disabled=true;btn.innerHTML='<span class="spinner"></span>등록 중...';fetch(API+"/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(d){if(d.registration){state.reg=d.registration;writeStoredJSON(REG_KEY,state.reg);enterLive();}else{showErr("reg",d.error||"등록에 실패했어요.");}}).catch(function(){showErr("reg","오류가 발생했어요.");}).finally(function(){btn.disabled=false;btn.innerHTML=${JSON.stringify(registrationForm.submitLabel)};});}
  function enterLive(){showPage("live");state.liveReady=true;var user=document.getElementById("live-user");if(user&&state.reg&&state.reg.name){user.textContent=state.reg.name;user.style.display="inline-flex";}sendPing("enter");if(!state.pingTimer)state.pingTimer=setInterval(function(){sendPing("ping");},30000);if(!state.announceTimer)state.announceTimer=setInterval(pollAnnouncements,15000);if(!state.popupTimer)state.popupTimer=setInterval(pollPopups,15000);if(!state.qaPolling)state.qaPolling=setInterval(loadQA,20000);pollAnnouncements();pollPopups();loadQA();window.addEventListener("beforeunload",function(){sendPing("leave");});}
  function sendPing(event){if(!state.reg)return;var body=JSON.stringify({registrationId:state.reg.id,event:event});navigator.sendBeacon?navigator.sendBeacon(API+"/ping",body):fetch(API+"/ping",{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true});}
  function pollAnnouncements(){fetch(API+"/announcements").then(function(r){return r.json();}).then(function(d){var bar=document.getElementById("announce-bar");if(d.announcements&&d.announcements.length>0){bar.textContent=d.announcements[0].message;bar.style.display="block";}else{bar.style.display="none";}}).catch(function(){});}
  function pollPopups(){fetch(API+"/popups").then(function(r){return r.json();}).then(function(d){if(!d.popups)return;d.popups.forEach(function(p){if(state.shownPopups.indexOf(p.id)===-1&&state.popupQueue.map(function(x){return x.id;}).indexOf(p.id)===-1)state.popupQueue.push(p);});showNextPopup();}).catch(function(){});}
  function showNextPopup(){if(!state.popupQueue.length||document.getElementById("popup-overlay").classList.contains("show"))return;var p=state.popupQueue.shift();document.getElementById("popup-title").textContent=p.title||"알림";document.getElementById("popup-message").textContent=p.message||"";var actions=document.getElementById("popup-actions");actions.innerHTML="";if(p.buttonLabel&&p.buttonUrl){var a=document.createElement("a");a.href=p.buttonUrl;a.target="_blank";a.rel="noopener noreferrer";a.textContent=p.buttonLabel;a.className="popup-btn-primary";actions.appendChild(a);}if(p.secondaryLabel){var b=document.createElement("button");b.textContent=p.secondaryLabel;b.className="popup-btn-secondary";b.onclick=closePopup;actions.appendChild(b);}document.getElementById("popup-overlay").classList.add("show");state.shownPopups.push(p.id);writeStoredJSON(POPUPS_KEY,state.shownPopups);}
  function closePopup(){document.getElementById("popup-overlay").classList.remove("show");setTimeout(showNextPopup,300);}
  function bindQA(){var open=document.getElementById("qa-open"),close=document.getElementById("qa-close"),modal=document.getElementById("qa-modal"),input=document.getElementById("qa-input"),submit=document.getElementById("qa-submit");if(open)open.addEventListener("click",openQA);if(close)close.addEventListener("click",closeQA);if(modal)modal.addEventListener("click",function(e){if(e.target===modal)closeQA();});if(input)input.addEventListener("input",function(){var c=document.getElementById("qa-count");if(c)c.textContent=String(input.value.length);});if(submit)submit.addEventListener("click",submitQA);document.addEventListener("keydown",function(e){if(e.key==="Escape")closeQA();if(e.key==="Enter"&&document.activeElement===document.getElementById("gate-value"))verifyGate();});}
  function openQA(){var modal=document.getElementById("qa-modal");if(modal)modal.classList.add("on");var success=document.getElementById("qa-success");if(success)success.style.display="none";setTimeout(function(){var input=document.getElementById("qa-input");if(input)input.focus();},80);}
  function closeQA(){var modal=document.getElementById("qa-modal");if(modal)modal.classList.remove("on");var input=document.getElementById("qa-input");if(input)input.value="";var c=document.getElementById("qa-count");if(c)c.textContent="0";var submit=document.getElementById("qa-submit");if(submit){submit.disabled=false;submit.textContent="질문 전송하기";submit.style.display="flex";}}
  function loadQA(){fetch(API+"/qa").then(function(r){return r.json();}).then(function(d){var list=document.getElementById("qa-list");if(!list)return;list.innerHTML="";if(!d.questions||!d.questions.length){list.innerHTML='<div class="qa-empty">아직 공개된 질문이 없습니다.</div>';return;}d.questions.forEach(function(q){var item=document.createElement("div");item.className="qa-item";item.innerHTML='<div class="qa-name">'+esc(q.name||"익명")+"</div>"+esc(q.question);list.appendChild(item);});}).catch(function(){});}
  function submitQA(){var input=document.getElementById("qa-input"),q=input?input.value.trim():"";if(!q||q.length<2)return;var submit=document.getElementById("qa-submit");if(submit){submit.disabled=true;submit.textContent="전송 중...";}var session=document.getElementById("qa-session");fetch(API+"/qa",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:state.reg?state.reg.name:"익명",company:state.reg?state.reg.company:undefined,phone:state.reg?state.reg.phone:undefined,email:state.reg?state.reg.email:undefined,question:q,sessionNumber:session&&session.value?Number(session.value):undefined,registrationId:state.reg?state.reg.id:undefined})}).then(function(r){return r.json().then(function(d){return {ok:r.ok,data:d};});}).then(function(res){if(res.ok){if(input)input.value="";var c=document.getElementById("qa-count");if(c)c.textContent="0";var success=document.getElementById("qa-success");if(success)success.style.display="block";if(submit)submit.style.display="none";setTimeout(closeQA,2200);}else{alert(res.data&&res.data.error?res.data.error:"질문 전송에 실패했어요.");if(submit){submit.disabled=false;submit.textContent="질문 전송하기";}}}).catch(function(){alert("오류가 발생했어요.");if(submit){submit.disabled=false;submit.textContent="질문 전송하기";}});}
  function showErr(p,m){var el=document.getElementById(p+"-error");if(el){el.textContent=m;el.style.display="block";}}
  function findRegElement(key){var all=document.querySelectorAll("#page-register [data-reg-key]");for(var i=0;i<all.length;i++){if(all[i].getAttribute("data-reg-key")===String(key))return all[i];}return null;}
  function esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
</script>
</body>
</html>`;
}

function buildBannerPreviewHtml(bannerCode: string, bg: string) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;height:100%;background:${bg};}
.sim{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;gap:14px;padding:40px 24px 160px;text-align:center;}
.sim-title{font-size:16px;font-weight:600;color:rgba(255,255,255,.10);font-family:sans-serif;}
.sim-line{height:11px;border-radius:6px;background:rgba(255,255,255,.05);}
.sim-preview-state{
  position:fixed;inset:0;z-index:999990;
  display:none;align-items:center;justify-content:center;padding:28px;
  background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;
}
.sim-preview-state.xf-on{display:flex;}
.sim-preview-card{
  width:min(360px,100%);padding:26px 24px;border-radius:18px;
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
  text-align:center;box-shadow:0 22px 70px rgba(0,0,0,.36);
}
.sim-preview-card h2{margin:0 0 8px;font-size:20px;}
.sim-preview-card p{margin:0 0 18px;color:rgba(255,255,255,.65);font-size:13px;line-height:1.6;}
.sim-preview-card button{
  border:0;border-radius:10px;padding:10px 16px;background:rgba(255,255,255,.12);
  color:#fff;font-weight:700;cursor:pointer;
}
</style></head><body>
<div class="sim">
  <div class="sim-title">웹사이트 콘텐츠 영역</div>
  <div class="sim-line" style="width:72%"></div>
  <div class="sim-line" style="width:88%"></div>
  <div class="sim-line" style="width:55%"></div>
  <div class="sim-line" style="width:80%;margin-top:8px"></div>
  <div class="sim-line" style="width:63%"></div>
</div>
<div id="xf-preview-state" class="sim-preview-state">
  <div class="sim-preview-card">
    <h2 id="xf-preview-title"></h2>
    <p id="xf-preview-desc"></p>
    <button type="button" id="xf-preview-close">미리보기로 돌아가기</button>
  </div>
</div>
${bannerCode}
</body></html>`;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────
export default function EmbedTab({ webinar }: { webinar: Webinar }) {
  const [activeType, setActiveType]           = useState<EmbedType>("banner");
  const [copied, setCopied]                   = useState<string | null>(null);
  const [previewDevice, setPreviewDevice]     = useState<PreviewDevice>("desktop");
  const [bannerSection, setBannerSection]     = useState<string>("text");
  const [previewBannerMode, setPreviewBannerMode] = useState<BannerMode>("pre");
  const [previewWidth, setPreviewWidth]       = useState(420);
  const [isResizing, setIsResizing]           = useState(false);

  const origin  = typeof window !== "undefined" ? window.location.origin : "https://your-domain.com";
  const apiBase = `${origin}/api/webinar/${webinar.slug}`;
  const liveUrl = `${origin}/webinar/${webinar.slug}/live`;
  const registerUrl = `${liveUrl}?view=signup`;

  const bg        = webinar.theme?.bgColor      ?? "#0f0f0f";

  const [bannerCfg, setBannerCfg] = useState<BannerConfig>({
    preText:       `<span class="xf-accent">${webinar.name}</span> 지금 사전등록하세요.`,
    liveText:      `<span class="xf-accent">${webinar.name}</span>가 지금 진행 중입니다!`,
    endedText:     `<span class="xf-accent">${webinar.name}</span>가 종료되었습니다. 감사합니다! 🎉`,
    registerLabel: "사전등록하기",
    enterLabel:    "웨비나 입장하기",
    calendarUrl:   "",
    showCalendar:  true,
    surveyUrl:     "",
    surveyLabel:   "만족도 조사 참여하기",
    showVerify:    true,
    icsTitle:      webinar.name,
    icsDesc:       webinar.description ?? "",
    icsLocation:   "Online (mach)",
  });

  const updCfg = (patch: Partial<BannerConfig>) => setBannerCfg(prev => ({ ...prev, ...patch }));

  // 복사용 코드는 forceMode 없이
  const bannerCodeFinal = generateBannerHtml(webinar, bannerCfg, apiBase, liveUrl, registerUrl);
  // 미리보기용 코드는 선택된 모드 강제
  const bannerCodePreview = generateBannerHtml(webinar, bannerCfg, apiBase, liveUrl, registerUrl,
    previewBannerMode === "auto" ? undefined : previewBannerMode
  );

  const codes: Record<EmbedType, { label: string; description: string; code: string }> = {
    banner: {
      label: "배너",
      description: "랜딩페이지 하단 고정 배너 (사전등록·라이브·종료 모드 자동 전환)",
      code: bannerCodeFinal,
    },
    "live-page": {
      label: "라이브 페이지",
      description: "아임웹 HTML 페이지에 붙여넣는 독립형 라이브 페이지",
      code: generateFullHtml(webinar, apiBase),
    },
  };

  const copyCode = (type: EmbedType) => {
    navigator.clipboard.writeText(codes[type].code);
    setCopied(type); setTimeout(() => setCopied(null), 2000);
    toast.success("코드가 복사됐어요");
  };

  const downloadHtml = () => {
    const blob = new Blob([codes["live-page"].code], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `webinar-${webinar.slug}.html`; a.click();
    URL.revokeObjectURL(url); toast.success("HTML 파일이 다운로드됐어요");
  };

  // 미리보기 srcdoc
  const previewSrcdoc = (() => {
    if (activeType === "banner")    return buildBannerPreviewHtml(bannerCodePreview, bg);
    if (activeType === "live-page") return codes["live-page"].code;
    return null;
  })();
  const isFullPreview = previewSrcdoc !== null;

  const previewUrl = useMemo(() => {
    if (!previewSrcdoc) return null;
    const blob = new Blob([previewSrcdoc], { type: "text/html;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [previewSrcdoc]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const openPreviewInNewTab = () => {
    if (!previewSrcdoc) return;
    const blob = new Blob([previewSrcdoc], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  // ── 패널 드래그 리사이즈 ────────────────────────────────────────
  const handleDragStart = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = previewWidth;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: globalThis.MouseEvent) => {
      const delta = startX - ev.clientX;
      setPreviewWidth(Math.max(300, Math.min(680, startWidth + delta)));
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("blur", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("blur", onUp);
  };

  const inp = "w-full px-3 py-2 rounded-xl border border-border bg-secondary/40 text-sm outline-none focus:border-violet-500 transition-colors";
  const sectState = { current: bannerSection, onChange: setBannerSection };

  return (
    <div className="flex h-full lg:overflow-hidden">
      {/* ── 좌측: 코드 + 설정 패널 ── */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-5 overflow-y-auto lg:border-r border-border">
        <div>
          <h3 className="text-sm font-semibold mb-1">임베드 코드</h3>
          <p className="text-sm text-muted-foreground">아임웹 등 외부 사이트에 붙여넣어 사용하세요</p>
        </div>

        {/* 타입 탭 */}
        <div className="flex items-center gap-1 flex-wrap">
          {(Object.keys(codes) as EmbedType[]).map(type => (
            <button key={type} onClick={() => setActiveType(type)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${activeType === type ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"}`}
            >
              {type === "live-page" && <FileCode className="w-3.5 h-3.5 inline mr-1.5" />}
              {codes[type].label}
            </button>
          ))}
        </div>

        {/* 배너 설정 UI */}
        {activeType === "banner" && (
          <div className="space-y-2">
            <Sect {...sectState} id="text" title="모드별 배너 문구">
              <Fld label="사전등록 모드 (.xf-accent 클래스로 강조색 적용)">
                <textarea value={bannerCfg.preText} onChange={e => updCfg({ preText: e.target.value })}
                  rows={2} className={inp + " resize-none font-mono text-xs"} />
              </Fld>
              <Fld label="라이브 모드">
                <textarea value={bannerCfg.liveText} onChange={e => updCfg({ liveText: e.target.value })}
                  rows={2} className={inp + " resize-none font-mono text-xs"} />
              </Fld>
              <Fld label="종료 모드">
                <textarea value={bannerCfg.endedText} onChange={e => updCfg({ endedText: e.target.value })}
                  rows={2} className={inp + " resize-none font-mono text-xs"} />
              </Fld>
            </Sect>

            <Sect {...sectState} id="buttons" title="버튼 설정">
              <Fld label="사전등록 버튼 레이블">
                <input type="text" value={bannerCfg.registerLabel} onChange={e => updCfg({ registerLabel: e.target.value })} className={inp} />
              </Fld>
              <Fld label="입장하기 버튼 레이블 (라이브 모드)">
                <input type="text" value={bannerCfg.enterLabel} onChange={e => updCfg({ enterLabel: e.target.value })} className={inp} />
              </Fld>
              <Toggle checked={bannerCfg.showVerify} onChange={v => updCfg({ showVerify: v })} label="입장 시 등록 인증 모달 표시" />
            </Sect>

            <Sect {...sectState} id="calendar" title="캘린더 버튼">
              <Toggle checked={bannerCfg.showCalendar} onChange={v => updCfg({ showCalendar: v })} label="캘린더 버튼 표시 (사전등록 모드)" />
              {bannerCfg.showCalendar && (
                <>
                  <Fld label="구글 캘린더 URL (데스크톱)">
                    <input type="url" value={bannerCfg.calendarUrl} onChange={e => updCfg({ calendarUrl: e.target.value })}
                      placeholder="https://calendar.google.com/..." className={inp} />
                  </Fld>
                  <p className="text-[11px] text-muted-foreground -mt-1">모바일에서는 .ics 파일로 자동 다운로드됩니다</p>
                  <div className="border-t border-border pt-3 mt-1 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">.ics 캘린더 이벤트 내용</p>
                    <Fld label="이벤트 제목">
                      <input type="text" value={bannerCfg.icsTitle} onChange={e => updCfg({ icsTitle: e.target.value })} className={inp} />
                    </Fld>
                    <Fld label="설명">
                      <input type="text" value={bannerCfg.icsDesc} onChange={e => updCfg({ icsDesc: e.target.value })} placeholder="웨비나 설명" className={inp} />
                    </Fld>
                    <Fld label="장소">
                      <input type="text" value={bannerCfg.icsLocation} onChange={e => updCfg({ icsLocation: e.target.value })} placeholder="Online" className={inp} />
                    </Fld>
                  </div>
                </>
              )}
            </Sect>

            <Sect {...sectState} id="survey" title="만족도 조사 (종료 모드)">
              <Fld label="조사 URL">
                <input type="url" value={bannerCfg.surveyUrl} onChange={e => updCfg({ surveyUrl: e.target.value })}
                  placeholder="https://tally.so/r/..." className={inp} />
              </Fld>
              <Fld label="버튼 레이블">
                <input type="text" value={bannerCfg.surveyLabel} onChange={e => updCfg({ surveyLabel: e.target.value })} className={inp} />
              </Fld>
            </Sect>

            <Sect {...sectState} id="schedule" title="배너 적용 일정">
              <div className="space-y-2">
                {([
                  ["사전등록 마감", webinar.signupDeadline],
                  ["라이브 시작",   webinar.liveStartAt],
                  ["라이브 종료",   webinar.liveEndAt],
                ] as const).map(([label, iso]) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
                    <span className="text-xs font-mono text-foreground tabular-nums">
                      {new Date(iso).toLocaleString("ko-KR", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })}
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/60">
                  일정 수정은{" "}
                  <span className="text-violet-400 font-medium">설정 탭</span>
                  에서 해주세요. 배너 코드에 자동 반영됩니다.
                </p>
              </div>
            </Sect>
          </div>
        )}

        {/* 코드 박스 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{codes[activeType].label}</p>
              <p className="text-xs text-muted-foreground">{codes[activeType].description}</p>
            </div>
            <div className="flex items-center gap-2">
              {activeType === "live-page" && (
                <button onClick={downloadHtml} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors shrink-0">
                  <FileCode className="w-3.5 h-3.5" />.html 저장
                </button>
              )}
              <button onClick={() => copyCode(activeType)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors shrink-0">
                {copied === activeType ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied === activeType ? "복사됨" : "복사"}
              </button>
            </div>
          </div>
          <pre className="p-4 rounded-2xl bg-secondary/50 border border-border text-xs overflow-x-auto leading-relaxed whitespace-pre-wrap break-all max-h-72">
            <code>{codes[activeType].code}</code>
          </pre>
        </div>

        {/* API 엔드포인트 */}
        <div className="p-4 rounded-2xl border border-border bg-secondary/20 space-y-2">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Public API 엔드포인트</p>
          </div>
          <div className="space-y-1.5 text-xs font-mono">
            {[["GET","info"],["POST","register"],["POST","verify"],["GET/POST","qa"],["GET","announcements"],["GET","popups"],["GET","tally-pushes"],["POST","ping"]].map(([m,e]) => (
              <p key={e}><span className="text-muted-foreground">{m}</span> {apiBase}/{e}</p>
            ))}
          </div>
        </div>
      </div>

      {/* ── 드래그 핸들 ── */}
      <div
        onMouseDown={handleDragStart}
        className="hidden lg:flex w-3 shrink-0 items-center justify-center cursor-col-resize hover:bg-violet-500/10 transition-colors group"
        title="드래그해서 크기 조절"
      >
        <GripVertical className="w-3 h-5 text-muted-foreground/30 group-hover:text-violet-400 transition-colors" />
      </div>

      {/* ── 우측: 미리보기 패널 ── */}
      <div className="hidden lg:flex shrink-0 flex-col" style={{ width: previewWidth }}>
        {/* 미리보기 헤더 */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <span className="text-xs font-medium text-muted-foreground">미리보기</span>
          <div className="flex items-center gap-1">
            {/* 배너 모드 토글 */}
            {activeType === "banner" && (
              <div className="flex items-center gap-0.5 mr-1 bg-secondary/50 rounded-lg p-0.5">
                {(["pre","live","ended"] as const).map(m => (
                  <button key={m} onClick={() => setPreviewBannerMode(m)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${previewBannerMode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {m === "pre" ? "사전등록" : m === "live" ? "라이브" : "종료"}
                  </button>
                ))}
              </div>
            )}
            {!isFullPreview && (
              <>
                <button onClick={() => setPreviewDevice("desktop")}
                  className={`p-1.5 rounded-lg transition-colors ${previewDevice === "desktop" ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Monitor className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setPreviewDevice("mobile")}
                  className={`p-1.5 rounded-lg transition-colors ${previewDevice === "mobile" ? "bg-violet-500/10 text-violet-500" : "text-muted-foreground hover:bg-secondary"}`}>
                  <Smartphone className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openPreviewInNewTab}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
              title={`${codes[activeType].label} 미리보기 새 탭에서 열기`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 미리보기 본문 */}
        <div className="flex-1 overflow-hidden bg-secondary/20">
          {previewUrl ? (
            <iframe
              src={previewUrl}
              className={`w-full h-full border-0 ${isResizing ? "pointer-events-none" : ""}`}
              title="미리보기"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-downloads allow-modals"
            />
          ) : (
            <div className="flex items-center justify-center h-full" style={{ background: bg }}>
              <div className={previewDevice === "mobile" ? "w-[375px]" : "w-full p-8"}>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
