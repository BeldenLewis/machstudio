// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountCollectForm } from "../mount";
import { normalizeCollectForm } from "@/lib/collect-form-config";

/**
 * 등록 폼 런타임 — **임베드·미리보기·빌더 옆칸이 전부 이 함수를 탄다.**
 * 그래서 여기서 깨지면 세 화면이 같이 깨지고, 여기서 통과하면 셋 다 같은 동작이다.
 */

const CONFIG = normalizeCollectForm({
  fields: [
    { id: "f1", key: "email", label: { en: "Email" }, type: "email", required: true, enabled: true },
    { id: "f2", key: "phone", label: { en: "Phone" }, type: "tel", enabled: true },
    {
      id: "f3", key: "type", label: { en: "Visitor type" }, type: "select", enabled: true,
      options: [{ en: "General" }, { en: "Buyer" }],
    },
    { id: "f4", key: "hidden_one", label: { en: "Hidden" }, type: "text", enabled: false },
  ],
  branch: {
    enabled: true, fieldKey: "type",
    groups: [{ value: "Buyer", fields: [{ id: "b1", key: "company", label: { en: "Company" }, type: "text", required: true, enabled: true }] }],
  },
  notices: [{ id: "portrait", enabled: true, placement: "above-consent", mode: "notice", body: { en: "첫 줄\n둘째 줄" } }],
  consent: { privacy: { enabled: true, label: { en: "Privacy" } } },
});

let host: HTMLDivElement;
let handle: { destroy(): void } | null = null;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});
afterEach(() => {
  handle?.destroy();
  handle = null;
  host.remove();
  document.getElementById("msf-css")?.remove();
  delete (window as { dataLayer?: unknown[] }).dataLayer;
  vi.restoreAllMocks();
});

function mount(extra: Partial<Parameters<typeof mountCollectForm>[0]> = {}) {
  handle = mountCollectForm({ mount: host, config: CONFIG, origin: "", sourceId: "src1", preview: true, ...extra });
  return handle;
}
const text = () => host.textContent ?? "";
const submitBtn = () => [...host.querySelectorAll("button")].find((b) => b.className.includes("msf-submit")) as HTMLButtonElement;
const labels = () => [...host.querySelectorAll(".msf-label")].map((l) => l.textContent ?? "");

describe("등록 폼 렌더", () => {
  it("표시 꺼진 항목은 그리지 않는다", () => {
    mount();
    expect(text()).toContain("Email");
    expect(text()).not.toContain("Hidden");
  });

  it("유형을 고르면 분기 문항이 기준 항목 바로 아래에 삽입된다 — 화면 순서 = 검증 순서(§4)", () => {
    mount();
    expect(labels().join("|")).not.toContain("Company");

    const sel = host.querySelector("select")!;
    sel.value = "Buyer";
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    const order = labels().map((l) => l.replace("*", ""));
    expect(order).toEqual(["Email", "Phone", "Visitor type", "Company"]);
  });

  it("접수 창 밖이면 폼 대신 상태 화면 — 마감 화면을 미리 볼 수 있어야 한다", () => {
    mount({ forceStatus: "closed" });
    expect(text()).toContain("closed");
    expect(host.querySelector("select")).toBeNull();

    handle?.destroy();
    mount({ forceStatus: "before" });
    expect(text()).toContain("hasn't opened");
  });

  /** AGENTS.md 공통: 사용자 텍스트는 줄바꿈을 보존한다. */
  it("안내 본문은 줄바꿈을 보존한다", () => {
    mount();
    const el = [...host.querySelectorAll(".msf-notice-body")].find((p) => p.textContent?.includes("첫 줄"));
    expect(el).toBeTruthy();
    expect(getComputedStyle(el as Element).whiteSpace).toBe("pre-wrap");
  });

  it("항목이 없으면 빈 상태를 알린다 — 빈 화면은 고장으로 보인다", () => {
    mount({ config: normalizeCollectForm({}) });
    expect(text()).toContain("no fields");
  });

  /** 설계 §16.1 — 유형을 지정한 채로 열 수 있어야 검토자가 그 화면을 본다. */
  it("forceType 을 주면 그 유형 문항이 펼쳐진 채로 열린다", () => {
    mount({ forceType: "Buyer" });
    expect(labels().join("|")).toContain("Company");
  });
});

