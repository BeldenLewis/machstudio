"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";

/**
 * 앱 전역 확인 대화상자 — window.confirm() 을 대체하는 프로미스 기반 공용 컴포넌트.
 * `const confirm = useConfirm(); if (!(await confirm({...}))) return;` 형태로 사용.
 * 파괴적/고영향 액션은 tone="danger" 로 통일된 경고 스타일을 준다.
 * 접근성: role="dialog" aria-modal, 초기 포커스·포커스 트랩·Escape 닫기·포커스 복원.
 */
type ConfirmTone = "default" | "danger";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    previousFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    setOptions(opts);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const close = useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
    // 포커스 복원 — 열기 전 요소로 되돌려 키보드 흐름 유지
    previousFocusRef.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!options) return;
    confirmBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close(false);
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        // 포커스 트랩 — 대화상자 밖으로 새어나가지 않게 순환
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AnimatePresence>
        {options && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => close(false)} aria-hidden="true" />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-dialog-title"
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl"
            >
              <div className="flex gap-3">
                {options.tone === "danger" && (
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-500">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 id="confirm-dialog-title" className="text-sm font-semibold">{options.title}</h2>
                  {options.description && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground whitespace-pre-line">{options.description}</p>
                  )}
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  onClick={() => close(false)}
                  className="rounded-xl border border-border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
                >
                  {options.cancelLabel ?? "취소"}
                </button>
                <button
                  ref={confirmBtnRef}
                  onClick={() => close(true)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    options.tone === "danger"
                      ? "bg-red-500 hover:bg-red-600 focus-visible:ring-red-500/50"
                      : "bg-violet-500 hover:bg-violet-600 focus-visible:ring-violet-500/50"
                  }`}
                >
                  {options.confirmLabel ?? "확인"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  );
}
