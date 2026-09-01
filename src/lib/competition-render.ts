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
import { competitionFormStrings } from "./competition-strings";
import type { CompetitionConfig, CompetitionNoticeBlock } from "./competition-config";
import type { CompetitionPhase } from "./competition-status";
import { COUNTRY_DIALS, flagEmoji, isKnownCountry } from "./collect-country";
import { onAccentColor } from "@/lib/color";

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
 * 키 컬러 위 글자색.
 *
 * 계산은 `@/lib/color` 한 곳에 있다. **이름은 여기 그대로 둔다** — 폼 로더(`collect-form/mount`,
 * `lookup-mount`), 공고(`notice/mount`, `notice/build-model`), 대회 공개 화면(`show/[token]`)이
 * 전부 이 파일에서 가져간다.
 */
export { onAccentColor } from "@/lib/color";

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
/* 전화 — 국가코드 칸 + 번호 칸 (사전등록 msf-tel 과 같은 계약) */
.mc-tel { display:flex; gap:8px; align-items:stretch; }
.mc-tel-cc { flex: 0 0 auto; max-width: 44%; padding: 0 8px; font-size: 14px; font-weight: 600;
  background: transparent; border: 1px solid rgba(120,120,128,.35); border-radius: 10px; color: inherit;
  white-space: nowrap; cursor: pointer; min-height: 44px; }
.mc-tel-cc:focus { border-color: var(--mc-accent); }
.mc-tel .mc-input { flex: 1 1 auto; min-width: 0; }
.mc-hint { margin-top: 5px; font-size: 11.5px; opacity: .62; }
.mc-check { display:flex; align-items:flex-start; gap:8px; font-size:13px; line-height:1.5; margin-bottom:8px; cursor:pointer; }
.mc-check input { margin-top: 2px; flex: none; }
/* 놓치기 쉬운 체크박스(참가자격 확인 등)를 눈에 띄게 — 배경·테두리로 감싸고 굵게. */
.mc-check-emph { padding: 12px 14px; border-radius: var(--mc-radius);
  background: color-mix(in srgb, var(--mc-accent) 10%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--mc-accent) 45%, transparent); }
