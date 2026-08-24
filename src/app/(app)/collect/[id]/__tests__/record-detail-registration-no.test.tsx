// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RecordDetailModal from "../RecordDetailModal";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;
let registrationNo: string | null = "1234567890128";

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => vi.fn(async () => false),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const record = () => ({
  id: "record-1",
  data: { name: "김현장" },
  registrationNo,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  firstUtmSource: null,
  firstUtmMedium: null,
  firstUtmCampaign: null,
  firstUtmTerm: null,
  firstUtmContent: null,
  firstReferrer: null,
  firstSeenAt: null,
  referrer: null,
  createdAt: "2026-08-21T00:00:00.000Z",
});

beforeEach(() => {
  registrationNo = "1234567890128";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ record: record() })));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderModal() {
  await act(async () => {
    root.render(
      <RecordDetailModal
        sourceId="source-1"
        recordId="record-1"
        fieldMappings={[{ id: "field-name", key: "name", label: "이름", type: "text" }]}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("레코드 상세의 등록번호", () => {
  it("번호가 있으면 mapped field보다 먼저 읽기 전용으로 보여 준다", async () => {
    await renderModal();

    const text = container.textContent ?? "";
    // 번호 행이 뒤에 있으면 대조할 때 시선이 필드 목록을 먼저 훑게 된다.
    const registrationNoIndex = text.indexOf("등록번호");
    expect(registrationNoIndex).toBeGreaterThanOrEqual(0);
    expect(registrationNoIndex).toBeLessThan(text.indexOf("이름"));
    expect(text).toContain("1234567890128");
    // mapped field를 편집해도 등록번호는 capture 값이라 input이 되면 안 된다.
    const edit = [...container.querySelectorAll("button")].find((button) => button.textContent === "편집");
    await act(async () => { edit?.click(); });
    const inputs = [...container.querySelectorAll<HTMLInputElement>("input")];
    expect(inputs.map((input) => input.value)).toContain("김현장");
    expect(inputs.map((input) => input.value)).not.toContain("1234567890128");
  });

  it("capture record에 번호가 없으면 빈 등록번호 행을 만들지 않는다", async () => {
    registrationNo = null;
    await renderModal();

    expect(container.textContent).not.toContain("등록번호");
    expect(container.textContent).not.toContain("등록번호-");
  });
});
