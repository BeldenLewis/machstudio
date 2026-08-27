"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FilePlus2, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { ExpoChecklist } from "@/components/expo/ExpoChecklist";
import type { ChecklistItem } from "@/lib/expo/template-service";

/**
 * 홈페이지 만들기 — **빈 사이트**와 **템플릿**을 나란히 놓는다.
 *
 * ── 왜 선택을 접지 않나 ───────────────────────────────────────────────
 * 이 화면에서 고르는 값은 딱 두 개(무엇으로 시작할지, 이름)이고 **여기서 고쳐진다.**
 * 그래서 드롭다운이나 다음 단계 뒤에 숨기지 않고 둘 다 바로 보여 준다.
 *
 * ── 여기서 만드는 것은 전부 비공개다 ──────────────────────────────────
 * 발행도, 공개 스위치도, 아임웹 연결도 하지 않는다. 템플릿을 골랐다는 이유로 지난
 * 전시 문구가 파트너 사이트에 나가는 일은 없어야 한다.
 */

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  contentMode: "design" | "full";
  pageCount: number;
}

export function ExpoCreateChoices() {
  const router = useRouter();
  const { workspace, currentProject, isLoading } = useWorkspace();

  const [name, setName] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * 만들었는데 **이어서 할 일이 있는** 상태. 곧바로 편집기로 보내면 그 목록을 아무도
   * 못 읽는다 — 템플릿은 사전등록 소스·내부 링크·아임웹 주소를 일부러 비우는데,
   * 비웠다는 사실을 모르면 다 된 줄 알고 발행한다.
   * 할 일이 없으면 이 화면을 거치지 않고 바로 보낸다.
   */
  const [handoff, setHandoff] = useState<{ siteId: string; checklist: ChecklistItem[] } | null>(null);

  const generation = useMemo(
    () => (workspace && currentProject ? `${workspace.id}:${currentProject.id}` : ""),
    [workspace, currentProject],
  );
  const latest = useRef("");

  useEffect(() => {
    if (isLoading || !generation) return;
    latest.current = generation;
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/expo/templates", { signal: controller.signal, cache: "no-store" });
        // 워크스페이스를 바꾼 뒤 도착한 응답은 버린다 — 남의 템플릿 목록이 보이면 안 된다.
        if (latest.current !== generation) return;
        setTemplates(res.ok ? ((await res.json()).templates as TemplateRow[]) : []);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        setTemplates([]);
      }
    })();
    return () => controller.abort();
  }, [generation, isLoading]);

  const createBlank = useCallback(async () => {
    if (!currentProject) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("홈페이지 이름을 입력해 주세요");
      return;
    }
    setBusy("blank");
    try {
      const res = await fetch("/api/expo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, name: trimmed }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "만들지 못했어요");
        return;
      }
      const { site } = await res.json();
      router.replace(`/homepage/${site.id}`);
    } finally {
      setBusy(null);
    }
  }, [currentProject, name, router]);

  const instantiate = useCallback(async (templateId: string) => {
    if (!currentProject) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("홈페이지 이름을 입력해 주세요");
      return;
    }
    setBusy(templateId);
    try {
      const res = await fetch(`/api/expo/templates/${encodeURIComponent(templateId)}/instantiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: currentProject.id, name: trimmed }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "만들지 못했어요");
        return;
      }
      const { site, checklist } = (await res.json()) as {
        site: { id: string };
        checklist?: ChecklistItem[];
      };
      // 할 일이 없으면 한 번 더 누르게 하지 않는다.
      if (!checklist || checklist.length === 0) {
        router.replace(`/homepage/${site.id}`);
        return;
      }
      setHandoff({ siteId: site.id, checklist });
    } finally {
      setBusy(null);
    }
  }, [currentProject, name, router]);

  if (handoff) {
    return (
      <div className="mt-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">홈페이지를 만들었어요</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            템플릿은 지난 전시의 연결을 일부러 비웁니다 — 그대로 두면 그 자리가 공개 화면에서
            빠지거나 아무 데도 가지 않는 버튼이 돼요.
          </p>
        </div>

        <ExpoChecklist items={handoff.checklist} />

        <button
          type="button"
          onClick={() => router.replace(`/homepage/${handoff.siteId}`)}
          className="inline-flex min-h-9 items-center rounded-xl bg-violet-500 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600"
        >
          홈페이지 열기
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <label className="block">
        <span className="text-sm font-medium">홈페이지 이름</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="예: 2026 에듀테크 코리아"
          maxLength={120}
          className="mt-1.5 block w-full rounded-xl bg-card px-3.5 py-2.5 text-sm shadow-sm outline-none transition-shadow focus:shadow-md"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          운영자만 보는 이름이에요. 나중에 바꿀 수 있어요.
        </span>
      </label>

      <section>
        <h2 className="text-sm font-semibold">무엇으로 시작할까요</h2>

        <button
          type="button"
          onClick={createBlank}
          disabled={busy !== null}
          className="mt-3 flex w-full items-start gap-3 rounded-xl bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
        >
          <FilePlus2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block text-sm font-medium">빈 사이트</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              홈 페이지 하나로 시작해요. 구획은 직접 추가합니다.
            </span>
          </span>
          {busy === "blank" ? <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden /> : null}
        </button>

        {templates === null ? (
          <p className="mt-3 flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            템플릿을 불러오는 중…
          </p>
        ) : templates.length === 0 ? (
          <p className="mt-3 px-1 text-xs text-muted-foreground">
            저장된 템플릿이 아직 없어요. 홈페이지를 하나 완성하면 템플릿으로 저장할 수 있어요.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {templates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => instantiate(template.id)}
                  disabled={busy !== null}
                  className="flex w-full items-start gap-3 rounded-xl bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
                >
                  <Layers className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{template.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {/*
                        `design` 이 기본값이라는 것을 여기서 설명한다 — 운영자가 "왜 문구가
                        안 왔지" 로 헤매지 않게. 이건 선택이 아니라 그 템플릿의 성질이다.
                      */}
                      {template.contentMode === "full"
                        ? `구조와 문구까지 · 페이지 ${template.pageCount}개`
                        : `구조만(문구·이미지는 새로 씁니다) · 페이지 ${template.pageCount}개`}
                    </span>
                    {template.description ? (
                      <span className="mt-1 block whitespace-pre-wrap text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    ) : null}
                  </span>
                  {busy === template.id ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="px-1 text-xs text-muted-foreground">
        만든 홈페이지는 <strong className="font-semibold">비공개</strong>로 시작해요.
        발행과 공개는 나중에 따로 켭니다.
      </p>

      <Link href="/homepage?list=1" className="inline-block px-1 text-sm underline underline-offset-4">
        목록으로
      </Link>
    </div>
  );
}
