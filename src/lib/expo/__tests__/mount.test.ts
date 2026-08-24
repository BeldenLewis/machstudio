// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mountExpo, type ExpoRuntimePayload } from "@/lib/expo/mount";
import { EXPO_HOST_TAG } from "@/lib/expo/shadow";
import { resetExpoPortal } from "@/lib/expo/overlay";
import { resetFormTargets } from "@/lib/collect-form/target-registry";
import { resetExpoFontRegistry } from "@/lib/expo/font";
import { resetExpoSeen } from "@/lib/expo/seen";
import { scrollLockDepth, unlockScroll } from "@/lib/dom/scroll-lock";

/**
 * 부트와 수명.
 *
 * 여기서 지키는 것: **어떤 실패도 파트너 페이지를 깨지 않는다**, 그리고 **정리가 끝나면
 * 잔여물이 0이다**. 후자를 놓치면 파트너 body 에 스크롤 잠금이나 화면 전체 고정 노드가
 * 남는다 — 우리 화면이 아니라 그들 화면의 고장이다.
 */

const SID = "11111111-1111-1111-1111-111111111111";
const SID2 = "22222222-2222-2222-2222-222222222222";
const THEME = { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" };

const payload = (over: Partial<ExpoRuntimePayload> = {}): ExpoRuntimePayload => ({
  pageId: "pg1",
  theme: THEME,
  origin: "https://mach.example.com",
  sections: [{
    sid: SID, type: "kv", variant: "column",
    design: { bg: "light", align: "left" },
    content: { title: "지난 전시" },
  }],
  ...over,
});

function host() {
  const container = document.createElement("div");
  const wrap = document.createElement("div");
  wrap.appendChild(container);
  document.body.appendChild(wrap);
  return { container, wrap };
}

const mount = (over: Partial<Parameters<typeof mountExpo>[0]> = {}) => {
  const container = over.container ?? host().container;
  return mountExpo({ container, payload: payload(), ...over });
};

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  /**
   * 라이브 마운트는 "붙어 있다" 비콘을 보낸다. jsdom 에는 sendBeacon 이 없어 fetch 로
   * 떨어지고, 그게 실제 네트워크를 때린다 — 목으로 막고 매 테스트마다 초기화한다.
   */
  resetExpoSeen(globalThis as never);
  vi.stubGlobal("navigator", Object.assign(Object.create(Object.getPrototypeOf(navigator)), navigator, {
    sendBeacon: vi.fn(() => true),
  }));
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  resetExpoPortal(window as never);
  resetFormTargets(globalThis as never);
  resetExpoFontRegistry(globalThis as never);
  delete (globalThis as Record<string, unknown>).__MACH_EXPO_MOUNTS_V1__;
  delete (globalThis as Record<string, unknown>).__MACH_EXPO_SHEET_V1__;
  while (scrollLockDepth() > 0) unlockScroll();
});

