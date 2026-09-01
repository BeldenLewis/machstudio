/** @vitest-environment jsdom */
import { act } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageDraftWorkspace } from "@/components/expo/PageDraftWorkspace";
import type { ExpoPageEditorDto, ExpoPageTransport } from "@/lib/expo/editor-dto";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const permissions = {
  canEdit: true,
  canPublish: true,
  canManageSite: false,
  canManageTemplates: false,
};

const speakerSid = "11111111-1111-1111-1111-111111111111";
const ctaSid = "22222222-2222-2222-2222-222222222222";

function page(): ExpoPageEditorDto {
  return {
    id: "page-1", siteId: "site-1", slug: "home", title: "홈", imwebUrl: "",
    draft: {
      schemaVersion: 2,
      sections: [
        {
          sid: speakerSid, type: "speaker-carousel", variant: "default", enabled: true,
          embedEnabled: false, design: {}, content: { heading: { en: "SPEAKERS" }, categories: [], speakers: [] },
        },
        {
          sid: ctaSid, type: "cta-band", variant: "default", enabled: true,
          embedEnabled: false, design: {}, content: { heading: { ko: "문의" }, ctas: [] },
        },
      ],
    },
    draftRevision: 7, codeDigest: "draft-digest", publishedCodeDigest: "", hasPublished: false,
    publishedAt: null, liveAt: null, updatedAt: "2026-09-01T00:00:00.000Z",
    readiness: { canPublish: true, canGoLive: true, publishIssues: [], liveIssues: [], notes: [] },
    snippets: { ok: true, page: { code: "<script></script>", src: "https://example.com/h/page-1" }, sections: [] },
  };
}

function makeTransport(save = vi.fn().mockResolvedValue({ kind: "saved", revision: 8 })) {
  const load = vi.fn().mockResolvedValue(page());
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ revisions: [] }), { status: 200 }));
  return { transport: { load, save, request } satisfies ExpoPageTransport, load, save, request };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("one Expo page draft owner", () => {
  it("keeps tree, editor, and preview on one draft", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { transport, save } = makeTransport();
    render(<PageDraftWorkspace siteId="site-1" pageId="page-1" permissions={permissions} transport={transport} />);
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: "SPEAKERS 편집" }));
    await user.type(screen.getByLabelText("섹션 제목"), " 2027");

    expect(screen.getByTestId("expo-preview")).toHaveAttribute("data-selected-sid", speakerSid);
    expect(screen.getByTestId("expo-preview")).toHaveTextContent("SPEAKERS 2027");
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("page-1", expect.objectContaining({
      title: "홈", draftRevision: 7,
      draft: expect.objectContaining({ sections: expect.arrayContaining([
        expect.objectContaining({ sid: speakerSid, content: expect.objectContaining({ heading: { en: "SPEAKERS 2027" } }) }),
      ]) }),
    }));
  });

  it("stops autosave after a 409 conflict until explicit reload", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const save = vi.fn().mockResolvedValueOnce({ kind: "conflict", revision: 12 });
    const { transport, load } = makeTransport(save);
    render(<PageDraftWorkspace siteId="site-1" pageId="page-1" permissions={permissions} transport={transport} />);
    await act(async () => {});

    await user.type(screen.getByLabelText("페이지 제목"), " 충돌");
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText("다른 팀원이 먼저 저장했어요")).toBeInTheDocument();
    const reload = screen.getByRole("button", { name: "최신 내용 다시 불러오기" });
    expect(reload).toBeEnabled();

    await user.type(screen.getByLabelText("페이지 제목"), " 이후");
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("페이지 제목")).toHaveValue("홈 충돌 이후");

    load.mockResolvedValueOnce({ ...page(), title: "서버 최신", draftRevision: 12 });
    await user.click(reload);
    await act(async () => {});
    expect(screen.getByLabelText("페이지 제목")).toHaveValue("서버 최신");
  });

  it("routes publish, live, history, and rollback through the injected request", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const { transport, request } = makeTransport();
    request.mockImplementation(async (path: string) => {
      if (path.endsWith("/revisions")) {
        return new Response(JSON.stringify({ revisions: [{
          id: "rev-1", sequence: 1, codeDigest: "0123456789abcdef", publishedBy: "u1",
          publisher: { id: "u1", name: "담당자", email: null }, createdAt: "2026-09-01T00:00:00.000Z",
          summary: { sectionCount: 2, campaignCount: 0, destinationCount: 0 },
        }] }), { status: 200 });
      }
      if (path.includes("/rollback")) {
        return new Response(JSON.stringify({ revision: { sequence: 2 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ page: {} }), { status: 200 });
    });
    render(<PageDraftWorkspace siteId="site-1" pageId="page-1" permissions={permissions} transport={transport} />);
    await act(async () => {});

    await user.click(screen.getByRole("button", { name: "발행하기" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await user.click(screen.getByRole("switch", { name: "홈 아임웹에 내보내기" }));
    await user.click(screen.getByRole("button", { name: "공개하기" }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await user.click(screen.getByRole("button", { name: "발행 이력 보기" }));
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "버전 1 복구" }));
    await user.click(screen.getByRole("button", { name: "발행본으로 복구" }));
    await act(async () => {});

    expect(request.mock.calls.map(([path]) => path)).toEqual(expect.arrayContaining([
      "/api/expo/pages/page-1/publish",
      "/api/expo/pages/page-1/live",
      "/api/expo/pages/page-1/revisions",
      "/api/expo/pages/page-1/revisions/rev-1/rollback",
    ]));
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });
});
