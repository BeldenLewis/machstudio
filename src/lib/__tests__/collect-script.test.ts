// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { buildCollectScripts } from "@/lib/collect-script";

/**
 * 연동형(capture) 수집 스크립트 — 필드 묶음 선택자가 하드코딩된 ".form-group"(아임웹 전용)
 * 이었다가 소스별로 바꿀 수 있게 된 부분을 검증한다. "콘솔에 입력해도 아무것도 안 뜨더라"는
 * 피드백의 원인이었다 — 아임웹이 아닌 사이트는 .form-group 자체가 없다.
 */
function baseInput(overrides: Partial<Parameters<typeof buildCollectScripts>[0]["source"]> = {}) {
  return {
    source: {
      id: "src_1",
      apiKey: "key_1",
      successTrigger: "감사합니다",
      redirectUrl: null,
      ...overrides,
    },
    fieldMappings: [{ index: 0, key: "name", label: "이름" }],
    baseUrl: "https://machstudio.app",
  };
}

describe("buildCollectScripts — 필드 묶음 선택자", () => {
  it("지정하지 않으면 기본값(.form-group, 아임웹 관례)을 쓴다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain('var GROUP_SELECTOR = ".form-group"');
  });

  it("소스에 저장된 선택자를 그대로 스크립트에 심는다", () => {
    const { script } = buildCollectScripts(baseInput({ fieldGroupSelector: "table tr" }));
    expect(script).toContain('var GROUP_SELECTOR = "table tr"');
  });

  it("빈 문자열이면 기본값으로 떨어진다 — 선택자가 비면 필드를 하나도 못 찾는다", () => {
    const { script } = buildCollectScripts(baseInput({ fieldGroupSelector: "" }));
    expect(script).toContain('var GROUP_SELECTOR = ".form-group"');
  });

  it("라벨 추출이 label 뿐 아니라 th 도 본다 — 표 형태 신청서는 th 를 쓴다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain('querySelector("label, th")');
  });

  it("체크박스·라디오 옵션 label 과 필드 제목을 구분한다 — 입력 래퍼가 아닌 형제를 먼저 본다", () => {
    const { script } = buildCollectScripts(baseInput());
    expect(script).toContain(':scope > *:not(.input-area)');
  });

  it("생성된 스크립트가 문법적으로 유효한 JS 다", () => {
    const { script, utmScript } = buildCollectScripts(baseInput());
    expect(() => new Function(utmScript)).not.toThrow();
    expect(() => new Function(script)).not.toThrow();
  });
});

describe("buildCollectScripts — 실제 수집이 스니퍼가 찍은 index 와 맞는다", () => {
  it("입력 없는 .field(안내문 등)가 앞에 끼어도 밀리지 않는다", async () => {
    document.body.innerHTML = `
      <div class="field">안내: 아래 항목을 입력해 주세요</div>
      <div class="field"><span>이름</span><div class="input-area"><input value="홍길동" /></div></div>
      <div class="field"><span>이메일</span><div class="input-area"><input value="a@b.com" /></div></div>
    `;
    // 스니퍼는 입력 없는 첫 번째 .field(안내문)를 건너뛰고 이름=index0, 이메일=index1 로 찍는다
    // — 실제 수집도 같은 필터를 써야 이 index 가 맞는다.
    const { script } = buildCollectScripts({
      source: {
        id: "src_1",
        apiKey: "key_1",
        successTrigger: "접수완료",
        redirectUrl: null,
        fieldGroupSelector: ".field",
      },
      fieldMappings: [
        { index: 0, key: "name", label: "이름" },
        { index: 1, key: "email", label: "이메일" },
      ],
      baseUrl: "https://machstudio.app",
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    new Function(script)();
    document.body.insertAdjacentHTML("beforeend", "<div>접수완료</div>");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data).toEqual({ name: "홍길동", email: "a@b.com" });

    vi.unstubAllGlobals();
  });
});

describe("buildCollectScripts — 성공 메시지가 alert() 팝업으로 뜨는 사이트", () => {
  it("alert 문구가 성공 트리거와 일치하면 그때 전송한다", async () => {
    document.body.innerHTML = `
      <div class="field"><span>이름</span><div class="input-area"><input value="홍길동" /></div></div>
    `;
    const { script } = buildCollectScripts({
      source: {
        id: "src_1",
        apiKey: "key_1",
        successTrigger: "사전등록이 완료되었습니다",
        redirectUrl: null,
        fieldGroupSelector: ".field",
      },
      fieldMappings: [{ index: 0, key: "name", label: "이름" }],
      baseUrl: "https://machstudio.app",
    });

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const alertMock = vi.fn();
    vi.stubGlobal("alert", alertMock);

    new Function(script)();

    // 검증 실패 알림처럼 트리거 문구와 무관한 alert 은 무시한다 — 오탐 방지.
    window.alert("이메일을 입력해주세요");
    expect(fetchMock).not.toHaveBeenCalled();

    window.alert("사전등록이 완료되었습니다");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.data).toEqual({ name: "홍길동" });
    expect(alertMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
