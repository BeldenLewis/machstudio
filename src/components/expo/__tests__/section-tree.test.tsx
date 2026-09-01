/** @vitest-environment jsdom */
import { useState } from "react";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExpoSectionTree } from "@/components/expo/ExpoSectionTree";
import type { ExpoSection } from "@/lib/expo/types";

const first = "11111111-1111-1111-1111-111111111111";
const second = "22222222-2222-2222-2222-222222222222";
const third = "33333333-3333-3333-3333-333333333333";

const initial: ExpoSection[] = [
  { sid: first, type: "textblock", variant: "prose", enabled: true, embedEnabled: false, design: {}, content: { heading: { ko: "첫째" }, body: { ko: "a" } } },
  { sid: second, type: "textblock", variant: "prose", enabled: false, embedEnabled: true, design: {}, content: { heading: { ko: "둘째" }, body: { ko: "b" } } },
  { sid: third, type: "textblock", variant: "prose", enabled: true, embedEnabled: false, design: {}, content: { heading: { ko: "셋째" }, body: { ko: "c" } } },
];

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

function Harness({
  canEdit = true, initialSections = initial,
}: { canEdit?: boolean; initialSections?: ExpoSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [selectedSid, setSelectedSid] = useState<string | null>(second);
  return <>
    <output data-testid="selection">{selectedSid}</output>
    <output data-testid="order">{sections.map((section) => section.type).join(",")}</output>
    <ExpoSectionTree
      sections={sections}
      selectedSid={selectedSid}
      onSelect={setSelectedSid}
      onChange={setSections}
      canEdit={canEdit}
      issues={[{ code: "empty-enabled-section", sid: second, message: "비었어요" }]}
    />
  </>;
}

describe("Expo section tree", () => {
  it("shows structure, statuses, issue counts, and immutable-sid selection", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "둘째 편집" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("숨김")).toBeInTheDocument();
    expect(screen.getByText("코드 내보냄")).toBeInTheDocument();
    expect(screen.getByText("문제 1개")).toBeInTheDocument();
    expect(screen.getByTestId("selection")).toHaveTextContent(second);
  });

  it("keeps selection stable while sorting and announces the move", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const handle = screen.getByRole("button", { name: /둘째.*순서 변경/ });
    expect(document.getElementById(handle.getAttribute("aria-describedby")!)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "둘째 아래로 이동" }));
    expect(screen.getByTestId("selection")).toHaveTextContent(second);
    expect(screen.getByText(/둘째.*이동/)).toBeInTheDocument();
  });

  it("deleting the selected row chooses next then previous", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "둘째 구획 삭제" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByTestId("selection")).toHaveTextContent(third);
    fireEvent.click(screen.getByRole("button", { name: "셋째 구획 삭제" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByTestId("selection")).toHaveTextContent(first);
  });

  it("read-only users can select but cannot drag or delete", async () => {
    const user = userEvent.setup();
    render(<Harness canEdit={false} />);
    expect(screen.queryByRole("button", { name: /순서 변경/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /구획 삭제/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "첫째 편집" }));
    expect(screen.getByTestId("selection")).toHaveTextContent(first);
  });

  it("adds sections through the tree and keeps pinned-first types at the front", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "+ 키비주얼" }));
    expect(screen.getByTestId("order")).toHaveTextContent(/^kv,/);
    expect(screen.getByRole("button", { name: "+ 키비주얼" })).toBeDisabled();
    expect(screen.getByTestId("selection")).not.toHaveTextContent(second);
  });
});
