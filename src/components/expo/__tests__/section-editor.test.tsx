// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROW_KEY } from "@/components/ui/editable-list";
import { normalizeExpoPage, newSection } from "@/lib/expo/config";
import { stripExpoRowKeys, findRowKeyLeak } from "@/lib/expo/row-key";
import type { ExpoSection } from "@/lib/expo/types";

/**
 * 구획 편집기 — **화면이 서버와 같은 말을 하는가.**
 *
 * 어드민 화면은 로그인 벽 뒤라 브라우저로 열어 볼 수 없다. 그래서 jsdom 에 실제로 마운트해
 * 값을 치고 결과를 본다.
 *
 * 여기서 붙잡는 사고는 전부 **화면과 저장된 것이 갈라지는** 종류다:
 *  · 타이핑 중 trim — 띄어쓰기를 칠 때마다 지워져 문장을 못 쓴다
 *  · 다른 로케일 소실 — 우리가 안 보여 주는 값을 우리가 없앤다
 *  · media 의 kind 누락 — 정규화가 통째로 버려서 이미지가 조용히 사라진다
 *  · 행 키 유출 — 발행 스냅샷과 공개 페이로드에 편집기 전용 키가 들어간다
 *  · 키비주얼 위치·중복 — 저장할 때 서버가 조용히 옮기거나 버린다
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { SectionsEditor } = await import("@/components/expo/SectionEditor");

let host: HTMLDivElement;
let root: Root;
let latest: ExpoSection[] = [];

/**
 * 편집기는 제어 컴포넌트다 — 상태를 쥔 껍데기가 있어야 실제 흐름과 같아진다.
 * `latest` 는 **onChange 에서만** 기록한다. 렌더 중에 바깥 변수를 쓰면 그 자체가 부작용이라
 * 언제 다시 렌더되느냐에 따라 값이 달라진다(react-hooks 규칙).
 */
function Harness({
  initial, canEdit = true, locale = "ko",
}: { initial: ExpoSection[]; canEdit?: boolean; locale?: string }) {
  const [sections, setSections] = useState(initial);
  return (
    <SectionsEditor
      sections={sections}
      onChange={(next) => { latest = next; setSections(next); }}
      canEdit={canEdit}
      siteId="site-1"
      sources={[{ id: "src-1", name: "관람 신청", isActive: true }]}
      pages={[{ id: "page-2", title: "전시 소개" }]}
      locale={locale}
    />
  );
}

async function render(initial: ExpoSection[] = [], canEdit = true, locale = "ko") {
  host = document.createElement("div");
  document.body.appendChild(host);
  latest = initial;
  await act(async () => {
    root = createRoot(host);
    root.render(<Harness initial={initial} canEdit={canEdit} locale={locale} />);
  });
}

const buttons = () => [...host.querySelectorAll("button")];
const buttonByText = (text: string) =>
  buttons().find((b) => b.textContent?.trim() === text);

const field = <T extends Element>(selector: string): T => {
  const found = host.querySelector<T>(selector);
  if (!found) throw new Error(`없는 칸: ${selector}`);
  return found;
};

/**
 * React 는 value 프로퍼티를 가로채므로 네이티브 setter 로 값을 넣고 input 을 쏜다 —
 * `el.value = x` 만 하면 React 가 변화를 못 본다.
 */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element | undefined) {
  if (!el) throw new Error("없는 버튼");
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  latest = [];
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  vi.useRealTimers();
});

