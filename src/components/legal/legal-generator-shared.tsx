"use client";

/**
 * 법률 문구 생성기 패널 — CollectSource·Competition 양쪽에서 같이 쓰는 조각.
 *
 * 워크스페이스 조직 정보 fetch·제3자 목록 편집기는 두 시스템에서 모양이 완전히 같다
 * (다른 건 저장 대상 스키마뿐이다). 여기 한 곳에 두면 세 번째 시스템이 생겨도 그대로 쓴다.
 */
import { useEffect, useState } from "react";
import { EditableList, ROW_KEY, withRowKeys } from "@/components/ui/editable-list";
import { FINISH, R } from "@/components/ui/primitives";
import type { ThirdParty, WorkspaceLegalProfile } from "@/lib/legal-templates";

/**
 * 워크스페이스의 법률 조직 정보를 읽어온다. 아직 안 채워져 있으면 null.
 *
 * **`useWorkspace()` 를 직접 부르지 않는다.** 이 훅을 쓰는 생성기 패널은 폼 빌더 렌더
 * 테스트처럼 `WorkspaceProvider` 없이 단독으로 마운트되는 자리에도 들어간다 — 컨텍스트를
 * 직접 물면 그 테스트들이 "must be used within WorkspaceProvider" 로 전부 깨진다.
 * 그래서 workspaceId 를 **호출부가 넘겨받아 전달**한다(페이지가 이미 useWorkspace() 로 안다).
 */
export function useWorkspaceLegalProfile(workspaceId: string | undefined): { profile: WorkspaceLegalProfile | null; loaded: boolean } {
  const [profile, setProfile] = useState<WorkspaceLegalProfile | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) return;
    (async () => {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setProfile(data.workspace?.legalProfile ?? null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  return { profile, loaded };
}

export function ThirdPartiesEditor({
  items,
  onChange,
}: {
  items: ThirdParty[];
  onChange: (next: ThirdParty[]) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-medium text-muted-foreground">제3자 제공 대상</span>
      <p className="mb-1.5 text-[11px] leading-snug text-muted-foreground/70">
        비워 두면 제3자 제공 동의 자체가 만들어지지 않아요.
      </p>
      <EditableList<ThirdParty & { [ROW_KEY]?: string }>
        listId="legal-thirdparty"
        itemNoun="제3자"
        items={withRowKeys(items)}
        onChange={(next) => onChange(next)}
        rowKey={(t) => t[ROW_KEY] ?? ""}
        addLabel="제3자 추가"
        makeItem={() => ({ name: "", purpose: "" })}
        emptyState={<p className="rounded-xl bg-secondary/40 p-3 text-center text-[11px] text-muted-foreground">없음</p>}
        renderRow={({ item, removeButton, patch: patchRow }) => (
          <div className={`${R.surface} flex items-center gap-1.5 bg-secondary p-2 ${FINISH.s2}`}>
            <input
              value={item.name}
              onChange={(e) => patchRow({ name: e.target.value })}
              placeholder="제공받는 자 (예: 공동주최 OOO)"
              aria-label="제공받는 자"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
            />
            <input
              value={item.purpose}
              onChange={(e) => patchRow({ purpose: e.target.value })}
              placeholder="제공 목적 (예: 경품 발송)"
              aria-label="제공 목적"
              className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/50"
            />
            {removeButton()}
          </div>
        )}
      />
    </div>
  );
}
