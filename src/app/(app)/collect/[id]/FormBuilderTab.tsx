"use client";

/**
 * 빌더형 수집 소스의 폼 편집 화면 — 왼쪽 편집, 오른쪽 미리보기(설계 §16).
 *
 * 편집 영역이므로 **값은 항상 보이고 그 자리에서 고쳐진다**(AGENTS.md §2). 접기·모달 뒤로
 * 넣지 않는다. 자동저장 + 인접 실시간 미리보기가 같은 절의 요구다.
 */
import { useCallback, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EditableList, withRowKeys, ROW_KEY } from "@/components/ui/editable-list";
import { useAutosave } from "@/components/ui/use-autosave";
import { useReportAutosave } from "@/components/ui/autosave-scope";
import { btnCls, R, FINISH } from "@/components/ui/primitives";
import { CollectFieldCard, keyFromLabel } from "@/components/form-builder/CollectFieldCard";
import { CollectFormRuntime } from "@/components/form-builder/CollectFormRuntime";
import { CollectFormSections } from "@/components/form-builder/CollectFormSections";
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
  previewToken,
}: {
  sourceId: string;
  initialConfig: unknown;
  /** /p/{token} 미리보기 링크. 빌더형이면 항상 있지만, 예전 소스는 null 일 수 있다. */
  previewToken: string | null;
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

        {/* 항목 아래에 나머지 설정 — 순서가 곧 폼이 그려지는 순서다(개요 → 항목 → 안내 → 동의). */}
        <CollectFormSections config={config} patch={patch} />
      </div>

      {/* 미리보기는 임베드와 같은 모델·가시성 규칙을 읽는다 — 각자 그리면 반드시 갈라진다. */}
      <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
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
          <CollectFormRuntime
            config={config}
            sourceId={sourceId}
            forceStatus={previewState === "auto" ? undefined : previewState}
          />
        </div>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground/70">
          마감 화면은 마감 당일에 처음 보면 늦어요 — 상태를 바꿔 미리 확인하세요.
        </p>

        <PreviewLinkRow sourceId={sourceId} initialToken={previewToken} />
      </aside>
    </div>
  );
}

/**
 * 미리보기 링크 — 로그인 없이 열리는 /p/{token}.
 *
 * 옆칸 미리보기가 있는데도 링크가 필요한 이유: 확인해 줄 사람(전시 주최·법무·번역 담당)이
 * 워크스페이스 멤버가 아니다. 그래서 **끊을 수단**이 같은 자리에 붙어 있어야 한다 — 링크는
 * 메신저로 흘러가면 회수가 안 되고, 재발급만이 유일한 회수 방법이다.
 */
function PreviewLinkRow({ sourceId, initialToken }: { sourceId: string; initialToken: string | null }) {
  const confirm = useConfirm();
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  // 서버에서 그릴 땐 origin 을 모른다 — 클라이언트에서만 절대 주소를 만든다.
  const url = token ? `${typeof window === "undefined" ? "" : window.location.origin}/p/${token}` : "";

  const regenerate = async () => {
    const ok = await confirm({
      title: "미리보기 링크를 새로 발급할까요?",
      description: "지금 링크는 즉시 열리지 않게 됩니다. 이미 보낸 사람에게는 새 링크를 다시 보내야 해요.",
      confirmLabel: "새로 발급",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/regenerate-preview-token`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "재발급하지 못했어요"); return; }
      setToken(data.previewToken);
      toast.success("새 미리보기 링크를 발급했어요");
    } catch {
      toast.error("재발급하지 못했어요");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className={`${R.surface} bg-secondary/40 p-3 ${FINISH.s2}`}>
        <p className="text-[11px] leading-snug text-muted-foreground">
          이 소스에는 아직 미리보기 링크가 없어요.
        </p>
        <button type="button" onClick={regenerate} disabled={busy} className={`${btnCls("ghost")} mt-2 w-full justify-center`}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />링크 발급
        </button>
      </div>
    );
  }

  return (
    <div className={`${R.surface} bg-secondary/40 p-3 ${FINISH.s2}`}>
      <p className="text-[11px] font-semibold">미리보기 링크</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        로그인 없이 열려요. 링크를 받은 사람도 상태·언어를 바꿔 볼 수 있고, 제출해도 저장되지 않습니다.
      </p>
      <p className="mt-2 break-all rounded-lg bg-background px-2 py-1.5 font-mono text-[10px] leading-relaxed shadow-sm">/p/{token}</p>
      <div className="mt-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className={`${btnCls("ghost")} flex-1 justify-center`}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "복사됨" : "링크 복사"}
        </button>
        <a href={`/p/${token}`} target="_blank" rel="noopener noreferrer" className={`${btnCls("ghost")} justify-center`}>
          <ExternalLink className="h-3.5 w-3.5" />열기
        </a>
        <button type="button" onClick={regenerate} disabled={busy} title="새로 발급" aria-label="미리보기 링크 새로 발급" className={`${btnCls("ghost")} justify-center`}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}

export { DEFAULT_LOCALE };
