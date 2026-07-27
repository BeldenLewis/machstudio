/**
 * 랜딩 상세페이지 스타일 — 단독 페이지 / 어드민 미리보기 / 외부 사이트 임베드가 모두 이 한 벌을 쓴다.
 * 다크 에디토리얼 고정 테마(의도된 단일 테마), 키컬러만 theme.accentColor 에서 파생.
 */

import { sessionLogoCss } from "@/lib/webinar-logo";

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

/* ── 호스트 전역 CSS 방어 ──
   외부 사이트(아임웹 등) 문서에 직접 마운트되면 호스트의 **상속 프로퍼티**가 그대로 흘러든다.
   실측(www.k-expo.org): body 에 -webkit-text-fill-color:#363636 이 걸려 있어 우리 흰 글자가
   진회색으로 렌더됐다(color 를 덮어쓰는 프로퍼티라 color 지정만으로는 못 막는다).
   상속으로 새는 것들만 루트에서 다시 못박고, 호스트가 !important 로 강제하는 4종에만
   !important 로 맞선다(같은 호스트에서 도는 /w 로더가 이미 같은 방어를 쓰고 있다). */
.lnd.lnd, .lnd.lnd * { -webkit-text-fill-color: currentColor !important; }
.lnd.lnd {
  letter-spacing: normal; word-spacing: normal; text-transform: none;
  text-align: left; text-indent: 0; text-shadow: none; white-space: normal;
  font-style: normal; font-weight: 400; visibility: visible;
  /* all:initial 을 쓰지 않는 이유: text-size-adjust 가 auto 로 풀려 iOS 텍스트 자동확대가
     랜딩 안에서만 되살아난다. 필요한 것만 명시한다. */
  -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
}
/* 호스트가 a { color: ... !important } 를 걸어 두므로 링크 색을 !important 로 되찾는다.
   단 이 규칙은 "기본값"일 뿐이다 — 우리가 색을 명시하는 링크(.toc-link/.hero-cta)는
   아래에서 다시 !important 로 못박아야 한다. 안 그러면 이 줄이 우리 색까지 덮어버려
   목차 활성 표시와 CTA 대비색이 조용히 사라진다(실제로 그랬다). */
.lnd a { color: inherit !important; text-decoration: none !important; }
.lnd button {
  font: inherit; color: inherit; background: transparent; border: 0; border-radius: 0;
  padding: 0; margin: 0; text-align: inherit; cursor: pointer;
  -webkit-appearance: none; appearance: none;
}
.lnd ul, .lnd ol { list-style: none; }
.lnd img, .lnd svg, .lnd video { display: block; max-width: 100%; border: 0; }
.lnd ::selection { background: var(--primary); color: var(--on-primary); }
.lnd :focus-visible { outline: 3px solid var(--primary-bright); outline-offset: 4px; }

.lnd .preview-badge {
  position: fixed; left: 12px; top: 12px; z-index: 200;
  padding: 6px 12px; border-radius: 999px;
  background: rgba(255, 255, 255, .92); color: #111827;
  font-size: 12px; font-weight: 800;
}

/* ── 왼쪽 세로 목차 — 넓은 화면 전용(임베드 포함) ──
   마운트가 body 직계 레이어(.lnd-toc-layer)로 포털한다. 여기 fixed/left/top 은 그 레이어 안에서도
   그대로 유효하다(레이어가 viewport 를 덮으므로 기준이 같다).
   [data-lnd-off] 는 랜딩이 화면을 벗어났을 때 effects 가 거는 표시 — display 를 건드리지 않고
   숨겨서 미디어쿼리(display:flex)와 싸우지 않는다. */
.lnd .toc {
  position: fixed; left: 24px; top: 50%; transform: translateY(-50%); z-index: 90;
  display: none; flex-direction: column; gap: 2px;
  transition: opacity .3s ease, visibility .3s ease;
}
@media (min-width: 1280px) { .lnd .toc { display: flex; } }
.lnd .toc[data-lnd-off] { opacity: 0; visibility: hidden; pointer-events: none; }
.lnd .toc-link {
  display: flex; align-items: center; gap: 11px; min-height: 30px;
  /* !important: 위 .lnd a 방어 규칙(color:inherit !important)을 이겨야 한다. */
  color: var(--muted) !important; font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
  transition: color .4s ease;
}
.lnd .toc-mark {
  flex: 0 0 auto; width: 16px; height: 2px; background: currentColor; opacity: .5;
  transition: width .25s ease, opacity .25s ease, background .4s ease;
}
.lnd .toc-link:hover { color: var(--paper) !important; }
.lnd .toc-link[aria-current="true"] { color: var(--primary-bright) !important; }
.lnd .toc-link[aria-current="true"] .toc-mark { width: 30px; opacity: 1; background: var(--primary-bright); }
.lnd.on-accent .toc-link { color: color-mix(in srgb, var(--on-primary) 58%, transparent) !important; }
.lnd.on-accent .toc-link:hover,
.lnd.on-accent .toc-link[aria-current="true"] { color: var(--on-primary) !important; }
.lnd.on-accent .toc-link[aria-current="true"] .toc-mark { background: var(--on-primary); }

