/**
 * 투표 화면 CSS — 공고 CSS(buildCompetitionCss)에 이어 붙는다.
 * 색은 전부 공고 쪽이 심어 둔 --mc-* 변수를 쓴다(하드코딩 금지).
 */
export const VOTE_CSS = `
/* 960px 는 공고 페이지(notice shell)와 같은 최대 폭이다 — 대회 임베드 화면 전체가 같은 리듬을 쓴다.
   호스트 페이지가 폭을 제한하지 않는 아임웹 사이트에 붙었을 때, 좌우 여백 없이 뷰포트
   끝까지 카드가 붙어버리는 걸 여기서 막는다(임베드는 호스트 CSS 에 기대면 안 된다). */
.mcv { max-width: 960px; margin: 0 auto; padding: 20px 20px 40px; box-sizing: border-box; }
.mcv-bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 12px 0; margin-bottom: 14px; background: var(--mc-surface);
  border-bottom: 1px solid rgba(120,120,128,.18); }
.mcv-bar-title { font-size: 16px; font-weight: 800; }
.mcv-remain { font-size: 13px; font-weight: 700; color: var(--mc-accent); }
/* auto-fill 이 아니라 auto-fit 을 쓴다 — 참가작이 한 줄을 못 채울 만큼 적을 때(리허설·오픈 초기)
   auto-fill 은 빈 트랙을 그대로 남겨 카드가 왼쪽에 몰리고 오른쪽이 통째로 비어 보인다.
   auto-fit 은 빈 트랙을 접어 남은 폭을 실제 카드에 돌려준다. */
.mcv-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.mcv-card { display: flex; flex-direction: column; overflow: hidden; border-radius: var(--mc-radius);
  background: var(--mc-surface); box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 6px 20px rgba(0,0,0,.06);
  transition: box-shadow .18s ease, transform .18s ease; }
.mcv-card:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,.12), 0 12px 28px rgba(0,0,0,.10); }
.mcv-card.is-voted { box-shadow: 0 0 0 2px var(--mc-accent), 0 6px 20px rgba(0,0,0,.10); }
/* 16:9 — 참가작 영상은 대부분 무대를 가로로 찍은 유튜브 영상이다. 세로 여백이 남는 16:10 은
   그 위에 검은 레터박스가 생긴다(object-fit:cover 라 실제로는 위아래가 잘려 나간다). */
.mcv-media { position: relative; aspect-ratio: 16 / 9; background: rgba(120,120,128,.12); }
.mcv-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mcv-thumb-empty { width: 100%; height: 100%; }
.mcv-video { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.mcv-play { position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-size: 17px; color: #fff;
  background: rgba(0,0,0,.55); pointer-events: none; }
.mcv-frame { width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }
.mcv-body { display: flex; flex-direction: column; gap: 6px; padding: 13px 14px 14px; }
.mcv-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.mcv-no { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 20px; padding: 0 6px;
  border-radius: 999px; background: color-mix(in srgb, var(--mc-accent) 12%, transparent);
  color: var(--mc-accent); font-size: 11px; font-weight: 800; }
.mcv-count { font-size: 12px; font-weight: 700; opacity: .7; }
.mcv-title { font-size: 15px; font-weight: 700; line-height: 1.4; margin: 0; word-break: keep-all; }
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
  .mcv-card, .mcv-card:hover { transition: none; transform: none; }
}
`.trim();
