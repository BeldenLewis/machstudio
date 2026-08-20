import type { DataCategory, EventLegalBlanks, OrgProfile } from "../types";

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

export function orgLineEn(org: OrgProfile): string {
  const name = blankEn(org.legalName, "[Business Legal Name]");
  const address = blankEn(org.address, "[Business Mailing Address]");
  return `${name}, ${address}`;
}

export function orgLineKo(org: OrgProfile): string {
  const name = blankKo(org.legalName, "[회사명 미입력]");
  const address = blankKo(org.address, "[사업장 주소 미입력]");
  return `${name} (${address})`;
}

export function contactEmailEn(org: OrgProfile, event: EventLegalBlanks): string {
  return blankEn(event.contactEmail || org.privacyContactEmail, "[privacy contact email]");
}

export function contactEmailKo(org: OrgProfile, event: EventLegalBlanks): string {
  return blankKo(event.contactEmail || org.privacyContactEmail, "[담당 이메일 미입력]");
}
