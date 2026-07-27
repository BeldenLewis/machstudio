// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachAccordion } from "@/lib/landing/effects";

/**
 * details 아코디언 모션.
 *
 * 왜 브라우저가 아니라 여기서 검증하나: 이 로직의 핵심은 **애니메이션이 끝난 뒤** 무엇을
 * 하는가다(닫기는 그때 open 을 뗀다). 그런데 브라우저 창이 화면에 없으면
 * `document.timeline.currentTime` 이 0 에 멈춰 Web Animations 가 진행되지 않고 finish 도
 * 오지 않는다(실측: hidden 창에서 timeline 0, performance.now() 96662). 그래서 종료 콜백을
 * 우리가 부를 수 있는 가짜 animate 로 대체해 계약만 확인한다.
 *
 * 확인하는 계약:
 *   · 닫을 때 open 을 **바로 떼지 않는다** — 떼면 내용이 사라져 줄어드는 모습을 볼 수 없다.
 *     (이게 details 를 CSS 만으로 다룰 수 없는 이유이고, 이 코드가 존재하는 이유다.)
 *   · 끝나면 인라인 잔재를 남기지 않는다 — 남으면 창 크기가 바뀔 때 높이가 내용과 어긋난다.
 *   · reduced-motion 이면 아예 개입하지 않는다(가로채기 자체가 버그원).
 *   · 위임이라 **다시 그려진 항목에도 걸린다** — FAQ 는 카테고리 탭에서 목록을 다시 그린다.
 */

interface FakeAnim {
  cancel: () => void;
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  finish: () => void;
}

let anims: FakeAnim[];

function stubAnimate() {
  anims = [];
  // jsdom 에는 Element.prototype.animate 가 없다 — 있어야 attachAccordion 이 개입한다.
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    writable: true,
    value: function () {
      const a: FakeAnim = {
        onfinish: null,
        oncancel: null,
        cancel() { a.oncancel?.(); },
        finish() { a.onfinish?.(); },
      };
      anims.push(a);
      return a as unknown as Animation;
    },
  });
}

function setReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: reduce && q.includes("reduce"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  }));
}

/** summary + data-acc-body 래퍼를 가진 details 하나. */
function build(root: HTMLElement, opts: { body?: boolean } = {}) {
  const d = document.createElement("details");
  d.setAttribute("data-acc", "");
  const sum = document.createElement("summary");
  sum.textContent = "제목";
  d.appendChild(sum);
  if (opts.body !== false) {
    const body = document.createElement("div");
    body.setAttribute("data-acc-body", "");
    body.textContent = "내용";
    d.appendChild(body);
  }
  root.appendChild(d);
  return { details: d, summary: sum, body: d.querySelector<HTMLElement>("[data-acc-body]") };
}

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = "";
  root = document.createElement("div");
  document.body.appendChild(root);
  stubAnimate();
  setReducedMotion(false);
});

describe("열기", () => {
  it("높이를 재려면 먼저 열려 있어야 한다 — open 을 켠 뒤 애니메이션한다", () => {
    const { details, summary } = build(root);
    attachAccordion(root);
    summary.click();
    expect(details.open).toBe(true);
    expect(anims).toHaveLength(1);
  });
});

describe("닫기 — 이 코드가 존재하는 이유", () => {
  it("누른 직후에는 open 을 떼지 않는다 — 떼면 줄어드는 모습을 볼 수 없다", () => {
    const { details, summary } = build(root);
    details.open = true;
    attachAccordion(root);
    summary.click();
    expect(details.open).toBe(true); // 아직 닫히지 않았다
    expect(anims).toHaveLength(1);
  });

  it("애니메이션이 끝난 뒤에 open 이 떨어진다", () => {
    const { details, summary } = build(root);
    details.open = true;
    attachAccordion(root);
    summary.click();
    anims[0].finish();
    expect(details.open).toBe(false);
  });

  it("끝나면 인라인 잔재가 없다 — 남으면 창 크기 변화에 높이가 어긋난다", () => {
    const { details, summary, body } = build(root);
    details.open = true;
    attachAccordion(root);
    summary.click();
    expect(body!.style.overflow).toBe("hidden"); // 진행 중에는 필요하다
    anims[0].finish();
    expect(body!.style.overflow).toBe("");
  });

  it("중간에 끊겨도(cancel) 잔재를 지운다 — 다음 열기의 시작 높이가 틀어진다", () => {
    const { details, summary, body } = build(root);
    details.open = true;
    attachAccordion(root);
    summary.click();
    anims[0].cancel();
    expect(body!.style.overflow).toBe("");
  });

  it("연달아 누르면 앞 애니메이션을 취소하고 새로 시작한다 — 상태가 겹치지 않게", () => {
    const { summary } = build(root);
    attachAccordion(root);
    summary.click(); // 열기
    summary.click(); // 바로 닫기
    expect(anims).toHaveLength(2);
  });
});

describe("건드리지 않는 경우", () => {
  it("reduced-motion 이면 아예 개입하지 않는다 — 브라우저 기본 동작에 맡긴다", () => {
    setReducedMotion(true);
    const { summary } = build(root);
    attachAccordion(root);
    summary.click();
    expect(anims).toHaveLength(0);
  });

  it("본문 래퍼가 없으면 손대지 않는다 — 모션이 없는 것보다 열리지 않는 게 나쁘다", () => {
    const { details, summary } = build(root, { body: false });
    attachAccordion(root);
    summary.click();
    expect(anims).toHaveLength(0);
    expect(details.open).toBe(true); // 브라우저 기본 토글이 그대로 동작
  });

  it("data-acc 가 없는 details 는 대상이 아니다 — 랜딩 밖의 details 를 가로채지 않는다", () => {
    const { details, summary } = build(root);
    details.removeAttribute("data-acc");
    attachAccordion(root);
    summary.click();
    expect(anims).toHaveLength(0);
  });
});

describe("위임 — 다시 그려진 항목에도 걸린다", () => {
  /**
   * FAQ 는 카테고리 탭을 누르면 목록을 통째로 다시 그린다. 항목별 리스너였다면 그때부터
   * 모션이 조용히 사라진다(그래서 toggle 이벤트를 쓰지 않는다 — toggle 은 버블링하지 않아
   * 위임이 불가능하다).
   */
  it("부착 후 새로 추가된 details 도 동작한다", () => {
    attachAccordion(root);
    const { summary } = build(root); // 부착 뒤에 생성
    summary.click();
    expect(anims).toHaveLength(1);
  });

  it("해제하면 더 이상 가로채지 않는다", () => {
    const { summary } = build(root);
    const detach = attachAccordion(root);
    detach();
    summary.click();
    expect(anims).toHaveLength(0);
  });
});
