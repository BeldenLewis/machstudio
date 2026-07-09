// 공개 노출용 이름 마스킹 — Q&A·채팅에서 실제 이름 대신 가운데를 가린다.
// 김민준 → 김*준, 홍길동 → 홍*동, 남궁민수 → 남**수, 김민 → 김*, 김 → 김.
// 서버(공개 응답)에서 마스킹해 클라이언트로 원본 PII 를 아예 내보내지 않는 것이 원칙.
export function maskName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "익명";
  const chars = [...trimmed]; // 서로게이트/한글 안전 분할
  if (chars.length <= 1) return chars[0] ?? "익명";
  if (chars.length === 2) return `${chars[0]}*`;
  return `${chars[0]}${"*".repeat(chars.length - 2)}${chars[chars.length - 1]}`;
}
