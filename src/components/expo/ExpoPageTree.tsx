"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { FINISH, R, SELECTED } from "@/components/ui/primitives";
import { EditableList } from "@/components/ui/editable-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { derivePageState } from "@/lib/expo/model";
import { objectParticle } from "@/lib/korean";
import type { ExpoPageState } from "@/lib/expo/types";

/**
 * 페이지 트리 — **만들고, 고르고, 순서를 바꾸고, 지운다.**
 *
 * ── 왜 이제야 붙나 ────────────────────────────────────────────────────
 * 서버는 처음부터 다 있었다(`PATCH /api/expo/{siteId}/pages` 순서, `DELETE /api/expo/pages/{id}`).
 * 화면에는 "+ 페이지" 만 있어서 **만들 수는 있는데 지우거나 옮길 수가 없었다.**
 *
 * ── 홈은 고정이다 ─────────────────────────────────────────────────────
 * 맨 위에 있고, 끌 수 없고, 지울 수 없다. 서버도 같은 판정을 한다
 * (`prepareDeletePage` 가 홈이면 거절, `prepareReorder` 가 홈을 앞으로 되돌린다).
 * 화면이 그 규칙을 미리 지키지 않으면 끌어다 놓은 순서가 저장 뒤에 되돌아간다.
 *
 * ── 삭제는 5초 유예다 ─────────────────────────────────────────────────
 * 확인 모달을 띄우지 않는다 — 되돌리기가 한 번의 클릭이고, 모달은 자주 하는 일을 느리게 만든다.
 * **단 공개 중인 페이지는 다르다:** 지우는 순간 파트너 사이트에서 그 페이지가 사라지므로
 * 확인 단계를 거친다. 되돌릴 수 있는 것과 밖에 나가 있는 것을 같은 무게로 다루지 않는다.
 *
 * 유예 중에는 그 페이지를 못 고친다. 실행취소로 되살아날 수 있는 것을 편집하게 두면
 * 되살린 뒤 무엇이 남아 있어야 하는지 아무도 모른다.
 *
 * ── 이름은 여기서 고친다 ──────────────────────────────────────────────
 * 행을 누르고 바로 타이핑한다(0클릭). 가운데 칸에도 이름 칸을 두지 않는 이유는 **같은 값을
 * 두 곳이 저장하면** 한쪽이 저장 중일 때 다른 쪽이 옛 값으로 덮는 경합이 생기기 때문이다.
 * 고르지 않은 페이지도 여기서 바로 고칠 수 있다 — 그게 트리에 두는 값어치다.
 */

export interface ExpoPageRow {
  id: string;
  title: string;
  isHome: boolean;
  hasPublished: boolean;
  liveAt: string | null;
}

export interface ExpoPageTreeProps {
  siteId: string;
  pages: ExpoPageRow[];
  selectedId: string | null;
  canEdit: boolean;
  /** 페이지 제목은 공유 초안 훅에서만 고칠 때 false. */
  canRename?: boolean;
  /** 삭제는 `canManageSite` 다 — 서버도 역할까지 본다. */
  canManageSite: boolean;
  onSelect: (pageId: string) => void;
  onAdd: () => void;
  /** 목록을 다시 읽는다(생성·삭제·순서 변경 뒤). */
  onReload: () => void;
  /** 유예로 화면에서 사라진 페이지들 — 편집기와 발행 패널이 이걸 보고 잠근다. */
  onPendingChange: (pendingIds: ReadonlySet<string>) => void;
}

const STATE_LABEL: Record<ExpoPageState, string> = {
  draft: "초안",
  published: "발행됨",
  live: "공개 중",
};

/** 상태는 색만으로 구분하지 않는다 — 점 + 글자를 함께 준다. */
const STATE_DOT: Record<ExpoPageState, string> = {
  draft: "bg-muted-foreground/40",
  published: "bg-amber-500",
  live: "bg-emerald-500",
};

