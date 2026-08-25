"use client";

import { useCallback, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Field, FieldArea, FINISH, R, Segmented } from "@/components/ui/primitives";
import { ExpoChecklist } from "@/components/expo/ExpoChecklist";
import type { ChecklistItem } from "@/lib/expo/template-service";

/**
 * 이 사이트를 **다음 전시가 쓸 틀로** 저장한다.
 *
 * ── 왜 이 화면이 필요했나 ────────────────────────────────────────────
 * 만들기 화면은 이미 템플릿 목록을 보여 주고 "홈페이지를 하나 완성하면 템플릿으로 저장할
 * 수 있어요" 라고 적어 두었는데, **저장하는 길이 어디에도 없었다.** 지키지 못하는 약속이었다.
 *
 * ── 접어 두는 이유 ────────────────────────────────────────────────────
 * 전시 하나에 한 번 있을까 한 동작이라 항상 펼쳐 두면 매일 쓰는 색·페이지 목록을 밀어낸다.
 * 대신 **값을 고치는 순간부터는 접지 않는다** — 이름·설명·범위는 여기서 고쳐지는 값이라
 * 폼이 열리면 전부 보인다(AGENTS.md §2 의 판별 질문 2: 저빈도 × 짧은 세부 = 가까운 확장).
 *
 * ── 파괴적이지 않다 ───────────────────────────────────────────────────
 * 새 템플릿을 만들 뿐 이 사이트는 건드리지 않는다. 그래서 확인 단계를 두지 않는다.
 */
export function ExpoTemplateSave({ siteId, siteName }: { siteId: string; siteName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(siteName);
  const [description, setDescription] = useState("");
  const [contentMode, setContentMode] = useState<"design" | "full">("design");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<{ name: string; checklist: ChecklistItem[] } | null>(null);

  const save = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("템플릿 이름을 입력해 주세요");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/expo/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteId, name: trimmed, description, contentMode }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        template?: { name: string };
        checklist?: ChecklistItem[];
        error?: string;
        errors?: { message: string }[];
      };
      if (!res.ok) {
        // 필드 오류가 오면 그걸 먼저 — "저장하지 못했어요" 보다 무엇을 고칠지 말해 준다.
        toast.error(body.errors?.[0]?.message ?? body.error ?? "템플릿을 저장하지 못했어요");
        return;
      }
      setSaved({ name: body.template?.name ?? trimmed, checklist: body.checklist ?? [] });
      setOpen(false);
    } catch {
      toast.error("템플릿을 저장하지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [name, description, contentMode, siteId]);

  return (
    <section className={`${R.panel} ${FINISH.s1} space-y-2 bg-card p-3`} aria-labelledby="expo-template-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="expo-template-heading" className="text-sm font-semibold">템플릿</h2>
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`inline-flex min-h-8 items-center gap-1.5 ${R.control} px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            저장
          </button>
        ) : null}
      </div>

      {saved ? (
        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed">
            <span className="font-medium">&ldquo;{saved.name}&rdquo; 로 저장했어요.</span>
            <span className="mt-0.5 block text-muted-foreground">
              다음 전시에서 홈페이지를 만들 때 고를 수 있어요.
            </span>
          </p>
          {/* 저장 시점에도 끊어 둔 것을 말한다 — 다음 전시가 그걸 이어야 한다. */}
          <ExpoChecklist items={saved.checklist} title="이 템플릿을 쓸 때 이어서 할 일" />
        </div>
      ) : null}

      {open ? (
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">템플릿 이름</span>
            <Field
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              className="mt-0.5"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">설명</span>
            <FieldArea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              placeholder="다음 전시가 고를 때 보이는 설명"
              className="mt-0.5"
            />
          </label>

          <div>
            <span className="block text-[11px] font-medium text-muted-foreground">가져갈 범위</span>
            <Segmented
              className="mt-0.5"
              label="템플릿이 가져갈 범위"
              value={contentMode}
              onChange={setContentMode}
              options={[
                { value: "design", label: "구조만" },
                { value: "full", label: "문구까지" },
              ]}
            />
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {contentMode === "full"
                ? "문구와 이미지까지 가져가요. 다음 전시가 고쳐 쓸 초안으로 좋아요."
                : "구획 배치와 색만 가져가요. 문구·이미지는 새로 씁니다."}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className={`inline-flex min-h-9 items-center gap-1.5 ${R.control} ${FINISH.control} bg-violet-500 px-3 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-60`}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              템플릿으로 저장
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              className={`inline-flex min-h-9 items-center ${R.control} px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60`}
            >
              취소
            </button>
          </div>
        </div>
      ) : saved ? null : (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          이 홈페이지의 구조를 저장해 두면 다음 전시가 골라 쓸 수 있어요.
          사전등록 소스·내부 링크·아임웹 주소는 전시마다 다르므로 가져가지 않아요.
        </p>
      )}
    </section>
  );
}
