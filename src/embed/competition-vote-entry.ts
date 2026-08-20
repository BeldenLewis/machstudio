/**
 * 대회 투표 임베드 런타임 — 아임웹 코드블럭에 한 줄로 붙는다.
 *
 *   <script async src="https://…/c/{competitionId}/vote"></script>
 *   <div data-mach-competition-vote></div>
 *
 * 공고 임베드와 달리 **참가작 목록을 실행 시점에 가져온다.** 노출 토글·투표 수·이미 찍은 표가
 * 사람마다·순간마다 다르기 때문이다(스냅샷으로 굳히면 안 된다).
 *
 * 영상은 썸네일만 깔고 **클릭했을 때 iframe 을 붙인다** — 20개를 한 번에 임베드하면 페이지가 죽는다.
 */
import { buildCompetitionCss, escapeHtml, type CompetitionTheme } from "@/lib/competition-render";
import { VOTE_CSS } from "@/lib/competition-vote-css";
import { competitionVoteStrings, type CompetitionVoteStrings } from "@/lib/competition-vote-strings";
import type { NoticeLanguage } from "@/lib/notice/config";

interface BootPayload {
  competitionId: string;
  origin: string;
  round: "prelim" | "final";
  preview?: boolean;
  /**
   * 미리보기에서만 넘어온다. 서버가 이 토큰을 확인해 투표 창을 열린 것으로 보여 주고,
   * 공개된 참가작이 없으면 샘플을 채운다 — 접수 전에도 화면을 볼 수 있게.
   */
  previewToken?: string;
  /** "open" 이면 닫혀 있어도 열린 화면으로 그린다. 닫힌 화면도 봐야 하므로 값으로 구분한다. */
  previewState?: "open" | "closed";
}

interface MediaItem {
  kind: "image" | "youtube";
  url?: string;
  videoId?: string;
}

interface EntryDto {
  id: string;
  entryNo: string;
  title: string;
  teamName: string | null;
  summary: string | null;
  media: MediaItem[];
}

interface StateDto {
  competition: { id: string; name: string; theme: CompetitionTheme; language: NoticeLanguage };
  round: { kind: string; name: string; maxVotesPerVoter: number; allowVoteUndo: boolean; showLiveTally: boolean };
  open: boolean;
  message: string;
  entries: EntryDto[];
  myVoteIds: string[];
  remaining: number;
  tally: Record<string, number> | null;
}

const DEVICE_KEY = "mc_device_id";
const STYLE_ID = "mc-vote-styles";

/**
 * 시스템 문구 사전. **상태를 가져온 뒤 확정한다** — 언어는 대회 설정값이라 실행 시점 fetch
 * 응답(state.competition.language)에만 있다. 기본값을 한국어로 두어 fetch 전에 불려도 안 깨진다.
 */
let t: CompetitionVoteStrings = competitionVoteStrings("ko");

function warn(message: string, error?: unknown) {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach competition vote] " + message, error ?? "");
  } catch {
    /* 로깅 실패는 무시 */
  }
}

/**
 * 기기 식별자 — 브라우저에 보관하는 임의 값. 서버는 이걸 해시해서만 저장한다.
 * localStorage 가 막힌 환경(시크릿·차단)에서는 세션 단위로라도 유지되게 폴백한다.
 */
function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? String(Date.now()) + Math.random().toString(36).slice(2));
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    try {
      let id = sessionStorage.getItem(DEVICE_KEY);
      if (!id) {
        id = String(Date.now()) + Math.random().toString(36).slice(2);
        sessionStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return "";
    }
  }
}

function findMount(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("[data-mach-competition-vote]");
  if (marked) return marked;
  const current = document.currentScript as HTMLScriptElement | null;
  const scripts = current ? [current] : Array.from(document.querySelectorAll("script[src*='/vote']"));
  const script = scripts[scripts.length - 1] as HTMLScriptElement | undefined;
  if (!script?.parentNode) return null;
  const host = document.createElement("div");
  host.setAttribute("data-mach-competition-vote", "");
  script.parentNode.insertBefore(host, script.nextSibling);
  return host;
}

function injectStyles(theme: CompetitionTheme) {
  const css = buildCompetitionCss(theme) + "\n" + VOTE_CSS;
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
    warn("마운트 지점을 찾지 못했어요 — <div data-mach-competition-vote></div> 를 넣어주세요.");
    return;
  }
  const deviceId = getDeviceId();

  let state: StateDto;
  try {
    const res = await fetch(
      `${payload.origin}/api/competitions/${payload.competitionId}/votes?round=${payload.round}&deviceId=${encodeURIComponent(deviceId)}` +
        (payload.previewToken ? `&previewToken=${encodeURIComponent(payload.previewToken)}` : "") +
        (payload.previewState ? `&state=${payload.previewState}` : ""),
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(String(res.status));
    state = await res.json();
  } catch (error) {
    warn("상태를 불러오지 못했어요", error);
    mount.innerHTML = `<div class="mc"><p class="mc-note">${escapeHtml(t.loadFailed)}</p></div>`;
    return;
  }

  t = competitionVoteStrings(state.competition.language);
  injectStyles(state.competition.theme);
  renderVote(mount, state, payload, deviceId);
}