/* ── 히어로 ──
   호스트 DOM 에 직접 마운트하면 100svh 가 브라우저 네이티브로 동작한다(모바일 주소창 접힘에도
   재계산 없음). 레거시 iframe 임베드에서만 문서 전체 높이가 되어 무한 성장하므로,
   그 경로에 한해 호스트가 postMessage 로 넘겨준 --lnd-vh 로 대체한다. */
.lnd .hero {
  position: relative;
  /* --lnd-topinset = 첫 화면에서 랜딩 위를 차지하는 호스트 크롬(헤더) 높이.
     빼지 않으면 히어로 바닥에 붙은 일시·CTA 가 딱 그만큼 화면 밖으로 밀린다. */
  min-height: calc(100svh - var(--lnd-topinset, 0px));
  display: grid; place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 45%, rgba(7, 12, 26, .15) 0 20%, transparent 21%),
    linear-gradient(180deg, #05070c 0%, #05070d 100%);
}
.lnd[data-legacy-iframe] .hero { min-height: var(--lnd-vh, 720px); }
/* 히어로 이미지·영상이 있으면 기본 장식(키컬러 링·그라데이션)을 **아예 그리지 않는다**.
   덮어씌우는 방식이면 CSS 는 즉시 그려지고 이미지는 나중에 도착하므로,
   첫 로드에 기본 화면이 보였다가 이미지로 바뀌는 게 그대로 눈에 띈다. */
.lnd .hero.hero-has-media { background: var(--ink); }
.lnd .hero.hero-has-media::before,
.lnd .hero.hero-has-media::after { content: none; }
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
  /* !important: .lnd a 방어 규칙에 덮이면 키컬러가 밝을 때(노랑 등) 흰 글자가 남아 대비가 깨진다.
     accentColor 가 흰 글자를 쓰는 색이면 시각 변화가 없고, 어두운 글자를 써야 하는 색에서만 달라진다. */
  color: var(--on-primary) !important;
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
  width: calc(50% - 8px); max-width: 372px; aspect-ratio: 210 / 297; /* A4 세로 */
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
/* 이름·회사(왼쪽) 과 '자세히 보기'(오른쪽 하단) 를 한 줄에 — baseline 이 아니라 flex-end 로
   맞춘다. 회사명이 있으면 왼쪽이 두 줄이 되는데, 그때 링크가 첫 줄에 붙어 뜨지 않게. */