.mc-check-emph span { font-weight: 700; }
.mc-consent-link { text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
/* 파일 선택 버튼 — 네이티브 input 은 화면 밖에 둔다(display:none 이면 탭 순서에서도 빠져
   키보드로 못 연다). 클릭은 <label> 위임이 아니라 버튼이 JS 로 input.click() 을 직접
   부른다 — iOS Safari 는 이렇게 극단적으로 축소된(clip 된) input 을 <label> 로 감싸면
   탭해도 파일 선택창이 안 뜨는 경우가 있다(WebKit 파일 input 알려진 버그). 관리자용 로고
   업로드(EntryLogoControl)도 처음부터 이 방식이라, 여기만 다른 방식을 쓰고 있었다. */
.mc-file-input { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
.mc-file-btn { display:inline-flex; align-items:center; padding:10px 16px; font-size:13px; font-weight:600;
  border:1px solid rgba(120,120,128,.35); border-radius:10px; cursor:pointer; color:inherit; background:transparent;
  transition:border-color .15s ease,color .15s ease; }
.mc-file-btn:hover { border-color: var(--mc-accent); color: var(--mc-accent); }
.mc-file-btn:focus-visible { outline:2px solid var(--mc-accent); outline-offset:2px; }
.mc-files { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
.mc-thumb { position:relative; width:72px; height:72px; border-radius:10px; overflow:hidden; background:rgba(120,120,128,.12); }
.mc-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.mc-thumb button { position:absolute; top:2px; right:2px; border:0; border-radius:999px; width:18px; height:18px; line-height:1;
  background:rgba(0,0,0,.6); color:#fff; cursor:pointer; font-size:12px; }
/* 반복 항목(팀원 등) — 행 하나가 mc-field 여러 개를 묶는다. */
.mc-rep-rows { display: flex; flex-direction: column; gap: 10px; }
.mc-rep-row { padding: 12px; border: 1px solid rgba(120,120,128,.22); border-radius: var(--mc-radius); display: flex; flex-direction: column; gap: 10px; }
.mc-rep-row-head { display: flex; align-items: center; justify-content: space-between; }
.mc-rep-row-title { font-size: 12px; font-weight: 700; opacity: .7; }
.mc-rep-remove { border: 0; background: transparent; color: inherit; opacity: .55; cursor: pointer; font-size: 18px; line-height: 1; padding: 2px 6px; }
.mc-rep-remove:hover { opacity: 1; color: #dc2626; }
.mc-rep-add { margin-top: 10px; display: inline-flex; align-items: center; padding: 9px 14px; font-size: 13px; font-weight: 600;
  border: 1px dashed rgba(120,120,128,.4); border-radius: 10px; cursor: pointer; color: inherit; background: transparent; }
.mc-rep-add:hover { border-color: var(--mc-accent); color: var(--mc-accent); }
.mc-rep-add[disabled] { opacity: .4; cursor: not-allowed; }
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
  const t = competitionFormStrings(config.language);
  const heroImage = notice.heroImageUrl ? safeUrl(notice.heroImageUrl) : "";
  const title = notice.heroTitle.trim() || competitionName;

  // 접수 기간 밖에서는 버튼 자리에 이유를 적는다. 눌리지 않는 버튼만 두면 사람들이 계속 누른다.
  // applyLabel 기본값도 언어를 따른다 — 운영자가 안 채웠다고 영문 공고에 한글 버튼이 뜨면 안 된다.
  const ctaHtml = canApply
    ? `<button type="button" class="mc-btn" data-mc-apply>${escapeHtml(notice.applyLabel || t.applyLabel)}</button>`
    : `<button type="button" class="mc-btn" disabled>${escapeHtml(notice.applyLabel || t.applyLabel)}</button>
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

/**
 * 신청 폼 팝업의 **껍데기**(제목·닫기·안내문 + 본문).
 *
 * 런타임과 어드민 미리보기가 이걸 같이 쓴다. 껍데기를 각자 만들면 제목 문구나 여백이
 * 조용히 어긋나서 "미리보기에서는 괜찮았는데" 가 생긴다 — 공고 페이지에서 같은 이유로
 * renderNoticeHtml 을 공유하고 있다.
 */
export function renderFormModalHtml(config: CompetitionConfig): string {
  const t = competitionFormStrings(config.language);
  return `
    <div class="mc-modal-head">
      <h3 class="mc-modal-title">${escapeHtml(config.form.title || t.modalTitle)}</h3>
      <button type="button" class="mc-modal-close" aria-label="${escapeHtml(t.close)}">&times;</button>
    </div>
    <div class="mc-modal-body">
      ${config.form.description ? `<p class="mc-hint" style="margin-bottom:14px">${escapeHtml(config.form.description)}</p>` : ""}
      ${renderFormFieldsHtml(config)}
    </div>`;
}

/** 신청 폼 본문(모달 안). 파일·YouTube 항목은 런타임이 이벤트를 붙일 수 있게 data 속성을 단다. */
export function renderFormFieldsHtml(config: CompetitionConfig): string {
  // 시스템 문구는 사전에서 — 운영자가 손댈 수 없는 자리라 언어를 못 맞추면 방법이 없다.
  const t = competitionFormStrings(config.language);
  const parts = config.form.fields
    .filter((f) => f.enabled)
    .map((field) => {
      const req = field.required ? '<span class="mc-req">*</span>' : "";
      const label = `<label class="mc-label" for="mc-f-${escapeHtml(field.key)}">${escapeHtml(field.label)}${req}</label>`;
      const common = `id="mc-f-${escapeHtml(field.key)}" data-mc-key="${escapeHtml(field.key)}"`;

      if (field.type === "image") {
        const max = field.maxFiles ?? 3;
        // 네이티브 <input type=file> 의 "파일 선택" 버튼 라벨은 브라우저 UI 언어를 따른다
        // (페이지 언어와 무관) — 영문 폼에서도 한글로 남는다. 입력을 시각적으로 숨기고
        // 라벨을 우리 사전 문구로 직접 그린다(competition-strings.ts 참고).
        // <label> 로 감싸지 않고 버튼 + input.click() 조합을 쓴다 — 위 CSS 주석 참고.
        return `<div class="mc-field">${label}
          <button type="button" class="mc-file-btn" data-mc-image-btn="${escapeHtml(field.key)}">${escapeHtml(t.chooseFile)}</button>
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple tabindex="-1" aria-hidden="true" ${common} data-mc-image data-mc-max="${max}" class="mc-file-input">
          <p class="mc-hint">${escapeHtml(t.imageHint(max))}</p>
          <div class="mc-files" data-mc-files></div></div>`;
      }
      if (field.type === "repeater") {
        const subFields = field.subFields ?? [];
        const min = field.minItems ?? 1;
        const max = field.maxItems ?? 10;
        const rowFieldsHtml = subFields
          .map((sf) => {
            const req = sf.required ? '<span class="mc-req">*</span>' : "";
            return `<div class="mc-field"><label class="mc-label">${escapeHtml(sf.label)}${req}</label>
              <input type="${sf.type === "email" ? "email" : "text"}" class="mc-input" data-mc-rep-field="${escapeHtml(sf.key)}"></div>`;
          })
          .join("");
        // 초기 화면에도 최소 행 수만큼 미리 그린다 — 빈 화면에서 "+ 추가"를 누르는 것보다
        // 몇 명분을 채워야 하는지 바로 보이는 편이 낫다(최소 0이어도 1행은 보여준다).
        const initialCount = Math.max(min, 1);
        const rowHtml = `<div class="mc-rep-row" data-mc-rep-row>
            <div class="mc-rep-row-head"><span class="mc-rep-row-title" data-mc-rep-title></span>
              <button type="button" class="mc-rep-remove" data-mc-rep-remove aria-label="${escapeHtml(t.removeRow)}">&times;</button></div>
            ${rowFieldsHtml}
          </div>`;
        const rows = Array.from({ length: initialCount }, () => rowHtml).join("");
        return `<div class="mc-field">${label}
          <div class="mc-rep-rows" data-mc-rep-rows data-mc-key="${escapeHtml(field.key)}"
            data-mc-rep-min="${min}" data-mc-rep-max="${max}" data-mc-rep-label="${escapeHtml(field.label)}"
            data-mc-rep-count-from="${escapeHtml(field.countFromKey ?? "")}"
            data-mc-rep-count-exclude="${field.countExclude ?? 0}">${rows}</div>
          <template data-mc-rep-template>${rowHtml}</template>
          <button type="button" class="mc-rep-add" data-mc-rep-add data-mc-rep-add-for="${escapeHtml(field.key)}">+ ${escapeHtml(t.addRow)}</button>
        </div>`;
      }
      if (field.type === "youtube") {
        return `<div class="mc-field">${label}
          <input type="url" ${common} class="mc-input" placeholder="${escapeHtml(field.placeholder || "https://youtube.com/watch?v=...")}">
          <p class="mc-hint">${escapeHtml(t.youtubeHint)}</p></div>`;
      }
      if (field.type === "select" || field.type === "multiple") {
        const options = field.options
          .filter((o) => o.trim())
          .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
          .join("");
        return `<div class="mc-field">${label}
          <select ${common} class="mc-select" ${field.type === "multiple" ? "multiple" : ""}>
            ${field.type === "select" ? `<option value="">${escapeHtml(t.choosePlaceholder)}</option>` : ""}${options}
          </select></div>`;
      }
      if (field.type === "checkbox") {
        const checkClass = field.emphasized ? "mc-check mc-check-emph" : "mc-check";
        return `<div class="mc-field"><label class="${checkClass}"><input type="checkbox" ${common}><span>${escapeHtml(
          field.label,
        )}${field.required ? t.required : ""}</span></label></div>`;
      }
      if (field.key === "summary") {
        return `<div class="mc-field">${label}<textarea ${common} class="mc-textarea" placeholder="${escapeHtml(
          field.placeholder,
        )}"></textarea></div>`;
      }
      if (field.type === "tel") {
        // 국가 선택(사전등록과 같은 계약, §6.3). 값은 국가번호를 붙여 보내지 않고 고른 국가를
        // 그대로 보낸다 — 앞 0 처리 규칙이 나라마다 달라(한국은 떼고 이탈리아는 안 뗀다) 붙이면 틀린다.
        const defaultCountry = config.form.defaultCountry;
        const options = COUNTRY_DIALS.map(
          (c) =>
            `<option value="${c.code}"${isKnownCountry(defaultCountry) && c.code === defaultCountry.toUpperCase() ? " selected" : ""}>${flagEmoji(c.code)} +${c.dial} ${escapeHtml(c.name)}</option>`,
        ).join("");
        return `<div class="mc-field">${label}<div class="mc-tel">
          <select class="mc-tel-cc" data-mc-cc="${escapeHtml(field.key)}" aria-label="${escapeHtml(field.label)} — country">${options}</select>
          <input type="tel" inputmode="tel" ${common} class="mc-input" placeholder="${escapeHtml(field.placeholder)}"></div></div>`;
      }
      if (field.type === "number") {
        // 반복 그룹의 "인원수 항목과 연동"이 이 값을 그대로 Number() 로 읽는다 — 자유
        // 텍스트로 두면 신청자가 아무거나 적어 연동이 조용히 안 먹는다.
        return `<div class="mc-field">${label}<input type="number" inputmode="numeric" min="0" step="1" ${common} class="mc-input" placeholder="${escapeHtml(
          field.placeholder,
        )}"></div>`;
      }
      const inputType = field.type === "email" ? "email" : "text";
      return `<div class="mc-field">${label}<input type="${inputType}" ${common} class="mc-input" placeholder="${escapeHtml(
        field.placeholder,
      )}"></div>`;
    });

  const consentDetail = (kind: "privacy" | "marketing" | "thirdParty", text: string, body: string, mode: "text" | "link", linkUrl: string) => {
    const href = safeUrl(linkUrl);
    if (mode === "link" && href) return `<a class="mc-consent-link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
    return `<span${body ? ` class="mc-consent-link" data-mc-terms="${kind === "thirdParty" ? "third-party" : kind}"` : ""}>${escapeHtml(text)}</span>`;
  };
  const consent = `
    <label class="mc-check"><input type="checkbox" data-mc-privacy${config.form.privacyDefaultChecked ? " checked" : ""}>
      ${consentDetail("privacy", config.form.privacyText, config.form.privacyBody, config.form.privacyBodyMode, config.form.privacyLinkUrl)}</label>
    <label class="mc-check"><input type="checkbox" data-mc-marketing${config.form.marketingDefaultChecked ? " checked" : ""}>
      ${consentDetail("marketing", config.form.marketingText, config.form.marketingBody, config.form.marketingBodyMode, config.form.marketingLinkUrl)}</label>
    ${config.form.thirdPartyEnabled ? `<label class="mc-check"><input type="checkbox" data-mc-third-party${config.form.thirdPartyDefaultChecked ? " checked" : ""}>
      ${consentDetail("thirdParty", config.form.thirdPartyText, config.form.thirdPartyBody, config.form.thirdPartyBodyMode, config.form.thirdPartyLinkUrl)}</label>` : ""}`;

  return `${parts.join("")}${consent}
    <input type="text" data-mc-hp tabindex="-1" autocomplete="off" aria-hidden="true"
      style="position:absolute;left:-9999px;top:-9999px;height:1px;width:1px;opacity:0">
    <button type="submit" class="mc-btn mc-submit" data-mc-submit>${escapeHtml(config.form.submitLabel || t.submit)}</button>
    <p class="mc-msg" data-mc-msg></p>`;
}
