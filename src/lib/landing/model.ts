/**
 * 랜딩 파생 로직 — 순수 함수만. React / Next / Prisma 를 import 하지 않는다.
 * (호스트 DOM 임베드 번들에 그대로 들어가므로 브라우저 안전해야 한다.)
 */

export const SAFE_HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 좌측 목차 정의 — 실제 노출은 섹션에 내용이 있을 때만. */
export const TOC_DEF = [
  { id: "lnd-about", label: "About" },
  { id: "lnd-sessions", label: "Sessions" },
  { id: "lnd-timetable", label: "Time Table" },
  { id: "lnd-programs", label: "Programs" },
  { id: "lnd-highlights", label: "Highlights" },
  // "이런 분들께 추천합니다" — Join 바로 위. 참여 방법을 읽기 직전에 "내 얘기인가" 를
  // 한 번 더 확인시키고 등록으로 넘긴다. dark-zone 안이라 키컬러가 비치지 않는다(mount 주석).
  { id: "lnd-audience", label: "Audience" },
  { id: "lnd-join", label: "Join" },
  { id: "lnd-faq", label: "FAQ" },
] as const;

// 키컬러 위 텍스트 — 브랜드 요청으로 흰색 기본(라이브 페이지의 밝은 버튼 인상과 통일).
// 노랑·연회색처럼 아주 밝은 키컬러에서만 안전장치로 진한 글자(명도 0.78 이상).
export function onPrimaryFor(accent: string): string {
  let hex = accent.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum >= 0.78 ? "#1a1a1f" : "#ffffff";
}

// 연사 표기 분리: 새 데이터는 speakerCompany 컬럼, 레거시는 speaker 의 "이름 | 회사" 결합형을 파싱.
export function parseSpeaker(
  speaker: string | null | undefined,
  company: string | null | undefined,
): { name: string; company: string } {
  const raw = (speaker ?? "").trim();
  const co = (company ?? "").trim();
  if (co) return { name: raw, company: co };
  const idx = raw.indexOf("|");
  if (idx >= 0) return { name: raw.slice(0, idx).trim(), company: raw.slice(idx + 1).trim() };
  return { name: raw, company: "" };
}
