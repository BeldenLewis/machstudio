"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Search, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatKstDateTime } from "@/lib/datetime";
import ModalShell from "./ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface SampleRecord { id: string; createdAt: string; data: Record<string, unknown> }
interface Props { sourceId: string; onClose: () => void; onChanged: () => void }

export default function GdprModal({ sourceId, onClose, onChanged }: Props) {
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ matched: number; sample: SampleRecord[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleAnalyze = async () => {
    if (search.trim().length < 3) { toast.error("검색어는 3자 이상"); return; }
    setAnalyzing(true);
    setResult(null);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/gdpr`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "검색 실패"); return; }
      setResult({ matched: data.matched, sample: data.sample });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDelete = async () => {
    if (!result || result.matched === 0) return;
    if (!(await confirm({ title: "영구 삭제할까요?", description: `${result.matched}건을 영구 삭제해요. 되돌릴 수 없어요.`, confirmLabel: "삭제", tone: "danger" }))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/gdpr`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, dryRun: false }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "삭제 실패"); return; }
      toast.success(`${data.deleted}건 삭제됐어요`);
      onChanged();
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModalShell open onClose={onClose} title="개인정보 검색 · 삭제 (GDPR)" size="md">
      <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            특정 사용자의 개인정보(이메일, 전화번호 등) 검색 → 일괄 삭제. <b>right-to-erasure</b> 요청 대응용.
          </p>

          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="예: 010-1234-5678 또는 user@example.com"
              className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400 transition-colors"
            />
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={handleAnalyze}
              disabled={analyzing}
              className="px-3 py-2 rounded-xl bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 disabled:opacity-40 transition-colors"
            >
              {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : "검색"}
            </motion.button>
          </div>

          <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={spring}
              className="space-y-3"
            >
              <div className="p-3 rounded-xl border border-border bg-secondary/30">
                <p className="text-sm">매칭: <b className={result.matched > 0 ? "text-red-500" : ""}>{result.matched.toLocaleString()}건</b></p>
              </div>
              {result.sample.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">미리보기 (상위 10건)</p>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {result.sample.map((r) => (
                      <div key={r.id} className="px-3 py-2 rounded-lg border border-border text-[11px]">
                        <div className="text-muted-foreground">{formatKstDateTime(r.createdAt)} KST</div>
                        <pre className="text-[10px] mt-1 font-mono break-all whitespace-pre-wrap">{JSON.stringify(r.data, null, 2).slice(0, 300)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.matched > 0 && (
                <>
                  <div className="flex items-start gap-2 p-3 rounded-xl border border-red-500/30 bg-red-500/5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-red-700 dark:text-red-400">되돌릴 수 없어요. 필요하다면 먼저 백업 받으세요.</p>
                  </div>
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.96 }}
                    transition={spring}
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-40 transition-colors"
                  >
                    {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    {result.matched.toLocaleString()}건 영구 삭제
                  </motion.button>
                </>
              )}
            </motion.div>
          )}
          </AnimatePresence>
      </div>
    </ModalShell>
  );
}
