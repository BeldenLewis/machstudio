/**
 * 랜딩 상세페이지 스타일 — 단독 페이지 / 어드민 미리보기 / 외부 사이트 임베드가 모두 이 한 벌을 쓴다.
 * 다크 에디토리얼 고정 테마(의도된 단일 테마), 키컬러만 theme.accentColor 에서 파생.
 */

export const LANDING_CSS = `
.lnd {
  --ink: #06080d;
  --ink-soft: #0d131d;
  --panel: #171d2a;
  --paper: #f6f8ff;
  --muted: #abb5c7;
  --line: rgba(255, 255, 255, .12);
  --primary-bright: color-mix(in srgb, var(--primary) 76%, #ffffff);
  --primary-soft: color-mix(in srgb, var(--primary) 70%, #05060a);
  --primary-ink: color-mix(in srgb, var(--primary) 52%, #050403);
  --max: 960px;
  --shadow: 0 26px 80px rgba(0, 6, 24, .38);
  --sans: "Pretendard Variable", Pretendard, "Noto Sans KR", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  min-height: 100%;
  background: var(--ink);
  color: var(--paper);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  transition: background-color .8s ease;
}
.lnd.on-accent { background: var(--primary); }
.lnd *, .lnd *::before, .lnd *::after { box-sizing: border-box; margin: 0; padding: 0; }
.lnd a { color: inherit; text-decoration: none; }
.lnd button { font: inherit; color: inherit; }
.lnd ::selection { background: var(--primary); color: var(--on-primary); }
.lnd :focus-visible { outline: 3px solid var(--primary-bright); outline-offset: 4px; }

.lnd .preview-badge {
  position: fixed; left: 12px; top: 12px; z-index: 200;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(255, 255, 255, .92); color: #111827;
  font-size: 12px; font-weight: 800;
}

/* ── 왼쪽 세로 목차 — 넓은 화면 전용(임베드에선 미표시) ── */
.lnd .toc {
  position: fixed; left: 24px; top: 50%; transform: translateY(-50%); z-index: 90;
  display: none; flex-direction: column; gap: 2px;
}
@media (min-width: 1280px) { .lnd .toc { display: flex; } }
.lnd .toc-link {
  display: flex; align-items: center; gap: 11px; min-height: 30px;
  color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
  transition: color .4s ease;
}
.lnd .toc-mark {
  flex: 0 0 auto; width: 16px; height: 2px; background: currentColor; opacity: .5;
  transition: width .25s ease, opacity .25s ease, background .4s ease;
}
.lnd .toc-link:hover { color: var(--paper); }
.lnd .toc-link[aria-current="true"] { color: var(--primary-bright); }
.lnd .toc-link[aria-current="true"] .toc-mark { width: 30px; opacity: 1; background: var(--primary-bright); }
.lnd.on-accent .toc-link { color: color-mix(in srgb, var(--on-primary) 58%, transparent); }
.lnd.on-accent .toc-link:hover,
.lnd.on-accent .toc-link[aria-current="true"] { color: var(--on-primary); }
.lnd.on-accent .toc-link[aria-current="true"] .toc-mark { background: var(--on-primary); }

/* ── 히어로 ──
   호스트 DOM 에 직접 마운트하면 100svh 가 브라우저 네이티브로 동작한다(모바일 주소창 접힘에도
   재계산 없음). 레거시 iframe 임베드에서만 문서 전체 높이가 되어 무한 성장하므로,
   그 경로에 한해 호스트가 postMessage 로 넘겨준 --lnd-vh 로 대체한다. */
.lnd .hero {
  position: relative;
  min-height: 100svh;
  display: grid; place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(7, 12, 26, .15) 0 20%, transparent 21%),
    linear-gradient(180deg, #05070c 0%, #05070d 100%);
}
.lnd[data-legacy-iframe] .hero { min-height: var(--lnd-vh, 720px); }
.lnd .hero::before,
.lnd .hero::after {
  content: ""; position: absolute; inset: 50% auto auto 50%;
  transform: translate(-50%, -50%); border-radius: 50%; pointer-events: none;
}
.lnd .hero::before {
  width: min(112vw, 1220px); aspect-ratio: 1;
  background: radial-gradient(circle,
    transparent 0 34%,
    color-mix(in srgb, var(--primary) 22%, transparent) 35%,
    var(--primary-bright) 44%,
    var(--primary-soft) 51%,
    color-mix(in srgb, var(--primary-soft) 62%, transparent) 59%,
    transparent 69%);
  filter: saturate(1.15); opacity: .92;
}
.lnd .hero::after {
  width: min(55vw, 590px); aspect-ratio: 1;
  background: radial-gradient(circle at 50% 45%, #05070b 0 56%, #02040a 72%);
  box-shadow: 0 0 100px rgba(0, 0, 0, .8);
}
.lnd .hero-media { position: absolute; inset: 0; z-index: 1; overflow: hidden; }
.lnd .hero-media img, .lnd .hero-media video { width: 100%; height: 100%; object-fit: cover; }
.lnd .hero-media.has-media::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(4, 6, 11, .5), rgba(4, 6, 11, .82));
}
.lnd .hero-inner {
  position: relative; z-index: 2; align-self: stretch; justify-self: center;
  width: min(100% - 40px, 980px);
  display: grid; place-items: center;
  padding: 96px 0 clamp(40px, 6vh, 76px);
}
.lnd .hero-copy { text-align: center; }
.lnd .eyebrow {
  margin: 0 0 6px;
  font-size: clamp(15px, 1.8vw, 22px); font-weight: 900; letter-spacing: -.03em;
  color: var(--primary-bright);
}
/* 임베드에선 호스트에 h1 이 이미 있어 히어로 제목만 h2 로 낮춘다 — 시각은 동일하게 */
.lnd .hero h1,
.lnd .hero h2 {
  font-size: clamp(44px, 7vw, 92px); font-weight: 900; letter-spacing: -.055em;
  line-height: .98; text-transform: uppercase; text-wrap: balance; word-break: keep-all;
}
.lnd .hero h1 span, .lnd .hero h2 span { display: block; }
.lnd .hero-subtitle {
  margin: 24px 0 0;
  font-size: clamp(17px, 2.3vw, 30px); font-weight: 800; letter-spacing: -.035em; word-break: keep-all;
}
.lnd .hero-meta {
  position: absolute; left: 0; bottom: 54px;
  color: #fff; font-size: clamp(16px, 2vw, 21px); font-weight: 700; line-height: 1.5;
  letter-spacing: -.01em; white-space: pre-line; font-variant-numeric: tabular-nums;
}
.lnd .hero-cta {
  position: absolute; right: 0; bottom: 48px;
  min-width: 210px; min-height: 58px;
  display: inline-flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 0 24px; border-radius: 999px;
  background: var(--primary);
  color: var(--on-primary);
  box-shadow: 0 16px 34px color-mix(in srgb, var(--primary) 34%, transparent);
  font-weight: 850;
  transition: transform .2s ease, box-shadow .2s ease;
}
.lnd .hero-cta:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 42px color-mix(in srgb, var(--primary) 46%, transparent);
}
.lnd .hero-cta svg { width: 23px; height: 23px; flex: 0 0 auto; }

/* ── ABOUT ── */
.lnd .intro {
  position: relative; min-height: 560px;
  display: grid; place-items: center;
  padding: 100px 24px; background: #000; text-align: center;
}
.lnd .intro-copy { max-width: 760px; }
.lnd .intro h2 {
  font-size: clamp(28px, 4vw, 48px); font-weight: 900; line-height: 1.28; letter-spacing: -.04em;
  white-space: pre-line; text-wrap: balance; word-break: keep-all;
}
.lnd .intro p {
  margin: 44px auto 0; color: #c3cad6;
  font-size: clamp(15px, 1.8vw, 21px); line-height: 1.85; letter-spacing: -.02em;
  white-space: pre-line; word-break: keep-all;
}
.lnd .scroll-cue {
  position: absolute; left: 50%; bottom: 44px;
  width: 22px; height: 22px;
  border-right: 2px solid rgba(255, 255, 255, .6); border-bottom: 2px solid rgba(255, 255, 255, .6);
  transform: translateX(-50%) rotate(45deg);
}

/* ── 섹션 공통 ── */
.lnd .section {
  width: min(100% - 36px, var(--max));
  margin: 0 auto;
  padding: clamp(92px, 12vw, 150px) 0;
}
.lnd .section-title {
  margin: 0 0 clamp(42px, 6vw, 70px);
  text-align: center;
  font-size: clamp(30px, 4vw, 44px); font-weight: 900; line-height: 1; letter-spacing: -.04em; text-transform: uppercase;
}
.lnd .accent-zone .section-title { transition: color .8s ease; }
.lnd.on-accent .accent-zone .section-title { color: var(--on-primary); }

/* ── 세션 카드 ── */
/* 데스크톱 2개/줄(50%-half gap). flex + 가운데 정렬이라 개수 무관하게 균형 유지 */
.lnd .session-cards { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px; }
.lnd .session-card {
  position: relative;
  width: calc(50% - 8px); max-width: 460px; aspect-ratio: 210 / 297; /* A4 세로 */
  overflow: hidden; border-radius: 9px;
  background: linear-gradient(160deg, #1b2130, #12161f 60%, #0c0f16);
  box-shadow: var(--shadow);
  transform: translateZ(0);
  /* article/button 겸용 — 버튼일 때 기본 스타일 리셋 */
  display: block; text-align: left; color: inherit; font: inherit; border: 0; padding: 0; appearance: none;
}
.lnd .session-card.is-clickable { cursor: pointer; transition: transform .22s ease, box-shadow .22s ease; }
.lnd .session-card.is-clickable:hover { transform: translateY(-4px); box-shadow: 0 26px 54px rgba(0, 0, 0, .5); }
.lnd .session-card.is-clickable:focus-visible { outline: 2px solid var(--primary-bright); outline-offset: 3px; }
.lnd .session-photo { position: absolute; inset: 0; z-index: 0; width: 100%; height: 100%; object-fit: cover; }
.lnd .session-card::after {
  content: ""; position: absolute; inset: 0; z-index: 1;
  background: linear-gradient(180deg, transparent 26%, rgba(3, 7, 14, .12) 44%, rgba(3, 7, 14, .96) 100%);
}
.lnd .session-card-body {
  position: absolute; z-index: 2; inset: auto 16px 16px;
  display: flex; flex-direction: column; align-items: flex-start;
}
.lnd .session-time {
  display: inline-flex; align-items: center; min-height: 29px; padding: 0 9px; border-radius: 3px;
  background: var(--primary); color: var(--on-primary);
  font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums;
}
.lnd .session-card h3 {
  margin: 12px 0 20px;
  font-size: 17px; line-height: 1.35; letter-spacing: -.03em; word-break: keep-all;
}
.lnd .speaker { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; color: #dfe5f0; font-size: 12px; }
.lnd .speaker b { color: #fff; font-weight: 800; }
.lnd .speaker-co { color: #aeb8c9; font-size: 11px; font-weight: 600; letter-spacing: -.01em; }
.lnd .session-more {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 11px;
  font-size: 11px; font-weight: 800; letter-spacing: -.01em; color: var(--primary-bright);
}
.lnd .session-more svg { width: 13px; height: 13px; }

/* ── body 직계 고정 레이어 ── 모달처럼 뷰포트에 붙어야 하는 것만 여기 산다.
   외부 사이트(아임웹)에 마운트되면 조상에 position:relative/transform 이 있어
   랜딩 내부의 position:fixed 가 갇힌다 → 레이어를 body 직계로 포털한다.
   평소엔 pointer-events:none 이라 호스트 클릭을 가로채지 않는다. */
.lnd.lnd-layer {
  position: fixed; inset: 0; z-index: 999960;
  background: none; min-height: 0; width: auto; margin: 0; overflow: visible;
  pointer-events: none;
}
.lnd.lnd-layer > * { pointer-events: auto; }

/* ── 세션 상세 팝업 (글래스모피즘) — 뷰포트 중앙 고정 ── */
.lnd .lnd-modal-root {
  position: fixed; inset: 0; z-index: 1;
  display: grid; place-items: center; padding: 16px;
}
.lnd .lnd-modal-backdrop {
  position: absolute; inset: 0; background: rgba(4, 6, 11, .62);
  -webkit-backdrop-filter: blur(7px); backdrop-filter: blur(7px);
  animation: lnd-modal-fade .2s ease;
}
.lnd .lnd-modal {
  position: relative;
  width: min(920px, calc(100% - 32px)); max-height: min(90svh, 900px);
  display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr);
  overflow: hidden; border-radius: 18px;
  background: rgba(19, 23, 32, .72);
  -webkit-backdrop-filter: blur(26px) saturate(1.3); backdrop-filter: blur(26px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, .12);
  box-shadow: 0 40px 90px rgba(0, 0, 0, .6);
  animation: lnd-modal-pop .22s cubic-bezier(.2, .8, .3, 1);
}
.lnd .lnd-modal:not(.has-photo) { grid-template-columns: minmax(0, 1fr); width: min(600px, calc(100% - 32px)); }
.lnd .lnd-modal-close {
  position: absolute; top: 12px; right: 12px; z-index: 3;
  width: 38px; height: 38px; display: grid; place-items: center; border-radius: 999px; color: #fff;
  background: rgba(255, 255, 255, .08); border: 1px solid rgba(255, 255, 255, .14);
  transition: background .18s ease;
}
.lnd .lnd-modal-close:hover { background: rgba(255, 255, 255, .2); }
.lnd .lnd-modal-close svg { width: 18px; height: 18px; }
.lnd .lnd-modal-photo { position: relative; min-height: 100%; background: #0c0f16; }
.lnd .lnd-modal-photo img { width: 100%; height: 100%; object-fit: cover; }
.lnd .lnd-modal-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 48%, rgba(6, 9, 15, .85)); }
.lnd .lnd-modal-photo-cap { position: absolute; z-index: 1; left: 20px; bottom: 18px; display: flex; flex-direction: column; gap: 3px; color: #fff; }
.lnd .lnd-modal-photo-cap b { font-size: 16px; font-weight: 800; letter-spacing: -.02em; }
.lnd .lnd-modal-photo-cap span { font-size: 12px; color: #cfd6e2; }
.lnd .lnd-modal-main { padding: 30px; overflow-y: auto; }
.lnd .lnd-modal-time {
  display: inline-flex; align-items: center; min-height: 26px; padding: 0 9px; border-radius: 4px;
  background: var(--primary); color: var(--on-primary); font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums;
}
.lnd .lnd-modal-main h3 { margin: 14px 0 0; font-size: clamp(21px, 2.4vw, 27px); font-weight: 900; letter-spacing: -.035em; line-height: 1.25; word-break: keep-all; }
.lnd .lnd-modal-desc { margin: 14px 0 0; color: #c4ccd9; font-size: 15px; line-height: 1.7; white-space: pre-line; word-break: keep-all; }
.lnd .lnd-modal-speaker { margin-top: 22px; padding: 18px; border-radius: 14px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .08); }
.lnd .lnd-modal-speaker-head { display: flex; align-items: center; gap: 13px; }
.lnd .lnd-modal-avatar { width: 52px; height: 52px; border-radius: 999px; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; background: var(--primary-soft, #2a3040); color: #fff; font-weight: 800; font-size: 20px; }
.lnd .lnd-modal-avatar img { width: 100%; height: 100%; object-fit: cover; }
.lnd .lnd-modal-speaker-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.lnd .lnd-modal-speaker-id b { font-size: 16px; font-weight: 800; letter-spacing: -.02em; }
.lnd .lnd-modal-speaker-id span { font-size: 13px; color: #aeb8c9; }
.lnd .lnd-modal-bio { margin-top: 16px; padding-top: 15px; border-top: 1px solid rgba(255, 255, 255, .09); }
.lnd .lnd-modal-bio h4 { margin: 0 0 8px; padding-left: 10px; border-left: 3px solid var(--primary-bright); font-size: 13px; font-weight: 800; letter-spacing: -.01em; }
.lnd .lnd-modal-bio p { margin: 0; color: #c4ccd9; font-size: 14px; line-height: 1.7; white-space: pre-line; word-break: keep-all; }
@keyframes lnd-modal-fade { from { opacity: 0; } }
@keyframes lnd-modal-pop { from { opacity: 0; transform: translateY(10px); } }
@media (max-width: 640px) {
  .lnd .lnd-modal, .lnd .lnd-modal.has-photo { grid-template-columns: minmax(0, 1fr); width: calc(100% - 24px); }
  .lnd .lnd-modal-photo { display: none; }
  .lnd .lnd-modal-main { padding: 24px 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .lnd .lnd-modal, .lnd .lnd-modal-backdrop { animation: none; }
}

/* ── 타임테이블 ── */
.lnd .schedule { display: grid; gap: 10px; list-style: none; }
.lnd .schedule-row {
  min-height: 62px;
  display: grid; grid-template-columns: 190px 1fr; align-items: center;
  border-radius: 6px; background: #f8f9fc; color: #111724;
  box-shadow: 0 10px 28px rgba(3, 9, 26, .12);
}
.lnd .schedule-row.is-break { background: rgba(58, 63, 98, .94); color: #f3f5fa; }
.lnd .schedule-time {
  padding: 0 23px; border-right: 1px solid rgba(21, 32, 51, .3);
  color: var(--primary-ink);
  font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.lnd .is-break .schedule-time { border-color: rgba(255, 255, 255, .25); color: #fff; }
.lnd .schedule-content { padding: 10px 20px; }
.lnd .schedule-name { display: block; font-size: 15px; font-weight: 850; letter-spacing: -.02em; word-break: keep-all; }
.lnd .schedule-name .tag {
  display: inline-block; margin-left: 10px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--primary-ink); color: var(--primary-ink);
  font-size: 10px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; vertical-align: 2px;
}
.lnd .schedule-speaker { display: block; margin-top: 2px; color: #586074; font-size: 11px; }

/* ── 다크 존(Programs~FAQ) — 지브라 구분 ── */
.lnd .dark-zone { position: relative; background: var(--ink); }
.lnd .dark-zone .section { position: relative; }
.lnd .dark-zone .section > * { position: relative; z-index: 1; }
.lnd .dark-zone .section:nth-of-type(even)::before {
  content: ""; position: absolute; top: 0; bottom: 0;
  left: calc(50% - 50vw); right: calc(50% - 50vw);
  background: var(--ink-soft);
}

.lnd .program-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.lnd .program-card, .lnd .benefit-card, .lnd .join-step {
  border-radius: 8px; background: rgba(24, 31, 45, .94);
  box-shadow: 0 18px 48px rgba(2, 8, 24, .25);
}
.lnd .program-card { min-height: 142px; padding: 24px; }
.lnd .program-heading { display: flex; align-items: center; gap: 12px; }
.lnd .program-icon {
  min-width: 38px; height: 38px; display: grid; place-items: center; border-radius: 5px;
  background: var(--primary); color: var(--on-primary);
  font-size: 10px; font-weight: 900; letter-spacing: -.02em;
}
.lnd .program-card h3, .lnd .benefit-card h3, .lnd .join-step h3 { font-size: 19px; letter-spacing: -.03em; word-break: keep-all; }
.lnd .program-card p, .lnd .benefit-card p, .lnd .join-step p {
  margin: 14px 0 0; color: #b7c0d0;
  font-size: 13px; line-height: 1.7; white-space: pre-line; word-break: keep-all;
}
.lnd .benefit-grid, .lnd .join-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.lnd .benefit-card { min-height: 170px; padding: 22px; }
.lnd .benefit-number {
  display: block; margin-bottom: 6px;
  font-size: 21px; font-weight: 900; font-variant-numeric: tabular-nums; color: var(--primary-bright);
}
.lnd .join-step { padding: 26px; }
.lnd .join-k {
  display: block; font-size: 12px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase;
  color: var(--primary-bright);
}
.lnd .join-step h3 { margin-top: 12px; }
.lnd .deadline {
  margin-top: clamp(40px, 7vh, 64px);
  text-align: center; color: var(--muted);
  font-size: clamp(13px, 1.7vw, 15px); font-variant-numeric: tabular-nums;
}
.lnd .deadline b { color: var(--paper); font-weight: 800; }

/* ── FAQ ── */
.lnd .faq-tabs { margin: -8px 0 26px; display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; }
.lnd .faq-tab {
  min-height: 44px; padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, .2); border-radius: 7px; background: transparent;
  cursor: pointer; font-weight: 750;
  transition: background .2s ease, border-color .2s ease, color .2s ease;
}
.lnd .faq-tab[aria-pressed="true"] { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
.lnd .faq-list { display: grid; gap: 12px; }
.lnd .faq-item { border-radius: 8px; background: rgba(45, 49, 57, .96); overflow: hidden; }
.lnd .faq-item summary {
  min-height: 56px; display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 0 18px; cursor: pointer; list-style: none;
  font-size: 14px; font-weight: 750; word-break: keep-all;
}
.lnd .faq-item summary::-webkit-details-marker { display: none; }
.lnd .faq-item summary::after { content: "+"; color: #b9c1cf; font-size: 21px; font-weight: 400; }
.lnd .faq-item[open] summary::after { content: "\\2212"; }
.lnd .faq-item p { padding: 0 18px 20px; color: #c0c7d2; font-size: 13px; white-space: pre-line; }

/* ── 스크롤 리빌(transform 전용 — JS 미실행에서도 콘텐츠 가시) ── */
.lnd .rv { transform: translateY(12px); transition: transform .5s cubic-bezier(.22, .7, .2, 1); }
.lnd .rv.in { transform: translateY(0); }

@media (max-width: 760px) {
  .lnd .hero-inner { width: min(100% - 32px, 980px); padding-bottom: 150px; }
  .lnd .hero h1, .lnd .hero h2 { font-size: clamp(38px, 13vw, 66px); }
  .lnd .hero-subtitle { font-size: 17px; }
  .lnd .hero-meta { left: 50%; bottom: 116px; transform: translateX(-50%); width: 100%; text-align: center; font-size: 15px; }
  .lnd .hero-cta { left: 50%; right: auto; bottom: 36px; width: min(100%, 320px); transform: translateX(-50%); }
  .lnd .hero-cta:hover { transform: translate(-50%, -2px); }
  .lnd .intro { min-height: 480px; padding-inline: 20px; }
  .lnd .scroll-cue { bottom: 28px; }
  .lnd .section { width: min(100% - 28px, var(--max)); }
  .lnd .session-cards { gap: 14px; }
  .lnd .session-card { width: min(calc(50% - 7px), 286px); }
  .lnd .session-card-body { inset: auto 12px 12px; }
  .lnd .session-card h3 { margin: 9px 0 14px; font-size: 14px; }
  .lnd .session-time { min-height: 25px; font-size: 10px; }
  .lnd .schedule-row { min-height: 72px; grid-template-columns: 112px 1fr; }
  .lnd .schedule-time { padding: 0 12px; font-size: 14px; }
  .lnd .schedule-content { padding: 10px 12px; }
  .lnd .schedule-name { font-size: 13px; }
  .lnd .program-grid, .lnd .benefit-grid, .lnd .join-grid { grid-template-columns: 1fr; }
  .lnd .benefit-card { min-height: 130px; }
  .lnd .faq-tabs { overflow-x: auto; justify-content: flex-start; padding-bottom: 4px; }
  .lnd .faq-tab { flex: 0 0 auto; }
}

@media (max-width: 410px) {
  .lnd .session-card { width: 100%; max-width: 310px; }
  .lnd .session-card h3 { font-size: 16px; }
  .lnd .schedule-row { grid-template-columns: 1fr; gap: 0; }
  .lnd .schedule-time { padding: 10px 14px 6px; border-right: 0; border-bottom: 1px solid rgba(21, 32, 51, .15); }
  .lnd .is-break .schedule-time { border-color: rgba(255, 255, 255, .14); }
  .lnd .schedule-content { padding: 7px 14px 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .lnd, .lnd *, .lnd *::before, .lnd *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
  .lnd .rv { transform: none; }
}
`;
