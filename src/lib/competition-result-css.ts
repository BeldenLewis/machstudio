/**
 * 결과 발표 화면 CSS — 공고 CSS(buildCompetitionCss)에 이어 붙는다.
 * 색은 전부 공고 쪽이 심어 둔 --mc-* 변수를 쓴다(하드코딩 금지).
 *
 * 1위를 크게, 나머지를 작게 — 결과 페이지는 훑는 화면이지 비교하는 화면이 아니다.
 */
export const RESULT_CSS = `
/* 투표 화면(.mcv)과 같은 최대 폭 — 임베드 화면 전체가 같은 리듬을 쓴다. */
.mcr { max-width: 960px; margin: 0 auto; padding: 20px 20px 40px; box-sizing: border-box; }
.mcr-head { text-align: center; margin-bottom: 22px; }
.mcr-title { font-size: 22px; font-weight: 800; margin: 0; word-break: keep-all; }
.mcr-sub { font-size: 13px; opacity: .65; margin: 6px 0 0; }
.mcr-list { display: flex; flex-direction: column; gap: 14px; }

.mcr-item { display: flex; gap: 14px; align-items: stretch; overflow: hidden; border-radius: var(--mc-radius);
  background: var(--mc-surface); box-shadow: 0 1px 3px rgba(0,0,0,.10), 0 6px 20px rgba(0,0,0,.06); }
.mcr-item.is-top { flex-direction: column; gap: 0; box-shadow: 0 0 0 2px var(--mc-accent), 0 10px 30px rgba(0,0,0,.12); }

.mcr-media { flex: 0 0 132px; background: rgba(120,120,128,.12); }
.mcr-item.is-top .mcr-media { flex: none; aspect-ratio: 16 / 9; }
.mcr-thumb { width: 100%; height: 100%; object-fit: cover; display: block; }
.mcr-video { position: relative; display: block; width: 100%; height: 100%; padding: 0; border: 0; background: none; cursor: pointer; }
.mcr-play { position: absolute; inset: 0; margin: auto; width: 46px; height: 46px; border-radius: 999px;
  display: flex; align-items: center; justify-content: center; font-size: 17px; color: #fff;
  background: rgba(0,0,0,.55); pointer-events: none; }
.mcr-frame { width: 100%; aspect-ratio: 16 / 9; border: 0; display: block; }

.mcr-body { display: flex; flex-direction: column; gap: 5px; padding: 14px 16px; min-width: 0; }
.mcr-badge { align-self: flex-start; display: inline-flex; align-items: center; height: 22px; padding: 0 10px;
  border-radius: 999px; font-size: 12px; font-weight: 800; letter-spacing: .01em;
  background: color-mix(in srgb, var(--mc-accent) 14%, transparent); color: var(--mc-accent); }
.mcr-item.is-top .mcr-badge { height: 26px; padding: 0 13px; font-size: 13.5px;
  background: var(--mc-accent); color: var(--mc-on-accent); }
.mcr-name { font-size: 16px; font-weight: 700; line-height: 1.4; margin: 2px 0 0; word-break: keep-all; }
.mcr-item.is-top .mcr-name { font-size: 20px; }
.mcr-team { font-size: 13px; opacity: .7; margin: 0; }
.mcr-desc { font-size: 12.5px; line-height: 1.65; opacity: .75; margin: 4px 0 0; white-space: pre-line; }
.mcr-no { font-size: 11.5px; opacity: .55; font-variant-numeric: tabular-nums; }

.mcr-empty { text-align: center; padding: 46px 20px; border-radius: var(--mc-radius);
  background: rgba(120,120,128,.08); }
.mcr-empty-title { font-size: 15px; font-weight: 700; margin: 0; }
.mcr-empty-sub { font-size: 13px; opacity: .65; margin: 6px 0 0; }

@media (max-width: 560px) {
  .mcr-item { flex-direction: column; }
  .mcr-media { flex: none; aspect-ratio: 16 / 9; }
}
`;
