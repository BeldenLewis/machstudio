"use client";

import { useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import type { FieldIssue } from "@/lib/expo/types";

export interface InlineEditableTableProps<Row extends { id: string }> {
  ariaLabel: string;
  rows: readonly Row[];
  disabled?: boolean;
  issues: readonly FieldIssue[];
  renderRow(row: Row, index: number): ReactNode;
  onChange(rows: Row[]): void;
  canDelete?(row: Row): true | string;
}

export function InlineEditableTable<Row extends { id: string }>({
  ariaLabel, rows, disabled = false, issues, renderRow, onChange, canDelete,
}: InlineEditableTableProps<Row>) {
  const [dragged, setDragged] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const move = (from: number, to: number) => {
    if (disabled || from === to || to < 0 || to >= rows.length) return;
    const next = [...rows];
    const [row] = next.splice(from, 1);
    next.splice(to, 0, row);
    onChange(next);
  };
  const remove = (index: number) => {
    if (disabled) return;
    const row = rows[index];
    const permission = canDelete?.(row) ?? true;
    if (permission !== true) {
      setBlocked(permission);
      setConfirming(null);
      return;
    }
    setBlocked(null);
    setConfirming(row.id);
  };
  const finishDelete = (id: string) => {
    if (disabled) return;
    const row = rows.find((candidate) => candidate.id === id);
    if (!row || (canDelete?.(row) ?? true) !== true) return;
    onChange(rows.filter((candidate) => candidate.id !== id));
    setConfirming(null);
  };
  const dragStart = (event: DragEvent<HTMLButtonElement>, index: number) => {
    if (disabled) return;
    setDragged(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  };
  const dragOver = (event: DragEvent<HTMLTableRowElement>, index: number) => {
    if (disabled || dragged === null || dragged === index) return;
    event.preventDefault();
  };
  const drop = (event: DragEvent<HTMLTableRowElement>, index: number) => {
    event.preventDefault();
    if (dragged !== null) move(dragged, index);
    setDragged(null);
  };
  const handleKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    move(index, index + (event.key === "ArrowUp" ? -1 : 1));
  };

  return (
    <div className="max-w-full min-w-0 overflow-x-clip">
      <table aria-label={ariaLabel} className="w-full max-w-full table-fixed border-separate border-spacing-y-2 max-[390px]:block">
        <thead className="sr-only"><tr><th>순서와 편집 값</th><th>삭제</th></tr></thead>
        <tbody className="max-[390px]:block">
          {rows.map((row, index) => {
            const rowIssues = issues.filter((issue) => issue.path === `[${index}]` || issue.path.startsWith(`[${index}].`) || issue.path.includes(`[${index}]`));
            return (
              <tr
                key={row.id}
                data-testid="inline-row"
                draggable={!disabled}
                onDragOver={(event) => dragOver(event, index)}
                onDrop={(event) => drop(event, index)}
                onDragEnd={() => setDragged(null)}
                className="max-w-full align-top max-[390px]:grid max-[390px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[390px]:rounded-lg max-[390px]:bg-secondary max-[390px]:p-2"
              >
                <td className="w-10 p-1 align-top max-[390px]:w-auto">
                  <button
                    type="button"
                    draggable={!disabled}
                    disabled={disabled}
                    aria-label={`${readableName(row, index)} 순서 변경 — 끌거나 포커스 후 방향키`}
                    onDragStart={(event) => dragStart(event, index)}
                    onKeyDown={(event) => handleKey(event, index)}
                    className="grid h-9 w-9 cursor-grab place-items-center disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <GripVertical className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="sr-only">
                    <button type="button" disabled={disabled || index === 0} aria-label={`${readableName(row, index)} 위로 이동`} onClick={() => move(index, index - 1)} />
                    <button type="button" disabled={disabled || index === rows.length - 1} aria-label={`${readableName(row, index)} 아래로 이동`} onClick={() => move(index, index + 1)} />
                  </span>
                </td>
                <td className="min-w-0 p-1 max-[390px]:col-start-2">
                  <fieldset disabled={disabled} className="min-w-0 space-y-1.5 border-0 p-0">{renderRow(row, index)}</fieldset>
                  {rowIssues.map((issue, issueIndex) => (
                    <p key={`${issue.path}:${issueIndex}`} role={issue.severity === "error" ? "alert" : "status"} data-field-path={issue.path} className="mt-1 text-[11px] text-[var(--destructive)]">
                      {issue.message}
                    </p>
                  ))}
                </td>
                <td className="w-10 p-1 align-top max-[390px]:w-auto">
                  {confirming === row.id ? (
                    <div className="flex flex-col gap-1">
                      <button type="button" disabled={disabled} aria-label={`${readableName(row, index)} 삭제 확인`} onClick={() => finishDelete(row.id)} className="min-h-9 text-[11px] text-[var(--destructive)]">삭제 확인</button>
                      <button type="button" disabled={disabled} aria-label="삭제 취소" onClick={() => setConfirming(null)} className="min-h-9 text-[11px]">취소</button>
                    </div>
                  ) : (
                    <button type="button" disabled={disabled} aria-label={`${readableName(row, index)} 삭제`} onClick={() => remove(index)} className="grid h-9 w-9 place-items-center disabled:opacity-40">
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {blocked ? <p role="alert" className="mt-1 text-[11px] text-[var(--destructive)]">{blocked}</p> : null}
    </div>
  );
}

function readableName(row: { id: string } & Record<string, unknown>, index: number): string {
  for (const value of [row.name, row.label, row.title]) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const text = Object.values(value).find((candidate) => typeof candidate === "string" && candidate.trim());
      if (typeof text === "string") return text;
    }
  }
  return `${index + 1}번 행`;
}
