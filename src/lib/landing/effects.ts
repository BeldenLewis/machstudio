/**
 * 랜딩 스크롤 연출 3종 — 전부 해제 함수를 돌려준다(재마운트·모델 변경 시 정리 가능해야 함).
 *
 * 원본은 `webinar/[slug]/landing/page.tsx` 의 useEffect 세 개였다. 옮기면서 바뀐 전제:
 *  - 예전엔 auto-height iframe 안이라 문서에 스크롤이 없었고, IO 는 최상위 뷰포트를 기준으로만
 *    동작했다. 이제 호스트 DOM 에 직접 마운트되므로 threshold/rootMargin 이 실제 뷰포트에
 *    걸린다 → 값은 원본 그대로 두되(시각 회귀 0), 의미가 생겼다는 점만 기억할 것.
 *  - 한 페이지에 랜딩이 둘 이상 붙을 수 있다 → document 전역 조회 금지, 넘겨받은 root 안에서만 찾는다.
 *  - IntersectionObserver 미지원 브라우저에서 콘텐츠가 통째로 안 보이는 사고를 막는 게 최우선이다.
 */

/**
 * uid 접두가 붙은 id 는 숫자로 시작할 수도 있어 `#id` 셀렉터가 깨질 수 있다.
 * CSS.escape 유무에 의존하지 않도록 [id] 를 훑어 비교한다(부착 시 1회라 비용 무시 가능).
 */
function findById(root: HTMLElement, id: string): HTMLElement | null {
  if (!id) return null;
  if (root.id === id) return root;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[id]"))) {
    if (el.id === id) return el;
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasIO(): boolean {
  return typeof IntersectionObserver !== "undefined";
}

const noop = () => {};

/**
 * 스크롤 리빌 — `.rv` 가 뷰포트에 들어오면 `.in` 을 붙인다(한 번만).
 * transform 만 쓰므로 JS 미실행에서도 콘텐츠는 보이지만, reduced-motion·IO 미지원에서는
 * 애초에 `.in` 을 전부 붙여 연출을 건너뛴다.
 */
export function attachReveal(root: HTMLElement): () => void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
  if (prefersReducedMotion() || !hasIO()) {
    els.forEach((el) => el.classList.add("in"));
    return noop;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  els.forEach((el) => io.observe(el));
  return () => io.disconnect();
}

/**
 * 세션~타임테이블 구간 키컬러 배경 — 화면 중앙 밴드(rootMargin -45%/-45%)에 구간이 걸치면
 * root 에 `.on-accent` 를 붙이고, 벗어나면 뗀다.
 * zoneIds 는 sectionId() 를 통과한 실제 DOM id 를 받는다.
 *
 * mirror: 같은 클래스를 함께 걸 요소들. 목차는 body 직계 레이어로 포털되어 root 의 후손이
 * 아니게 되므로(`.lnd.on-accent .toc-link` 가 안 걸린다), 그 레이어를 여기로 넘겨 색을 맞춘다.
 */
export function attachAccentZone(root: HTMLElement, zoneIds: string[], mirror: HTMLElement[] = []): () => void {
  const zones = zoneIds
    .map((id) => findById(root, id))
    .filter((el): el is HTMLElement => Boolean(el));
  const targets = [root, ...mirror];
  if (!zones.length || !hasIO()) return noop;

  const active = new Set<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) active.add(entry.target);
        else active.delete(entry.target);
      });
      const on = active.size > 0;
      targets.forEach((el) => el.classList.toggle("on-accent", on));
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  zones.forEach((zone) => io.observe(zone));
  return () => {
    io.disconnect();
    active.clear();
    targets.forEach((el) => el.classList.remove("on-accent"));
  };
}

/**
 * 목차 노출 게이트 — 랜딩 콘텐츠가 화면에서 벗어나면 목차를 감춘다.
 *
 * 단독 페이지는 랜딩이 문서 전체라 원래 문제가 없었다. 임베드는 위아래로 호스트 콘텐츠가 있어서,
 * 목차가 viewport 고정이면 호스트 헤더/푸터를 보는 동안에도 그대로 떠 있게 된다.
 * IO 미지원이면 감추지 않는다 — 랜딩 구간에서 목차가 아예 안 보이는 쪽이 더 나쁘다.
 */
