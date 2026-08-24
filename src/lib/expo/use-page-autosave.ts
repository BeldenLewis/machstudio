"use client";

/**
 * 홈페이지 페이지 편집의 **자동저장 상태기계**.
 *
 * ── 왜 공용 useAutosave 를 안 쓰나 ────────────────────────────────────
 * 공용 훅(`components/ui/use-autosave.ts`)은 "값이 바뀌면 보낸다" 만 안다. 여기에는
 * 그것으로 표현할 수 없는 것이 하나 있다: **`draftRevision` 비교-교환(CAS)**.
 *
 * 두 탭에서 같은 페이지를 열면 나중 저장이 앞 저장을 조용히 덮는다. 그래서 클라이언트가
 * 자기가 읽은 번호를 같이 보내고, 서버는 번호가 다르면 409 로 막는다. 문제는 그 번호가
 * **저장할 때마다 바뀐다**는 것이다 — 번호를 직렬화되는 값에 넣으면 성공한 저장이
 * 값을 바꾸고, 그게 곧바로 두 번째 저장을 일으켜 **한 번 타이핑에 PATCH 가 무한히** 나간다.
 *
 * 그래서 번호는 **전송 전용**이다. 직렬화 대상에 없으므로 성공이 값을 바꾸지 않고,
 * 다음 PATCH 는 사용자가 실제로 뭔가 고쳤을 때만 나간다.
 *
 * ── 409 는 재시도하지 않는다 ──────────────────────────────────────────
 * 덮으면 남의 편집이 사라진다. W1 은 **페이지 통짜 JSON 초안을 자동 병합하지 않는다** —
 * 로컬 초안을 그대로 보존하고, 사람이 "서버 내용으로 다시 불러오기" 와 "내 사본 유지"
 * 중에 고른다. 자동으로 고르면 어느 쪽이든 누군가의 작업이 조용히 사라진다.
 *
 * ── 렌더 중에는 ref 를 만지지 않는다 ─────────────────────────────────
 * 기준선은 **상태**다(렌더가 `dirty` 를 계산해야 하므로). 콜백에서 쓰는 사본은 효과에서
 * 미러링한다. 렌더 중 ref 읽기·쓰기는 동시 렌더링에서 두 번 실행되며 깨지고,
 * `react-hooks/refs` 가 그걸 막는다 — 규칙을 억제하지 않고 구조를 맞춘다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AutosaveState } from "@/components/ui/use-autosave";

export type { AutosaveState };

/** 서버 응답을 이 세 가지로 좁혀서 받는다 — 훅이 HTTP 를 알 필요는 없다. */
export type ExpoSaveOutcome =
  /** 저장됨. `revision` 은 서버가 올린 새 번호다. */
  | { kind: "saved"; revision: number }
  /** 그 사이 다른 곳에서 저장했다. `revision` 은 서버의 현재 번호. */
  | { kind: "conflict"; revision: number }
  /** 네트워크·5xx. 재시도해도 되는 실패다. */
  | { kind: "failed" };

export interface ExpoConflict {
  /** 서버의 현재 번호 — 화면이 "서버 내용으로 다시 불러오기" 에 쓴다. */
  revision: number;
}

/** `flush()` 의 결과. 페이지 전환은 `clean`·`saved` 일 때만 진행한다. */
export type FlushResult = "clean" | "saved" | "failed" | "conflict" | "disabled";

export interface UsePageAutosaveOptions<T> {
  /**
   * 지금 편집 중인 페이지 id.
   *
   * 바뀌면 기준선과 번호를 **새 페이지 것으로 갈아탄다.** 이 값을 안 보면 앞 페이지의
   * 대기분이 새 페이지 id 로 나가서 남의 페이지를 덮는다.
   */
  pageId: string;
  value: T;
  /** 서버가 준 최초 번호. */
  initialRevision: number;
  /** 실제 전송. 번호는 훅이 꺼내 넘긴다. */
  save: (value: T, revision: number) => Promise<ExpoSaveOutcome>;
  debounceMs?: number;
  /** 뷰어에게는 **아무 핸들러도 붙지 않는다.** 타이머도 리스너도 만들지 않는다. */
  enabled?: boolean;
}

export interface PageAutosave {
  state: AutosaveState;
  /** 409 를 만난 뒤의 상태. null 이 아니면 자동저장이 멈춰 있다. */
  conflict: ExpoConflict | null;
  dirty: boolean;
  /** 대기분을 즉시 보내고 결과를 기다린다 — 페이지 전환 **전에** 부른다. */
  flush: () => Promise<FlushResult>;
  /**
   * 409 를 사람이 해소했다. 서버 내용으로 갈아탔으면 그 번호를 넘긴다 —
   * 자동저장이 다시 돈다.
   */
  resolveConflict: (revision: number) => void;
  retry: () => void;
}

