"use client";

/**
 * 자동저장 표시를 **화면당 하나**로 모은다.
 *
 * 왜: 만들기 탭들이 각자 자기 자동저장 표시를 그려서 6벌이 돌아다녔고, 긴 화면에서는 그게
 * 스크롤 밖으로 밀려 "저장됐나?" 를 알 수 없었다. 1단계에서 원본 정보가 세 영역을 한 화면에
 * 합치면서 **같은 화면에 표시가 셋** 뜨는 상태가 됐다(정체성·일정 / 진행 순서 / 브랜드).
 *
 * 표시를 합치는 것과 **저장 경로를 합치는 것은 다른 문제**다. 저장 경로는 계속 나뉘어 있어야
 * 한다 — 한 훅으로 묶으면 한 영역을 고칠 때 나머지 영역의 스냅샷까지 전송돼 다른 창이 방금
 * 저장한 값을 되돌린다. 그래서 각 영역은 자기 useAutosave 를 그대로 쓰고, **표시만** 여기로
 * 올려 보낸다.
 *
 * 집계 규칙은 "가장 나쁜 상태가 이긴다": 하나라도 실패면 실패, 아니면 하나라도 저장 중이면
 * 저장 중, 아니면 하나라도 저장됨이면 저장됨, 그 외 idle. 실패를 저장됨이 덮으면 사용자가
 * 잃은 변경을 모른 채 화면을 떠난다.
 */

import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useState,
  type ReactNode,
} from "react";
import { AutosaveIndicator } from "./autosave-indicator";
import type { AutosaveState } from "./use-autosave";

interface Report {
  state: AutosaveState;
  retry?: () => void;
}

interface ScopeApi {
  report: (id: string, r: Report | null) => void;
}

const ScopeCtx = createContext<ScopeApi | null>(null);
const ReportsCtx = createContext<Record<string, Report>>({});

export function AutosaveScope({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<Record<string, Report>>({});

  const report = useCallback((id: string, r: Report | null) => {
    setReports((prev) => {
      if (r === null) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const cur = prev[id];
      // 같은 상태면 새 객체를 만들지 않는다 — 매 렌더 setState 로 루프가 돌지 않게.
      if (cur && cur.state === r.state && cur.retry === r.retry) return prev;
      return { ...prev, [id]: r };
    });
  }, []);

  const api = useMemo(() => ({ report }), [report]);

  return (
    <ScopeCtx.Provider value={api}>
      <ReportsCtx.Provider value={reports}>{children}</ReportsCtx.Provider>
    </ScopeCtx.Provider>
  );
}

/**
 * 편집 영역이 자기 자동저장 상태를 위로 올려 보낸다. 스코프 밖이면 아무 일도 하지 않으므로
 * 다른 화면에서 같은 컴포넌트를 재사용해도 안전하다(그 경우엔 각자 표시를 그리면 된다).
 */
export function useReportAutosave(state: AutosaveState, retry?: () => void) {
  const ctx = useContext(ScopeCtx);
  const id = useId();
  useEffect(() => {
    if (!ctx) return;
    ctx.report(id, { state, retry });
    return () => ctx.report(id, null);
  }, [ctx, id, state, retry]);
}

/** 스코프 안에 편집 영역이 하나라도 있는지 — 표시를 그릴지 판단할 때. */
export function useHasAutosaveReports() {
  return Object.keys(useContext(ReportsCtx)).length > 0;
}

/** 스코프 전체를 대표하는 표시 하나. */
export function AggregateAutosaveIndicator() {
  const reports = useContext(ReportsCtx);
  const entries = Object.values(reports);
  if (entries.length === 0) return null;

  const failed = entries.filter((r) => r.state === "error");
  const state: AutosaveState =
    failed.length > 0 ? "error"
    : entries.some((r) => r.state === "saving") ? "saving"
    : entries.some((r) => r.state === "saved") ? "saved"
    : "idle";

  // 여러 영역이 동시에 실패했으면 전부 재시도한다 — 하나만 되살리면 남은 실패가 조용히 남는다.
  const onRetry = failed.length
    ? () => failed.forEach((r) => r.retry?.())
    : undefined;

  return <AutosaveIndicator state={state} onRetry={onRetry} />;
}
