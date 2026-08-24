// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import LiveConsoleTab from "../LiveConsoleTab";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const dashboard = {
  status: "registration",
  isOverridden: false,
  summary: {
    totalRegistered: 0,
    attended: 0,
    activeViewers: 0,
    presenceViewers: 0,
    marketingAgreed: 0,
    pendingQuestions: 0,
    answeredQuestions: 0,
    dismissedQuestions: 0,
    totalQuestions: 0,
    attendRate: 0,
    marketingRate: 0,
    avgStayMinutes: 0,
    maxStayMinutes: 0,
    stay30: 0,
    stay60: 0,
    stay30Rate: 0,
    stay60Rate: 0,
  },
  currentViewers: [],
  latestQuestions: [],
  generatedAt: "2026-08-21T00:00:00.000Z",
};

const responsesByUrl: Record<string, unknown> = {
  "/api/webinars/webinar-navigation-copy/dashboard": dashboard,
  "/api/webinars/webinar-navigation-copy/analytics/attendance-curve?range=all": {
    points: [], peak: 0, avg: 0, hasData: false, clamped: false,
  },
  "/api/webinars/webinar-navigation-copy/activity": { items: [] },
  "/api/webinars/webinar-navigation-copy/survey-responses": {
    total: 0, counts: {}, surveyOrder: [], surveys: {}, responses: [],
  },
  "/api/webinars/webinar-navigation-copy/chat": {
    messages: [],
    settings: { chatEnabled: false, hideLinks: true, slowSec: 0, bannedWords: [], bannedCount: 0 },
  },
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function clickDisclosure(label: string) {
  const button = [...host!.querySelectorAll<HTMLButtonElement>("button")]
    .find((candidate) => candidate.textContent?.includes(label));
  expect(button).toBeTruthy();
  act(() => { button?.click(); });
}

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root?.render(
      <ConfirmProvider>
        <LiveConsoleTab
          webinarId="webinar-navigation-copy"
          webinar={{ config: {}, components: { chatEnabled: false }, sessions: [], _count: { registrations: 0 } }}
        />
      </ConfirmProvider>,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("운영 콘솔 안내는 현재 만들기 메뉴를 가리킨다", () => {
  it("폼 응답과 채팅 안내가 현행 시청 화면 경로를 표시한다", async () => {
    // jsdom에는 차트 캔버스 구현이 없다. 실제 콘솔 렌더와 fetch 경계는 유지하고, 없는 브라우저
    // 그리기 API만 null로 둬 OverviewChart가 그리기를 건너뛰게 한다.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      const body = responsesByUrl[url];
      if (!body) throw new Error(`Unexpected fetch: ${url}`);
      return Promise.resolve({ ok: true, json: async () => body });
    }));

    render();
    await flush();

    clickDisclosure("문의·폼 응답");
    await flush();
    expect(host?.textContent).toContain("만들기 → 시청 화면 → 라이브의 CTA 버튼에 폼을 연결하면");

    clickDisclosure("실시간 채팅");
    await flush();
    expect(host?.textContent).toContain("만들기 → 시청 화면 → 라이브 → 참여 구성에서 채팅을 켜야 시청 화면에 보여요");
    expect(host?.textContent).toContain("만들기 → 시청 화면 → 라이브 → 참여 구성에서 채팅을 켜야 보여요");
    expect(host?.textContent).not.toContain("만들기 → 라이브 페이지");
  });
});