describe("입력 정규화", () => {
  /** AGENTS.md 공통: 입력은 소스에서 정규화한다 — 안내 문구가 아니라 입력 시점에 강제. */
  it("전화 입력에서 하이픈·괄호·공백을 타이핑 즉시 지운다", () => {
    mount();
    const tel = host.querySelector<HTMLInputElement>('input[type="tel"]')!;
    tel.value = "(202) 555-0147";
    tel.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tel.value).toBe("2025550147");
  });

  it("국제표기의 + 는 남긴다 — 기본 국가가 아닌 사람이 쓰는 유일한 수단이다", () => {
    mount();
    const tel = host.querySelector<HTMLInputElement>('input[type="tel"]')!;
    tel.value = "+82 10-1234-5678";
    tel.dispatchEvent(new Event("input", { bubbles: true }));
    expect(tel.value).toBe("+821012345678");
  });
});

describe("제출", () => {
  const fill = (sel: string, v: string) => {
    const el = host.querySelector<HTMLInputElement>(sel)!;
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const tickPrivacy = () => {
    const cb = [...host.querySelectorAll<HTMLInputElement>(".msf-check input")].pop()!;
    cb.checked = true;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  };

  it("빈 폼은 항목 바로 아래 인라인으로 알린다(AGENTS.md 공통)", () => {
    mount();
    submitBtn().click();
    const errs = [...host.querySelectorAll(".msf-err")].map((e) => e.textContent).filter(Boolean);
    expect(errs).toContain("Required");
    expect(errs).toContain("Please agree to continue");
  });

  /**
   * 분기를 되돌리면 이전 그룹 값이 상태에 남는다(공통 입력을 유지해야 하므로 정상 동작).
   * 그 값이 검증에 실리면 **고칠 칸도 없는 오류**로 등록이 영영 막힌다.
   */
  it("분기를 되돌려도 남은 값이 제출을 막지 않는다", () => {
    mount();
    fill('input[type="email"]', "a@b.com");

    const sel = host.querySelector("select")!;
    sel.value = "Buyer";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    fill('input[type="text"]', "Acme");
    sel.value = "General";
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    tickPrivacy();
    submitBtn().click();

    const errs = [...host.querySelectorAll(".msf-err")].map((e) => e.textContent).filter(Boolean);
    expect(errs).toEqual([]);
  });

  /** 설계 §16.1 — 미리보기는 저장 직전에 멈추고 더미 번호로 완료 화면을 그린다. */
  it("미리보기는 아무것도 보내지 않고 완료 화면을 더미 번호로 보여준다", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    mount();
    fill('input[type="email"]', "a@b.com");
    tickPrivacy();
    submitBtn().click();

    expect(spy).not.toHaveBeenCalled();
    expect(host.querySelector(".msf-regno")?.textContent).toBe("0000000000000");
    expect(text()).toContain("nothing was saved");
  });

  /** 미리보기 클릭이 광고 전환으로 잡히면 데이터가 오염된다(설계 §16.1·§18). */
  it("미리보기에서는 dataLayer 가 한 번도 발화하지 않는다", () => {
    mount();
    fill('input[type="email"]', "a@b.com");
    tickPrivacy();
    submitBtn().click();
    expect((window as { dataLayer?: unknown[] }).dataLayer).toBeUndefined();
  });

  it("실제 모드에서는 폼 노출·시작·제출이 dataLayer 로 나간다(§18)", () => {
    mount({ preview: false });
    const events = () => ((window as { dataLayer?: Array<{ event: string }> }).dataLayer ?? []).map((e) => e.event);
    expect(events()).toContain("ms_form_view");

    fill('input[type="email"]', "a@b.com");
    expect(events()).toContain("ms_form_start");
  });
});
