/**
 * 공고 상세페이지 조립 — 어드민 미리보기 / 외부 사이트 임베드 공통 진입점.
 *
 * 껍데기의 스타일·효과를 그대로 쓴다. 웨비나 랜딩과 **같은 클래스·같은 변수 계약**이라
 * 스크롤 리빌·세로 목차·배경 모드가 별도 구현 없이 걸린다.
 */
import { clearNode, h } from "@/lib/landing/h";
import { attachReveal, attachTocSpy, attachTocVisibility } from "@/lib/landing/effects";
import { createTocLayer, releaseLayer } from "@/lib/landing/overlay";
import { NOTICE_CSS } from "./css";
import { buildNoticeModel } from "./build-model";
import { renderHero, renderToc } from "./view-hero";
import {
  renderApply,
  renderConcept,
  renderCountdown,
  renderCriteria,
  renderEligibility,
  renderFaq,
  renderPrizes,
  renderSelection,
  renderSnapshot,
  renderSponsors,
  renderTimeline,
} from "./view-sections";
import { normalizeNoticePageConfig } from "./config";
import type { NoticeCompetition } from "./types";

const STYLE_ID = "mc-notice-styles";
const FONT_ID = "mc-notice-font";
const FONT_HREF = "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

let seq = 0;
const nextUid = () => `n${(seq += 1)}`;

export interface MountNoticeOptions {
  mount: HTMLElement;
  competition: NoticeCompetition;
  /** Competition.config 원본 — 여기서 정규화한다(호출부마다 다르게 다루면 어긋난다). */
  config: unknown;
  embedded: boolean;
  isPreview: boolean;
  /** 신청 버튼을 눌렀을 때. 미리보기면 호출부가 저장하지 않는 핸들러를 준다. */
  onApply: () => void;
  /**
   * 세로 목차를 붙일지. 목차는 `position: fixed` 로 **body 직계**에 사는데,
   * 어드민 편집 화면의 축소 미리보기에서는 그게 편집 UI 위로 떠 버린다.
   * 기본값 true — 끄는 건 어드민 인라인 미리보기뿐이다.
   */
  attachToc?: boolean;
}

export interface NoticeHandle {
  destroy(): void;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = NOTICE_CSS;
  document.head.appendChild(style);
}