function mediaThumbHtml(entry: EntryDto): string {
  const image = entry.media.find((m) => m.kind === "image" && m.url);
  if (image?.url) {
    return `<img class="mcv-thumb-img" src="${escapeHtml(image.url)}" alt="" loading="lazy">`;
  }
  const video = entry.media.find((m) => m.kind === "youtube" && m.videoId);
  if (video?.videoId) {
    // 썸네일만 깔고 재생은 클릭 시 — 목록에 iframe 을 다 붙이면 페이지가 느려진다.
    return `<button type="button" class="mcv-video" data-mcv-play="${escapeHtml(video.videoId)}" aria-label="${escapeHtml(t.playAriaLabel)}">
      <img class="mcv-thumb-img" src="https://img.youtube.com/vi/${escapeHtml(video.videoId)}/hqdefault.jpg" alt="" loading="lazy">
      <span class="mcv-play">▶</span></button>`;
  }
  return `<div class="mcv-thumb-empty"></div>`;
}

function renderVote(mount: HTMLElement, state: StateDto, payload: BootPayload, deviceId: string) {
  const selected = new Set(state.myVoteIds);
  let remaining = state.remaining;

  const cards = state.entries
    .map((entry) => {
      const voted = selected.has(entry.id);
      const tallyText =
        state.round.showLiveTally && state.tally
          ? `<span class="mcv-count">${escapeHtml(t.voteCount(state.tally[entry.id] ?? 0))}</span>`
          : "";
      return `<article class="mcv-card${voted ? " is-voted" : ""}" data-mcv-entry="${escapeHtml(entry.id)}">
        <div class="mcv-media">${mediaThumbHtml(entry)}</div>
        <div class="mcv-body">
          <div class="mcv-head"><span class="mcv-no">${escapeHtml(entry.entryNo)}</span>${tallyText}</div>
          <h3 class="mcv-title">${escapeHtml(entry.title)}</h3>
          ${entry.teamName ? `<p class="mcv-team">${escapeHtml(entry.teamName)}</p>` : ""}
          ${entry.summary ? `<p class="mcv-summary">${escapeHtml(entry.summary)}</p>` : ""}
          <button type="button" class="mcv-btn" data-mcv-vote="${escapeHtml(entry.id)}">
            ${voted ? escapeHtml(t.voteBtnVoted) : escapeHtml(t.voteBtnDefault)}
          </button>
        </div>
      </article>`;
    })
    .join("");

  mount.innerHTML = `<div class="mc mcv">
    ${payload.preview ? `<div class="mc-preview-banner">${escapeHtml(t.previewBanner)}</div>` : ""}
    <div class="mcv-bar">
      <span class="mcv-bar-title">${escapeHtml(state.round.name)}</span>
      <span class="mcv-remain" data-mcv-remain>${escapeHtml(t.remaining(remaining, state.round.maxVotesPerVoter))}</span>
    </div>
    ${state.open ? "" : `<p class="mc-note">${escapeHtml(state.message)}</p>`}
    ${state.entries.length === 0 ? `<p class="mc-note">${escapeHtml(t.emptyEntries)}</p>` : `<div class="mcv-grid">${cards}</div>`}
    <p class="mc-msg" data-mcv-msg></p>
  </div>`;

  const msgNode = mount.querySelector<HTMLElement>("[data-mcv-msg]");
  const remainNode = mount.querySelector<HTMLElement>("[data-mcv-remain]");
  const showMsg = (kind: "error" | "success", text: string) => {
    if (!msgNode) return;
    msgNode.className = `mc-msg mc-msg-${kind}`;
    msgNode.textContent = text;
  };
  const syncRemain = () => {
    if (remainNode) remainNode.textContent = t.remaining(remaining, state.round.maxVotesPerVoter);
  };

  // 영상 재생 — 클릭한 카드에만 iframe 을 붙인다.
  mount.querySelectorAll<HTMLElement>("[data-mcv-play]").forEach((node) => {
    node.addEventListener("click", () => {
      const videoId = node.getAttribute("data-mcv-play");
      if (!videoId) return;
      const frame = document.createElement("iframe");
      frame.className = "mcv-frame";
      frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
      frame.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture";
      frame.setAttribute("allowfullscreen", "");
      frame.setAttribute("title", t.videoTitle);
      node.replaceWith(frame);
    });
  });

  mount.querySelectorAll<HTMLButtonElement>("[data-mcv-vote]").forEach((button) => {
    button.addEventListener("click", async () => {
      const entryId = button.getAttribute("data-mcv-vote");
      if (!entryId) return;

      if (!state.open) { showMsg("error", state.message || t.cannotVoteNow); return; }

      const card = button.closest<HTMLElement>(".mcv-card");
      const alreadyVoted = selected.has(entryId);

      if (alreadyVoted && !state.round.allowVoteUndo) {
        showMsg("error", t.alreadyVoted);
        return;
      }
      if (!alreadyVoted && remaining <= 0) {
        showMsg("error", t.limitReached(state.round.maxVotesPerVoter));
        return;
      }

      if (payload.preview) {
        showMsg("success", t.previewNoEffect);
        return;
      }

      button.disabled = true;
      try {
        const res = await fetch(`${payload.origin}/api/competitions/${payload.competitionId}/votes`, {
          method: alreadyVoted ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            round: payload.round,
            deviceId,
            ...(alreadyVoted ? { entryId } : { entryIds: [entryId] }),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showMsg("error", data.error || t.genericError);
          if (typeof data.remaining === "number") { remaining = data.remaining; syncRemain(); }
          return;
        }

        if (alreadyVoted) {
          selected.delete(entryId);
          card?.classList.remove("is-voted");
          button.textContent = t.voteBtnDefault;
          showMsg("success", t.undone);
        } else {
          selected.add(entryId);
          card?.classList.add("is-voted");
          button.textContent = t.voteBtnVoted;
          showMsg("success", data.message || t.votedSuccess);
        }
        if (typeof data.remaining === "number") remaining = data.remaining;
        syncRemain();
      } catch {
        showMsg("error", t.networkError);
      } finally {
        button.disabled = false;
      }
    });
  });
}
