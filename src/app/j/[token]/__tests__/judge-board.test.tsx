// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JudgeBoard } from "../page";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const state = {
  authed: true,
  judgeName: "심사위원 A",
  competitionName: "테스트 대회",
  round: { id: "round-1", kind: "prelim", name: "예선" },
  criteria: [
    { key: "creativity", label: "창의성", maxScore: 40 },
    { key: "impact", label: "임팩트", maxScore: 30 },
  ],
  criteriaMax: 70,
  entries: [{ id: "entry-1", entryNo: "1", title: "참가작 1", teamName: "팀 1", summary: null, media: [] }],
  scores: [],
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root?.render(<JudgeBoard token="tok" state={state} />); });
  return host;
}

function slide(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("심사 화면 자동저장", () => {
  it("디바운스가 끝난 뒤 **마지막으로 만진 값**을 보낸다", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, total: 19, submitted: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const el = render();
    const [creativity, impact] = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="range"]'));

    act(() => { slide(creativity, "12"); });
    act(() => { slide(impact, "7"); });

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    // 옛 클로저를 읽으면 여기서 마지막 조작(impact)이 빠진다 — 실제로 그렇게 유실됐다.
    expect(body).toMatchObject({
      roundId: "round-1",
      entryId: "entry-1",
      scores: { creativity: 12, impact: 7 },
      submitted: false,
    });
  });

  it("합계는 저장을 기다리지 않고 슬라이더를 따라간다", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 0, submitted: false }) }));
    const el = render();
    const [creativity, impact] = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="range"]'));

    act(() => { slide(creativity, "12"); });
    act(() => { slide(impact, "7"); });

    expect(el.textContent).toContain("합계 19 / 70");
  });

  it("모든 항목을 채우기 전에는 제출할 수 없다", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ total: 0, submitted: false }) }));
    const el = render();
    const submit = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "제출")!;
    expect(submit.disabled).toBe(true);

    const [creativity, impact] = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="range"]'));
    act(() => { slide(creativity, "12"); });
    act(() => { slide(impact, "7"); });
    expect(submit.disabled).toBe(false);
  });

  it("제출한 참가작은 슬라이더까지 잠긴다", () => {
    vi.stubGlobal("fetch", vi.fn());
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        <JudgeBoard
          token="tok"
          state={{ ...state, scores: [{ entryId: "entry-1", scores: { creativity: 30, impact: 20 }, total: 50, comment: null, submitted: true }] }}
        />,
      );
    });

    const ranges = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="range"]'));
    expect(ranges.every((r) => r.disabled)).toBe(true);
    expect(host.querySelector("textarea")?.disabled).toBe(true);
    expect(host.textContent).toContain("제출 완료");
  });
});
