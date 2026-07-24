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
 */
export function attachAccentZone(root: HTMLElement, zoneIds: string[]): () => void {
  const zones = zoneIds
    .map((id) => findById(root, id))
    .filter((el): el is HTMLElement => Boolean(el));
  if (!zones.length || !hasIO()) return noop;

  const active = new Set<Element>();
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) active.add(entry.target);
        else active.delete(entry.target);
      });
      root.classList.toggle("on-accent", active.size > 0);
    },
    { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
  );
  zones.forEach((zone) => io.observe(zone));
  return () => {
    io.disconnect();
    active.clear();
    root.classList.remove("on-accent");
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