describe("구획 추가", () => {
  it("카탈로그에 여섯 종류가 다 있다", async () => {
    await render();
    for (const label of ["키비주얼", "본문", "카드", "퀵 액션", "사전등록 폼", "직접 넣은 코드"]) {
      expect(buttonByText(label), label).toBeTruthy();
    }
  });

  it("고르면 그 타입의 슬롯 칸이 곧바로 생긴다", async () => {
    await render();
    await click(buttonByText("키비주얼"));

    expect(latest).toHaveLength(1);
    expect(latest[0].type).toBe("kv");
    // 카탈로그의 라벨이 아니라 **편집 칸**이 생겨야 실제로 쓸 수 있다.
    expect(host.querySelector('input[aria-label="제목"]')).toBeTruthy();
    expect(host.querySelector('input[aria-label="윗줄"]')).toBeTruthy();
  });

  /** `multi:false` 인 타입은 두 번째가 저장 때 조용히 버려진다 — 미리 막는다. */
  it("하나만 놓을 수 있는 타입은 이미 있으면 못 누른다", async () => {
    await render();
    await click(buttonByText("키비주얼"));
    expect(buttonByText("키비주얼")?.disabled).toBe(true);
    // 여러 개 놓을 수 있는 타입은 그대로 열려 있다.
    expect(buttonByText("본문")?.disabled).toBe(false);
  });

  /** 키비주얼은 저장될 때 맨 위로 간다. 화면이 그걸 미리 반영하지 않으면 순서가 갈라진다. */
  it("나중에 넣은 키비주얼도 맨 위로 간다", async () => {
    await render();
    await click(buttonByText("본문"));
    await click(buttonByText("키비주얼"));

    expect(latest.map((s) => s.type)).toEqual(["kv", "textblock"]);
    // 서버 정규화와 같은 순서인가 — 이게 이 규칙의 존재 이유다.
    expect(normalizeExpoPage({ sections: latest }).sections.map((s) => s.type))
      .toEqual(latest.map((s) => s.type));
  });

  it("뷰어에게는 카탈로그·정렬·삭제 컨트롤을 보여주지 않는다", async () => {
    await render([newSection("textblock")], false);
    expect(buttonByText("본문")).toBeUndefined();
    expect(host.querySelector('button[aria-label*="순서 변경"]')).toBeNull();
    expect(host.querySelector('button[aria-label*="구획 삭제"]')).toBeNull();
  });
});

describe("텍스트 슬롯", () => {
  it("타이핑 중에는 trim 하지 않는다", async () => {
    await render([newSection("kv")]);
    const title = field<HTMLInputElement>('input[aria-label="제목"]');

    // 서버의 toLocalized 를 편집 경로에 쓰면 여기서 뒤 공백이 사라져 다음 낱말을 못 친다.
    await type(title, "빛의 ");
    expect((latest[0].content.title as Record<string, string>).ko).toBe("빛의 ");

    await type(title, "빛의 시간");
    expect((latest[0].content.title as Record<string, string>).ko).toBe("빛의 시간");
  });

  it("다른 로케일은 건드리지 않는다", async () => {
    const kv = newSection("kv");
    kv.content.title = { ko: "빛", en: "Light" };
    await render([kv]);

    await type(field<HTMLInputElement>('input[aria-label="제목"]'), "빛의 시간");
    expect(latest[0].content.title).toEqual({ ko: "빛의 시간", en: "Light" });
  });

  /**
   * 글은 **사이트가 말하는 언어**에 들어간다. 편집 UI 의 언어가 아니다 —
   * 공개 로더가 `site.defaultLocale` 로 읽으므로 다른 칸에 넣으면 폴백에 기대게 된다.
   */
  it("사이트의 로케일에 쓴다", async () => {
    const kv = newSection("kv");
    kv.content.title = { ja: "光" };
    await render([kv], true, "ja");

    const title = field<HTMLInputElement>('input[aria-label="제목"]');
    expect(title.value).toBe("光");

    await type(title, "光の時間");
    expect(latest[0].content.title).toEqual({ ja: "光の時間" });
  });

  it("서버가 자르는 길이를 입력에서 먼저 막는다", async () => {
    await render([newSection("kv")]);
    expect(field<HTMLInputElement>('input[aria-label="제목"]').maxLength).toBe(500);
  });
});

