// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RegistrantsTab from "../RegistrantsTab";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * 등록자 명단의 참여점수 열·세그먼트 필터.
 *
 * 왜 생겼나: 리드 스코어링이 **분석 탭 상위 8명과 CSV 에만** 있었다. 정작 전화를 돌리는
 * 화면(이 명단)에는 점수가 없어서, 254명 중 누구부터 연락할지 화면에서 정할 수 없었다.
 * 그리고 방송 전에는 전원 0점 노쇼라 열이 오해만 만들므로 숨긴다(분석 탭과 같은 규칙).
 */

const BREAKDOWN = { attend: 25, watch: 22, interact: 5, interactRaw: 5, intent: 0, evaluatedMinutes: 75 };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "r1", name: "김철수", phone: "01011112222", email: "a@b.com", company: "아웃컴",
    department: null, jobTitle: null, industry: null, agreeMarketing: true, agreePrivacy: true,
    memo: null, stayMinutes: 75, connectedSeconds: 4500, focusSeconds: 4000,
    isActive: false, isLive: false, submittedAt: "2026-08-01T00:00:00Z",
    enteredAt: "2026-08-11T01:00:00Z", lastPingAt: null,
    score: 52, segment: "warm", scoreBreakdown: BREAKDOWN,
    ...over,
  };
}

const STATS = { registered: 6, entered: 4, active: 0, surveyResponded: 0, segments: { hot: 1, warm: 2, cold: 1, noShow: 2 } };

let host: HTMLDivElement | null = null;
let root: Root | null = null;
let lastUrl = "";

function mockFetch(phase: "before" | "live" | "ended", rows = [row()]) {
  lastUrl = "";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return {
      ok: true,
      json: async () => ({
        registrations: rows,
        total: rows.length,
        stats: STATS,
        scoring: { phase, liveMinutes: 75, scheduledMinutes: 120 },
        surveys: [],
        surveyResponses: [],
        qaItems: [],
      }),
    } as Response;
  }));
}

async function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  // RegistrantsTab 은 공용 확인 모달(useConfirm)을 쓴다 — 실제 화면과 같은 provider 로 감싼다
  await act(async () => { root?.render(<ConfirmProvider><RegistrantsTab webinarId="w1" /></ConfirmProvider>); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = null; root = null;
  vi.unstubAllGlobals();
});

describe("참여점수 열", () => {
  it("방송이 끝나면 점수·세그먼트가 이름 옆에 보인다", async () => {
    mockFetch("ended");
    const el = await render();
    const text = el.textContent ?? "";
    expect(text).toContain("참여점수");
    expect(text).toContain("52");
    expect(text).toContain("웜");
  });

  /** 방송 전에는 전원 0점 노쇼라 열이 의미가 없다 — 분석 탭 '확보한 리드' 와 같은 규칙. */
  it("방송 전에는 점수 열과 세그먼트 필터를 숨긴다", async () => {
    mockFetch("before", [row({ score: 0, segment: "noShow", scoreBreakdown: null })]);
    const el = await render();
    const text = el.textContent ?? "";
    expect(text).not.toContain("참여점수");
    expect(text).not.toContain("리드 세그먼트");
  });

  it("점수 근거를 툴팁으로 남긴다 — 숫자만 보고 CSV 와 대조하지 않게", async () => {
    mockFetch("ended");
    const el = await render();
    const titles = [...el.querySelectorAll("[title]")].map((n) => n.getAttribute("title") ?? "");
    expect(titles.some((t) => t.includes("참석 25 + 체류 22") && t.includes("75/75분") && t.includes("52점"))).toBe(true);
  });
});

describe("세그먼트 필터", () => {
  it("칩에 개수를 함께 보여준다", async () => {
    mockFetch("ended");
    const el = await render();
    const text = el.textContent ?? "";
    expect(text).toContain("리드 세그먼트");
    expect(text).toContain("핫 1");
    expect(text).toContain("웜 2");
    expect(text).toContain("노쇼 2");
  });

  /** 점수는 SQL 로 표현할 수 없어 서버가 별도 경로로 처리한다 — 쿼리에 실려야 그 경로가 돈다. */
  it("칩을 누르면 segment 파라미터로 다시 조회한다", async () => {
    mockFetch("ended");
    const el = await render();
    const chip = [...el.querySelectorAll("button")].find((b) => (b.textContent ?? "").startsWith("핫"));
    expect(chip, "핫 칩이 있어야 한다").toBeTruthy();
    await act(async () => { chip?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    await act(async () => { await Promise.resolve(); });
    expect(lastUrl).toContain("segment=hot");
  });
});
