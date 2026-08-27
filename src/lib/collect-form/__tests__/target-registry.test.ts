// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  formTargetKey, getFormTarget, isPreviewMode, registerFormTarget,
  resetFormTargets, unregisterFormTarget, type FormTargetRecord,
} from "@/lib/collect-form/target-registry";

/**
 * 예약된 자리.
 *
 * 홈페이지 섹션의 마운트 지점은 Shadow 안이라 문서 탐색으로는 안 보인다. 그래서 먼저
 * 예약하고 열쇠를 넘긴다. 여기서 지켜야 하는 것은 **죽은 자리에 폼이 앉지 않는 것**이다 —
 * 정리된 섹션에 폼이 붙으면 보이지 않는 곳에서 제출까지 받는다.
 */

const key = (over: Partial<Parameters<typeof formTargetKey>[0]> = {}) =>
  formTargetKey({ sourceId: "s1", view: "form", mode: "live", instanceKey: "sec1", ...over });

function record(over: Partial<FormTargetRecord> = {}): FormTargetRecord {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, styleRoot: document, mode: "live", ...over };
}

beforeEach(() => {
  resetFormTargets();
  document.body.innerHTML = "";
});

describe("열쇠", () => {
  /** 같은 소스를 한 페이지에 두 번 놓을 수 있다 — 섹션 두 개, 또는 폼 + 모달. */
  it("소스·화면·모드·인스턴스를 모두 구분한다", () => {
    expect(key()).toBe("s1:form:live:sec1");
    expect(key({ view: "check" })).not.toBe(key());
    expect(key({ mode: "preview-draft" })).not.toBe(key());
    expect(key({ instanceKey: "sec2" })).not.toBe(key());
  });

  it("미리보기 두 종류는 둘 다 부작용을 막는다", () => {
    expect(isPreviewMode("live")).toBe(false);
    expect(isPreviewMode("preview-draft")).toBe(true);
    expect(isPreviewMode("preview-published")).toBe(true);
  });
});

describe("예약과 조회", () => {
  it("예약한 자리를 그대로 돌려준다", () => {
    const r = record();
    registerFormTarget(key(), r);
    expect(getFormTarget(key())).toBe(r);
  });

  it("없는 열쇠는 null", () => {
    expect(getFormTarget("없음")).toBeNull();
  });

  /** 따로 번들된 IIFE 끼리 공유하려면 창에 있어야 한다. */
  it("창에 매달려 있어 다른 번들에서도 보인다", () => {
    registerFormTarget(key(), record());
    const shared = (globalThis as Record<string, unknown>)["__MACH_FORM_TARGETS_V1__"];
    expect(shared).toBeDefined();
    expect(Object.keys(shared as object)).toContain(key());
  });

  it("같은 소스의 두 인스턴스가 서로의 자리를 뺏지 않는다", () => {
    const a = record();
    const b = record();
    registerFormTarget(key({ instanceKey: "sec1" }), a);
    registerFormTarget(key({ instanceKey: "sec2" }), b);
    expect(getFormTarget(key({ instanceKey: "sec1" }))).toBe(a);
    expect(getFormTarget(key({ instanceKey: "sec2" }))).toBe(b);
  });
});

describe("죽은 자리는 없는 것으로 답한다", () => {
  /** 정리된 섹션에 폼이 붙으면 보이지 않는 곳에서 제출까지 받는다. */
  it("컨테이너가 문서에서 떨어지면 null", () => {
    const r = record();
    registerFormTarget(key(), r);
    r.container.remove();
    expect(getFormTarget(key())).toBeNull();
  });

  it("예약한 쪽이 끊으면 null", () => {
    const controller = new AbortController();
    registerFormTarget(key(), record({ disposeSignal: controller.signal }));
    expect(getFormTarget(key())).not.toBeNull();
    controller.abort();
    expect(getFormTarget(key())).toBeNull();
  });

  /** 죽은 예약이 남아 있으면 같은 열쇠를 다시 쓸 때 옛 자리를 물려받는다. */
  it("죽은 예약은 그 자리에서 지운다", () => {
    const r = record();
    registerFormTarget(key(), r);
    r.container.remove();
    getFormTarget(key());
    const shared = (globalThis as Record<string, unknown>)["__MACH_FORM_TARGETS_V1__"] as object;
    expect(Object.keys(shared)).not.toContain(key());
  });

  it("직접 지울 수도 있다", () => {
    registerFormTarget(key(), record());
    unregisterFormTarget(key());
    expect(getFormTarget(key())).toBeNull();
  });
});