describe("깨끗한 페이지", () => {
  it("Shadow 안에 구획을 그리고 보이게 한다", () => {
    const { container } = host();
    expect(mount({ container })).not.toBeNull();

    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    const root = shadow.querySelector<HTMLElement>(".msx-root")!;
    expect(root.getAttribute("data-msx-ready")).toBe("1");
    expect(root.querySelectorAll(".msx-section")).toHaveLength(1);
    expect(root.querySelector(".msx-kv-title")!.textContent).toBe("지난 전시");
  });

  /** 파트너 문서의 라이트 DOM 에는 우리 구획 마크업이 한 줄도 없어야 한다. */
  it("라이트 DOM 에는 호스트 하나뿐이다", () => {
    const { container } = host();
    mount({ container });
    expect(container.children).toHaveLength(1);
    expect(document.querySelectorAll(".msx-section")).toHaveLength(0);
  });

  it("구획 세 개를 순서대로 그린다", () => {
    const { container } = host();
    mount({
      container,
      payload: payload({
        sections: [
          { sid: SID, type: "kv", variant: "column", design: {}, content: { title: "히어로" } },
          { sid: SID2, type: "textblock", variant: "prose", design: {}, content: { heading: "안내", body: "본문" } },
          { sid: "33333333-3333-3333-3333-333333333333", type: "toolbox", variant: "tiles", design: {}, content: { items: [{ label: "등록", link: { label: "등록", href: "https://x.test/r" } }] } },
        ],
      }),
    });
    const root = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    expect([...root.querySelectorAll(".msx-section")].map((s) => s.getAttribute("data-type")))
      .toEqual(["kv", "textblock", "toolbox"]);
  });

  /** 내용이 하나도 없으면 빈 껍데기를 내보내지 않는다. */
  it("빈 구획은 그리지 않고, 그래도 준비 표시는 켠다", () => {
    const { container } = host();
    mount({
      container,
      payload: payload({ sections: [{ sid: SID, type: "toolbox", variant: "tiles", design: {}, content: { items: [] } }] }),
    });
    const root = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!.querySelector<HTMLElement>(".msx-root")!;
    expect(root.querySelectorAll(".msx-section")).toHaveLength(0);
    expect(root.getAttribute("data-msx-ready")).toBe("1");
  });

  it("섹션 단독 임베드는 sid 를 호스트에 남긴다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sectionId: SID }) });
    expect(container.querySelector(EXPO_HOST_TAG)!.getAttribute("data-msx-section")).toBe(SID);
  });

  it("떼어진 컨테이너에는 붙지 않는다", () => {
    expect(mountExpo({ container: document.createElement("div"), payload: payload() })).toBeNull();
  });
});

describe("등록 폼 구획", () => {
  const formSection = (variant: "inline" | "cta") => ({
    sid: SID, type: "register-form", variant,
    design: {}, content: { sourceRef: "src-1", heading: "사전등록", note: "첫 줄\n둘째 줄" },
  });

  it("인라인은 자리를 예약하고 스크립트를 문서 head 에 붙인다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [formSection("inline")] }) });

    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    expect(shadow.querySelector(".msx-form-slot")).not.toBeNull();
    const script = document.head.querySelector<HTMLScriptElement>("script")!;
    expect(script.src).toBe("https://mach.example.com/f/src-1");
    // 스크립트는 Shadow 안에 넣지 않는다 — 그러면 currentScript 가 null 이다.
    expect(shadow.querySelector("script")).toBeNull();
  });

  it("안내 문구의 줄바꿈을 보존한다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [formSection("inline")] }) });
    const note = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!.querySelector(".msx-form-note")!;
    expect(note.textContent).toBe("첫 줄\n둘째 줄");
    expect(note.classList.contains("msx-prose")).toBe(true);
  });

  /** 소스가 안 붙어 있으면 그릴 것이 없다. */
  it("소스가 없으면 구획을 만들지 않는다", () => {
    const { container } = host();
    mount({
      container,
      payload: payload({ sections: [{ ...formSection("inline"), content: { heading: "사전등록" } }] }),
    });
    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    expect(shadow.querySelectorAll(".msx-section")).toHaveLength(0);
    expect(document.head.querySelector("script")).toBeNull();
  });

  /** 요약 + 버튼 변형은 폼을 body 직계 포털에서만 연다. */
  it("버튼 변형은 눌러야 포털이 열린다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [formSection("cta")] }) });

    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    expect(document.body.querySelector("mach-expo-overlay")).toBeNull();

    shadow.querySelector<HTMLButtonElement>(".msx-form .msx-btn")!.click();
    const portal = document.body.querySelector("mach-expo-overlay")!;
    expect(portal).not.toBeNull();
    // 폼 DOM 은 라이트 DOM 에 없다.
    expect(document.body.querySelector(".msx-modal")).toBeNull();
    expect(portal.shadowRoot!.querySelector(".msx-modal")).not.toBeNull();
    expect(scrollLockDepth()).toBe(1);
  });

  /** 두 번 눌러 두 겹 잠기면 한 번 닫아도 파트너 페이지가 안 풀린다. */
  it("두 번 눌러도 하나만 열린다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [formSection("cta")] }) });
    const button = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!
      .querySelector<HTMLButtonElement>(".msx-form .msx-btn")!;
    button.click();
    button.click();
    expect(scrollLockDepth()).toBe(1);
    expect(document.body.querySelectorAll("mach-expo-overlay")).toHaveLength(1);
  });
});