export function attachTocVisibility(content: HTMLElement, toc: HTMLElement | null): () => void {
  if (!toc || !hasIO()) return noop;
  const OFF = "data-lnd-off";
  // 초기 상태는 기하로 **동기 판정**한다. 무조건 감춰 놓고 IO 콜백이 풀어 주는 방식이면,
  // 랜딩이 이미 화면에 있는 흔한 경우에 로드 직후 목차가 사라졌다 다시 나타난다(페이드 왕복).
  // 스크롤이 이미 랜딩을 지난 상태로 진입하는 경우(임베드·새로고침)도 여기서 바로 감춰진다.
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = content.getBoundingClientRect();
  if (!(rect.bottom > 0 && rect.top < vh)) toc.setAttribute(OFF, "");
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) toc.removeAttribute(OFF);
        else toc.setAttribute(OFF, "");
      });
    },
    { threshold: 0 },
  );
  io.observe(content);
  return () => {
    io.disconnect();
    toc.removeAttribute(OFF);
  };
}

/**
 * 목차 링크의 `data-toc-id` 는 원칙적으로 섹션 DOM id 와 같은 값이지만,
 * 뷰가 uid 없는 기본 id("lnd-faq")를 심는 경우도 받아 준다 — 접두만 다른 접미 일치까지 허용.
 */
function tocIdMatches(attr: string | null, sectionId: string): boolean {
  if (!attr) return false;
  if (attr === sectionId) return true;
  return sectionId.length > attr.length && sectionId.endsWith(attr);
}

/**
 * 왼쪽 목차 스크롤 스파이 — 지금 보이는 섹션의 링크에 `aria-current="true"`.
 * 임베드처럼 목차가 없는 경우엔 tocEl 로 null 이 들어오고 아무것도 하지 않는다.
 * sectionIds 는 sectionId() 를 통과한 실제 DOM id 목록(목차 순서와 같아야 한다).
 */