describe("이미지 슬롯", () => {
  /** kind 를 빠뜨리면 정규화가 값을 통째로 버린다(`config.ts` case "media"). */
  it("주소만 적어도 kind 가 함께 저장된다", async () => {
    await render([newSection("kv")]);
    await type(
      field<HTMLInputElement>('input[aria-label="배경 이미지 주소"]'),
      "https://cdn.example.com/a.jpg",
    );

    expect(latest[0].content.media).toMatchObject({ kind: "image", url: "https://cdn.example.com/a.jpg" });
    // 정규화를 통과해도 살아남는가 — 이게 진짜 확인해야 할 것이다.
    const saved = normalizeExpoPage({ sections: stripExpoRowKeys(latest) }).sections[0];
    expect(saved.content.media).toEqual({
      kind: "image", url: "https://cdn.example.com/a.jpg",
      originalUrl: "https://cdn.example.com/a.jpg", decorative: false,
    });
  });

  it("대체 텍스트만 적고 주소가 없으면 정규화가 버린다는 것을 화면이 숨기지 않는다", async () => {
    await render([newSection("kv")]);
    await type(field<HTMLInputElement>('input[aria-label="배경 이미지 대체 텍스트"]'), "전시 전경");

    // 편집 중에는 남는다(타이핑 중인 값을 뺏지 않는다)…
    expect(latest[0].content.media).toMatchObject({ alt: "전시 전경" });
    // …그리고 제목이 비어 있으므로 구획 자체가 아직 공개로 안 나간다고 화면이 말한다.
    expect(host.textContent).toContain("공개 화면에 나가지 않아요");
  });
});

describe("링크 슬롯", () => {
  it("이 사이트의 페이지를 고르면 page: 참조로 저장된다", async () => {
    await render([newSection("kv")]);
    const select = field<HTMLSelectElement>('select[aria-label="버튼 연결 대상"]');

    await act(async () => {
      select.value = "page-2";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(latest[0].content.cta).toMatchObject({ href: "page:page-2" });
    // 내부 참조를 고르면 주소 칸은 사라지고 무슨 뜻인지 설명한다.
    expect(host.querySelector('input[aria-label="버튼 주소"]')).toBeNull();
  });
});

describe("목록 슬롯", () => {
  const cardgrid = () => {
    const section = newSection("cardgrid");
    section.content.items = [
      { [ROW_KEY]: "row-a", title: { ko: "첫 카드" } },
      { [ROW_KEY]: "row-b", title: { ko: "둘째 카드" } },
    ];
    return section;
  };

  it("행마다 제 값을 그린다", async () => {
    await render([cardgrid()]);
    const titles = [...host.querySelectorAll<HTMLInputElement>('input[aria-label="제목"]')];
    // 구획의 "제목" 슬롯 + 행 두 개의 "제목" = 3
    expect(titles.map((t) => t.value)).toEqual(["", "첫 카드", "둘째 카드"]);
  });

  it("한 행을 고쳐도 옆 행이 흔들리지 않는다", async () => {
    await render([cardgrid()]);
    const titles = [...host.querySelectorAll<HTMLInputElement>('input[aria-label="제목"]')];
    await type(titles[1], "첫 카드 수정");

    const rows = latest[0].content.items as Record<string, unknown>[];
    expect((rows[0].title as Record<string, string>).ko).toBe("첫 카드 수정");
    expect((rows[1].title as Record<string, string>).ko).toBe("둘째 카드");
    // 키는 그대로여야 한다 — 바뀌면 그 행이 리마운트돼 타이핑 중 포커스를 잃는다.
    expect(rows.map((r) => r[ROW_KEY])).toEqual(["row-a", "row-b"]);
  });

  it("새 행에는 키가 붙고, 서로 다르다", async () => {
    await render([cardgrid()]);
    await click(buttonByText("카드 추가"));
    await click(buttonByText("카드 추가"));

    const rows = latest[0].content.items as Record<string, unknown>[];
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map((r) => r[ROW_KEY])).size).toBe(4);
  });

  /**
   * 필수 값이 빈 행은 저장할 때 서버가 버린다. 편집기는 타이핑 중인 행을 남기므로
   * (keepEmptyRows) 화면과 저장된 것이 다르다 — 그 차이를 그 자리에서 말해야 한다.
   */
  it("필수 값이 빈 행이라고 그 행에서 알려 준다", async () => {
    await render([cardgrid()]);
    await click(buttonByText("카드 추가"));
    expect(host.textContent).toContain("채워야 저장돼요");
  });

  it("행 키는 저장 payload 에 남지 않는다", async () => {
    await render([cardgrid()]);
    await click(buttonByText("카드 추가"));
    expect(findRowKeyLeak(stripExpoRowKeys(latest))).toBeNull();
  });
});

