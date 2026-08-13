/**
 * 공고 페이지·신청 폼의 **HTML 을 만드는 단일 렌더러.**
 *
 * 어드민 미리보기(React)와 아임웹 임베드(바닐라 번들)가 **이 함수를 함께 쓴다.** 각자 렌더러를
 * 들고 있으면 "미리보기와 실제가 다르다"가 반드시 생긴다 — 웨비나 SetupPreview.tsx 주석이
 * 같은 이유로 실물 컴포넌트를 그대로 띄운다.
 *
 * 문자열 HTML 로 만드는 이유: 임베드 쪽은 React 가 없다. 양쪽이 공유하려면 최소 공통분모인
 * HTML 문자열이어야 한다. 사용자 입력은 전부 escapeHtml 을 통과한다(주입 방지).
 */
import type { CompetitionConfig, CompetitionNoticeBlock } from "./competition-config";
import type { CompetitionPhase } from "./competition-status";

export interface CompetitionTheme {
  accentColor?: string;
  textColor?: string;
  surfaceColor?: string;
  borderRadius?: string;
  logoUrl?: string;
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** http/https 만 통과시킨다 — javascript: 로 스크립트를 심는 경로를 막는다. */
export function safeUrl(value: string): string {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

/**
 * 키 컬러 위 글자색. 아주 밝은 키컬러(노랑·연회색)에서만 진한 글자를 쓴다.
 * 임계값 0.78 은 웨비나 로더(publicFormOnAccent)와 **같은 값**이어야 한다 — 두 곳의 CTA 가
 * 같은 브랜드 색에서 다른 글자색을 내면 안 된다.
 */
export function onAccentColor(value: string): string {
  let hex = String(value || "").trim().replace("#", "");
  if ((hex.length !== 3 && hex.length !== 6) || /[^0-9a-f]/i.test(hex)) return "#ffffff";
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 >= 0.78 ? "#1a1a1f" : "#ffffff";
}

export function buildCompetitionCss(theme: CompetitionTheme): string {
  const accent = theme.accentColor || "#6d28d9";
  const radius = theme.borderRadius || "12px";
  const text = theme.textColor || "#111111";
  const surface = theme.surfaceColor || "#ffffff";
  return `
.mc { --mc-accent:${accent}; --mc-on-accent:${onAccentColor(accent)}; --mc-radius:${radius}; --mc-text:${text}; --mc-surface:${surface};
  color: var(--mc-text); box-sizing: border-box; }
.mc *, .mc *::before, .mc *::after { box-sizing: border-box; }
.mc-hero { padding: 28px 0 20px; }
.mc-hero-img { width: 100%; max-height: 360px; object-fit: cover; border-radius: var(--mc-radius); display: block; margin-bottom: 18px; }
.mc-title { font-size: 26px; font-weight: 800; line-height: 1.3; margin: 0 0 8px; word-break: keep-all; }
.mc-sub { font-size: 15px; line-height: 1.6; opacity: .72; margin: 0; word-break: keep-all; white-space: pre-line; }
.mc-cta-row { margin: 22px 0 8px; }
.mc-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding:14px 30px; border:0;
  border-radius: var(--mc-radius); font-size:15px; font-weight:700; line-height:1.2; cursor:pointer; text-decoration:none !important;
  background: var(--mc-accent) !important; color: var(--mc-on-accent) !important; -webkit-text-fill-color: var(--mc-on-accent) !important;
  transition: transform .18s ease, opacity .18s ease; }
.mc-btn:hover { transform: translateY(-1px); opacity: .93; }
.mc-btn[disabled] { background: rgba(120,120,128,.18) !important; color:#8a8a92 !important; -webkit-text-fill-color:#8a8a92 !important; cursor:not-allowed; transform:none; }
.mc-note { margin-top: 10px; font-size: 13px; opacity: .7; }
.mc-block { padding: 22px 0; border-top: 1px solid rgba(120,120,128,.18); }
.mc-block-title { font-size: 18px; font-weight: 700; margin: 0 0 12px; }
.mc-text { font-size: 14.5px; line-height: 1.75; margin: 0; white-space: pre-line; word-break: keep-all; }
.mc-list { margin: 0; padding-left: 18px; }
.mc-list li { font-size: 14.5px; line-height: 1.8; word-break: keep-all; }
.mc-steps { display: grid; gap: 10px; }
.mc-step { display: flex; gap: 12px; align-items: flex-start; }
.mc-step-no { flex: none; width: 26px; height: 26px; border-radius: 999px; display:flex; align-items:center; justify-content:center;
  background: color-mix(in srgb, var(--mc-accent) 14%, transparent); color: var(--mc-accent); font-size: 12px; font-weight: 800; }
.mc-step-title { font-size: 14.5px; font-weight: 700; margin: 0 0 2px; }
.mc-step-desc { font-size: 13.5px; line-height: 1.65; opacity: .75; margin: 0; white-space: pre-line; }
.mc-table { width: 100%; border-collapse: collapse; }
.mc-table th, .mc-table td { padding: 11px 12px; font-size: 14px; text-align: left; vertical-align: top;
  border-bottom: 1px solid rgba(120,120,128,.16); word-break: keep-all; }
.mc-table th { width: 34%; font-weight: 700; opacity: .78; }
.mc-faq-item { border-bottom: 1px solid rgba(120,120,128,.16); padding: 12px 0; }
.mc-faq-q { font-size: 14.5px; font-weight: 700; margin: 0 0 6px; }
.mc-faq-a { font-size: 13.5px; line-height: 1.7; opacity: .78; margin: 0; white-space: pre-line; }
.mc-block-img { width: 100%; border-radius: var(--mc-radius); display: block; }
.mc-cap { margin-top: 8px; font-size: 12.5px; opacity: .65; }
/* 신청 폼 모달 */
.mc-overlay { position: fixed; inset: 0; z-index: 999950; background: rgba(0,0,0,.55); display: flex;
  align-items: center; justify-content: center; padding: 16px; }
.mc-modal { width: 100%; max-width: 520px; max-height: calc(100dvh - 32px); display: flex; flex-direction: column;
  background: var(--mc-surface); color: var(--mc-text); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.3); overflow: hidden; }
.mc-modal-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px;
  border-bottom: 1px solid rgba(120,120,128,.18); }
.mc-modal-title { font-size: 15px; font-weight: 700; margin: 0; }
.mc-modal-close { border:0; background:transparent; font-size:22px; line-height:1; cursor:pointer; color:inherit; opacity:.6; padding:4px 8px; }
.mc-modal-body { padding: 18px; overflow-y: auto; }
.mc-field { margin-bottom: 14px; }
.mc-label { display:block; font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.mc-req { color: #dc2626; margin-left: 3px; }
.mc-input, .mc-select, .mc-textarea { width:100%; padding:11px 12px; font:inherit; font-size:14px; color:inherit;
  background: transparent; border:1px solid rgba(120,120,128,.35); border-radius: 10px; outline: none; }
.mc-input:focus, .mc-select:focus, .mc-textarea:focus { border-color: var(--mc-accent); }
.mc-textarea { min-height: 84px; resize: vertical; }
.mc-hint { margin-top: 5px; font-size: 11.5px; opacity: .62; }
.mc-check { display:flex; align-items:flex-start; gap:8px; font-size:13px; line-height:1.5; margin-bottom:8px; cursor:pointer; }
.mc-check input { margin-top: 2px; flex: none; }
.mc-consent-link { text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.mc-files { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.mc-thumb { position:relative; width:72px; height:72px; border-radius:10px; overflow:hidden; background:rgba(120,120,128,.12); }
.mc-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.mc-thumb button { position:absolute; top:2px; right:2px; border:0; border-radius:999px; width:18px; height:18px; line-height:1;
  background:rgba(0,0,0,.6); color:#fff; cursor:pointer; font-size:12px; }
.mc-msg { margin-top: 10px; font-size: 13px; min-height: 18px; }
.mc-msg-error { color: #dc2626; }
.mc-msg-success { color: #059669; }
.mc-submit { width: 100%; margin-top: 6px; }
.mc-preview-banner { background:#fef3c7; color:#92400e; font-size:12.5px; font-weight:600; padding:10px 14px; border-radius:10px; margin-bottom:16px; }
@media (max-width: 600px) { .mc-title { font-size: 22px; } .mc-table th { width: 40%; } }
`.trim();
}

function blockHtml(block: CompetitionNoticeBlock): string {
  const title = block.title ? `<h3 class="mc-block-title">${escapeHtml(block.title)}</h3>` : "";
  switch (block.kind) {
    case "richText": {
      if (!block.body.trim() && !block.title) return "";
      return `<section class="mc-block">${title}<p class="mc-text">${escapeHtml(block.body)}</p></section>`;
    }
    case "list": {
      const items = block.items.filter((i) => i.trim());
      if (!items.length && !block.title) return "";
      return `<section class="mc-block">${title}<ul class="mc-list">${items
        .map((i) => `<li>${escapeHtml(i)}</li>`)
        .join("")}</ul></section>`;
    }
    case "steps": {
      const steps = block.steps.filter((s) => s.title.trim() || s.description.trim());
      if (!steps.length && !block.title) return "";
      return `<section class="mc-block">${title}<div class="mc-steps">${steps
        .map(
          (s, i) =>
            `<div class="mc-step"><span class="mc-step-no">${i + 1}</span><div><p class="mc-step-title">${escapeHtml(
              s.title,
            )}</p><p class="mc-step-desc">${escapeHtml(s.description)}</p></div></div>`,
        )
        .join("")}</div></section>`;
    }
    case "infoTable": {
      const rows = block.rows.filter((r) => r.label.trim() || r.value.trim());
      if (!rows.length && !block.title) return "";
      return `<section class="mc-block">${title}<table class="mc-table"><tbody>${rows
        .map((r) => `<tr><th>${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td></tr>`)
        .join("")}</tbody></table></section>`;
    }
    case "faq": {
      const items = block.items.filter((i) => i.question.trim() || i.answer.trim());
      if (!items.length && !block.title) return "";
      return `<section class="mc-block">${title}${items
        .map(
          (i) =>
            `<div class="mc-faq-item"><p class="mc-faq-q">${escapeHtml(i.question)}</p><p class="mc-faq-a">${escapeHtml(
              i.answer,
            )}</p></div>`,
        )
        .join("")}</section>`;
    }
    case "image": {
      const url = safeUrl(block.url);
      if (!url) return "";
      return `<section class="mc-block">${title}<img class="mc-block-img" src="${escapeHtml(url)}" alt="${escapeHtml(
        block.title || "이미지",
      )}" loading="lazy">${block.caption ? `<p class="mc-cap">${escapeHtml(block.caption)}</p>` : ""}</section>`;
    }
  }
}

export interface RenderNoticeOptions {
  config: CompetitionConfig;
  competitionName: string;
  phase: CompetitionPhase;
  canApply: boolean;
  /** 미리보기에서는 상단에 배너를 띄우고 제출 부작용을 막는다. */
  preview?: boolean;
}

export function renderNoticeHtml({ config, competitionName, phase, canApply, preview }: RenderNoticeOptions): string {
  const { notice, statusMessages } = config;
  const heroImage = notice.heroImageUrl ? safeUrl(notice.heroImageUrl) : "";
  const title = notice.heroTitle.trim() || competitionName;

  // 접수 기간 밖에서는 버튼 자리에 이유를 적는다. 눌리지 않는 버튼만 두면 사람들이 계속 누른다.
  const ctaHtml = canApply
    ? `<button type="button" class="mc-btn" data-mc-apply>${escapeHtml(notice.applyLabel || "참가 신청하기")}</button>`
    : `<button type="button" class="mc-btn" disabled>${escapeHtml(notice.applyLabel || "참가 신청하기")}</button>
       <p class="mc-note">${escapeHtml(phase === "upcoming" ? statusMessages.upcoming : statusMessages.closed)}</p>`;

  return `
<div class="mc">
  ${preview ? '<div class="mc-preview-banner">미리보기입니다. 신청해도 저장되지 않아요.</div>' : ""}
  <div class="mc-hero">
    ${heroImage ? `<img class="mc-hero-img" src="${escapeHtml(heroImage)}" alt="">` : ""}
    <h2 class="mc-title">${escapeHtml(title)}</h2>
    ${notice.heroSubtitle.trim() ? `<p class="mc-sub">${escapeHtml(notice.heroSubtitle)}</p>` : ""}
    <div class="mc-cta-row">${ctaHtml}</div>
  </div>
  ${notice.blocks.filter((b) => b.enabled).map(blockHtml).join("")}
</div>`.trim();
}

/** 신청 폼 본문(모달 안). 파일·YouTube 항목은 런타임이 이벤트를 붙일 수 있게 data 속성을 단다. */
export function renderFormFieldsHtml(config: CompetitionConfig): string {
  const parts = config.form.fields
    .filter((f) => f.enabled)
    .map((field) => {
      const req = field.required ? '<span class="mc-req">*</span>' : "";
      const label = `<label class="mc-label" for="mc-f-${escapeHtml(field.key)}">${escapeHtml(field.label)}${req}</label>`;
      const common = `id="mc-f-${escapeHtml(field.key)}" data-mc-key="${escapeHtml(field.key)}"`;

      if (field.type === "image") {
        const max = field.maxFiles ?? 3;
        return `<div class="mc-field">${label}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple ${common} data-mc-image data-mc-max="${max}" class="mc-input">
          <p class="mc-hint">장당 4MB 이하, 최대 ${max}장</p>
          <div class="mc-files" data-mc-files></div></div>`;
      }
      if (field.type === "youtube") {
        return `<div class="mc-field">${label}
          <input type="url" ${common} class="mc-input" placeholder="${escapeHtml(field.placeholder || "https://youtube.com/watch?v=...")}">
          <p class="mc-hint">비공개(Private) 영상은 심사·투표 화면에서 재생되지 않아요. 미등록(Unlisted) 또는 공개로 설정해주세요.</p></div>`;
      }
      if (field.type === "select" || field.type === "multiple") {
        const options = field.options
          .filter((o) => o.trim())
          .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
          .join("");
        return `<div class="mc-field">${label}
          <select ${common} class="mc-select" ${field.type === "multiple" ? "multiple" : ""}>
            ${field.type === "select" ? '<option value="">선택해주세요</option>' : ""}${options}
          </select></div>`;
      }
      if (field.type === "checkbox") {
        return `<div class="mc-field"><label class="mc-check"><input type="checkbox" ${common}><span>${escapeHtml(
          field.label,
        )}${field.required ? " (필수)" : ""}</span></label></div>`;
      }
      if (field.key === "summary") {
        return `<div class="mc-field">${label}<textarea ${common} class="mc-textarea" placeholder="${escapeHtml(
          field.placeholder,
        )}"></textarea></div>`;
      }
      const inputType = field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text";
      return `<div class="mc-field">${label}<input type="${inputType}" ${common} class="mc-input" placeholder="${escapeHtml(
        field.placeholder,
      )}"></div>`;
    });

  const consent = `
    <label class="mc-check"><input type="checkbox" data-mc-privacy${config.form.privacyDefaultChecked ? " checked" : ""}>
      <span${config.form.privacyBody ? ' class="mc-consent-link" data-mc-terms="privacy"' : ""}>${escapeHtml(config.form.privacyText)}</span></label>
    <label class="mc-check"><input type="checkbox" data-mc-marketing${config.form.marketingDefaultChecked ? " checked" : ""}>
      <span${config.form.marketingBody ? ' class="mc-consent-link" data-mc-terms="marketing"' : ""}>${escapeHtml(config.form.marketingText)}</span></label>`;

  return `${parts.join("")}${consent}
    <input type="text" data-mc-hp tabindex="-1" autocomplete="off" aria-hidden="true"
      style="position:absolute;left:-9999px;top:-9999px;height:1px;width:1px;opacity:0">
    <button type="submit" class="mc-btn mc-submit" data-mc-submit>${escapeHtml(config.form.submitLabel)}</button>
    <p class="mc-msg" data-mc-msg></p>`;
}