/** 이 페이지를 편집하는 동안의 기준점. 페이지가 바뀌면 통째로 갈아탄다. */
interface Anchor {
  pageId: string;
  /** 마지막으로 **저장 성공한** 직렬화 스냅샷. */
  baseline: string;
  revision: number;
}

export function usePageAutosave<T>(options: UsePageAutosaveOptions<T>): PageAutosave {
  const { pageId, value, initialRevision, save, debounceMs = 900, enabled = true } = options;

  const [state, setState] = useState<AutosaveState>("idle");
  const [conflict, setConflict] = useState<ExpoConflict | null>(null);

  const serialized = JSON.stringify(value);

  const [anchor, setAnchor] = useState<Anchor>({ pageId, baseline: serialized, revision: initialRevision });

  /**
   * 페이지가 바뀌면 렌더 중에 기준점을 갈아탄다.
   *
   * React 가 문서화한 "렌더 중 상태 조정" 패턴이다(효과가 아니다). 효과로 미루면 그 사이
   * 한 프레임 동안 **앞 페이지의 기준선으로 새 페이지의 값을 비교**해서 dirty 로 보이고,
   * 디바운스가 걸려 있으면 새 페이지 id 로 앞 페이지 내용이 나간다.
   */
  if (anchor.pageId !== pageId) {
    setAnchor({ pageId, baseline: serialized, revision: initialRevision });
    setState("idle");
    setConflict(null);
  }

  /** 콜백에서 쓰는 사본들. **효과에서만** 쓴다 — 렌더 중에는 만지지 않는다. */
  const valueRef = useRef(value);
  const anchorRef = useRef(anchor);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const haltedRef = useRef(false);
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 진행 중 저장이 끝난 뒤 **한 번만** 더 보내기 위한 표시. */
  const followUpRef = useRef(false);
  /**
   * 지금 도는 저장의 약속.
   *
   * `flush()` 는 페이지를 넘기기 **전에** 불린다. 그러니 "보냈다" 가 아니라 **"끝났다"**
   * 를 돌려줘야 한다 — 진행 중인데 즉시 반환하면 호출부가 저장이 끝난 줄 알고 페이지를
   * 넘기고, 그 사이 완료된 저장은 페이지가 바뀐 것을 보고 후속 저장을 버린다.
   * **전환 직전에 친 글자가 사라진다.**
   */
  const runningRef = useRef<Promise<FlushResult> | null>(null);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { saveRef.current = save; }, [save]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => {
    anchorRef.current = anchor;
    // 페이지가 바뀌면 잠금과 대기분을 함께 버린다 — 앞 페이지의 409 가 새 페이지를 막지 않게.
    haltedRef.current = conflict !== null;
  }, [anchor, conflict]);
  useEffect(() => {
    // 페이지 전환 시 앞 페이지용 타이머를 즉시 끊는다.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    haltedRef.current = false;
    followUpRef.current = false;
  }, [anchor.pageId]);

  const execute = useCallback(async (): Promise<FlushResult> => {
    /**
     * 재귀가 아니라 루프다.
     *
     * "저장하는 동안 타이핑했으면 한 번 더" 는 꼬리 재귀로 쓰기 쉽지만, 그러면
     * `useCallback` 이 자기 자신을 참조해 선언 전에 접근하게 된다. 루프는 그 문제가
     * 없고, **각 바퀴가 반드시 기준선을 전진시키므로** 끝난다.
     *
     * `savingRef` 는 루프 전체에서 잡고 있는다. 그래야 그 사이 들어온 호출이 요청을
     * 겹쳐 보내지 않고 `followUpRef` 만 세우고, 그걸 이 루프가 받아 처리한다.
     */
    savingRef.current = true;
    try {
      let result: FlushResult = "clean";
      for (;;) {
        const snapshot = JSON.stringify(valueRef.current);
        if (snapshot === anchorRef.current.baseline) return result;

        const sendingPage = anchorRef.current.pageId;
        setState("saving");

        let outcome: ExpoSaveOutcome;
        try {
          outcome = await saveRef.current(valueRef.current, anchorRef.current.revision);
        } catch {
          outcome = { kind: "failed" };
        }

        // 응답이 오는 동안 페이지가 바뀌었으면 그 결과를 새 페이지에 적용하지 않는다.
        if (anchorRef.current.pageId !== sendingPage) return "clean";

        if (outcome.kind === "conflict") {
          /**
           * 멈춘다. 재시도하면 남의 편집을 덮는다. 로컬 초안은 **건드리지 않는다** —
           * 사용자가 방금까지 타이핑한 것이고, 그걸 잃는 것이 이 화면 최악의 결과다.
           */
          /**
           * 여기서 즉시 잠근다. 아래 효과도 같은 일을 하지만, 그 효과는 커밋 뒤에
           * 돈다 — 그 사이 `flush()` 가 동기적으로 들어오면 한 번 더 나간다.
           * 두 겹인 것이 중복이 아니라 그 창을 닫는 것이다.
           */
          haltedRef.current = true;
          followUpRef.current = false;
          const next = { ...anchorRef.current, revision: outcome.revision };
          anchorRef.current = next;
          setAnchor(next);
          setConflict({ revision: outcome.revision });
          setState("error");
          return "conflict";
        }

        if (outcome.kind === "failed") {
          // 기준선을 유지한다 → 다음 변경이나 flush 에서 다시 시도된다.
          setState("error");
          return "failed";
        }

        /**
         * 성공. 번호를 올리고 기준선을 갱신한다.
         *
         * 번호는 직렬화 대상이 아니므로 이 갱신이 `serialized` 를 바꾸지 않는다 —
         * 그래서 **두 번째 PATCH 가 나가지 않는다.** 그게 이 설계의 핵심이다.
         */
        const next = { pageId: sendingPage, baseline: snapshot, revision: outcome.revision };
        anchorRef.current = next;
        setAnchor(next);
        setState("saved");
        result = "saved";

        // 저장하는 동안 타이핑했으면 한 바퀴 더, 최신 값과 새 번호로.
        const changedWhileSaving = followUpRef.current
          || JSON.stringify(valueRef.current) !== snapshot;
        followUpRef.current = false;
        if (!changedWhileSaving) return "saved";
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  const run = useCallback((): Promise<FlushResult> => {
    if (!enabledRef.current) return Promise.resolve<FlushResult>("disabled");
    if (haltedRef.current) return Promise.resolve<FlushResult>("conflict");
    if (savingRef.current) {
      /**
       * 진행 중이면 요청을 겹쳐 보내지 않는다 — 표시만 세우고 **그 저장을 기다린다.**
       * 진행 중인 루프가 이 표시를 보고 최신 값으로 한 바퀴 더 돌므로, 이 약속이
       * 풀릴 때는 방금 친 글자까지 저장이 끝나 있다.
       */
      followUpRef.current = true;
      return runningRef.current ?? Promise.resolve<FlushResult>("saved");
    }

    const pending = execute();
    runningRef.current = pending;
    const clear = () => { if (runningRef.current === pending) runningRef.current = null; };
    pending.then(clear, clear);
    return pending;
  }, [execute]);

  // 디바운스 — 값이 바뀔 때마다.
  useEffect(() => {
    if (!enabled) return;
    if (conflict) return;
    if (serialized === anchor.baseline) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void run(); }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [serialized, anchor.baseline, conflict, debounceMs, enabled, run]);

  /**
   * 언마운트·페이지 이탈 시 대기분을 밀어 넣는다.
   *
   * 뷰어(`enabled=false`)에게는 **리스너를 아예 붙이지 않는다** — 읽기 전용 화면이
   * beforeunload 를 잡고 있을 이유가 없다.
   */
  useEffect(() => {
    if (!enabled) return;
    const onUnload = () => { void run(); };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      void run();
    };
  }, [enabled, run]);

  const flush = useCallback(() => run(), [run]);

  const resolveConflict = useCallback((revision: number) => {
    haltedRef.current = false;
    // 기준선은 **지금 화면의 값**으로 잡는다. 서버 내용을 불러왔으면 그 값이 이미 화면에
    // 들어와 있고, 로컬 사본을 유지했으면 그 값이 다음 저장의 출발점이다.
    const next = {
      pageId: anchorRef.current.pageId,
      baseline: JSON.stringify(valueRef.current),
      revision,
    };
    anchorRef.current = next;
    setAnchor(next);
    setConflict(null);
    setState("idle");
  }, []);

  const retry = useCallback(() => { void run(); }, [run]);

  const dirty = serialized !== anchor.baseline || state === "saving";

  return { state, conflict, dirty, flush, resolveConflict, retry };
}