describe("구획 스위치", () => {
  it("페이지에 표시를 끄면 숨김이라고 말한다", async () => {
    await render([newSection("textblock")]);
    const toggle = host.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="본문 페이지에 표시"]');
    expect(toggle?.getAttribute("aria-checked")).toBe("true");

    await click(toggle!);
    expect(latest[0].enabled).toBe(false);
    expect(host.textContent).toContain("숨김");
  });

  /** 밖으로 나가는 스위치는 만들자마자 켜져 있으면 안 된다. */
  it("따로 내보내기는 기본이 꺼짐이다", async () => {
    await render();
    await click(buttonByText("본문"));
    expect(latest[0].embedEnabled).toBe(false);
  });
});

describe("카탈로그에 없는 타입", () => {
  it("편집 칸을 지어내지 않고 지우는 길만 준다", async () => {
    const stale: ExpoSection = {
      sid: "11111111-2222-3333-4444-555555555555",
      type: "gallery-carousel",
      variant: "x", enabled: true, embedEnabled: false, design: {}, content: {},
    };
    await render([stale]);
    expect(host.textContent).toContain("더 이상 쓰지 않는 구획");
    expect(host.textContent).toContain("저장할 때 사라져요");
    expect(host.querySelector('button[aria-label="쓰지 않는 구획 삭제"]')).toBeTruthy();
  });
});

/**
 * 올리는 동안에도 화면은 살아 있다 — 그 사이의 편집이 **되돌아가면 안 된다.**
 *
 * 업로드는 클릭 시점의 클로저를 들고 몇 초를 산다. 그 클로저가 붙잡은 `onChange` 는
 * 그때의 `section.content` 를 통째로 펼쳐 쓰므로(SectionEditor 의 setSlot), 응답이 오는
 * 순간 **올리는 동안 친 글이 전부 그때 값으로 롤백되고 그대로 자동저장된다.**
 */
