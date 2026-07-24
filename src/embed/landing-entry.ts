/**
 * 랜딩 임베드 진입점 — 외부 사이트(아임웹 등) 문서에서 실행된다.
 *
 * 스니펫:
 *   <div id="ms-landing-{slug}" data-ms-landing-mount data-ms-slug="{slug}">…폴백 링크…</div>
 *   <script async src="https://machstudio.vercel.app/w/l/{slug}"></script>
 *
 * 이 파일은 esbuild 로 IIFE 번들(globalName=__msLanding)이 되고, /w/l/{slug} 라우트가
 * 번들 뒤에 `__msLanding.boot({...페이로드...})` 를 붙여 내려보낸다.
 * → 데이터 fetch 왕복이 0이라 스크립트가 도착하는 순간 최종 콘텐츠가 그려진다
 *   (iframe 시절 10초 넘게 보이던 빈 화면의 근본 원인 제거).
 */

import { mountLanding, type LandingHandle } from "@/lib/landing/mount";
import type { LandingWebinar } from "@/lib/landing/types";

export interface BootConfig {
  slug: string;
  origin: string;
  /** 서버가 스크립트에 실어 보낸 스냅샷. null 이면 런타임 fetch 로 폴백. */
  webinar: LandingWebinar | null;
}

interface Instance {
  handle: LandingHandle | null;
  mount: HTMLElement | null;
  cfg: BootConfig;
  observer: MutationObserver | null;
  cleanupHero?: (() => void) | null;
  remounts: number;
  remountWindowStart: number;
}

type Registry = Record<string, Instance>;
type WindowWithRegistry = Window & { __MACH_LANDING__?: Registry };

function registry(): Registry {
  const w = window as WindowWithRegistry;
  return (w.__MACH_LANDING__ = w.__MACH_LANDING__ ?? {});
}

function warn(msg: string, e?: unknown): void {
  try {
    if (window.console && console.warn) console.warn("[mach landing] " + msg, e ?? "");
  } catch {
    /* 호스트 콘솔이 막혀 있어도 진행 */
  }
}

function findMount(slug: string): HTMLElement | null {
  const byAttr = document.querySelector<HTMLElement>(
    '[data-ms-landing-mount][data-ms-slug="' + CSS.escape(slug) + '"]',
  );
  if (byAttr) return byAttr;
  // 구 스니펫 호환 — id 만 있는 경우
  const all = document.querySelectorAll<HTMLElement>("[id]");
  for (let i = 0; i < all.length; i++) {
    if (all[i].id === "ms-landing-" + slug) return all[i];
  }
  return null;
}

/**
 * 아임웹 위젯 애니메이션이 마운트를 숨겨 둔 채로 두는 경우가 있다(_widget_data.wg_animated
 * → visibility:hidden). 우리 콘텐츠가 통째로 안 보이는 사고라 인라인으로 풀어 준다.
 */
function unhideWidget(mount: HTMLElement): void {
  try {
    const wd = mount.closest ? (mount.closest("._widget_data") as HTMLElement | null) : null;
    if (!wd) return;
    wd.classList.add("_ds_animated_except");
    wd.classList.remove("wg_animated");
    wd.style.visibility = "visible";
    wd.style.opacity = "1";
  } catch (e) {
    warn("widget unhide 실패", e);
  }
}

/** 마운트 안에 남아 있는 옛 iframe 임베드를 제거한다(스니펫 이중 부착 방어). */
function dropLegacyIframes(mount: HTMLElement): void {
  const frames = mount.querySelectorAll("iframe");
  for (let i = 0; i < frames.length; i++) {
    const src = frames[i].getAttribute("src") || "";
    if (src.indexOf("/landing") !== -1) frames[i].remove();
  }
}

