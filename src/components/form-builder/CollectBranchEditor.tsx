"use client";

import { useState } from "react";
import { GitBranch, Plus } from "lucide-react";
import { EditableList } from "@/components/ui/editable-list";
import { btnCls, FINISH, R, SELECTED_TEXT } from "@/components/ui/primitives";
import { CollectFieldCard, keyFromLabel } from "@/components/form-builder/CollectFieldCard";
import {
  DEFAULT_LOCALE,
  localize,
  type CollectBranch,
  type CollectField,
} from "@/lib/collect-form-config";

/** 현재 선택지 순서대로 탭을 만들 때 쓸 단일 로케일 값. 빈 선택지는 탭이 될 수 없다. */
export function branchOptionValues(field: CollectField): string[] {
  return [...new Set(field.options.map((option) => localize(option, DEFAULT_LOCALE).trim()).filter(Boolean))];
}

/**
 * 기준 문항의 선택지가 바뀌어도 이미 만든 분기 문항을 잃지 않게 그룹을 맞춘다.
 *
 * - 같은 값은 그대로 유지(순서 변경 포함)
 * - 선택지 개수가 같고 값만 바뀌면 같은 위치의 그룹을 새 이름으로 이동
 * - 삭제된 선택지의 그룹은 숨은 상태로 보존 — 실수 한 번으로 문항 묶음을 파기하지 않는다
 */
export function reconcileBranchGroups(
  branch: CollectBranch,
  previousValues: readonly string[],
  nextValues: readonly string[],
): CollectBranch["groups"] {
  const byValue = new Map(branch.groups.map((group) => [group.value, group]));
  const consumed = new Set<string>();
  const active = nextValues.map((value, index) => {
    const exact = byValue.get(value);
    if (exact) {
      consumed.add(exact.value);
      return exact;
    }

    const previousValue = previousValues[index];
    const renamed = previousValues.length === nextValues.length && previousValue
      ? byValue.get(previousValue)
      : undefined;
    if (renamed && !consumed.has(renamed.value)) {
      consumed.add(renamed.value);
      return { ...renamed, value };
    }
    return { value, fields: [] };
  });

  const activeValues = new Set(nextValues);
  const preserved = branch.groups.filter((group) => !consumed.has(group.value) && !activeValues.has(group.value));
  return [...active, ...preserved];
}

export function CollectBranchEditor({
  trigger,
  branch,
  allFields,
  onChange,
}: {
  trigger: CollectField;
  branch: CollectBranch;
  allFields: CollectField[];
  onChange: (branch: CollectBranch) => void;
}) {
  const options = branchOptionValues(trigger);
  const [requestedTab, setRequestedTab] = useState("");
  const activeValue = options.includes(requestedTab) ? requestedTab : (options[0] ?? "");
  const activeGroup = branch.groups.find((group) => group.value === activeValue)
    ?? (activeValue ? { value: activeValue, fields: [] } : null);

  const setGroupFields = (value: string, fields: CollectField[]) => {
    const exists = branch.groups.some((group) => group.value === value);
    onChange({
      ...branch,
      groups: exists
        ? branch.groups.map((group) => (group.value === value ? { ...group, fields } : group))
        : [...branch.groups, { value, fields }],
    });
  };

  const everyField = [
    ...allFields,
    ...branch.groups.flatMap((group) => group.fields),
  ];
  const allKeys = new Set(everyField.map((field) => field.key));

  return (
    <section className={`${R.surface} bg-violet-500/[0.04] p-3 ${FINISH.s2}`} aria-label="유형별 분기 문항">
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-500/12 ${SELECTED_TEXT}`}>
          <GitBranch className="h-3.5 w-3.5" />
        </span>
        <div>
          <h3 className="text-xs font-semibold">유형별 분기 문항</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            위 문항에서 고른 선택지에 따라 아래 문항이 달라져요. 탭마다 해당 유형에만 보일 문항을 추가하세요.
          </p>
        </div>
      </div>

      {options.length === 0 ? (
        <p className="mt-3 rounded-xl bg-secondary/60 p-4 text-center text-xs text-muted-foreground">
          기준 문항에 선택지를 먼저 추가하면 선택지별 탭이 생겨요.
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="분기 선택지">
            {options.map((option) => {
              const selected = option === activeValue;
              const count = branch.groups.find((group) => group.value === option)?.fields.length ?? 0;
              return (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setRequestedTab(option)}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition-all active:scale-[.98] ${
                    selected ? `bg-background shadow-sm ${SELECTED_TEXT}` : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
                  }`}
                >
                  {option}<span className="ml-1.5 text-[10px] font-normal opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {activeGroup && (
            <div className="mt-2" role="tabpanel">
              <EditableList<CollectField>
                listId={`branch:${trigger.id}:${activeValue}`}
                itemNoun="분기 문항"
                items={activeGroup.fields}
                onChange={(fields) => setGroupFields(activeValue, fields)}
                rowKey={(field) => field.id}
                reorderable
                rowChrome="bare"
                autoFocusNewRow
                emptyState={
                  <p className="rounded-xl bg-secondary/50 p-5 text-center text-xs text-muted-foreground">
                    <b className="font-semibold text-foreground">{activeValue}</b>를 선택했을 때만 보일 문항을 추가하세요.
                  </p>
                }
                renderAdd={({ add }) => (
                  <button
                    type="button"
                    onClick={() => {
                      const key = keyFromLabel("", allKeys);
                      add({
                        id: crypto.randomUUID(), key, label: {}, type: "text", placeholder: {},
                        required: false, enabled: true, options: [],
                      });
                    }}
                    className={`${btnCls("ghost")} w-full justify-center`}
                  >
                    <Plus className="h-3.5 w-3.5" />{activeValue} 문항 추가
                  </button>
                )}
                renderRow={({ item, handle, removeButton }) => (
                  <CollectFieldCard
                    field={item}
                    setFields={(updater) => {
                      const current = activeGroup.fields;
                      setGroupFields(activeValue, typeof updater === "function" ? updater(current) : updater);
                    }}
                    handle={handle}
                    removeButton={removeButton}
                    isBranchKey={false}
                    onMakeBranch={null}
                    takenKeys={new Set(everyField.filter((field) => field.id !== item.id).map((field) => field.key))}
                  />
                )}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
