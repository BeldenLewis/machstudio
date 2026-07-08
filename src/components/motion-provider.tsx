"use client";

import { MotionConfig } from "framer-motion";

/**
 * 전역 모션 정책 — reducedMotion="user" 로 OS 의 '동작 줄이기' 설정을 존중한다.
 * framer-motion 의 whileHover/whileTap/AnimatePresence(JS 구동 모션)는 CSS 미디어쿼리로
 * 잡히지 않으므로 여기서 일괄 처리하고, CSS 애니메이션/트랜지션은 globals.css 의 미디어쿼리가 담당한다.
 * (CLAUDE.md: 커스텀 애니메이션 추가 시 reduced-motion 존중 의무)
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
