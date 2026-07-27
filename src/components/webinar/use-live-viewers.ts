"use client";

import { useEffect, useState } from "react";

/** 30초 — 배지 숫자용. 운영 콘솔(10초)보다 느리게 둔다. 여기 숫자는 "지금 조심해야 하나"의 근거일 뿐이다. */
const POLL_MS = 30_000;

/**
 * 만들기 화면이 "지금 몇 명이 보고 있나"를 알기 위한 폴러.
 *
 * 세 가지 게이트를 모두 통과할 때만 요청한다:
 *   1. enabled — 호출자가 라이브라고 판단할 때만(라이브가 아니면 요청 0건)
 *   2. document.visibilityState === "visible" — 탭을 백그라운드에 두면 멈춘다
 *   3. 서버가 isLive: false 로 답하면 스스로 멈춘다 — 브라우저 시계로 계산한 enabled 는
 *      방송이 끝난 뒤에도 true 로 남을 수 있고, 그러면 배지가 영원히 "라이브 중"이 된다
 *
 * 실패는 조용히 넘긴다(다음 주기 재시도). 이 숫자를 못 가져와도 경고 문구 자체는 유효하다.
 */
export function useLiveViewers(webinarId: string, enabled: boolean): number | null {
  const [count, setCount] = useState<number | null>(null);
  /** 서버가 "이미 끝났다"고 답한 웨비나 id — 그 뒤로는 두드리지 않고 숫자도 감춘다. */
  const [endedId, setEndedId] = useState<string | null>(null);

  useEffect(() => {
    // enabled 가 꺼질 때 값을 지우지 않는다 — 지우는 건 아래 반환식이 파생으로 한다.
    // (effect 본문에서 setState 하면 렌더가 한 번 더 도는 캐스케이드가 된다)
    if (!enabled || endedId === webinarId) return;
    let cancelled = false;
    let ended = false;

    const tick = async () => {
      if (ended || document.visibilityState !== "visible") return;
      try {
        const res = await fetch(`/api/webinars/${webinarId}/live-viewers`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        // 서버 판정이 기준 — 브라우저 시계로 계산한 enabled 는 방송 종료 뒤에도 true 로 남는다
        if (data.isLive === false) { ended = true; setEndedId(webinarId); return; }
        setCount(typeof data.activeViewers === "number" ? data.activeViewers : null);
      } catch {
        /* 다음 주기 재시도 */
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    // 탭으로 돌아오면 주기를 기다리지 않고 즉시 한 번 — 낡은 숫자를 보여주지 않으려고
    const onVisible = () => { if (document.visibilityState === "visible") void tick(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [webinarId, enabled, endedId]);

  return enabled && endedId !== webinarId ? count : null;
}
