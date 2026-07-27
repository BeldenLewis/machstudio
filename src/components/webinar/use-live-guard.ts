"use client";

import { useCallback } from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import { objectParticle } from "@/lib/korean";

/**
 * 라이브 중 "끄는" 변경에 붙일 확인 내용 — 또는 확인이 필요 없으면 null.
 *
 * 훅에서 떼어낸 이유는 두 가지다. (1) 이 판단과 문구가 이 기능의 전부인데 훅 안에 있으면
 * 테스트할 수 없다(이 저장소엔 React 테스트 유틸이 없다). (2) 사람 수가 0명일 때와 아직
 * 모를 때의 문구가 달라야 하는데, 그 분기가 조용히 뒤바뀌면 "0명" 을 "모름" 으로 읽는다.
 */
export function liveOffConfirm(
  isLive: boolean,
  viewers: number | null,
  what: string,
  effect: string,
): ConfirmOptions | null {
  if (!isLive) return null; // 준비 중에는 마음껏 켜고 끈다
  const who =
    viewers === null
      ? "지금 방송 중이에요."
      : viewers > 0
        ? `지금 ${viewers.toLocaleString()}명이 보고 있어요.`
        : "지금 방송 중이에요(현재 접속자는 0명).";
  return {
    // 조사는 앞말의 종성에 달렸다 — "채팅 탭를" 처럼 굳혀 두면 스위치가 늘 때마다 어색해진다
    title: `라이브 중에 ${objectParticle(what)} 끌까요?`,
    description: `${who} ${effect} 저장은 즉시 반영돼요.`,
    confirmLabel: "끄기",
    tone: "danger",
  };
}

/**
 * 라이브 중 "시청자에게서 무언가를 빼앗는" 변경에만 확인을 붙인다.
 *
 * 규칙이 이렇게 좁은 이유:
 * - 만들기는 전부 자동저장이라 필드 타이핑마다 확인을 물을 수는 없다(모든 키 입력이 저장이다).
 * - 반대로 켜는 쪽(탭 추가·섹션 공개)은 시청자에게 더 주는 변경이라 사고가 아니다.
 * - 남는 건 **끄는 스위치**다. 라이브 중에 채팅 탭을 끄면 그 순간 시청자 화면에서 사라지고,
 *   랜딩 공개를 끄면 임베드된 등록 폼이 비공개 안내로 바뀐다. 이것만 확인 뒤에 둔다.
 *   (AGENTS §3 "시청자에게 노출되거나 파괴적인 동작만 확인 단계")
 *
 * 끄는 방향인지 판단하는 건 호출부다 — 스위치마다 "끔" 의 모양이 다르다(false / "closed").
 */
export function useLiveOffGuard(isLive: boolean, viewers: number | null) {
  const confirm = useConfirm();

  return useCallback(
    async (what: string, effect: string) => {
      const options = liveOffConfirm(isLive, viewers, what, effect);
      if (!options) return true;
      return confirm(options);
    },
    [confirm, isLive, viewers],
  );
}
