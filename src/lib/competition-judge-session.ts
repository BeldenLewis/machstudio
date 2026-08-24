/**
 * 심사위원 세션 — 링크(토큰) + 비밀번호를 통과한 뒤 짧게 유지되는 쿠키.
 *
 * 왜 쿠키가 필요한가: 채점은 참가작 수만큼 저장 요청이 오간다. 매 요청마다 비밀번호를 다시
 * 물으면 심사가 불가능하다. 반대로 쿠키가 영구하면 공용 PC 에서 다음 사람이 그대로 들어간다.
 * 그래서 **토큰별로 분리된 짧은 수명**의 서명 쿠키를 쓴다.
 *
 * 서명에 쓰는 비밀은 비밀번호 해시 자체다 — 비밀번호를 재설정하면 기존 세션이 자동으로 죽는다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import "server-only";

const MAX_AGE_SECONDS = 6 * 60 * 60; // 6시간 — 하루치 심사를 덮되 공용 PC 에 남지 않을 길이

export function judgeCookieName(token: string): string {
  // 토큰별로 쿠키를 나눈다 — 한 브라우저로 여러 심사위원 링크를 열어도 섞이지 않는다.
  return `mc_judge_${token.slice(0, 12)}`;
}

function sign(token: string, secret: string, expiresAt: number): string {
  return createHmac("sha256", secret).update(`${token}.${expiresAt}`).digest("base64url");
}

export function createJudgeSession(token: string, passwordHash: string | null): { value: string; maxAge: number } {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const signature = sign(token, passwordHash ?? "no-password", expiresAt);
  return { value: `${expiresAt}.${signature}`, maxAge: MAX_AGE_SECONDS };
}

export function verifyJudgeSession(
  cookieValue: string | undefined,
  token: string,
  passwordHash: string | null,
): boolean {
  if (!cookieValue) return false;
  const [expiresRaw, signature] = cookieValue.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || !signature) return false;
  if (Date.now() > expiresAt) return false;

  const expected = sign(token, passwordHash ?? "no-password", expiresAt);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
