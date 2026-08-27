/**
 * 투표 화면 CSS — 공고 CSS(buildCompetitionCss)에 이어 붙는다.
 * 색은 전부 공고 쪽이 심어 둔 --mc-* 변수를 쓴다(하드코딩 금지).
 */
export const VOTE_CSS = `
/* 공고 페이지(960px)와 같은 리듬을 쓰던 걸 투표 화면만 1200px 로 넓힌다 — 참가작 카드는
   텍스트보다 영상이 주인공인데, 960px 폭에서는 카드가 300px 로 눌려 영상(16:9)보다 제목·팀명·
   버튼이 차지하는 세로 비중이 더 커 보였다. 카드를 키우면 텍스트 영역 높이는 거의 그대로인 채
   영상 높이만 폭에 비례해 늘어나 자연히 영상이 더 크게 보인다. 1200px 는 3열이 각 카드 상한
   (360px)까지 실제로 자라고도 카드 사이 간격(20px)이 눌리지 않고 남는 최소 폭으로 역산했다
   — 1120px 였을 때는 3*360+2*16=1112 가 가용폭 1080 을 넘어서 카드가 상한까지 못 자라 간격이
   빠듯해 보였다. 호스트 페이지가 폭을 제한하지 않는 아임웹 사이트에 붙었을 때 좌우 끝까지
   붙어버리는 것도 여기서 막는다. */
.mcv { max-width: 1200px; margin: 0 auto; padding: 20px 20px 40px; box-sizing: border-box; }
/* 운영자가 채우는 행사 소개 — 색·크기는 인라인 style 로 받는다(대회마다 값이 다른 콘텐츠라
   --mc-* 테마 토큰이 아니라 개별 값). 색을 안 정하면 테마 글자색을 그대로 물려받는다. */
.mcv-intro { margin: 0 0 20px; color: var(--mc-text); }
.mcv-intro-title { margin: 0 0 8px; font-weight: 800; line-height: 1.35; word-break: keep-all; }
.mcv-intro-body { margin: 0; line-height: 1.7; white-space: pre-wrap; opacity: .85; }
.mcv-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 0; margin-bottom: 14px; background: var(--mc-surface);
  border-bottom: 1px solid rgba(120,120,128,.18); }
.mcv-bar-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.mcv-bar-title { font-size: 16px; font-weight: 800; }
.mcv-remain { font-size: 13px; font-weight: 700; color: var(--mc-accent); white-space: nowrap; }
/* "지금 투표 기간인지" 를 문장이 아니라 색+짧은 라벨로 바로 읽게 — 상태색은 대회 테마 accent 와
   별개다(대회마다 accent 가 달라도 열림·마감 색은 항상 같은 의미여야 한다). */
.mcv-status { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 800; white-space: nowrap; }
.mcv-status.is-open { background: rgba(16,185,129,.14); color: #059669; }
.mcv-status.is-before { background: rgba(245,158,11,.16); color: #b45309; }
.mcv-status.is-closed { background: rgba(239,68,68,.14); color: #dc2626; }
/*
 * 카드 폭을 280~360px 로 **고정 범위**에 묶는다. minmax(240px, 1fr) 이었을 때는 참가작이
 * 1~2개만 있어도(오픈 초기·리허설) 남는 폭을 전부 그 카드가 흡수해 카드 하나가 900px
 * 가까이 늘어났다(참고로 준 레퍼런스 이미지의 3열 고정 카드 크기와 정반대였다). 1fr 을
 * 없애면 카드는 더 늘어나지 않고, 대신 남는 폭이 줄 안에서 뜬다.
 * auto-fit 을 쓰는 이유는 그대로다 — 빈 트랙을 접어야 카드 크기가 실제 카드 기준으로 먹는다.
 * 상한을 300→360 으로 올린 건 카드를 더 키워 영상(16:9) 비중을 텍스트보다 우세하게 만들기 위함.
 * gap 을 20px 로 키운 것도 같은 이유 — 컨테이너를 넓히지 않으면 카드가 상한까지 자랄 때 간격이
 * 거의 안 남아 보인다(위 .mcv 주석의 역산 참고).
 * justify-content 는 center 가 아니라 start — 참가작이 한둘일 때 가운데 덩그러니 있는 것보다,
 * 신청 들어온 순서대로 왼쪽부터 차오르는 쪽이 "계속 채워지고 있다"는 인상을 준다.
 */
.mcv-grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(280px, 360px)); justify-content: start; }
.mcv-card { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--mc-radius);
  background: var(--mc-surface); box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 6px 20px rgba(0,0,0,.06);
  transition: box-shadow .18s ease, transform .18s ease; }
.mcv-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,.12), 0 12px 28px rgba(0,0,0,.10); }
.mcv-card.is-voted { box-shadow: 0 0 0 2px var(--mc-accent), 0 6px 20px rgba(0,0,0,.10); }
/* 16:9 — 참가작 영상은 대부분 무대를 가로로 찍은 유튜브 영상이다. 세로 여백이 남는 16:10 은
   그 위에 검은 레터박스가 생긴다(object-fit:cover 라 실제로는 위아래가 잘려 나간다). */
.mcv-media { position: relative; aspect-ratio: 16 / 9; background: rgba(120,120,128,.12); overflow: hidden; }
.mcv-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
.mcv-card:hover .mcv-thumb-img { transform: scale(1.04); }
.mcv-thumb-empty { width: 100%; height: 100%; }
.mcv-video { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.mcv-play { position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-size: 17px; color: #fff;
  background: rgba(0,0,0,.55); pointer-events: none; }
.mcv-frame { width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }
.mcv-body { display: flex; flex-direction: column; gap: 5px; padding: 11px 14px 12px; }
.mcv-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcv-no { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 20px; padding: 0 6px;
  border-radius: 999px; background: color-mix(in srgb, var(--mc-accent) 12%, transparent);
  color: var(--mc-accent); font-size: 11px; font-weight: 800; }
.mcv-count { font-size: 12px; font-weight: 700; opacity: .7; }
.mcv-title-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mcv-title { font-size: 15px; font-weight: 700; line-height: 1.4; margin: 0; word-break: keep-all; }
/* 대표 사진과 구분되는 팀 로고 — 카드 그림자 마감과 같은 규칙으로 테두리 대신 그림자를 쓴다. */
.mcv-logo { flex: none; width: 30px; height: 30px; border-radius: 999px; object-fit: cover;
  background: var(--mc-surface); box-shadow: 0 1px 3px rgba(0,0,0,.18); }
.mcv-team { font-size: 12.5px; opacity: .7; margin: 0; }
.mcv-summary { font-size: 12.5px; line-height: 1.6; opacity: .75; margin: 0;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.mcv-btn { margin-top: 4px; width: 100%; padding: 10px 12px; border: 0; border-radius: 10px; cursor: pointer;
  font: inherit; font-size: 13.5px; font-weight: 700;
  background: color-mix(in srgb, var(--mc-accent) 12%, transparent); color: var(--mc-accent);
  transition: background .16s ease, color .16s ease; }
.mcv-btn:hover { background: color-mix(in srgb, var(--mc-accent) 20%, transparent); }
.mcv-btn:disabled { opacity: .55; cursor: default; }
.is-voted .mcv-btn { background: var(--mc-accent); color: var(--mc-on-accent); }
@media (max-width: 520px) { .mcv-grid { grid-template-columns: 1fr; } }
@media (prefers-reduced-motion: reduce) {
  .mcv-card, .mcv-card:hover, .mcv-thumb-img, .mcv-card:hover .mcv-thumb-img { transition: none; transform: none; }
}
`.trim();