function ensureFont(): void {
  if (document.getElementById(FONT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_ID;
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  document.head.appendChild(link);
}

/**
 * 배경 위에서 읽히는 글자색.
 *
 * 랜딩 mount.ts 의 paperFor 와 같은 계산이다(그 파일은 이 함수를 export 하지 않는다).
 * 상수로 두지 않는 이유: 편집 UI 가 "글자색은 배경에서 자동으로 따라옵니다"라고 안내하는데,
 * 운영자가 다크 모드 배경에 흰색을 고르면 상수 --paper 로는 대비 1.06:1 백지가 된다.
 */
function paperFor(bg: string): string {
  const hex = bg.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.45 ? "#101828" : "#f6f8ff";
}

/**
 * 마감까지 남은 시간.
 *
 * 서버가 렌더한 값을 굳히지 않고 브라우저에서 1초마다 다시 센다 — 탭을 오래 열어 둔
 * 방문자에게 멈춘 숫자가 계속 보이면 안 된다. 마감이 지나면 0 으로 고정하고 타이머를 끈다.
 */
function attachCountdown(root: HTMLElement): () => void {
  const box = root.querySelector<HTMLElement>("[data-countdown]");
  const deadlineRaw = box?.getAttribute("data-countdown");
  if (!box || !deadlineRaw) return () => {};
  const deadline = new Date(deadlineRaw).getTime();
  if (Number.isNaN(deadline)) return () => {};

  const cell = (key: string) => box.querySelector<HTMLElement>(`[data-cd="${key}"]`);
  const nodes = { days: cell("days"), hours: cell("hours"), mins: cell("mins"), secs: cell("secs") };

  let timer = 0;
  const tick = () => {
    const diff = deadline - Date.now();
    if (diff <= 0) {
      for (const node of Object.values(nodes)) if (node) node.textContent = "0";
      window.clearInterval(timer);
      return;
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    if (nodes.days) nodes.days.textContent = String(Math.floor(diff / 86400000));
    if (nodes.hours) nodes.hours.textContent = pad(Math.floor((diff % 86400000) / 3600000));
    if (nodes.mins) nodes.mins.textContent = pad(Math.floor((diff % 3600000) / 60000));
    if (nodes.secs) nodes.secs.textContent = pad(Math.floor((diff % 60000) / 1000));
  };

  tick();
  timer = window.setInterval(tick, 1000);
  return () => window.clearInterval(timer);
}

export function mountNotice(opts: MountNoticeOptions): NoticeHandle {
  const { mount, competition, embedded, isPreview, onApply } = opts;
  const uid = nextUid();

  ensureStyles();
  ensureFont();

  const np = normalizeNoticePageConfig(opts.config);
  const m = buildNoticeModel(competition, np, { uid, embedded, isPreview });

  const root = h("div", {
    class: `lnd${embedded ? " embedded" : ""}`,
    lang: "ko",
    style: {
      "--primary": m.accent,
      "--on-primary": m.onPrimary,
      "--bg-light": np.colors.lightBg,
      "--bg-dark": np.colors.darkBg,
      "--paper-light": paperFor(np.colors.lightBg),
      "--paper-dark": paperFor(np.colors.darkBg),
    },
    // 루트 모드 = 히어로 모드. 섹션은 각자 data-bg 로 자기 배경을 칠한다.
    "data-bg": np.sectionBg.hero,
  });

  // 공개 게이트 — 미공개 공고가 외부 사이트에 그대로 노출되면 안 된다.
  if (!np.enabled && !isPreview) {
    root.appendChild(
      h(
        "div",
        { style: { minHeight: "50vh", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" } },
        "아직 공개되지 않은 페이지예요.",
      ),
    );
    clearNode(mount);
    mount.appendChild(root);
    return { destroy: () => root.remove() };
  }

  if (!np.enabled && isPreview) {
    root.appendChild(h("div", { class: "preview-badge" }, "비공개 상태 · 미리보기"));
  }

  const body = h(
    "div",
    { class: "lnd-body" },
    renderHero(m, onApply),
    renderConcept(m),
    renderSnapshot(m),
    renderTimeline(m),
    renderApply(m),
    renderEligibility(m),
    renderSelection(m),
    renderCriteria(m),
    renderPrizes(m),
    renderCountdown(m, onApply),
    renderFaq(m),
    renderSponsors(m),
  );
  root.appendChild(body);

  clearNode(mount);
  mount.appendChild(root);

  const cleanups: Array<() => void> = [];

  // 목차는 body 직계 레이어에 산다 — 호스트 페이지의 스택 문맥에 갇히지 않게.
  const toc = opts.attachToc === false ? null : renderToc(m);
  let tocLayer: HTMLElement | null = null;
  if (toc) {
    tocLayer = createTocLayer(uid, m.accent, m.onPrimary, np.colors.lightBg, np.colors.darkBg);
    tocLayer.appendChild(toc);
    cleanups.push(() => releaseLayer(uid));
  }

  cleanups.push(attachReveal(root));
  cleanups.push(attachCountdown(root));
  if (toc) {
    // 미디어 히어로는 설정이 라이트여도 스크림이 어둡다 → 목차 글자는 항상 밝게(css 와 같은 규칙).
    const heroBg = np.hero.media ? "dark" : np.sectionBg.hero;
    cleanups.push(
      attachTocSpy(root, toc, m.tocItems.map((item) => m.sectionId(item.id)), tocLayer, heroBg),
    );
    // 임베드는 공고 위아래로 호스트 콘텐츠가 있다 → 공고를 벗어나면 고정 목차를 감춘다.
    cleanups.push(attachTocVisibility(body, toc));
  }

  return {
    destroy() {
      for (const cleanup of cleanups) cleanup();
      root.remove();
    },
  };
}