describe("직접 넣은 코드 구획", () => {
  const codeSection = {
    sid: SID, type: "custom-code", variant: "boxed",
    design: {}, content: { heading: "지도", code: "<div>지도</div>" },
  };

  it("라이브는 자동으로 실행한다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [codeSection] }) });
    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    const frame = shadow.querySelector<HTMLIFrameElement>("iframe.msx-code-frame")!;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts allow-popups allow-forms");
  });

  /** 미리보기를 열 때마다 남의 추적 스크립트가 발화하면 통계가 오염된다. */
  it("미리보기는 자리표만 보여 준다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [codeSection], mode: "preview-draft" }) });
    const shadow = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!;
    expect(shadow.querySelector("iframe")).toBeNull();
    expect(shadow.querySelector(".msx-code-placeholder")).not.toBeNull();
  });

  it("운영자가 고르면 미리보기에서도 실행한다", () => {
    const { container } = host();
    mount({
      container,
      payload: payload({ sections: [codeSection], mode: "preview-draft", preview: { allowCustomCode: true } }),
    });
    expect(container.querySelector(EXPO_HOST_TAG)!.shadowRoot!.querySelector("iframe")).not.toBeNull();
  });
});

describe("실패해도 파트너 페이지를 깨지 않는다", () => {
  /** 옛 발행본에 모르는 타입이 남아 있을 수 있다. */
  it("모르는 타입은 건너뛰고 나머지를 그린다", () => {
    const { container } = host();
    mount({
      container,
      payload: payload({
        sections: [
          { sid: SID, type: "nope", variant: "x", design: {}, content: {} },
          { sid: SID2, type: "textblock", variant: "prose", design: {}, content: { body: "본문" } },
        ],
      }),
    });
    const root = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!.querySelector<HTMLElement>(".msx-root")!;
    expect(root.querySelectorAll(".msx-section")).toHaveLength(1);
    expect(root.getAttribute("data-msx-ready")).toBe("1");
  });

  it("구획이 없어도 준비 표시를 켠다", () => {
    const { container } = host();
    mount({ container, payload: payload({ sections: [] }) });
    const root = container.querySelector(EXPO_HOST_TAG)!.shadowRoot!.querySelector<HTMLElement>(".msx-root")!;
    expect(root.getAttribute("data-msx-ready")).toBe("1");
  });
});

describe("붙어 있다 비콘", () => {
  const beacon = () => (navigator.sendBeacon as unknown as ReturnType<typeof vi.fn>);

  it("라이브는 한 번 보낸다", () => {
    mount();
    expect(beacon()).toHaveBeenCalledTimes(1);
    const [url, body] = beacon().mock.calls[0];
    expect(url).toBe("https://mach.example.com/api/expo-embed/seen");
    expect(JSON.parse(body as string)).toEqual({ pageId: "pg1" });
  });

  /**
   * 운영자가 편집기를 열어 본 것이 "붙어 있음" 으로 기록되면 그 배지가 **거짓**이 된다.
   * 배지의 존재 이유가 "내가 붙였는지 모르겠다" 를 해결하는 것이므로 치명적이다.
   */
  it("미리보기는 보내지 않는다", () => {
    mount({ payload: payload({ mode: "preview-draft" }) });
    expect(beacon()).not.toHaveBeenCalled();
    mount({ container: host().container, payload: payload({ mode: "preview-published" }) });
    expect(beacon()).not.toHaveBeenCalled();
  });

  /** 내용이 없는 연결 확인 상태에서도 보낸다 — 이 값의 뜻은 "붙어 있는지" 다. */
  it("연결 확인 상태에서도 보낸다", () => {
    mount({ payload: payload({ connectionOnly: true }) });
    expect(beacon()).toHaveBeenCalledTimes(1);
  });

  it("구획 단독은 sid 를 함께 보낸다", () => {
    mount({ payload: payload({ sectionId: SID }) });
    expect(JSON.parse(beacon().mock.calls[0][1] as string)).toEqual({ pageId: "pg1", sectionId: SID });
  });
});

