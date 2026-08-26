"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 도넛 차트 채널 색 override 를 불러오고, 차트 위에서 바로 바꿀 때 저장까지 담당한다.
 *
 * 왜 여기 있나: SummaryDashboardClient·수집 소스 상세가 각자 `/api/workspace/{id}`를
 * 따로 불러야 했다 — WorkspaceProvider 컨텍스트의 workspace 는 초기 로드 시 목록 API
 * 값만 들고 있어 channelColors 처럼 상세 API 전용 필드가 비어 있을 수 있기 때문
 * (use-chart-colors.ts 의 관련 주석 참고). 저장 로직까지 한곳에 모아 두 화면이 같은
 * debounce·병합 규칙을 쓰게 한다.
 *
 * 색상 피커를 드래그하는 동안 매 프레임 저장 요청을 보내지 않도록, 마지막 변경 뒤
 * 짧게 기다렸다가 한 번만 PATCH 한다(마지막 값만 남으면 되므로 요청을 합친다).
 */
export function useWorkspaceChannelColors(workspaceId: string | undefined) {
  const [channelColors, setChannelColors] = useState<Record<string, string> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workspaceId) { setChannelColors(null); return; }
    let cancelled = false;
    fetch(`/api/workspace/${workspaceId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setChannelColors((data?.workspace?.channelColors as Record<string, string> | null | undefined) ?? null);
      })
      .catch((error) => console.error("[channel-colors] fetch failed", error));
    return () => { cancelled = true; };
  }, [workspaceId]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, []);

  /** 라벨은 도넛에 실제로 찍힌 값 그대로 받는다 — 저장 키는 조회와 같은 기준(소문자)으로 맞춘다. */
  const setChannelColorOverride = useCallback((label: string, hex: string) => {
    if (!workspaceId) return;
    const key = label.trim().toLowerCase();
    if (!key) return;

    setChannelColors((prev) => {
      const next = { ...(prev ?? {}), [key]: hex };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        fetch(`/api/workspace/${workspaceId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelColors: next }),
        }).catch((error) => console.error("[channel-colors] save failed", error));
      }, 400);
      return next;
    });
  }, [workspaceId]);

  return { channelColors, setChannelColorOverride };
}
