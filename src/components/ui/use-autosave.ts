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

/**
 * 폼 상태를 **다른 곳에서 바뀐 서버 값에 따라가게** 만든다. useAutosave 의 짝.
 *
 * 왜 필요한가: 만들기 탭들은 폼을 props 로 **한 번만** 초기화한다(useState 초기값).
 * 그래서 다른 창·다른 기기·운영 콘솔에서 같은 웨비나를 바꾸면 이 화면은 낡은 스냅샷을 들고
 * 있고, 다음 자동저장이 그 낡은 값을 되돌려 쓴다(예: 콘솔에서 Q&A 를 폐쇄형으로 바꿨는데
 * 만들기에서 문구 하나 고치면 오픈형으로 복귀). 라이브 당일 운영자가 둘일 때 실제로 난다.
 *
 * 규칙:
 * - incoming(서버에서 새로 온 값)이 달라졌을 때만 반응한다.
 * - 편집 중(dirty)이면 **덮지 않는다** — 타이핑 중 값이 사라지면 안 된다.
 *   이때 기준값을 갱신하지 않으므로, 저장이 끝나 dirty 가 풀리면 그때 반영된다.
 *
 * 주의: 이것만으로는 부족하다. 저장 페이로드도 **바뀐 키만** 보내야 한다 —
 * 폼이 들고 있는 모든 키를 매번 쓰면 내가 건드리지 않은 값까지 낡은 스냅샷으로 덮는다.
 */
export function useExternalSync<T>(incoming: T, apply: (v: T) => void, dirty: boolean): void {
  const baselineRef = useRef(JSON.stringify(incoming));
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    const decision = decideExternalSync(baselineRef.current, JSON.stringify(incoming), dirty);
    baselineRef.current = decision.baseline;
    if (decision.adopt) applyRef.current(incoming);
  }, [incoming, dirty]);
}

/**
 * useExternalSync 의 판정부 — 순수 함수로 빼서 테스트한다(훅은 얇은 껍데기).
 *
 * - incoming 이 baseline 과 같다 → 외부 변경 없음. 아무것도 안 한다.
 * - 편집 중(dirty) → 채택하지 않고 **baseline 을 그대로 유지**한다.
 *   이게 핵심이다: 갱신해 버리면 그 외부 변경을 영구히 놓치고, 유지하면 dirty 가 풀릴 때 다시 판정된다.
 * - 그 외 → 채택하고 baseline 을 incoming 으로 옮긴다.
 */
export function decideExternalSync(
  baseline: string,
  incoming: string,
  dirty: boolean,
): { baseline: string; adopt: boolean } {
  if (incoming === baseline) return { baseline, adopt: false };
  if (dirty) return { baseline, adopt: false };
  return { baseline: incoming, adopt: true };
}

/**
 * 서버가 아는 값과 내 폼 값을 비교해 **바뀐 키만** 담은 패치를 만든다.
 *
 * 왜: 서버는 config·components 를 최상위 키 단위로 병합하므로, 폼이 들고 있는 키를 매번 다 보내면
 * 내가 건드리지 않은 키까지 낡은 스냅샷으로 덮는다. 같은 키를 다른 화면(운영 콘솔)도 쓸 때
 * 그게 곧 "상대의 변경이 되돌아가는" 드리프트가 된다.
 */
export function diffPatch<T extends Record<string, unknown>>(server: T, local: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(local) as (keyof T)[]) {
    if (local[key] !== server[key]) out[key] = local[key];
  }
  return out;
}
