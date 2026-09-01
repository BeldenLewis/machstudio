/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { ExpoRevisionPanel } from "@/components/expo/ExpoRevisionPanel";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => cleanup());

it("requires confirmation, uses the injected request, and reports the new revision", async () => {
  const user = userEvent.setup();
  const globalFetch = vi.spyOn(globalThis, "fetch");
  const onRolledBack = vi.fn();
  const request = vi.fn(async (path: string) => {
    if (path.endsWith("/revisions")) {
      return new Response(JSON.stringify({ revisions: [{
        id: "revision-7", sequence: 7, codeDigest: "0123456789abcdef", publishedBy: "user-1",
        publisher: { id: "user-1", name: "발행자", email: "publisher@example.com" }, createdAt: "2026-09-01T04:00:00.000Z",
        summary: { preset: "stk-home-v1", sectionCount: 3, campaignCount: 1, destinationCount: 2 },
      }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ revision: { id: "revision-9", sequence: 9, codeDigest: "next" } }), { status: 200 });
  });

  render(<ConfirmProvider><ExpoRevisionPanel pageId="page-1" canPublish request={request} onRolledBack={onRolledBack} /></ConfirmProvider>);
  await user.click(await screen.findByRole("button", { name: "버전 7 복구" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "발행본으로 복구" }));

  expect(await screen.findByText("버전 9로 복구했어요")).toBeInTheDocument();
  expect(onRolledBack).toHaveBeenCalledWith(9);
  expect(request).toHaveBeenCalledWith(expect.stringContaining("revision-7/rollback"), expect.objectContaining({ method: "POST" }));
  expect(globalFetch).not.toHaveBeenCalled();
});
