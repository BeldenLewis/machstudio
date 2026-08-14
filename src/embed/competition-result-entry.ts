/**
 * 대회 결과 발표 임베드 런타임 — 아임웹 코드블럭에 한 줄로 붙는다.
 *
 *   <script async src="https://…/c/{competitionId}/result"></script>
 *   <div data-mach-competition-result></div>
 *
 * 투표 임베드와 같은 이유로 **스냅샷을 싣지 않는다**: 발표 전에는 명단이 없어야 하고,
 * 공개 버튼을 누른 순간 새로고침만으로 바뀌어야 한다.
 */
import { buildCompetitionCss, escapeHtml, type CompetitionTheme } from "@/lib/competition-render";
import { RESULT_CSS } from "@/lib/competition-result-css";

interface BootPayload {
  competitionId: string;
  origin: string;
  /** 미리보기 토큰 — 있으면 발표 전에도 결과를 그려 본다(운영자 확인용). */
  previewToken?: string;
}

interface MediaItem { kind: "image" | "youtube"; url?: string; videoId?: string }

interface AwardDto {
  id: string;
  name: string;
  description: string | null;
  entry: {
    entryNo: string;
    title: string;
    teamName: string | null;
    summary: string | null;
    media: MediaItem[];
  };
}

interface ResultDto {
  competition: { id: string; name: string; theme: CompetitionTheme };
  published: boolean;
  preview: boolean;
  publishedAt?: string;
  awards: AwardDto[];
}

const STYLE_ID = "mc-result-styles";

function warn(message: string, error?: unknown) {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach competition result] " + message, error ?? "");
  } catch {
    /* 로깅 실패는 무시 */
  }
}

function findMount(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("[data-mach-competition-result]");
  if (marked) return marked;
  const current = document.currentScript as HTMLScriptElement | null;
  const scripts = current ? [current] : Array.from(document.querySelectorAll("script[src*='/result']"));
  const script = scripts[scripts.length - 1] as HTMLScriptElement | undefined;
  if (!script?.parentNode) return null;
  const host = document.createElement("div");
  host.setAttribute("data-mach-competition-result", "");
  script.parentNode.insertBefore(host, script.nextSibling);
  return host;
}

function injectStyles(theme: CompetitionTheme) {
  const css = buildCompetitionCss(theme) + "\n" + RESULT_CSS;
  const existing = document.getElementById(STYLE_ID);
  if (existing) { existing.textContent = css; return; }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

export function boot(payload: BootPayload) {
  try {
    void start(payload);
  } catch (error) {
    warn("boot failed", error);
  }
}

async function start(payload: BootPayload) {
  const mount = findMount();
  if (!mount) {
    warn("마운트 지점을 찾지 못했어요 — <div data-mach-competition-result></div> 를 넣어주세요.");
    return;
  }

  let state: ResultDto;
  try {
    const query = payload.previewToken ? `?preview=${encodeURIComponent(payload.previewToken)}` : "";
    const res = await fetch(`${payload.origin}/api/competitions/${payload.competitionId}/result${query}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    state = await res.json();
  } catch (error) {
    warn("결과를 불러오지 못했어요", error);
    mount.innerHTML = `<div class="mc"><p class="mc-note">결과를 불러오지 못했어요. 잠시 후 새로고침해주세요.</p></div>`;
    return;
  }

  injectStyles(state.competition.theme);
  render(mount, state);
}

function mediaHtml(entry: AwardDto["entry"]): string {
  const image = entry.media.find((m) => m.kind === "image" && m.url);
  if (image?.url) {
    return `<div class="mcr-media"><img class="mcr-thumb" src="${escapeHtml(image.url)}" alt="" loading="lazy"></div>`;
  }
  const video = entry.media.find((m) => m.kind === "youtube" && m.videoId);
  if (video?.videoId) {
    // 목록에 iframe 을 다 붙이면 페이지가 느려진다 — 썸네일만 깔고 클릭 시 붙인다.
    return `<div class="mcr-media"><button type="button" class="mcr-video" data-mcr-play="${escapeHtml(video.videoId)}" aria-label="영상 재생">
      <img class="mcr-thumb" src="https://img.youtube.com/vi/${escapeHtml(video.videoId)}/hqdefault.jpg" alt="" loading="lazy">
      <span class="mcr-play">▶</span></button></div>`;
  }
  return "";
}

function render(mount: HTMLElement, state: ResultDto) {
  const notYet = !state.published;

  if (state.awards.length === 0) {
    mount.innerHTML = `<div class="mc mcr">
      ${state.preview ? '<div class="mc-preview-banner">미리보기입니다. 아직 공개되지 않았어요.</div>' : ""}
      <div class="mcr-empty">
        <p class="mcr-empty-title">${notYet ? "결과 발표를 준비하고 있어요" : "공개된 수상 내역이 없어요"}</p>
        <p class="mcr-empty-sub">${notYet ? "발표가 끝나면 이 자리에 수상작이 올라옵니다." : "잠시 후 다시 확인해주세요."}</p>
      </div>
    </div>`;
    return;
  }

  const items = state.awards
    .map((award, index) => {
      const entry = award.entry;
      return `<article class="mcr-item${index === 0 ? " is-top" : ""}">
        ${mediaHtml(entry)}
        <div class="mcr-body">
          <span class="mcr-badge">${escapeHtml(award.name)}</span>
          <h3 class="mcr-name">${escapeHtml(entry.title)}</h3>
          ${entry.teamName ? `<p class="mcr-team">${escapeHtml(entry.teamName)}</p>` : ""}
          <span class="mcr-no">참가번호 ${escapeHtml(entry.entryNo)}</span>
          ${award.description ? `<p class="mcr-desc">${escapeHtml(award.description)}</p>` : ""}
        </div>
      </article>`;
    })
    .join("");

  mount.innerHTML = `<div class="mc mcr">
    ${state.preview && notYet ? '<div class="mc-preview-banner">미리보기입니다. 아직 관람객에게는 보이지 않아요.</div>' : ""}
    <div class="mcr-head">
      <h2 class="mcr-title">${escapeHtml(state.competition.name)} 수상 결과</h2>
      <p class="mcr-sub">축하합니다!</p>
    </div>
    <div class="mcr-list">${items}</div>
  </div>`;

  mount.querySelectorAll<HTMLElement>("[data-mcr-play]").forEach((node) => {
    node.addEventListener("click", () => {
      const videoId = node.getAttribute("data-mcr-play");
      if (!videoId) return;
      const frame = document.createElement("iframe");
      frame.className = "mcr-frame";
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
      frame.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("title", "수상작 영상");
      node.replaceWith(frame);
    });
  });
}
