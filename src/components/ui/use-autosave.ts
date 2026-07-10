"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "saving" | "saved" | "error";

// 디바운스 자동저장 — value(직렬화 가능한 폼 상태)가 바뀌면 debounceMs 뒤 save() 호출.
// - 초기 마운트 값은 저장 기준(baseline)이라 저장하지 않는다(사용자가 바꿔야 저장).
// - 저장 중 값이 또 바뀌면 완료 후 한 번 더 저장(최신 반영).
// - 언마운트(섹션 전환)·페이지 이탈 시 대기분을 즉시 flush — 자동저장이므로 항상 영속화.
// - save 는 성공 true / 실패 false 반환. 실패 시 baseline 을 유지해 다음 변경/flush 때 재시도.
export function useAutosave<T>(value: T, save: (v: T) => Promise<boolean>, debounceMs = 900) {
  const [state, setState] = useState<AutosaveState>("idle");
  const serialized = JSON.stringify(value);
  const savedRef = useRef(serialized); // 마지막으로 저장 성공한 스냅샷
  const valueRef = useRef(value);
  valueRef.current = value;
  const saveRef = useRef(save);
  saveRef.current = save;
  const savingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (savingRef.current) return; // 진행 중이면 완료 후 재시도 로직이 처리
    const snap = JSON.stringify(valueRef.current);
    if (snap === savedRef.current) return; // 변경 없음
    savingRef.current = true;
    setState("saving");
    let ok = false;
    try { ok = await saveRef.current(valueRef.current); } catch { ok = false; }
    savingRef.current = false;
    if (ok) {
      savedRef.current = snap;
      setState("saved");
      // 저장하는 동안 값이 또 바뀌었으면 곧바로 한 번 더
      if (JSON.stringify(valueRef.current) !== savedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { void run(); }, 0);
      }
    } else {
      setState("error"); // baseline 유지 → 다음 변경/flush 때 재시도
    }
  }, []);

  // 디바운스 스케줄 — value 변경마다
  useEffect(() => {
    if (serialized === savedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void run(); }, debounceMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [serialized, debounceMs, run]);

  // 언마운트/페이지 이탈 시 대기분 flush(best-effort)
  useEffect(() => {
    const onUnload = () => { void run(); };
    window.addEventListener("beforeunload", onUnload);
    return () => { window.removeEventListener("beforeunload", onUnload); void run(); };
  }, [run]);

  const retry = useCallback(() => { void run(); }, [run]);
  const dirty = serialized !== savedRef.current || state === "saving";
  return { state, dirty, retry };
}