.lnd .session-foot { width: 100%; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.lnd .speaker { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; color: #dfe5f0; font-size: 15.5px; }
.lnd .speaker b { color: #fff; font-weight: 800; }
.lnd .speaker-co { color: #b9c2d1; font-size: 13.5px; font-weight: 600; letter-spacing: -.01em; }
.lnd .session-more {
  flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px;
  font-size: 14px; font-weight: 800; letter-spacing: -.01em; color: var(--primary-bright);
}
.lnd .session-more svg { width: 16px; height: 16px; }

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

/* ── 목차 전용 레이어 (body 직계) ──
   모달 레이어(999960)보다 **아래**로 못박아, 팝업이 열리면 목차가 백드롭 뒤로 들어간다.
   on-accent 를 이 레이어에도 미러링하므로(목차 색 전환) 배경 규칙을 더 높은 특이도로 무효화한다
   — 안 하면 .lnd.on-accent{background:var(--primary)} 가 화면 전체를 키컬러로 덮는다. */
.lnd.lnd-toc-layer {
  position: fixed; inset: 0; z-index: 999940;
  background: none; min-height: 0; width: auto; margin: 0; overflow: visible;
  pointer-events: none;
}
.lnd.lnd-toc-layer.on-accent { background: none; }
.lnd.lnd-toc-layer > * { pointer-events: auto; }

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
  /**
   * grid-template-rows: minmax(0, 1fr) 이 **없으면 긴 약력에서 스크롤이 죽는다.**
   * (이 주석은 템플릿 리터럴 안이라 백틱을 쓸 수 없다 — 쓰면 CSS 문자열이 거기서 끊긴다.)
   * 기본 auto 트랙은 내용 높이로 커지는데, 모달은 max-height 로 잘리고 overflow:hidden 이라
   * 넘친 부분에 닿을 방법이 없어진다. 안쪽 .lnd-modal-main 의 overflow-y:auto 도 무효다 —
   * 트랙(=자기 높이)이 내용만큼 크니 스크롤할 여지가 0 이다.
   * 실측(375×700, 약력 8단락): 모달 630px 인데 그리드 행 1156px, main clientHeight 1156,
   * scrollTop 이 0 에서 안 움직임. minmax(0,1fr) 로 행이 줄어들 수 있게 하면 main 이 스크롤한다.
   * 데스크톱도 같은 구조라 함께 고쳐진다(뷰포트가 커서 늦게 드러날 뿐이었다).
   */
  /* 1행: 사진|본문(줄어들 수 있어야 한다 — 위 주석 참고), 2행: SNS(내용 높이).
     암시 행(grid-auto-rows)에 맡기지 않고 적어 둔다 — 무엇이 줄어들 수 있는 행인지가
     이 모달의 스크롤 동작을 정하는 값이라 눈에 보여야 한다. */
  grid-template-rows: minmax(0, 1fr) auto;
  overflow: hidden; border-radius: 18px;
  background: rgba(19, 23, 32, .72);
  -webkit-backdrop-filter: blur(26px) saturate(1.3); backdrop-filter: blur(26px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, .12);
  box-shadow: 0 40px 90px rgba(0, 0, 0, .6);
  animation: lnd-modal-pop .22s cubic-bezier(.2, .8, .3, 1);
}
.lnd .lnd-modal:not(.has-photo) { grid-template-columns: minmax(0, 1fr); width: min(600px, calc(100% - 32px)); }
/* 닫기 버튼은 **스크롤과 무관하게 항상 같은 자리**다 — 스크롤하는 건 .lnd-modal-main 이고
   이 버튼은 모달(스크롤하지 않는 상자)에 absolute 로 붙어 있다. 반투명 판만으로는 아래로
   지나가는 본문 글자와 겹쳐 읽기 어려워, 불투명도를 올리고 블러를 깔았다. */
/* 홈페이지 바로가기 — 약력 아래. 채운 버튼이 아니라 텍스트 링크다:
   모달의 주 행동은 "읽기" 이고 이건 이어서 볼 수 있는 곳을 가리키는 보조 링크다. */
.lnd .lnd-modal-home {
  display: inline-flex; align-items: center; gap: 6px; margin-top: 16px;
  color: #fff; font-size: 13.5px; font-weight: 700; text-decoration: none;
  border-bottom: 1px solid rgba(255, 255, 255, .35); padding-bottom: 2px;
  transition: border-color .18s ease, gap .18s ease;
}
.lnd .lnd-modal-home:hover { border-color: #fff; gap: 9px; }
.lnd .lnd-modal-home svg { width: 15px; height: 15px; }
/* SNS — 모달 **맨 밑**. 아이콘만 두고 이름은 aria-label/title 로만 둔다(줄이 길어지면
   밑이 무거워져서, 읽고 나가는 흐름의 끝이 아니라 새 과제처럼 보인다). */
.lnd .lnd-modal-sns {
  grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px;
  padding: 14px 30px 18px;
  border-top: 1px solid rgba(255, 255, 255, .1);
}
.lnd .lnd-modal-sns-link {
  width: 38px; height: 38px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(255, 255, 255, .08); color: rgba(255, 255, 255, .78);
  transition: background .18s ease, color .18s ease, transform .18s ease;
}
.lnd .lnd-modal-sns-link:hover { background: rgba(255, 255, 255, .16); color: #fff; transform: translateY(-1px); }
.lnd .lnd-modal-sns-link svg { width: 19px; height: 19px; }

.lnd .lnd-modal-close {
  position: absolute; top: 12px; right: 12px; z-index: 3;
  width: 38px; height: 38px; display: grid; place-items: center; border-radius: 999px; color: #fff;
  background: rgba(28, 34, 48, .82); border: 1px solid rgba(255, 255, 255, .18);
  -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
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
.lnd .lnd-modal-main { min-height: 0; padding: 30px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
.lnd .lnd-modal-time {
  display: inline-flex; align-items: center; min-height: 26px; padding: 0 9px; border-radius: 4px;
  background: var(--primary); color: var(--on-primary); font-size: 12px; font-weight: 850; font-variant-numeric: tabular-nums;
}
/* 제목이 닫기 버튼 아래로 파고들지 않게 — 버튼(38px + 여백)만큼 오른쪽을 비운다. */
.lnd .lnd-modal-main h3 { padding-right: 46px; margin: 14px 0 0; font-size: clamp(21px, 2.4vw, 27px); font-weight: 900; letter-spacing: -.035em; line-height: 1.25; word-break: keep-all; }
.lnd .lnd-modal-desc { margin: 14px 0 0; color: #c4ccd9; font-size: 15px; line-height: 1.7; white-space: pre-line; word-break: keep-all; }
.lnd .lnd-modal-speaker { margin-top: 22px; padding: 18px; border-radius: 14px; background: rgba(255, 255, 255, .05); border: 1px solid rgba(255, 255, 255, .08); }
/* 아바타·이름(왼쪽) + 로고(오른쪽 끝). 좁은 화면에서 셋이 한 줄에 안 들어가면 줄바꿈하고,
   그때도 margin-left:auto 가 남아 로고는 자기 줄의 오른쪽에 붙는다. */
.lnd .lnd-modal-speaker-head { display: flex; align-items: center; flex-wrap: wrap; gap: 13px; }
/* 팝업 로고 — 어두운 글래스 배경이라 흰 판을 깐다(투명 PNG 가 대부분). */
${sessionLogoCss(".lnd .lnd-modal-logo", { plate: true })}
.lnd .lnd-modal-logo { margin-left: auto; }
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
  .lnd .lnd-modal, .lnd .lnd-modal.has-photo { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); width: calc(100% - 24px); }
  .lnd .lnd-modal-photo { display: none; }
  .lnd .lnd-modal-main { padding: 24px 20px; }
}
@media (prefers-reduced-motion: reduce) {
  .lnd .lnd-modal, .lnd .lnd-modal-backdrop { animation: none; }
}

/* ── 타임테이블 ── */
.lnd .schedule { display: grid; gap: 10px; list-style: none; }
/* li 는 카드 껍데기만 — 2열(시각 | 내용)은 안쪽 .schedule-summary 가 잡는다.
   왜 여기서 그리드를 뺐나: 펼치기를 넣으면서 li 의 자식이 details 하나가 되어, li 의 열
   정의가 details 하나에 먹혔다(시간칸이 190px 대신 내용 폭으로 줄고 시각·제목이 다른 줄로
   갈라졌다). summary 에 subgrid 를 주는 방법도 있지만 부모(details)가 그리드가 아니라
   폴백한다 — 열 정의를 실제로 그리는 요소에 두는 쪽이 구조가 정직하다.
   overflow:hidden 은 펼침 영역이 카드 모서리를 넘지 않게. */
.lnd .schedule-row {
  border-radius: 6px; background: #f8f9fc; color: #111724; overflow: hidden;
  box-shadow: 0 10px 28px rgba(3, 9, 26, .12);
}
.lnd .schedule-row.is-break { background: rgba(58, 63, 98, .94); color: #f3f5fa; }
.lnd .schedule-time {
  padding: 0 23px; border-right: 1px solid rgba(21, 32, 51, .3);
  color: var(--primary-ink);
  font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap;
}
.lnd .is-break .schedule-time { border-color: rgba(255, 255, 255, .25); color: #fff; }
/* 접힌 줄은 클릭 대상 전체가 summary 다 — 시각은 그대로 두고 마커만 없앤다.
   is-static 은 펼칠 것이 없는 행(상세·로고 둘 다 없음) — 커서를 손가락으로 바꾸지 않는다. */
.lnd .schedule-acc { display: block; }
/* 시각 | 내용 | 셰브론. 셰브론 열은 펼칠 수 없는 행에서는 자리를 차지하지 않는다(auto + 자식 없음). */
.lnd .schedule-summary {
  min-height: 62px;
  display: grid; grid-template-columns: 190px minmax(0, 1fr); align-items: center;
  list-style: none; cursor: pointer;
}
/* 배치를 **명시**한다(자동 배치 금지). 모바일에서 내용이 두 열을 다 쓰는 순간
   (grid-area 2 / 1 / 3 / -1) 자동 배치는 앞줄로 되돌아가지 못한다.
   셰브론은 그리드 항목이 아니다 — 제목 줄(.schedule-name) 안에 있다(view-sessions 주석 참고). */
.lnd .schedule-time { grid-area: 1 / 1; }
.lnd .schedule-content { grid-area: 1 / 2; }
.lnd .schedule-summary.is-static { cursor: default; }
.lnd .schedule-summary::-webkit-details-marker { display: none; }
/* 제목 줄 — 제목(+태그)과 셰브론을 한 줄에. 셰브론은 제목이 아무리 길어도 밀리지 않게
   flex:none, 제목은 줄바꿈할 수 있게 min-width:0. */
.lnd .schedule-name { display: flex; align-items: baseline; gap: 8px; }
.lnd .schedule-title { min-width: 0; }
/* 펼침 셰브론 — 제목 **바로 오른쪽**. 열리면 180도.
   오른쪽 열로 빼면 카드가 펼쳐졌을 때 화살표만 맨 위에 남아 내용과 멀어진다.
   색은 행 색을 따라간다(반전 행에서도 보이게). */
.lnd .schedule-chev {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  color: currentColor; opacity: .5;
  transition: transform .22s cubic-bezier(.22,.61,.36,1), opacity .18s ease;
}
.lnd .schedule-chev svg { width: 17px; height: 17px; }
.lnd .schedule-summary:hover .schedule-chev { opacity: .9; }
.lnd details[open] .schedule-chev { transform: rotate(180deg); }
/* 상세 — 높이 애니메이션 대상(effects.attachAccordion). CSS 로는 열림 상태만 잡고,
   여닫는 모션은 JS 가 인라인 height 로 그린다(details 는 닫히면 내용이 즉시 감춰진다). */
.lnd .schedule-detail { overflow: hidden; }
.lnd .schedule-detail-in {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 18px;
  padding: 2px 20px 16px 20px;
  border-top: 1px solid rgba(21, 32, 51, .12);
  margin: 0 20px;
}
.lnd .is-break .schedule-detail-in { border-color: rgba(255, 255, 255, .18); }
.lnd .schedule-desc {
  margin: 12px 0 0; min-width: 0; flex: 1 1 auto;
  color: #4b5364; font-size: 13.5px; line-height: 1.7; white-space: pre-line; word-break: keep-all;
}
.lnd .is-break .schedule-desc { color: #d6dae6; }
.lnd .schedule-content { padding: 10px 20px; }
.lnd .schedule-name { font-size: 15px; font-weight: 850; letter-spacing: -.02em; word-break: keep-all; }
.lnd .schedule-name .tag {
  display: inline-block; margin-left: 10px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid var(--primary-ink); color: var(--primary-ink);
  font-size: 10px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; vertical-align: 2px;
}
/* 연사 줄 — "이름 | 소속·직책" 한 줄. 접힌 상태에서 훑는 데 필요한 건 시각·무엇·누구뿐이라
   로고는 여기서 빼고 펼침 영역으로 옮겼다(줄마다 로고 폭이 달라 눈이 걸렸다).
   이름을 소속보다 진하게 둬서 구분자가 없어도 어디까지가 이름인지 읽힌다. */
.lnd .schedule-speaker {
  display: flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px;
  margin-top: 3px; color: #4b5364; font-size: 13.5px;
}
.lnd .schedule-speaker b { font-weight: 750; color: #2b3242; }
.lnd .is-break .schedule-speaker b { color: #eef1f7; }
.lnd .schedule-speaker .sep { opacity: .38; font-weight: 400; }
.lnd .schedule-speaker .co { font-weight: 500; }
/* 세션 로고 — 규격은 webinar-logo.ts 한 곳에서 온다(랜딩·대기·시청이 같은 크기여야 한다).
   밝은 타임테이블 행에서는 흰 판을 끈다 — 흰 배경에 흰 판은 네모 테두리로만 보인다. */
${sessionLogoCss(".lnd .schedule-logo")}
/* 펼침 영역 오른쪽 — 상세 본문과 나란히. flex:none 이라야 긴 본문에 눌려 찌그러지지 않는다. */
.lnd .schedule-logo { flex: none; margin-top: 12px; }
/* 반전된 휴식 행에서도 로고가 보이게 흰 판을 깐다(투명 PNG 가 대부분). */
.lnd .is-break .schedule-logo { background: #fff; border-radius: 4px; padding: 2px 4px; }

/* ── 다크 존(Programs~FAQ) — 지브라 구분 ── */
.lnd .dark-zone { position: relative; background: var(--ink); }
.lnd .dark-zone .section { position: relative; }
.lnd .dark-zone .section > * { position: relative; z-index: 1; }
.lnd .dark-zone .section:nth-of-type(even)::before {
  content: ""; position: absolute; top: 0; bottom: 0;
  left: calc(50% - 50vw); right: calc(50% - 50vw);
  background: var(--ink-soft);
}

/* ── 이런 분들께 추천합니다 ── (dark-zone 안 · Join 바로 위)
   카드 그리드가 아니라 **체크 목록**이다. 이 섹션의 일은 읽히는 것이 아니라 훑으면서
   나에 해당하는 줄을 찾는 것이라, 줄 단위로 눈이 내려가는 형태가 맞다.
   판 색·그림자는 이웃(program-card·benefit-card·join-step)과 같은 값을 쓴다 —
   같은 존 안에서 카드 마감이 갈리면 섹션 하나가 얹혀 있는 것처럼 보인다. */
.lnd .audience-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; list-style: none; padding: 0; margin: 0; }
.lnd .audience-item {
  display: flex; align-items: flex-start; gap: 13px;
  padding: 18px 20px; border-radius: 8px;
  background: rgba(24, 31, 45, .94);
  box-shadow: 0 18px 48px rgba(2, 8, 24, .25);
}
/* 체크 표시 — 아이콘을 비웠을 때의 기본. 키컬러 판 위에 놓아 목록의 리듬을 만든다. */
.lnd .audience-mark {
  flex-shrink: 0; width: 26px; height: 26px; border-radius: 8px;
  display: grid; place-items: center;
  background: color-mix(in srgb, var(--primary) 22%, transparent);
  color: var(--primary-bright);
  font-size: 14px; font-weight: 900; line-height: 1;
}
.lnd .audience-body { min-width: 0; }
.lnd .audience-body b { display: block; font-size: 16px; font-weight: 750; letter-spacing: -.02em; color: var(--paper); word-break: keep-all; }
.lnd .audience-body p { margin: 5px 0 0; font-size: 14px; line-height: 1.6; color: var(--muted); white-space: pre-line; word-break: keep-all; }
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
/* 답 본문은 래퍼로 감싼다 — 아코디언 모션이 높이를 재는 대상(data-acc-body).
   패딩을 p 가 아니라 여기 두면 height 0 에서 패딩이 남아 닫혀도 틈이 보이는 일이 없다. */
.lnd .faq-body { overflow: hidden; }
.lnd .faq-item p { margin: 0; padding: 0 18px 20px; color: #c0c7d2; font-size: 13px; white-space: pre-line; }

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
  .lnd .session-card { width: min(calc(50% - 7px), 252px); }
  .lnd .session-card-body { inset: auto 12px 12px; }
  .lnd .session-card h3 { margin: 9px 0 14px; font-size: 14px; }
  .lnd .session-time { min-height: 25px; font-size: 10px; }
  .lnd .schedule-summary { min-height: 72px; grid-template-columns: 112px minmax(0, 1fr); }
  .lnd .schedule-time { padding: 0 12px; font-size: 14px; }
  .lnd .schedule-content { padding: 10px 12px; }
  .lnd .schedule-name { font-size: 13px; }
  .lnd .program-grid, .lnd .benefit-grid, .lnd .join-grid, .lnd .audience-list { grid-template-columns: 1fr; }
  .lnd .benefit-card { min-height: 130px; }
  .lnd .faq-tabs { overflow-x: auto; justify-content: flex-start; padding-bottom: 4px; }
  .lnd .faq-tab { flex: 0 0 auto; }
}

@media (max-width: 410px) {
  .lnd .session-card { width: 100%; max-width: 310px; }
  .lnd .session-card h3 { font-size: 16px; }
  /* 모바일 1열 — 시각이 윗줄, 내용이 아랫줄. 셰브론은 제목 줄 안에 있어 따로 배치하지 않는다. */
  .lnd .schedule-summary { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .lnd .schedule-time { grid-area: 1 / 1; }
  .lnd .schedule-content { grid-area: 2 / 1; }
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
