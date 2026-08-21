import type { OrgProfile } from "./types";

/**
 * 조직 연락처(회사명·주소·이메일)는 워크스페이스 설정에서 수시로 바뀐다. 생성된 문서 본문에는
 * 이 값을 리터럴로 굳히지 않고 토큰으로 남겨 두고, 실제로 노출되는 시점(공개 임베드·관리자
 * 미리보기)마다 그때그때 최신 워크스페이스 값으로 채운다 — 주소 하나 바뀌었다고 전문을 다시
 * 생성해 손으로 고친 나머지 부분을 날릴 필요가 없게 하기 위해서다. "생성" 버튼 자체는 여전히
 * 스냅샷 방식(§legal-templates)이지만, 이 값들만은 예외적으로 항상 최신 워크스페이스 값을 따른다.
 */
export const ORG_TOKEN = {
  name: "{{ORG_NAME}}",
  address: "{{ORG_ADDRESS}}",
  email: "{{ORG_EMAIL}}",
  dpoEmail: "{{ORG_DPO_EMAIL}}",
  hostingRegion: "{{ORG_HOSTING_REGION}}",
} as const;

const PLACEHOLDER = {
  en: {
    name: "[Business Legal Name]", address: "[Business Mailing Address]", email: "[privacy contact email]",
    hostingRegion: "[server hosting region — set in Workspace Settings]",
  },
  ko: {
    name: "[회사명 미입력]", address: "[사업장 주소 미입력]", email: "[담당 이메일 미입력]",
    hostingRegion: "[서버 소재지 미입력 — 워크스페이스 설정에서 입력]",
  },
} as const;

/**
 * 토큰을 실제 워크스페이스 값으로 치환한다. 값이 비어 있어도 조용히 지우지 않고 자리표시자를
 * 남긴다 — 빈 채로 노출되는 것보다, 운영자든 방문자든 눈에 띄는 게 더 안전하다.
 */
export function resolveOrgTokens(text: string, org: OrgProfile, locale: "en" | "ko"): string {
  const p = PLACEHOLDER[locale];
  const name = org.legalName.trim() || p.name;
  const address = org.address.trim() || p.address;
  const email = org.privacyContactEmail.trim() || p.email;
  const dpoEmail = org.dpoContactEmail?.trim() || org.privacyContactEmail.trim() || p.email;
  const hostingRegion = org.hostingRegion.trim() || p.hostingRegion;
  return text
    .split(ORG_TOKEN.name).join(name)
    .split(ORG_TOKEN.address).join(address)
    .split(ORG_TOKEN.dpoEmail).join(dpoEmail)
    .split(ORG_TOKEN.email).join(email)
    .split(ORG_TOKEN.hostingRegion).join(hostingRegion);
}

/**
 * `resolveOrgTokens` 의 역방향 — 운영자가 편집 칸에서는 `{{ORG_ADDRESS}}` 같은 중괄호 문법을
 * 아예 보지 않아야 한다는 요구(§전문 재확인 없이도 자동 반영)에 맞춰, 편집 중에는 항상 실제
 * 값을 보여주고 **저장할 때만** 다시 토큰으로 접어 넣는다. 그래야 나중에 워크스페이스 값이
 * 또 바뀌어도 이 문서가 계속 최신값을 따라간다 — 저장 시점에 리터럴로 굳혀 버리면 이번에
 * 풀어 준 문제가 그대로 재발한다.
 *
 * 값이 비어 있는 필드는 건드리지 않는다 — 화면엔 자리표시자(예: "[회사명 미입력]")가 그대로
 * 있고, 여기서 되돌릴 원본 문자열이 없다. 운영자가 나중에 그 필드를 채우면 "생성"을 한 번
 * 다시 눌러 이 문서에도 토큰을 심어 주면 된다.
 */
export function encodeOrgTokens(text: string, org: OrgProfile): string {
  let result = text;
  // 개인정보보호책임자 연락처가 일반 담당 이메일과 다를 때만 구분해서 되돌릴 수 있다 — 같으면
  // 어느 자리였는지 텍스트만으로 알 길이 없어, 아래 일반 이메일 치환이 그 자리도 함께 담당한다.
  const dpoEmail = org.dpoContactEmail?.trim() ?? "";
  if (dpoEmail && dpoEmail !== org.privacyContactEmail.trim()) result = result.split(dpoEmail).join(ORG_TOKEN.dpoEmail);
  if (org.legalName.trim()) result = result.split(org.legalName.trim()).join(ORG_TOKEN.name);
  if (org.address.trim()) result = result.split(org.address.trim()).join(ORG_TOKEN.address);
  if (org.privacyContactEmail.trim()) result = result.split(org.privacyContactEmail.trim()).join(ORG_TOKEN.email);
  if (org.hostingRegion.trim()) result = result.split(org.hostingRegion.trim()).join(ORG_TOKEN.hostingRegion);
  return result;
}
