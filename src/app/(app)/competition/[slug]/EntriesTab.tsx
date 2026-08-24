"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { InlineError } from "@/components/ui/inline-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Switch } from "@/components/ui/switch";
import { FINISH, R } from "@/components/ui/primitives";
import { formatKst } from "@/lib/datetime";
import { normalizeMedia, youtubeThumbnailUrl } from "@/lib/competition-config";
import type { CompetitionDetail } from "./page";

interface Entry {
  id: string;
  entryNo: string;
  title: string;
  teamName: string | null;
  summary: string | null;
  media: unknown;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  isPublished: boolean;
  sortOrder: number;
  advanced: boolean;
  submittedAt: string;
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  submitted: { label: "접수", tone: "bg-secondary text-muted-foreground" },
  approved: { label: "승인", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rejected: { label: "반려", tone: "bg-red-500/10 text-red-500" },
};

export default function EntriesTab({
  competition,
  onCountChange,
}: {
  competition: CompetitionDetail;
  onCountChange: (count: number) => void;
}) {
  const confirm = useConfirm();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/competitions/${competition.id}/entries`);
      if (!res.ok) { setLoadError(true); return; }
      const data = await res.json();
      setEntries(data.entries ?? []);
      onCountChange((data.entries ?? []).length);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [competition.id, onCountChange]);

  useEffect(() => { void Promise.resolve().then(fetchEntries); }, [fetchEntries]);

  const patchEntry = async (entry: Entry, body: Record<string, unknown>) => {
    // 낙관적 반영 — 토글은 즉각 반응해야 한다. 실패하면 되돌린다.
    const before = entry;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, ...body } as Entry : e)));
    const res = await fetch(`/api/competitions/${competition.id}/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? before : e)));
      toast.error("변경에 실패했어요");
    }
  };

  const removeEntry = async (entry: Entry) => {
    const ok = await confirm({
      title: `${entry.entryNo}번 '${entry.title}'을(를) 삭제할까요?`,
      description: "투표·심사 기록이 함께 삭제되고 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    const res = await fetch(`/api/competitions/${competition.id}/entries/${entry.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== entry.id);
      onCountChange(next.length);
      return next;
    });
    toast.success("참가작을 삭제했어요");
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (loadError) return <InlineError message="참가작을 불러오지 못했어요" onRetry={fetchEntries} />;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
        <Users className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">아직 신청이 없어요</p>
        <p className="mt-1 text-xs text-muted-foreground/70">공고 페이지를 배포하면 여기에 쌓입니다</p>
      </div>
    );
  }

  const publishedCount = entries.filter((e) => e.isPublished).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        전체 {entries.length}건 · 투표 노출 {publishedCount}건 — <b>노출</b>을 켠 참가작만 투표 화면에 나옵니다.
      </p>

      <div className="space-y-2">
        {entries.map((entry) => {
          const media = normalizeMedia(entry.media);
          const thumb = media.find((m) => m.kind === "image");
          const video = media.find((m) => m.kind === "youtube");
          const status = STATUS_META[entry.status] ?? STATUS_META.submitted;
          return (
            <div key={entry.id} className={`flex flex-wrap items-center gap-3 bg-background p-3 ${R.surface} ${FINISH.s2}`}>
              <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold text-muted-foreground">
                {entry.entryNo}
              </span>

              <div className="h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-secondary">
                {thumb?.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb.url} alt="" className="h-full w-full object-cover" />
                ) : video?.kind === "youtube" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={youtubeThumbnailUrl(video.videoId)} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{entry.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${status.tone}`}>{status.label}</span>
                  {entry.advanced && (
                    <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                      본선
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {[entry.teamName, entry.contactName, entry.contactEmail].filter(Boolean).join(" · ")}
                </p>
                <p className="text-[10px] text-muted-foreground/70">{formatKst(entry.submittedAt)}</p>
              </div>

              {video?.kind === "youtube" && (
                <a
                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title="영상 보기"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}

              <select
                value={entry.status}
                onChange={(e) => patchEntry(entry, { status: e.target.value })}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-violet-400"
              >
                <option value="submitted">접수</option>
                <option value="approved">승인</option>
                <option value="rejected">반려</option>
              </select>

              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                노출
                <Switch
                  checked={entry.isPublished}
                  onChange={(v) => patchEntry(entry, { isPublished: v })}
                  label="투표 노출"
                  disabled={entry.status === "rejected"}
                />
              </label>

              <button
                onClick={() => removeEntry(entry)}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                aria-label="삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
