"use client";

/**
 * 빌더형 수집 소스의 폼 편집 화면 — 왼쪽 편집, 오른쪽 미리보기(설계 §16).
 *
 * 편집 영역이므로 **값은 항상 보이고 그 자리에서 고쳐진다**(AGENTS.md §2). 접기·모달 뒤로
 * 넣지 않는다. 자동저장 + 인접 실시간 미리보기가 같은 절의 요구다.
 */
import { useCallback, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { EditableList, withRowKeys, ROW_KEY } from "@/components/ui/editable-list";
import { useAutosave } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { btnCls, R, FINISH } from "@/components/ui/primitives";
import { CollectFieldCard, keyFromLabel } from "@/components/form-builder/CollectFieldCard";
import { CollectFormPreview } from "@/components/form-builder/CollectFormPreview";
import {
  DEFAULT_LOCALE,
  normalizeCollectForm,
  toLocalized,
  type CollectField,
  type CollectFormConfig,
  type RegistrationStatus,
} from "@/lib/collect-form-config";

const PREVIEW_STATES: Array<{ id: RegistrationStatus | "auto"; label: string }> = [
  { id: "auto", label: "지금 상태" },
  { id: "before", label: "접수 전" },
  { id: "open", label: "접수 중" },
  { id: "closed", label: "마감" },
];

export default function FormBuilderTab({
  sourceId,
  initialConfig,
}: {
  sourceId: string;
  initialConfig: unknown;
}) {
  // 저장된 값은 어떤 모양이든 올 수 있다 — 화면은 정규화된 것만 본다.
  const [config, setConfig] = useState<CollectFormConfig>(() => normalizeCollectForm(initialConfig));
  const [previewState, setPreviewState] = useState<RegistrationStatus | "auto">("auto");

  const save = useCallback(async (next: CollectFormConfig) => {
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formConfig: next }),
      });
      return res.ok;
    } catch { return false; }
  }, [sourceId]);

  const { state: saveState, retry } = useAutosave(config, save);
  // 표시는 껍데기 한 곳에서 그린다(화면당 1개) — 저장 경로는 각자.
  useReportAutosave(saveState, retry);

  const patch = (next: Partial<CollectFormConfig>) => setConfig((c) => ({ ...c, ...next }));
  const setFields = (updater: CollectField[] | ((prev: CollectField[]) => CollectField[])) =>
    setConfig((c) => ({ ...c, fields: typeof updater === "function" ? updater(c.fields) : updater }));

  const rows = useMemo(() => withRowKeys(config.fields), [config.fields]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">등록 항목</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">끌어서 순서를 바꿀 수 있어요. 저장 키는 한 번 정하면 바꾸지 마세요 — 이미 모인 데이터와 어긋납니다.</p>
          </div>
        </div>

        <EditableList<CollectField & { [ROW_KEY]?: string }>
          listId={`cfield:${sourceId}`}
          itemNoun="항목"
          items={rows}
          onChange={(next) => setFields(next)}
          rowKey={(f) => f.id}
          reorderable
          emptyState={
            <p className="rounded-xl bg-secondary/40 p-6 text-center text-xs text-muted-foreground">
              아직 항목이 없어요. 이름·이메일부터 추가해 보세요.
            </p>
          }
          renderAdd={({ add }) => (
            <button
              type="button"
              onClick={() => {
                const taken = new Set(config.fields.map((f) => f.key));
                const key = keyFromLabel("", taken);
                add({ id: crypto.randomUUID(), key, label: toLocalized(""), type: "text", placeholder: {}, required: false, enabled: true, options: [] });
              }}
              className={`${btnCls("ghost")} w-full justify-center`}
            >
              <Plus className="h-3.5 w-3.5" />항목 추가
            </button>
          )}
          autoFocusNewRow
          renderRow={({ item, handle, removeButton }) => (
            <CollectFieldCard
              field={item}
              setFields={setFields}
              handle={handle}
              removeButton={removeButton}
              isBranchKey={config.branch.enabled && config.branch.fieldKey === item.key}
              onMakeBranch={item.type === "select"
                ? (on) => patch({
                    branch: on
                      ? { enabled: true, fieldKey: item.key, groups: config.branch.groups }
                      : { ...config.branch, enabled: false },
                  })
                : null}
              // 자기 자신은 빼고 본다 — 안 그러면 모든 항목이 "중복" 이라고 나온다.
              takenKeys={new Set(config.fields.filter((f) => f.id !== item.id).map((f) => f.key))}
            />
          )}
        />
      </div>

      {/* 미리보기는 임베드와 같은 모델·가시성 규칙을 읽는다 — 각자 그리면 반드시 갈라진다. */}
      <aside className="space-y-2">
        <div className="flex items-center gap-1">
          {PREVIEW_STATES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setPreviewState(s.id)}
              className={`rounded-lg px-2 py-1 text-[11px] transition-shadow ${previewState === s.id ? `bg-violet-500/12 ${FINISH.s2Key}` : "hover:bg-secondary"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className={`${R.surface} bg-background p-4 ${FINISH.s2}`}>
          <CollectFormPreview
            config={config}
            forceStatus={previewState === "auto" ? undefined : previewState}
          />
        </div>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground/70">
          마감 화면은 마감 당일에 처음 보면 늦어요 — 상태를 바꿔 미리 확인하세요.
        </p>
      </aside>
    </div>
  );
}

export { DEFAULT_LOCALE };
