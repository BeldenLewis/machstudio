"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  commit: () => Promise<void> | void;
}

interface RemoveOpts {
  /** 대상 고유키 — 중복 삭제 방지에 사용 */
  key: string;
  /** 토스트 문구 (예: "공지를 삭제했어요") */
  message: string;
  /** 실행취소 유예(ms). 기본 5초 */
  windowMs?: number;
  /** 즉시 UI 에서 제거 (낙관적) */
  onOptimistic: () => void;
  /** 유예가 지나면 실제 서버 삭제 */
  commit: () => Promise<void> | void;
  /** 실행취소 시 UI 복원 (commit 은 아직 실행 안 됨) */
  onUndo: () => void;
}

// 낙관적 삭제 + "실행취소" 토스트(타이머 커밋 방식).
// - 클릭 즉시 목록에서 사라지고(onOptimistic), 유예(기본 5초) 뒤 실제 삭제(commit)가 실행된다.
// - 유예 안에 실행취소하면 commit 을 건너뛰고 UI 를 복원(onUndo) — 서버 호출 없음.
// - 페이지 이탈/언마운트 시 대기 중 삭제를 즉시 flush 해 확실히 반영(새로고침 등으로 유실 방지).
//   beforeunload 의 fetch 는 best-effort — 실패하면 항목이 남으므로(안전한 실패) 다시 삭제하면 된다.
export function useUndoableDelete() {
  const pending = useRef<Map<string, Pending>>(new Map());

  const flushAll = useCallback(() => {
    pending.current.forEach((p) => { clearTimeout(p.timer); void p.commit(); });
    pending.current.clear();
  }, []);

  useEffect(() => {
    const onUnload = () => flushAll(); // 실제 페이지 종료/새로고침 시에만 즉시 확정(best-effort)
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
    // 언마운트(어드민 탭 전환 등)에서는 즉시 커밋하지 않는다 — 클라이언트 컨텍스트가 유지되어
    // setTimeout 이 5초 뒤 정상 커밋되고, 그동안 토스트의 "실행취소"도 계속 유효하다.
    // (즉시 flush 하면 토스트는 남는데 되돌리기가 무의미해지는 문제)
  }, [flushAll]);

  const remove = useCallback((opts: RemoveOpts) => {
    const { key, message, windowMs = 5000, onOptimistic, commit, onUndo } = opts;
    if (pending.current.has(key)) return; // 이미 삭제 대기 중인 항목
    onOptimistic();
    const timer = setTimeout(() => {
      pending.current.delete(key);
      void commit();
    }, windowMs);
    pending.current.set(key, { timer, commit });
    toast(message, {
      duration: windowMs,
      action: {
        label: "실행취소",
        onClick: () => {
          // 대기 목록에 남아 있을 때만 취소 — 타이머가 이미 커밋(삭제)했다면 되돌리지 않는다(경합 방지)
          const p = pending.current.get(key);
          if (!p) return;
          clearTimeout(p.timer);
          pending.current.delete(key);
          onUndo();
        },
      },
    });
  }, []);

  return { remove };
}
