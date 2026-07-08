"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Check, Sparkles, AlertTriangle } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import ModalShell from "./ModalShell";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface FieldMapping {
  id: string;
  key: string;
  label: string;
}

interface Props {
  sourceId: string;
  fieldMappings: FieldMapping[];
  onClose: () => void;
  onApplied: () => void;
}

type Op = "trim" | "lowercase_email" | "phone_digits";

const OPS: { id: Op; label: string; desc: string }[] = [
  { id: "trim", label: "공백 제거", desc: "모든 텍스트 필드의 앞뒤 공백을 제거합니다" },
  { id: "lowercase_email", label: "이메일 소문자 통일", desc: "이메일 컬럼의 값을 모두 소문자로" },
  { id: "phone_digits", label: "휴대폰 숫자만", desc: "휴대폰/전화 컬럼에서 -, 공백, 괄호 등을 제거 (예: 01012345678)" },
];

export default function NormalizeModal({ sourceId, fieldMappings, onClose, onApplied }: Props) {
  const confirm = useConfirm();
  const [selectedOps, setSelectedOps] = useState<Set<Op>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<{ changedRows: number; changedCells: number } | null>(null);

  const toggleOp = (op: Op) => {
    setSelectedOps((prev) => {
      const next = new Set(prev);
      if (next.has(op)) next.delete(op); else next.add(op);
      return next;
    });
    setPreview(null);
  };

  const handleAnalyze = async () => {
    if (selectedOps.size === 0) { toast.error("작업을 하나 이상 선택해주세요"); return; }
    setAnalyzing(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/records/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: Array.from(selectedOps), dryRun: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "분석 실패"); return; }
      setPreview({ changedRows: data.changedRows, changedCells: data.changedCells });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!preview || preview.changedRows === 0) return;
    if (!(await confirm({ title: "레코드를 수정할까요?", description: `${preview.changedRows}건의 레코드를 수정해요.`, confirmLabel: "수정" }))) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/collect-sources/${sourceId}/records/normalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: Array.from(selectedOps) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "적용 실패"); return; }
      toast.success(`${data.applied}건 정규화됐어요`);
      onApplied();
      onClose();
    } finally {
      setApplying(false);
    }
  };

  return (
    <ModalShell open onClose={onClose} title="데이터 정규화" size="sm" footer={
      preview && preview.changedRows > 0 ? (
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={handleApply}
          disabled={applying}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40"
        >
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {applying ? "적용 중..." : `${preview.changedRows}건 정규화 적용`}
        </motion.button>
      ) : null
    }>
      <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            모든 레코드를 일괄 변환합니다. 이메일/휴대폰 컬럼은 필드 키와 라벨로 자동 식별돼요.
          </p>

          <div className="space-y-2">
            {OPS.map((op) => (
              <label key={op.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background hover:bg-secondary/40 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedOps.has(op.id)}
                  onChange={() => toggleOp(op.id)}
                  className="mt-0.5 accent-violet-500 cursor-pointer"
                />
                <div>
                  <p className="text-sm font-medium">{op.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{op.desc}</p>
                </div>
              </label>
            ))}
          </div>

          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={handleAnalyze}
            disabled={analyzing || selectedOps.size === 0}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-40"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {analyzing ? "분석 중..." : "변경 사항 분석"}
          </motion.button>

          <AnimatePresence>
          {preview && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={spring}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-border bg-secondary/30">
                  <p className="text-[11px] text-muted-foreground">변경될 레코드</p>
                  <p className={`text-xl font-semibold mt-0.5 ${preview.changedRows > 0 ? "text-violet-500" : ""}`}>{preview.changedRows.toLocaleString()}</p>
                </div>
                <div className="p-3 rounded-xl border border-border bg-secondary/30">
                  <p className="text-[11px] text-muted-foreground">변경될 셀</p>
                  <p className="text-xl font-semibold mt-0.5">{preview.changedCells.toLocaleString()}</p>
                </div>
              </div>
              {preview.changedRows === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-secondary/30 text-xs text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-green-500" />
                  이미 정규화돼있어요. 변경할 데이터가 없습니다.
                </div>
              ) : (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-700 dark:text-amber-400">되돌릴 수 없어요. 중요 데이터는 먼저 CSV로 내보내두세요.</p>
                </div>
              )}
            </motion.div>
          )}
          </AnimatePresence>
      </div>
    </ModalShell>
  );
}
