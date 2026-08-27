// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXPO_PORTAL_ATTR, EXPO_PORTAL_TAG, acquireExpoPortal, openExpoModal, resetExpoPortal,
} from "@/lib/expo/overlay";
import { EXPO_PORTAL_RESET_CSS } from "@/lib/expo/host-reset";
import { expoThemeVars } from "@/lib/expo/css";
import { scrollLockDepth, unlockScroll } from "@/lib/dom/scroll-lock";

/**
 * body 직계 Shadow 포털.
 *
 * 여기서 가장 나쁜 실패는 우리 모달이 안 보이는 것이 아니라 **파트너 사이트가
 * 스크롤되지 않게 남는 것**이다. 그래서 잠금 해제 경로를 여러 각도에서 본다.
 */

const VARS = expoThemeVars({ accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" });
const tick = () => new Promise((r) => setTimeout(r, 0));

const acquire = (over: Partial<Parameters<typeof acquireExpoPortal>[0]> = {}) =>
  acquireExpoPortal({ themeVars: VARS, sid: "sid-1", onLost: () => {}, ...over });

beforeEach(() => {
  // jsdom 은 scrollTo 를 구현하지 않는다 — 잠금 해제가 부르므로 목으로 막아 출력을 비운다.
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  resetExpoPortal(window as never);
  document.body.innerHTML = "";
  document.body.removeAttribute("style");
  document.body.className = "";
});

afterEach(() => {
  // 테스트가 잠금을 남기면 다음 테스트가 이유 없이 이상해진다.
  while (scrollLockDepth() > 0) unlockScroll();
  vi.restoreAllMocks();
});

describe("포털 호스트", () => {
  it("body 직계에 자기 Shadow 를 갖고 앉는다", () => {
    const lease = acquire()!;
    const host = document.body.querySelector(EXPO_PORTAL_TAG)!;
    expect(host.parentElement).toBe(document.body);
    expect(host.getAttribute(EXPO_PORTAL_ATTR)).toBe("v1");
    expect(host.shadowRoot).toBe(lease.root);
    expect(host.getAttribute("style")).toBe(EXPO_PORTAL_RESET_CSS);
  });

  /** 파트너 문서의 라이트 DOM 에는 우리 마크업이 한 줄도 없어야 한다. */
  it("모달 마크업이 라이트 DOM 에 없다", () => {
    const lease = acquire()!;
    lease.layer.appendChild(document.createElement("div"));
    expect(document.body.querySelector(".msx-portal")).toBeNull();
    expect(lease.root.querySelector(".msx-portal")).toBe(lease.layer);
  });

  /** `.msx-modal` 의 색이 전부 `.msx-root` 에 선언된 토큰이다 — 조상이 없으면 투명해진다. */
  it("Shadow 안에 렌더 루트가 있다", () => {
    const lease = acquire()!;
    const renderRoot = lease.root.querySelector(".msx-root[data-msx-portal-root]")!;
    expect(renderRoot).not.toBeNull();
    expect(lease.layer.parentElement).toBe(renderRoot);
    expect(renderRoot.getAttribute("data-msx-ready")).toBe("1");
  });

  /**
   * 한 파트너 페이지에 두 전시 홈페이지가 있으면 강조색이 다르다. 공용 렌더 루트에
   * 얹으면 마지막에 쓴 쪽이 이겨서 이미 열린 다른 오버레이 색이 조용히 바뀐다.
   */
  it("테마 토큰을 레이어에 얹는다 — 공용 루트가 아니다", () => {
    const lease = acquire()!;
    expect(lease.layer.style.getPropertyValue("--msx-accent")).toBe(VARS["--msx-accent"]);
    const renderRoot = lease.root.querySelector<HTMLElement>(".msx-root")!;
    expect(renderRoot.style.getPropertyValue("--msx-accent")).toBe("");
  });
});

describe("참조 카운트", () => {
  it("여러 임대가 호스트 하나를 공유한다", () => {
    const a = acquire({ sid: "a" })!;
    const b = acquire({ sid: "b" })!;
    expect(document.body.querySelectorAll(EXPO_PORTAL_TAG)).toHaveLength(1);
    expect(a.root).toBe(b.root);
    expect(a.layer).not.toBe(b.layer);
  });

  /** 삽입 순서가 z 순서다 — Tab·Escape 는 맨 위만 처리한다. */
  it("나중에 연 것이 맨 위다", () => {
    const a = acquire({ sid: "a" })!;
    const b = acquire({ sid: "b" })!;
    expect(a.isTopmost()).toBe(false);
    expect(b.isTopmost()).toBe(true);
    b.release();
    expect(a.isTopmost()).toBe(true);
  });

  /** 화면 전체를 덮는 고정 노드를 남기면 파트너의 `body > div` 규칙에 계속 걸린다. */
  it("마지막 임대가 끝나면 호스트까지 지운다", () => {
    const a = acquire({ sid: "a" })!;
    const b = acquire({ sid: "b" })!;
    a.release();
    expect(document.body.querySelector(EXPO_PORTAL_TAG)).not.toBeNull();
    b.release();
    expect(document.body.querySelector(EXPO_PORTAL_TAG)).toBeNull();
  });

  it("이중 해제는 무해하다", () => {
    const a = acquire({ sid: "a" })!;
    const b = acquire({ sid: "b" })!;
    a.release();
    a.release();
    // 언더플로로 호스트가 먼저 사라지면 b 의 모달이 화면에서 없어진다.
    expect(document.body.querySelector(EXPO_PORTAL_TAG)).not.toBeNull();
    b.release();
    expect(document.body.querySelector(EXPO_PORTAL_TAG)).toBeNull();
  });
});

describe("호스트가 사라지면", () => {
  /**
   * 아임웹이 페이지를 다시 그리면 호스트가 사라진다. 그걸 못 잡으면 스크롤 잠금
   * 카운트가 영영 안 내려가서 파트너 body 가 `position:fixed` 로 **모달도 없이** 굳는다.
   */
  it("보유자들에게 알린다", async () => {
    const lost = vi.fn();
    acquire({ onLost: lost });
    document.body.querySelector(EXPO_PORTAL_TAG)!.remove();
    await tick();
    await tick();
    expect(lost).toHaveBeenCalledTimes(1);
  });

  it("다음 acquire 는 새 호스트를 만든다", () => {
    acquire();
    document.body.querySelector(EXPO_PORTAL_TAG)!.remove();
    const next = acquire()!;
    expect(next.layer.isConnected).toBe(true);
    expect(document.body.querySelectorAll(EXPO_PORTAL_TAG)).toHaveLength(1);
  });

  /** `onLost` 핸들러가 동기적으로 다시 열 수 있다 — 순회 중인 Set 을 고치면 안 된다. */
  it("onLost 안에서 다시 열어도 안전하다", async () => {
    let reopened: ReturnType<typeof acquire> = null;
    acquire({ onLost: () => { reopened = acquire({ sid: "again" }); } });
    document.body.querySelector(EXPO_PORTAL_TAG)!.remove();
    await tick();
    await tick();
    expect(reopened).not.toBeNull();
    expect(document.body.querySelectorAll(EXPO_PORTAL_TAG)).toHaveLength(1);
  });
});

// ── 모달 ────────────────────────────────────────────────────────────────

function opener(): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "열기";
  document.body.appendChild(button);
  button.focus();
  return button;
}

const openModal = (over: Partial<Parameters<typeof openExpoModal>[0]> = {}) =>
  openExpoModal({ themeVars: VARS, sid: "sid-1", label: "사전등록", ...over });

describe("모달", () => {
  it("대화상자 의미를 갖는다", () => {
    const handle = openModal()!;
    const modal = handle.styleRoot.querySelector(".msx-modal")!;
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-modal")).toBe("true");
    expect(modal.getAttribute("aria-label")).toBe("사전등록");
    handle.close();
  });

  it("여는 동안 스크롤을 잠그고 닫을 때 푼다", () => {
    const handle = openModal()!;
    expect(scrollLockDepth()).toBe(1);
    expect(document.body.style.position).toBe("fixed");
    handle.close();
    expect(scrollLockDepth()).toBe(0);
    expect(document.body.getAttribute("style")).toBeNull();
  });

  it("Escape 로 닫힌다", () => {
    const handle = openModal()!;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(scrollLockDepth()).toBe(0);
    handle.close();
  });

  it("스크림 클릭으로 닫히고, 안쪽 클릭은 통과한다", () => {
    const handle = openModal()!;
    const layer = handle.styleRoot.querySelector<HTMLElement>(".msx-portal")!;
    const modal = handle.styleRoot.querySelector<HTMLElement>(".msx-modal")!;

    modal.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(scrollLockDepth()).toBe(1);

    layer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(scrollLockDepth()).toBe(0);
  });

  it("두 번 닫아도 잠금이 음수로 가지 않는다", () => {
    const handle = openModal()!;
    handle.close();
    handle.close();
    expect(scrollLockDepth()).toBe(0);
  });

  /** DOM 을 먼저 지우면 날아오던 폼 스크립트가 떼어진 자리를 보고 문서 탐색으로 떨어진다. */
  it("DOM 을 지우기 전에 onClose 를 부른다", () => {
    let connectedAtClose: boolean | null = null;
    const handle = openModal({ onClose: () => { connectedAtClose = handle!.body.isConnected; } })!;
    handle.close();
    expect(connectedAtClose).toBe(true);
    expect(handle.body.isConnected).toBe(false);
  });

  it("호스트가 사라져도 잠금을 푼다", async () => {
    openModal();
    expect(scrollLockDepth()).toBe(1);
    document.body.querySelector(EXPO_PORTAL_TAG)!.remove();
    await tick();
    await tick();
    expect(scrollLockDepth()).toBe(0);
  });
});

describe("포커스", () => {
  /**
   * `document.activeElement` 는 Shadow 안 요소 대신 **호스트**를 준다. 그래서 랜딩의
   * `document.contains(returnTo)` 복원은 우리에게서 절대 발화하지 않는다.
   */
  it("닫을 때 열었던 버튼으로 되돌린다", () => {
    const button = opener();
    const handle = openModal()!;
    handle.close();
    expect(document.activeElement).toBe(button);
  });

  it("열면 모달로 포커스가 간다", () => {
    opener();
    const handle = openModal()!;
    const modal = handle.styleRoot.querySelector<HTMLElement>(".msx-modal")!;
    expect(handle.styleRoot.activeElement).toBe(modal);
    handle.close();
  });

  /** 여는 버튼이 파트너 재렌더로 사라졌을 때 방문자를 문서 맨 위로 던지지 않는다. */
  it("되돌릴 곳이 없으면 대체 대상으로 간다", () => {
    const button = opener();
    const fallback = document.createElement("div");
    document.body.appendChild(fallback);
    const handle = openModal({ fallbackFocus: fallback })!;
    button.remove();
    handle.close();
    expect(document.activeElement).toBe(fallback);
    // 영구 tabindex 는 잔여물이다 — 임시로만 붙인다.
    fallback.dispatchEvent(new FocusEvent("blur"));
    expect(fallback.hasAttribute("tabindex")).toBe(false);
  });

  it("Tab 이 모달 안에서 돈다", () => {
    opener();
    const handle = openModal()!;
    const first = document.createElement("button");
    const second = document.createElement("button");
    handle.body.append(first, second);

    // 링은 매번 다시 모은다 — 폼 런타임이 트랩 설치 뒤에 자기 DOM 을 넣는다.
    second.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(handle.styleRoot.activeElement).toBe(handle.styleRoot.querySelector(".msx-modal-close"));

    handle.close();
  });

  it("Shift+Tab 도 돈다", () => {
    opener();
    const handle = openModal()!;
    const button = document.createElement("button");
    handle.body.appendChild(button);

    const close = handle.styleRoot.querySelector<HTMLElement>(".msx-modal-close")!;
    close.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    expect(handle.styleRoot.activeElement).toBe(button);

    handle.close();
  });
});
