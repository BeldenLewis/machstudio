/**
 * 법률 문구 생성기 — 공용 타입.
 *
 * 이 파일은 `CollectField`/`CompetitionFormField` 어느 쪽도 import 하지 않는다. 두 시스템
 * 모두에서 쓰일 엔진이라 특정 시스템에 얽매이면 안 된다 — `InferableField`는 두 필드 타입이
 * "우연히 만족하는" 최소 구조(덕 타이핑)로만 정의한다.
 */

/** 지금은 US·KR 만. 나라를 늘릴 때 이 유니온에 추가 + sections/{country}.ts 하나만 새로 만들면 된다. */
export type Country = "us" | "kr";

export const LEGAL_COUNTRIES: readonly { value: Country; label: string }[] = [
  { value: "us", label: "미국 (US)" },
  { value: "kr", label: "대한민국 (KR)" },
];

export function isLegalCountry(value: unknown): value is Country {
  return LEGAL_COUNTRIES.some((c) => c.value === value);
}

/**
 * 문서 내용이 갈리는 축. 사전등록(전시 방문객)과 대회 참가(무대에 서는 사람)는 촬영·영상 이용
 * 문단이 근본적으로 다르다 — 전자는 "행사장에서 촬영됩니다", 후자는 "제출한 영상·현장 녹화가
 * 심사·중계·홍보에 쓰입니다".
 */
export type Purpose = "pre-registration" | "competition-entry";

/**
 * 폼이 실제로 수집하는 항목의 카테고리. "개인정보처리방침 §2 수집 항목" 목록을 이걸로 자동 생성한다.
 * `otherText`는 일부러 뭉뚱그린다 — 회사명·주소처럼 특정 카테고리로 잘못 단정하는 것보다,
 * 애매하면 그냥 "귀하가 입력하는 추가 정보" 로 두는 게 안전하다(오탐이 더 나쁘다).
 */
export type DataCategory =
  | "name"
  | "email"
  | "phone"
  | "company"
  | "jobTitle"
  | "address"
  | "photo"
  | "video"
  | "otherText";

/**
 * 폼 필드 하나를 이 모양으로만 보면 `CollectField`·`CompetitionFormField` 둘 다 그대로 넘길 수 있다
 * (둘 다 `key`/`type`/`label` 을 갖는다 — `label` 은 CollectField 에서는 Localized 라 호출부가
 * `localize()` 로 문자열로 풀어서 넘긴다).
 */
export interface InferableField {
  key: string;
  type: string;
  label?: string;
}

/** 조직 정보 — 회사마다 한 번만 채우면 되는 값(워크스페이스 자산). */
export interface OrgProfile {
  /** 정식 법인명. 빈 값이면 문서에 "[회사명 미입력]" 이 그대로 노출된다 — 조용히 빠지면 더 위험하다. */
  legalName: string;
  address: string;
  privacyContactEmail: string;
  /** 개인정보보호책임자 등 — 없으면 privacyContactEmail 로 갈음한다. */
  dpoContactEmail?: string;
}

export function emptyOrgProfile(): OrgProfile {
  return { legalName: "", address: "", privacyContactEmail: "", dpoContactEmail: "" };
}

/** 워크스페이스에 저장되는 조직 정보. 나라별로 다른 법인·주소를 쓸 수 있어 override 를 둔다. */
export interface WorkspaceLegalProfile {
  default: OrgProfile;
  byCountry?: Partial<Record<Country, Partial<OrgProfile>>>;
}

/** 나라별 override 를 얹어 실제 사용할 OrgProfile 을 만든다. 빈 문자열 override 는 무시(= 상속). */
export function resolveOrgProfile(profile: WorkspaceLegalProfile | null | undefined, country: Country): OrgProfile {
  const base = profile?.default ?? emptyOrgProfile();
  const override = profile?.byCountry?.[country];
  if (!override) return base;
  const merged: OrgProfile = { ...base };
  for (const key of Object.keys(override) as (keyof OrgProfile)[]) {
    const value = override[key];
    if (typeof value === "string" && value.trim()) merged[key] = value;
  }
  return merged;
}

export interface ThirdParty {
  /** 제공받는 자 이름 — 예: "참가작 심사위원단", "공동주최 OOO". */
  name: string;
  /** 제공 목적 — 예: "심사 진행", "시상품 발송". */
  purpose: string;
}

export function emptyThirdParty(): ThirdParty {
  return { name: "", purpose: "" };
}

/** 행사(소스·대회)마다 채우는 빈칸. */
export interface EventLegalBlanks {
  eventName: string;
  /** ["2026-10-22", "2026-10-23"] 같은 ISO 날짜 목록. */
  eventDates: string[];
  venue: string;
  /** 문의처로 노출할 이메일. 비면 org.privacyContactEmail 로 대체. */
  contactEmail: string;
  /** 행사장 촬영·녹화 여부 — 사전등록 문서의 "촬영·영상" 섹션 노출 조건. */
  onSitePhotography: boolean;
  /** 비어 있으면 제3자 제공 동의 문서 자체를 만들지 않는다. */
  thirdParties: ThirdParty[];
  /** 보유기간 — 비어 있으면 나라별 기본 문구를 쓴다(구현부에서 처리). */
  dataRetentionNote: string;
  /** ISO 날짜. 비어 있으면 오늘 날짜를 쓴다(호출부 책임). */
  effectiveDate: string;
}

export function emptyEventLegalBlanks(): EventLegalBlanks {
  return {
    eventName: "",
    eventDates: [],
    venue: "",
    contactEmail: "",
    onSitePhotography: false,
    thirdParties: [],
    dataRetentionNote: "",
    effectiveDate: "",
  };
}

export interface GenerateInput {
  country: Country;
  purpose: Purpose;
  org: OrgProfile;
  event: EventLegalBlanks;
  /** inferDataCategories() 로 폼 필드에서 뽑아낸 값을 넘긴다. */
  collectedCategories: DataCategory[];
  /** 이 폼이 마케팅 수신 동의를 제공하는지 — false 면 마케팅 동의 문서 자체를 만들지 않는다. */
  marketingOffered: boolean;
}

export interface GeneratedDoc {
  /** 체크박스 옆 짧은 문구. */
  label: string;
  /** "자세히" 팝업에 보여줄 전문. */
  body: string;
}

export interface GenerateOutput {
  /** 항상 생성된다 — 개인정보처리방침은 선택 사항이 아니다. */
  privacy: GeneratedDoc;
  marketing: GeneratedDoc | null;
  thirdParty: GeneratedDoc | null;
}

/** 섹션 하나. purpose·필드 조건에 따라 독립적으로 포함/제외된다. */
export interface Section {
  id: string;
  purposes: readonly Purpose[] | "any";
  /** 없으면 항상 포함(단, purposes 조건은 별도로 적용됨). */
  when?: (ctx: GenerateInput) => boolean;
  render: (ctx: GenerateInput) => string;
}

/** 국가 하나가 세 문서 각각에 쓸 섹션 목록. */
export interface CountrySections {
  privacy: readonly Section[];
  marketing: readonly Section[];
  thirdParty: readonly Section[];
  /** 체크박스 옆 짧은 라벨 — 나라마다 관용구가 달라 섹션이 아니라 별도 함수로 둔다. */
  labels: {
    privacy: (ctx: GenerateInput) => string;
    marketing: (ctx: GenerateInput) => string;
    thirdParty: (ctx: GenerateInput) => string;
  };
}
