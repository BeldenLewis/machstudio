import type { DataCategory, EventLegalBlanks } from "../types";
import { ORG_TOKEN } from "../tokens";

/** DataCategory 를 문서 산문에 넣을 구절로. 나라(=언어)마다 다른 사전을 쓴다. */
const CATEGORY_EN: Record<DataCategory, string> = {
  name: "your name",
  email: "your email address",
  phone: "your phone number",
  company: "your company or organization name",
  jobTitle: "your job title",
  address: "your mailing address",
  photo: "photos you upload",
  video: "video links or footage you submit",
  otherText: "additional information you provide in the registration form",
};

const CATEGORY_KO: Record<DataCategory, string> = {
  name: "성명",
  email: "이메일 주소",
  phone: "전화번호",
  company: "소속(회사·단체명)",
  jobTitle: "직책",
  address: "주소",
  photo: "업로드하신 사진",
  video: "제출하신 영상 링크 또는 영상 자료",
  otherText: "신청 폼에 입력하신 그 외 정보",
};

export function categoryLabelEn(category: DataCategory): string {
  return CATEGORY_EN[category];
}

export function categoryLabelKo(category: DataCategory): string {
  return CATEGORY_KO[category];
}

/** "October 22–24, 2026" 같은 표기. 날짜가 없으면 빈칸 표식을 그대로 남긴다(조용히 지우면 더 위험). */
export function formatDateRangeEn(dates: readonly string[]): string {
  if (dates.length === 0) return "[event dates]";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} – ${dates[dates.length - 1]}`;
}

export function formatDateRangeKo(dates: readonly string[]): string {
  if (dates.length === 0) return "[행사 일자 미입력]";
  if (dates.length === 1) return dates[0];
  return `${dates[0]} ~ ${dates[dates.length - 1]}`;
}

export function blankEn(value: string, placeholder: string): string {
  const trimmed = value.trim();
  return trimmed || placeholder;
}

export function blankKo(value: string, placeholder: string): string {
  const trimmed = value.trim();
  return trimmed || placeholder;
}

/**
 * 조직명·주소·이메일은 리터럴 값이 아니라 토큰을 그대로 문서에 심는다 — 워크스페이스 설정에서
 * 값이 바뀌면 이미 생성된 문서도 다시 만들 필요 없이 노출 시점에 최신 값으로 풀린다
 * (`resolveOrgTokens`, `../tokens.ts`). 행사별 문의처 override(`event.contactEmail`)만은 그 행사에
 * 한정된 값이라 리터럴로 그대로 굳힌다.
 */
export function orgLineEn(): string {
  return `${ORG_TOKEN.name}, ${ORG_TOKEN.address}`;
}

export function orgLineKo(): string {
  return `${ORG_TOKEN.name} (${ORG_TOKEN.address})`;
}

export function contactEmailEn(event: EventLegalBlanks): string {
  return event.contactEmail.trim() || ORG_TOKEN.email;
}

export function contactEmailKo(event: EventLegalBlanks): string {
  return event.contactEmail.trim() || ORG_TOKEN.email;
}
