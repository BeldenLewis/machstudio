"use client";

import { Check, Loader2, AlertCircle } from "lucide-react";
import type { AutosaveState } from "./use-autosave";

// 자동저장 상태 인디케이터 — 저장 버튼을 대체하는 차분한 표시.
export function AutosaveIndicator({ state, onRetry }: { state: AutosaveState; onRetry?: () => void }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> 저장 중…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-emerald-500" /> 저장됨 · 변경하면 자동 저장돼요
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-red-500">
        <AlertCircle className="h-3.5 w-3.5" /> 저장 실패
        {onRetry && (
          <button type="button" onClick={onRetry} className="underline underline-offset-2 hover:text-red-600">다시 시도</button>
        )}
      </span>
    );
  }
  // idle — 아직 변경 없음
  return <span className="text-xs text-muted-foreground/70">변경하면 자동 저장돼요</span>;
}
