"use client";

import { useCallback, useState } from "react";
import { EditableList } from "@/components/ui/editable-list";
import { Chip, FINISH, R, SELECTED } from "@/components/ui/primitives";
import { newSection } from "@/lib/expo/config";
import { EXPO_LIMITS, EXPO_SECTIONS, sectionDef } from "@/lib/expo/registry";
import type { ReadinessIssue } from "@/lib/expo/readiness";
import type { ExpoSection } from "@/lib/expo/types";

function localized(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["ko", "en", ...Object.keys(record)]) {
    const text = record[key];
    if (typeof text === "string" && text.trim()) return text;
  }
  return "";
}

/** 제목은 sid와 달리 표시용이다. 선택·정렬·삭제 판정에는 절대 쓰지 않는다. */
export function expoSectionTitle(section: ExpoSection): string {
  const content = section.content;
  const direct = localized(content.heading)
    || localized(content.title)
    || localized(content.headline)
    || localized(content.accessibleHeadline);
  if (direct) return direct;
  if (Array.isArray(content.typingLines)) {
    const first = content.typingLines.map(localized).find(Boolean);
    if (first) return first;
  }
  return sectionDef(section.type)?.label ?? section.type;
}

export interface ExpoSectionTreeProps {
  sections: ExpoSection[];
  selectedSid: string | null;
  onSelect(sid: string): void;
  onChange(next: ExpoSection[]): void;
  canEdit: boolean;
  issues?: readonly ReadinessIssue[];
}

function applyPinned(sections: ExpoSection[]): ExpoSection[] {
  const pinned = sections.filter((section) => sectionDef(section.type)?.pinnedFirst);
  return pinned.length === 0
    ? sections
    : [...pinned, ...sections.filter((section) => !sectionDef(section.type)?.pinnedFirst)];
}

export function ExpoSectionTree({
  sections, selectedSid, onSelect, onChange, canEdit, issues = [],
}: ExpoSectionTreeProps) {
  const [announcement, setAnnouncement] = useState("");

  const commit = useCallback((next: ExpoSection[]) => {
    const normalized = applyPinned(next);
    const sameMembers = normalized.length === sections.length
      && normalized.every((section) => sections.some((current) => current.sid === section.sid));
    if (sameMembers) {
      const moved = normalized.find((section, index) => sections[index]?.sid !== section.sid);
      if (moved) {
        const position = normalized.findIndex((section) => section.sid === moved.sid) + 1;
        setAnnouncement(`${expoSectionTitle(moved)} 구획을 ${position}번째로 이동했어요.`);
      }
    }

    if (selectedSid && !normalized.some((section) => section.sid === selectedSid)) {
      const removedIndex = sections.findIndex((section) => section.sid === selectedSid);
      // 제거 전 같은 인덱스가 곧 다음 이웃이다. 없으면 이전 이웃을 고른다.
      const neighbour = normalized[removedIndex] ?? normalized[removedIndex - 1] ?? null;
      if (neighbour) onSelect(neighbour.sid);
    }
    onChange(normalized);
  }, [onChange, onSelect, sections, selectedSid]);

  return (
    <nav className={`${R.panel} ${FINISH.s1} bg-card p-2`} aria-label="구획 구조">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold">구획 구조</h2>
        <span className="text-[11px] text-muted-foreground">{sections.length}개</span>
      </div>
      <EditableList<ExpoSection>
        listId="expo-section-tree"
        itemNoun="구획"
        items={sections}
        onChange={commit}
        rowKey={(section) => section.sid}
        reorderable={canEdit}
        handleLabel={(section) => `${expoSectionTitle(section)} 구획 순서 변경 — 끌거나 포커스 후 방향키`}
        removable={() => canEdit}
        rowChrome="bare"
        emptyState={<p className="px-2 py-5 text-xs text-muted-foreground">아직 구획이 없어요.</p>}
        renderRow={({ item, handle, removeButton }) => {
          const title = expoSectionTitle(item);
          const index = sections.findIndex((section) => section.sid === item.sid);
          const issueCount = issues.filter((issue) => issue.sid === item.sid).length;
          const selected = selectedSid === item.sid;
          return (
            <div className={`flex items-center gap-1 ${R.control} p-1 transition-colors ${selected ? SELECTED : "hover:bg-secondary"}`}>
              {handle}
              <button
                type="button"
                onClick={() => onSelect(item.sid)}
                aria-label={`${title} 편집`}
                aria-current={selected ? "true" : undefined}
                className="min-w-0 flex-1 px-1 py-1.5 text-left"
              >
                <span className="block truncate text-xs font-medium">{title}</span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {!item.enabled ? <Chip tone="warn">숨김</Chip> : null}
                  {item.embedEnabled ? <Chip tone="ok">코드 내보냄</Chip> : null}
                  {issueCount > 0 ? <Chip tone="warn">문제 {issueCount}개</Chip> : null}
                </span>
              </button>
              {canEdit ? <span className="flex shrink-0">
                <button
                  type="button"
                  disabled={index <= 0}
                  aria-label={`${title} 위로 이동`}
                  onClick={() => {
                    if (index <= 0) return;
                    const next = [...sections];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    commit(next);
                    setAnnouncement(`${title} 구획을 ${index}번째로 이동했어요.`);
                  }}
                  className="h-7 w-6 text-xs text-muted-foreground disabled:opacity-30"
                >↑</button>
                <button
                  type="button"
                  disabled={index >= sections.length - 1}
                  aria-label={`${title} 아래로 이동`}
                  onClick={() => {
                    if (index >= sections.length - 1) return;
                    const next = [...sections];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    commit(next);
                    setAnnouncement(`${title} 구획을 ${index + 2}번째로 이동했어요.`);
                  }}
                  className="h-7 w-6 text-xs text-muted-foreground disabled:opacity-30"
                >↓</button>
              </span> : null}
              {removeButton({ label: `${title} 구획 삭제` })}
            </div>
          );
        }}
      />
      {canEdit ? (
        <div className="mt-2 border-t border-border px-1 pt-2">
          <p className="mb-1.5 text-[11px] text-muted-foreground">구획 추가</p>
          <div className="flex flex-wrap gap-1">
            {EXPO_SECTIONS.map((definition) => {
              const disabled = sections.length >= EXPO_LIMITS.sectionsPerPage
                || (!definition.multi && sections.some((section) => section.type === definition.type));
              return (
                <button
                  key={definition.type}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const created = newSection(definition.type);
                    commit([...sections, created]);
                    onSelect(created.sid);
                  }}
                  className={`${R.control} border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  + {definition.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <p data-testid="move-announcement" role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </nav>
  );
}
