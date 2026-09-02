"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { FINISH, R } from "@/components/ui/primitives";

export interface RevisionListItem {
  id: string;
  sequence: number;
  codeDigest: string;
  publishedBy: string;
  publisher: { id: string; name: string | null; email: string | null } | null;
  createdAt: string;
  summary: { preset?: string; sectionCount: number; campaignCount: number; destinationCount: number };
}

export interface ExpoRevisionPanelProps {
  pageId: string;
  canPublish: boolean;
  request?: (path: string, init?: RequestInit) => Promise<Response>;
  /** 성공 뒤 부모가 발행본 미리보기만 새로 읽는다. 초안은 이 패널이 만지지 않는다. */
  onRolledBack(sequence: number): void;
}

export function ExpoRevisionPanel({ pageId, canPublish, request, onRolledBack }: ExpoRevisionPanelProps) {
  const confirm = useConfirm();
  const [revisions, setRevisions] = useState<RevisionListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 주입값이 없을 때만 전역 transport 를 쓴다. SSR 렌더 중에는 window 를 읽지 않고,
  // fallback 참조는 안정적이라 이력 조회 effect 가 반복되지 않는다.
  const fallbackRequest = useCallback((path: string, init?: RequestInit) => window.fetch(path, init), []);
  const requester = request ?? fallbackRequest;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await requester(`/api/expo/pages/${encodeURIComponent(pageId)}/revisions`, { cache: "no-store" });
      if (!response.ok) throw new Error("history");
      const body = await response.json() as { revisions?: RevisionListItem[] };
      setRevisions(Array.isArray(body.revisions) ? body.revisions : []);
    } catch {
      toast.error("발행 이력을 불러오지 못했어요.");
    } finally {
      setLoading(false);
    }
  }, [pageId, requester]);

  useEffect(() => { void load(); }, [load]);

  const rollback = useCallback(async (revision: RevisionListItem) => {
    const approved = await confirm({
      title: `버전 ${revision.sequence} 발행본으로 복구할까요?`,
      description: "현재 초안은 그대로 두고, 이 발행본을 새 버전으로 다시 발행합니다.",
      confirmLabel: "발행본으로 복구",
      tone: "danger",
    });
    if (!approved) return;
    setBusyId(revision.id);
    setNotice(null);
    try {
      const response = await requester(
        `/api/expo/pages/${encodeURIComponent(pageId)}/revisions/${encodeURIComponent(revision.id)}/rollback`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      );
      const body = await response.json().catch(() => ({})) as { error?: string; revision?: { sequence?: number } };
      if (!response.ok || !Number.isFinite(body.revision?.sequence)) {
        toast.error(body.error ?? "발행본을 복구하지 못했어요.");
        return;
      }
      const sequence = body.revision!.sequence!;
      setNotice(`버전 ${sequence}로 복구했어요`);
      onRolledBack(sequence);
      // 새 revision 이 추가됐으므로 이력만 다시 읽는다. 초안 상태를 덮어쓰지 않는다.
      await load();
    } catch {
      toast.error("발행본을 복구하지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setBusyId(null);
    }
  }, [confirm, load, onRolledBack, pageId, requester]);

  return (
    <section className={`${R.panel} ${FINISH.s1} space-y-3 bg-card p-3`} aria-labelledby="expo-revision-heading">
      <div>
        <h2 id="expo-revision-heading" className="text-sm font-semibold">발행 이력</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">복구해도 편집 중인 초안은 바뀌지 않아요.</p>
      </div>
      {notice ? <p role="status" className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
      {loading ? <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />불러오는 중…</p> : null}
      {!loading && revisions.length === 0 ? <p className="text-[11px] text-muted-foreground">아직 발행 이력이 없어요.</p> : null}
      {!loading ? <ul className="space-y-2">{revisions.map((revision) => (
        <li key={revision.id} className={`${R.surface} ${FINISH.s2} bg-secondary p-2.5`}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-[11px]">
              <p className="font-medium">버전 {revision.sequence}</p>
              <p className="mt-0.5 text-muted-foreground">{new Date(revision.createdAt).toLocaleString()} · {revision.publisher?.name ?? revision.publisher?.email ?? "삭제된 사용자"}</p>
              <p className="mt-1 text-muted-foreground">{revision.summary.preset ?? "사용자 설정"} · 구획 {revision.summary.sectionCount} · 캠페인 {revision.summary.campaignCount} · 이동 {revision.summary.destinationCount}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{revision.codeDigest.slice(0, 12)}</p>
            </div>
            {canPublish ? <button type="button" disabled={busyId !== null} onClick={() => void rollback(revision)} className={`shrink-0 ${R.control} px-2 py-1 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50`}>
              {busyId === revision.id ? "복구 중…" : `버전 ${revision.sequence} 복구`}
            </button> : null}
          </div>
        </li>
      ))}</ul> : null}
    </section>
  );
}