export function ExpoPageTree({
  siteId, pages, selectedId, canEdit, canRename = canEdit, canManageSite,
  onSelect, onAdd, onReload, onPendingChange,
}: ExpoPageTreeProps) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  /** 낙관적 순서 — 서버 왕복을 기다리는 동안 화면이 멈추지 않게. */
  const [order, setOrder] = useState<string[] | null>(null);

  /**
   * 홈을 맨 앞으로. 서버가 저장할 때 그렇게 하므로(`prepareReorder`) 화면도 그렇게 둔다 —
   * 아니면 끌어다 놓은 자리가 저장 뒤에 되돌아간다.
   */
  const pinHome = useCallback((rows: ExpoPageRow[]) => {
    const home = rows.filter((p) => p.isHome);
    return home.length ? [...home, ...rows.filter((p) => !p.isHome)] : rows;
  }, []);

  const rows = useMemo(() => {
    if (!order) return pinHome(pages);
    const byId = new Map(pages.map((p) => [p.id, p]));
    const sorted = order.map((id) => byId.get(id)).filter((p): p is ExpoPageRow => Boolean(p));
    // 낙관적 순서에 없는(그 사이 새로 생긴) 페이지는 뒤에 붙인다 — 사라지면 안 된다.
    const rest = pages.filter((p) => !order.includes(p.id));
    return pinHome([...sorted, ...rest]);
  }, [pages, order, pinHome]);

  const reorder = useCallback(async (next: ExpoPageRow[]) => {
    const pinned = pinHome(next);
    setOrder(pinned.map((p) => p.id));
    try {
      const res = await fetch(`/api/expo/${encodeURIComponent(siteId)}/pages`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order: pinned.map((p) => p.id) }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "순서를 바꾸지 못했어요");
        setOrder(null); // 서버 순서로 되돌린다.
        return;
      }
      onReload();
    } catch {
      toast.error("순서를 바꾸지 못했어요. 연결을 확인해 주세요.");
      setOrder(null);
    }
  }, [siteId, pinHome, onReload]);

  /**
   * 고치는 중인 이름. 서버 값을 그대로 쓰면 저장 왕복 동안 글자가 되돌아간다.
   * 저장이 끝나 목록을 다시 읽으면 지운다.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const pending = timers.current;
    return () => { Object.values(pending).forEach(clearTimeout); };
  }, []);

  const saveTitle = useCallback(async (pageId: string, title: string) => {
    const trimmed = title.trim();
    // 빈 이름은 보내지 않는다 — 서버가 "제목 없음" 으로 바꿔 버리면 지우던 중에 이름이 뒤바뀐다.
    if (!trimmed) return;
    try {
      const res = await fetch(`/api/expo/pages/${encodeURIComponent(pageId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "이름을 바꾸지 못했어요");
        return;
      }
      // 서버 값이 오면 고치던 값을 놓는다 — 서버가 자른 결과가 화면에 보여야 한다.
      setDrafts((prev) => { const next = { ...prev }; delete next[pageId]; return next; });
      onReload();
    } catch {
      toast.error("이름을 바꾸지 못했어요. 연결을 확인해 주세요.");
    }
  }, [onReload]);

  const editTitle = useCallback((pageId: string, title: string) => {
    setDrafts((prev) => ({ ...prev, [pageId]: title }));
    if (timers.current[pageId]) clearTimeout(timers.current[pageId]);
    timers.current[pageId] = setTimeout(() => { void saveTitle(pageId, title); }, 600);
  }, [saveTitle]);

  /** 포커스를 떠나면 기다리지 않고 보낸다 — 다 쳤다는 신호다. */
  const flushTitle = useCallback((pageId: string) => {
    const pending = drafts[pageId];
    if (pending === undefined) return;
    if (timers.current[pageId]) clearTimeout(timers.current[pageId]);
    void saveTitle(pageId, pending);
  }, [drafts, saveTitle]);

  /** 유예가 끝났다 — 이제야 서버에 지운다. 정확히 한 번. */
  const removeNow = useCallback(async (page: ExpoPageRow) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/expo/pages/${encodeURIComponent(page.id)}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error((await res.json().catch(() => ({}))).error ?? "페이지를 지우지 못했어요");
        return;
      }
      // 지운 페이지를 보고 있었으면 다른 페이지로 옮긴다 — 없는 페이지를 편집하게 두지 않는다.
      if (page.id === selectedId) {
        const next = rows.find((p) => p.id !== page.id && p.isHome) ?? rows.find((p) => p.id !== page.id);
        if (next) onSelect(next.id);
      }
      setOrder(null);
      onReload();
    } catch {
      toast.error("페이지를 지우지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }, [selectedId, rows, onSelect, onReload]);

  /**
   * 공개 중인 페이지는 지우는 순간 파트너 사이트에서 사라진다 — 그건 확인받을 일이다.
   * 그 밖에는 5초 유예가 곧 확인이므로 모달을 띄우지 않는다.
   */
  const guardedRemove = useCallback(async (page: ExpoPageRow, request: () => void) => {
    if (page.liveAt) {
      const ok = await confirm({
        title: "지금 공개 중인 페이지예요",
        description:
          `지우면 붙여 둔 자리에서 바로 사라집니다. ${objectParticle(page.title)} 지울까요?`,
        confirmLabel: "지우기",
        tone: "danger",
      });
      if (!ok) return;
    }
    request();
  }, [confirm]);

  return (
    <nav className={`${R.panel} ${FINISH.s1} bg-card p-2`} aria-label="페이지">
      <EditableList<ExpoPageRow>
        listId={`expo-pages-${siteId}`}
        itemNoun="페이지"
        items={rows}
        /**
         * `EditableList` 는 **순서 변경과 삭제 확정 둘 다** 이 콜백으로 알린다.
         * 구분하지 않으면 지운 페이지가 순서 목록에서만 빠지고, 서버의 `prepareReorder` 는
         * 빠진 페이지를 "잘려 온 목록" 으로 보고 **맨 뒤에 도로 붙인다** — 지웠는데 안 지워진다.
         * 사라진 행이 있으면 그건 삭제다.
         */
        onChange={(next) => {
          const removed = rows.find((page) => !next.some((n) => n.id === page.id));
          if (removed) { void removeNow(removed); return; }
          void reorder(next);
        }}
        rowKey={(page) => page.id}
        reorderable={canEdit}
        rowChrome="bare"
        removable={(page) => canManageSite && !page.isHome}
        onPendingRemoveChange={onPendingChange}
        renderAdd={() =>
          canEdit ? (
            <button
              type="button"
              onClick={onAdd}
              disabled={busy}
              className={`flex w-full items-center gap-2 ${R.control} px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-60`}
            >
              <Plus className="h-4 w-4" aria-hidden />
              페이지
            </button>
          ) : null
        }
        renderRow={({ item, handle, removeButton, requestRemove }) => {
          const state = derivePageState({
            published: item.hasPublished ? {} : null,
            liveAt: item.liveAt,
          });
          const active = item.id === selectedId;
          return (
            <div
              className={`flex items-center gap-1 ${R.control} pr-1 transition-colors ${
                active ? SELECTED : "hover:bg-secondary"
              }`}
            >
              {/**
                * 홈에는 핸들을 주지 않는다. 끌 수는 있는데 `pinHome` 이 곧바로 제자리로
                * 되돌리므로, 핸들이 있으면 **없는 기능을 있는 것처럼** 보여 주게 된다.
                * 자리는 남겨 둔다 — 안 그러면 홈 행만 왼쪽으로 밀려 목록이 어긋난다.
                */}
              {item.isHome ? <span className="block h-9 w-9 shrink-0" aria-hidden /> : handle}
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[state]}`} aria-hidden />
              {canRename ? (
                /* 0클릭 — 누르고 바로 친다. 포커스가 곧 선택이라 키보드로도 같은 흐름이다. */
                <input
                  value={drafts[item.id] ?? item.title}
                  onChange={(event) => editTitle(item.id, event.target.value)}
                  onFocus={() => onSelect(item.id)}
                  onBlur={() => flushTitle(item.id)}
                  onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
                  maxLength={120}
                  aria-label={`${item.title} 이름`}
                  aria-current={active ? "page" : undefined}
                  className="min-w-0 flex-1 truncate bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground/50"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? "page" : undefined}
                  className="min-w-0 flex-1 truncate py-2 text-left text-sm"
                >
                  {item.title}
                </button>
              )}
              {item.isHome ? (
                <span className="shrink-0 text-[11px] text-muted-foreground">홈</span>
              ) : null}
              <span className="sr-only">{STATE_LABEL[state]}</span>
              {removeButton({
                label: `${item.title} 페이지 삭제`,
                onClick: () => void guardedRemove(item, requestRemove),
              })}
            </div>
          );
        }}
      />
    </nav>
  );
}
