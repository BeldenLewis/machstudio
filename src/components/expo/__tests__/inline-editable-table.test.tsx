/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InlineEditableTable } from "@/components/expo/fields/InlineEditableTable";

const rows = [
  { id: "first", name: "첫 행", public: true, image: "https://cdn.example.com/first.webp" },
  { id: "second", name: "둘째 행", public: false, image: "" },
];

describe("InlineEditableTable", () => {
  it("keeps desktop rows and 390px cards in one overflow-safe structure", () => {
    render(
      <InlineEditableTable
        ariaLabel="연사"
        rows={rows}
        issues={[{ path: "speakers[0].name", code: "required", message: "이름이 필요해요", severity: "error" }]}
        onChange={vi.fn()}
        renderRow={(row) => <>
          {row.image ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={row.image} alt={`${row.name} 썸네일`} />
          </> : null}
          <input aria-label={`${row.name} 이름`} defaultValue={row.name} />
        </>}
      />,
    );
    expect(screen.getByRole("table", { name: "연사" })).toHaveClass("max-w-full");
    expect(screen.getAllByTestId("inline-row")[0]).toHaveClass("max-[390px]:grid");
    expect(screen.getByAltText("첫 행 썸네일")).toBeInTheDocument();
    expect(screen.getByText("이름이 필요해요")).toHaveAttribute("data-field-path", "speakers[0].name");
  });

  it("reorders with the accessible drag handle and gates deletion", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <InlineEditableTable
        ariaLabel="카테고리"
        rows={rows}
        issues={[]}
        onChange={onChange}
        canDelete={(row) => row.id === "first" ? "연사가 참조하고 있어요" : true}
        renderRow={(row) => <span>{row.name}</span>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "첫 행 아래로 이동" }));
    expect(onChange).toHaveBeenLastCalledWith([rows[1], rows[0]]);
    await user.click(screen.getByRole("button", { name: "첫 행 삭제" }));
    expect(screen.getByRole("alert")).toHaveTextContent("연사가 참조하고 있어요");
    await user.click(screen.getByRole("button", { name: "둘째 행 삭제" }));
    expect(screen.getByRole("button", { name: "둘째 행 삭제 확인" })).toBeInTheDocument();
  });

  it("disables every mutation control for viewers", () => {
    render(<InlineEditableTable ariaLabel="읽기 전용" rows={rows} issues={[]} disabled onChange={vi.fn()} renderRow={(row) => <span>{row.name}</span>} />);
    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(true);
  });
});