export function attachTocSpy(
  root: HTMLElement,
  tocEl: HTMLElement | null,
  sectionIds: string[],
): () => void {
  if (!tocEl || !hasIO()) return noop;
  const sections = sectionIds
    .map((id) => findById(root, id))
    .filter((el): el is HTMLElement => Boolean(el));
  if (!sections.length) return noop;

  const links = Array.from(tocEl.querySelectorAll<HTMLElement>("[data-toc-id]"));
  let active: string | null = null;

  const apply = () => {
    for (const link of links) {
      const on = active !== null && tocIdMatches(link.getAttribute("data-toc-id"), active);
      if (on) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  };

  const io = new IntersectionObserver(
    (entries) => {
      // 원본과 동일한 판정: 교차 중인 엔트리 중 마지막 것이 이긴다(교차가 없으면 직전 값 유지).
      let next = active;
      entries.forEach((entry) => {
        if (entry.isIntersecting) next = (entry.target as HTMLElement).id;
      });
      if (next === active) return;
      active = next;
      apply();
    },
    { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
  );
  apply(); // 재부착 시 이전 상태가 남지 않게 초기화
  sections.forEach((section) => io.observe(section));
  return () => {
    io.disconnect();
    active = null;
    apply();
  };
}

/**
 * details 아코디언 열고 닫는 모션 — FAQ 와 타임테이블이 공유한다.
 *
 * 왜 CSS 로 안 되나: `<details>` 는 닫히는 순간 브라우저가 내용을 즉시 감춘다(구현에 따라
 * display:none 또는 ::details-content 의 content-visibility). 그래서 `details[open]` 에
 * transition 을 걸어도 **닫는 애니메이션은 아예 실행되지 않고**, 여는 쪽만 어색하게 튄다.
 * 최신 CSS(interpolate-size / ::details-content 전환)로 되는 조합도 있지만, 랜딩은 남의
 * 사이트(아임웹 등)에 붙어서 브라우저를 고를 수 없다.
 *
 * 그래서 toggle 을 가로채 높이를 직접 애니메이션한다. 핵심은 **닫을 때 open 을 바로 떼지 않는
 * 것** — 애니메이션이 끝난 뒤에 뗀다. 그전에 떼면 내용이 사라져 줄어드는 모습을 볼 수 없다.
 *
 * 열림 상태를 CSS 가 아니라 JS 가 소유하지 않도록, 애니메이션 중에만 인라인 height 를 쓰고
 * 끝나면 지운다(그 뒤 높이는 내용이 정한다 — 창 크기가 바뀌어도 어긋나지 않는다).
 *
 * `<summary>` 는 반드시 첫 자식이어야 하고, 나머지를 감싼 래퍼 하나가 애니메이션 대상이다.
 * 뷰가 그 래퍼에 data-acc-body 를 달아 준다(래퍼가 없으면 그 항목은 조용히 건너뛴다 —
 * 모션이 없는 것보다 열리지 않는 게 나쁘다).
 */
const ACC_MS = 220;
const ACC_EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

export function attachAccordion(root: HTMLElement): () => void {
  /* reduced-motion 이면 브라우저 기본 동작에 맡긴다 — 즉시 열리고 닫힌다.
     "모션을 0ms 로" 가 아니라 아예 개입하지 않는 쪽이 안전하다(가로채기 자체가 버그원). */
  if (prefersReducedMotion() || typeof Element.prototype.animate !== "function") return noop;

  /**
   * **위임**으로 처리한다(항목별 리스너 금지). FAQ 는 카테고리 탭을 누르면 목록을 다시 그리는데,
   * 그때 새로 생긴 details 에는 리스너가 없어 모션만 조용히 사라진다. 루트 한 곳에서 받으면
   * 몇 번 다시 그려도 계약이 유지된다.
   *
   * toggle 이벤트를 쓰지 않는 이유: toggle 은 **버블링하지 않아서** 위임이 불가능하다.
   * 그래서 열기/닫기 **둘 다** click 에서 가로채고 open 을 우리가 넘긴다.
   * (summary 는 키보드 Enter/Space 도 click 으로 들어온다 — 키보드 경로가 빠지지 않는다.)
   */
  const running = new WeakMap<HTMLElement, Animation>();

  const animate = (item: HTMLDetailsElement, body: HTMLElement, opening: boolean) => {
    running.get(body)?.cancel();
    if (opening) item.open = true; // 높이를 재려면 먼저 열려 있어야 한다
    const target = body.scrollHeight;
    const frames = opening
      ? [{ height: "0px", opacity: 0 }, { height: `${target}px`, opacity: 1 }]
      : [{ height: `${target}px`, opacity: 1 }, { height: "0px", opacity: 0 }];
    body.style.overflow = "hidden";
    const anim = body.animate(frames, { duration: ACC_MS, easing: ACC_EASE });
    running.set(body, anim);
    const done = () => {
      // 인라인 잔재를 남기지 않는다 — 남기면 창 크기가 바뀌었을 때 높이가 내용과 어긋난다.
      body.style.overflow = "";
      running.delete(body);
    };
    anim.onfinish = () => {
      done();
      // 닫기는 애니메이션이 **끝난 뒤** open 을 뗀다. 먼저 떼면 내용이 즉시 사라져
      // 줄어드는 모습을 볼 수 없다(그게 details 를 CSS 로 못 다루는 이유다).
      if (!opening) item.open = false;
    };
    anim.oncancel = done;
  };

  const onClick = (e: Event) => {
    const target = e.target as HTMLElement | null;
    const summary = target?.closest?.("summary");
    if (!summary) return;
    const item = summary.parentElement as HTMLDetailsElement | null;
    if (!item || item.tagName !== "DETAILS" || !item.hasAttribute("data-acc")) return;
    if (!root.contains(item)) return;
    const body = item.querySelector<HTMLElement>("[data-acc-body]");
    // 래퍼가 없으면 손대지 않는다 — 모션이 없는 것보다 열리지 않는 게 나쁘다.
    if (!body) return;
    e.preventDefault();
    animate(item, body, !item.open);
  };

  root.addEventListener("click", onClick);
  return () => root.removeEventListener("click", onClick);
}
