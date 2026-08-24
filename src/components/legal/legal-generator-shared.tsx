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
import { encodeOrgTokens, resolveOrgTokens, type OrgProfile, type ThirdParty, type WorkspaceLegalProfile } from "@/lib/legal-templates";

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

/**
 * 동의 전문(privacy/marketing/thirdParty body) 편집 칸.
 *
 * 저장된 값에는 `{{ORG_ADDRESS}}` 같은 조직 토큰이 들어 있을 수 있다(§legal-templates/tokens —
 * 워크스페이스 정보가 바뀌어도 재생성 없이 반영되게 하려고 일부러 남겨 둔다). 하지만 운영자가
 * 편집할 때 중괄호 문법을 보게 하면 "이게 뭐지, 왜 안 채워져 있지"로 읽힌다 — 실제로 그런
 * 피드백을 받았다("이런거 없게 입력할 수 있게 해줘! 입력폼으로 채우고싶어"). 그래서 화면에는
 * 항상 지금 조직 정보로 풀어 보여주고(`resolveOrgTokens`), 저장 직전에만 다시 토큰으로
 * 접어 넣는다(`encodeOrgTokens`) — 편집 경험은 "그냥 실제 값" 이면서 저장은 여전히 살아있게.
 *
 * blur 에만 저장하는 이유: 매 타이핑마다 풀고-접으면 커서가 있는 자리 앞뒤 글자 수가
 * (`{{ORG_ADDRESS}}` 열여섯 자 ↔ 실제 주소 길이) 달라져 커서가 튄다.
 */
export function ConsentBodyField({
  value,
  org,
  locale,
  onSave,
  placeholder,
  ariaLabel,
  rows = 2,
  className = "w-full resize-y rounded-lg bg-background px-2 py-1.5 text-[12px] shadow-sm outline-none",
}: {
  value: string;
  org: OrgProfile;
  locale: "en" | "ko";
  onSave: (nextRawValue: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  rows?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(() => resolveOrgTokens(value, org, locale));

  // 다른 곳에서 값이 바뀌었을 때(예: "생성" 버튼)만 다시 풀어서 보여준다 — 타이핑 중에
  // org 참조가 재계산돼도 내용이 같으면 이 effect 는 다시 안 돈다(호출부가 useMemo 로 넘긴다).
  useEffect(() => {
    setDraft(resolveOrgTokens(value, org, locale));
  }, [value, org, locale]);

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const encoded = encodeOrgTokens(draft, org);
        if (encoded !== value) onSave(encoded);
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      rows={rows}
      className={className}
    />
  );
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