describe("재마운트", () => {
  const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** 아임웹이 위젯을 다시 그리면 우리 호스트가 사라진다 — 복원된 HTML 의 script 는 재실행되지 않는다. */
  it("호스트가 지워지면 다시 붙인다", async () => {
    const { container, wrap } = host();
    mount({ container });
    container.querySelector(EXPO_HOST_TAG)!.remove();
    // 감시 대상은 컨테이너의 부모다.
    wrap.appendChild(document.createElement("span"));
    await tick(300);
    expect(container.querySelector(EXPO_HOST_TAG)).not.toBeNull();
  });

  /**
   * `document.contains` 는 Shadow 를 못 봐서 우리 콘텐츠에 대해 **항상 false** 다.
   * 그걸 쓰면 재마운트가 끝없이 돌며 타이핑 중인 입력을 계속 날린다.
   */
  it("호스트가 살아 있으면 다시 붙이지 않는다", async () => {
    const { container, wrap } = host();
    mount({ container });
    const before = container.querySelector(EXPO_HOST_TAG);
    for (let i = 0; i < 10; i++) wrap.appendChild(document.createElement("span"));
    await tick(300);
    expect(container.querySelector(EXPO_HOST_TAG)).toBe(before);
  });

  /** 붙일 자리가 없으면 아무것도 만들지 않는다 — 떼어진 트리에 호스트를 더 쌓지 않는다. */
  it("컨테이너까지 사라지면 새로 만들지 않는다", async () => {
    const { container, wrap } = host();
    mount({ container });
    const original = container.querySelector(EXPO_HOST_TAG);
    original!.remove();
    container.remove();
    wrap.appendChild(document.createElement("span"));
    await tick(300);
    expect(container.querySelectorAll(EXPO_HOST_TAG)).toHaveLength(0);
    expect(container.isConnected).toBe(false);
  });

  it("한도를 넘으면 한 번만 알리고 관측만 한다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { container, wrap } = host();
    mount({ container });
    for (let i = 0; i < 8; i++) {
      container.querySelector(EXPO_HOST_TAG)?.remove();
      wrap.appendChild(document.createElement("span"));
      await tick(260);
    }
    const capped = warn.mock.calls.filter((c) => String(c[0]).includes("재마운트 한도"));
    expect(capped).toHaveLength(1);
    warn.mockRestore();
  });
});

describe("정리", () => {
  it("호스트를 지우고 컨테이너는 남긴다", () => {
    const { container } = host();
    const handle = mount({ container })!;
    handle.destroy();
    expect(container.isConnected).toBe(true);
    expect(container.querySelector(EXPO_HOST_TAG)).toBeNull();
  });

  /** 잔여물이 남으면 파트너 사이트가 스크롤되지 않거나 클릭이 막힌다. */
  it("열린 모달과 스크롤 잠금과 폼 스크립트를 전부 치운다", () => {
    const { container } = host();
    const handle = mount({
      container,
      payload: payload({
        sections: [{ sid: SID, type: "register-form", variant: "cta", design: {}, content: { sourceRef: "src-1" } }],
      }),
    })!;
    container.querySelector(EXPO_HOST_TAG)!.shadowRoot!
      .querySelector<HTMLButtonElement>(".msx-form .msx-btn")!.click();
    expect(scrollLockDepth()).toBe(1);

    handle.destroy();
    expect(scrollLockDepth()).toBe(0);
    expect(document.body.querySelector("mach-expo-overlay")).toBeNull();
    expect(document.body.getAttribute("style")).toBeNull();
  });

  it("두 번 불러도 안전하다", () => {
    const handle = mount()!;
    handle.destroy();
    expect(() => handle.destroy()).not.toThrow();
  });

  it("정리 뒤에는 재마운트가 돌지 않는다", async () => {
    const { container, wrap } = host();
    const handle = mount({ container })!;
    handle.destroy();
    wrap.appendChild(document.createElement("span"));
    await new Promise((r) => setTimeout(r, 300));
    expect(container.querySelector(EXPO_HOST_TAG)).toBeNull();
  });
});