describe("이미지를 올리는 동안", () => {
  /** 응답을 테스트가 원할 때 풀 수 있는 업로드. */
  function deferredUpload() {
    let releaseSession: (() => void) | null = null;
    let finalUrl = "";
    const sessionWait = new Promise<void>((resolve) => { releaseSession = resolve; });
    const fetchMock = vi.fn(async (target: string | URL | Request) => {
      const url = String(target);
      if (url.endsWith("/media/session")) {
        await sessionWait;
        return { ok: true, status: 201, json: async () => ({
          path: "ws/expo-quarantine/site/user/a.jpg", signedUrl: "https://storage.example.com/signed", token: "one-use",
        }) } as Response;
      }
      if (url === "https://storage.example.com/signed") return { ok: true, status: 200 } as Response;
      return { ok: true, status: 201, json: async () => ({
        kind: "image", url: finalUrl, originalUrl: `${finalUrl}?original=1`,
        mimeType: "image/webp", width: 1200, height: 800, bytes: 100,
      }) } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    return {
      release: async (url: string) => {
        finalUrl = url;
        releaseSession!();
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
      },
    };
  }

  it("같은 구획의 다른 칸에 친 글을 되돌리지 않는다", async () => {
    const upload = deferredUpload();
    await render([newSection("textblock")]);

    // 파일을 고른다 — 업로드가 시작되고 응답은 아직 안 온다.
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const input = field<HTMLInputElement>('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // 올라가는 동안 제목을 친다.
    await type(field<HTMLInputElement>('input[aria-label="제목"]'), "빛의 시간");
    expect((latest[0].content.heading as Record<string, string>).ko).toBe("빛의 시간");

    // 응답 도착.
    await act(async () => { await upload.release("https://cdn.example.com/a.jpg"); });

    expect(latest[0].content.media).toMatchObject({ url: "https://cdn.example.com/a.jpg" });
    // 여기가 핵심 — 올리는 동안 친 글이 살아 있어야 한다.
    expect((latest[0].content.heading as Record<string, string>)?.ko).toBe("빛의 시간");
  });

  /** 대체 텍스트도 같은 클로저에 잡혀 있다. */
  it("올리는 동안 고친 대체 텍스트를 덮어쓰지 않는다", async () => {
    const upload = deferredUpload();
    await render([newSection("textblock")]);

    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    const input = field<HTMLInputElement>('input[type="file"]');
    await act(async () => {
      Object.defineProperty(input, "files", { value: [file], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await type(field<HTMLInputElement>('input[aria-label="이미지 대체 텍스트"]'), "전시 전경");
    await act(async () => { await upload.release("https://cdn.example.com/a.jpg"); });

    expect(latest[0].content.media).toMatchObject({
      kind: "image", url: "https://cdn.example.com/a.jpg", alt: "전시 전경",
    });
  });
});

/**
 * 하나만 놓을 수 있는 타입을 지운 **직후** 다시 넣으면, 유예가 끝나기 전에는 배열에
 * 같은 타입이 둘이 된다. 저장하면 서버가 **먼저 것(=지우려던 것)** 을 남기고 새것을 버린다
 * (`config.ts` 의 usedSingletons). 실행취소까지 누르면 그 상태가 영구가 된다.
 */
describe("하나만 놓는 구획을 지운 직후", () => {
  it("같은 타입이 배열에 둘이 되지 않는다", async () => {
    await render([newSection("kv")]);

    await click(host.querySelector('button[aria-label="키비주얼 구획 삭제"]') ?? undefined);
    // 유예 중 — 화면에서는 사라졌지만 배열에는 남아 있다.
    const kvButton = buttonByText("키비주얼");
    if (kvButton && !kvButton.disabled) await click(kvButton);

    const kvs = latest.filter((s) => s.type === "kv");
    expect(kvs.length, "kv 가 둘이면 저장 때 하나가 조용히 버려진다").toBeLessThanOrEqual(1);
  });
});

/**
 * 사전등록 폼은 **소스가 붙어야 그려진다.** 렌더러가 소스 없는 구획을 통째로 건너뛴다
 * (`view-page.ts`). 필수로 걸어 두지 않으면 제목 한 줄만 있어도 편집기는 "멀쩡함" 이고
 * 공개 화면에는 아무것도 안 나온다 — 어디에도 단서가 없다.
 */
describe("사전등록 폼 구획", () => {
  it("소스를 안 고르면 공개로 안 나간다고 말한다", async () => {
    const section = newSection("register-form");
    section.content.heading = { ko: "관람 신청" };
    await render([section]);

    expect(host.textContent).toContain("공개 화면에 나가지 않아요");
    expect(host.textContent).toContain("내용 없음");
  });

  it("소스를 고르면 경고가 사라진다", async () => {
    const section = newSection("register-form");
    section.content.heading = { ko: "관람 신청" };
    section.content.sourceRef = "src-1";
    await render([section]);

    expect(host.textContent).not.toContain("공개 화면에 나가지 않아요");
  });
});