/** /w 로더의 하단 배너와 히어로 CTA 가 겹치지 않게 상태를 <html> 에 게시한다. */
function publishHeroVisibility(root: HTMLElement): () => void {
  const hero = root.querySelector(".hero");
  if (!hero || typeof IntersectionObserver === "undefined") return () => {};
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        document.documentElement.setAttribute(
          "data-ms-landing-hero",
          entry.isIntersecting ? "in" : "out",
        );
      }
    },
    { threshold: 0.35 },
  );
  io.observe(hero);
  return () => {
    io.disconnect();
    document.documentElement.removeAttribute("data-ms-landing-hero");
  };
}

async function fetchWebinar(cfg: BootConfig): Promise<LandingWebinar | null> {
  try {
    const res = await fetch(cfg.origin + "/api/webinar/" + encodeURIComponent(cfg.slug) + "/info", {
      credentials: "omit",
      mode: "cors",
    });
    const data = (await res.json()) as { webinar?: LandingWebinar } | null;
    return data?.webinar ?? null;
  } catch (e) {
    warn("데이터 요청 실패", e);
    return null;
  }
}

function render(inst: Instance): void {
  const mount = findMount(inst.cfg.slug);
  if (!mount) {
    warn("마운트 지점을 찾지 못했습니다: " + inst.cfg.slug);
    return;
  }
  inst.mount = mount;
  unhideWidget(mount);
  dropLegacyIframes(mount);

  const webinar = inst.cfg.webinar;
  if (!webinar) return;

  inst.handle?.destroy();
  inst.cleanupHero?.();

  const handle = mountLanding({
    mount,
    webinar,
    embedded: true,
    isPreview: false, // 호스트 URL 쿼리는 신뢰하지 않는다 — 비공개 랜딩이 새면 안 된다
    origin: inst.cfg.origin,
  });
  inst.handle = handle;

  const root = mount.querySelector<HTMLElement>(".lnd");
  if (root) inst.cleanupHero = publishHeroVisibility(root);
  document.documentElement.setAttribute("data-ms-landing", "1");
}

/**
 * 호스트가 위젯을 다시 그리면 우리 콘텐츠가 지워진다. 복원된 HTML 안의 <script> 는
 * innerHTML 경로라 재실행되지 않으므로, 우리가 직접 감시해서 다시 붙인다.
 * 폭주 방지: 1분에 5회까지만.
 */
function watchForRerender(inst: Instance): void {
  if (typeof MutationObserver === "undefined") return;
  const target = inst.mount?.parentElement;
  if (!target) return;

  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new MutationObserver(() => {
    const root = inst.mount && inst.mount.querySelector(".lnd");
    if (root && document.contains(root)) return; // 우리 콘텐츠가 살아 있으면 무시
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const now = Date.now();
      if (now - inst.remountWindowStart > 60_000) {
        inst.remountWindowStart = now;
        inst.remounts = 0;
      }
      if (++inst.remounts > 5) {
        warn("재마운트 한도 초과 — 관측만 계속합니다");
        return;
      }
      render(inst);
    }, 200);
  });
  observer.observe(target, { childList: true });
  inst.observer = observer;
}

export function boot(cfg: BootConfig): void {
  try {
    const reg = registry();
    const prev = reg[cfg.slug];
    if (prev) {
      // 재진입은 조기 return 이 아니라 재마운트 — 호스트 재렌더 후 스크립트가 다시 돌 수 있다.
      prev.cfg = cfg;
      render(prev);
      return;
    }
    const inst: Instance = {
      handle: null,
      mount: null,
      cfg,
      observer: null,
      remounts: 0,
      remountWindowStart: Date.now(),
    };
    reg[cfg.slug] = inst;

    const start = () => {
      if (!inst.cfg.webinar) {
        void fetchWebinar(inst.cfg).then((w) => {
          inst.cfg = { ...inst.cfg, webinar: w };
          if (!w) {
            warn("데이터를 가져오지 못해 폴백 링크를 유지합니다");
            return;
          }
          render(inst);
          watchForRerender(inst);
        });
        return;
      }
      render(inst);
      watchForRerender(inst);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  } catch (e) {
    // 호스트 페이지를 절대 깨뜨리지 않는다.
    warn("부트 실패", e);
  }
}
