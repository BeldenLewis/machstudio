import { describe, expect, it } from "vitest";
import { generateConsentDocuments } from "@/lib/legal-templates/generate";
import { ORG_TOKEN } from "@/lib/legal-templates/tokens";
import type { Country, GenerateInput, Purpose } from "@/lib/legal-templates/types";
import { emptyEventLegalBlanks, emptyOrgProfile } from "@/lib/legal-templates/types";

const COUNTRIES: Country[] = ["us", "kr"];
const PURPOSES: Purpose[] = ["pre-registration", "competition-entry"];

function baseInput(overrides: Partial<GenerateInput> = {}): GenerateInput {
  return {
    country: "us",
    purpose: "pre-registration",
    org: { ...emptyOrgProfile(), legalName: "Exporum Inc.", address: "123 Main St, Los Angeles, CA", privacyContactEmail: "privacy@exporum.com" },
    event: {
      ...emptyEventLegalBlanks(),
      eventName: "Korea Expo LA",
      eventDates: ["2026-10-22", "2026-10-24"],
      venue: "Magic Box, Los Angeles",
      contactEmail: "privacy@exporum.com",
    },
    collectedCategories: ["email", "phone"],
    marketingOffered: true,
    ...overrides,
  };
}

describe("generateConsentDocuments — 국가 × 목적 전수", () => {
  it.each(COUNTRIES.flatMap((country) => PURPOSES.map((purpose) => [country, purpose] as const)))(
    "%s × %s — 개인정보처리방침은 항상 비어있지 않다",
    (country, purpose) => {
      const result = generateConsentDocuments(baseInput({ country, purpose }));
      expect(result.privacy.label.length).toBeGreaterThan(0);
      expect(result.privacy.body.length).toBeGreaterThan(100);
    },
  );

  it.each(COUNTRIES)("%s — marketingOffered 가 false 면 marketing 은 null", (country) => {
    const result = generateConsentDocuments(baseInput({ country, marketingOffered: false }));
    expect(result.marketing).toBeNull();
  });

  it.each(COUNTRIES)("%s — marketingOffered 가 true 면 marketing 이 생성된다", (country) => {
    const result = generateConsentDocuments(baseInput({ country, marketingOffered: true }));
    expect(result.marketing).not.toBeNull();
    expect(result.marketing!.body.length).toBeGreaterThan(0);
  });

  it.each(COUNTRIES)("%s — 제3자 목록이 비어있으면 thirdParty 는 null", (country) => {
    const result = generateConsentDocuments(
      baseInput({ country, event: { ...emptyEventLegalBlanks(), thirdParties: [] } }),
    );
    expect(result.thirdParty).toBeNull();
  });

  it.each(COUNTRIES)("%s — 제3자 목록이 있으면 thirdParty 가 생성되고 이름이 들어간다", (country) => {
    const result = generateConsentDocuments(
      baseInput({
        country,
        event: {
          ...emptyEventLegalBlanks(),
          thirdParties: [{ name: "Sponsor Co.", purpose: "Prize fulfillment" }],
        },
      }),
    );
    expect(result.thirdParty).not.toBeNull();
    expect(result.thirdParty!.body).toContain("Sponsor Co.");
  });

  it("purpose 에 따라 촬영/영상 섹션 내용이 달라진다 (사전등록 vs 참가자)", () => {
    const registration = generateConsentDocuments(
      baseInput({ purpose: "pre-registration", event: { ...emptyEventLegalBlanks(), eventName: "X", onSitePhotography: true } }),
    );
    const competition = generateConsentDocuments(baseInput({ purpose: "competition-entry" }));

    expect(registration.privacy.body).toMatch(/Photography and Videography/);
    expect(competition.privacy.body).toMatch(/Use of Submitted Media/);
    // 서로 다른 섹션이 나와야 한다 — 문구가 같으면 purpose 분기가 실제로 안 걸린 것.
    expect(registration.privacy.body).not.toEqual(competition.privacy.body);
  });

  it("사전등록에서 onSitePhotography 가 꺼져 있으면 촬영 섹션 자체가 빠진다", () => {
    const result = generateConsentDocuments(
      baseInput({ purpose: "pre-registration", event: { ...emptyEventLegalBlanks(), onSitePhotography: false } }),
    );
    expect(result.privacy.body).not.toMatch(/Photography and Videography/);
  });

  it("collectedCategories 에 없는 항목은 개인정보처리방침 수집 목록에 등장하지 않는다", () => {
    const withPhone = generateConsentDocuments(baseInput({ collectedCategories: ["email", "phone"] }));
    const withoutPhone = generateConsentDocuments(baseInput({ collectedCategories: ["email"] }));
    expect(withPhone.privacy.body).toContain("your phone number");
    expect(withoutPhone.privacy.body).not.toContain("your phone number");
  });

  it("KR 문서는 PIPA 필수 고지 항목(보유기간·거부권·제3자 제공 시 항목별 안내)을 포함한다", () => {
    const result = generateConsentDocuments(
      baseInput({
        country: "kr",
        event: {
          ...emptyEventLegalBlanks(),
          eventName: "댄스 콘테스트",
          thirdParties: [{ name: "협찬사 A", purpose: "경품 발송" }],
        },
      }),
    );
    expect(result.privacy.body).toContain("보유 및 이용기간");
    expect(result.privacy.body).toContain("정보주체");
    expect(result.thirdParty).not.toBeNull();
    expect(result.thirdParty!.body).toContain("제공받는 자");
    expect(result.thirdParty!.body).toContain("보유·이용기간");
    expect(result.thirdParty!.body).toContain("협찬사 A");
  });

  it("빈칸을 안 채워도 던지지 않고 플레이스홀더로 채운다", () => {
    const result = generateConsentDocuments({
      country: "us",
      purpose: "pre-registration",
      org: emptyOrgProfile(),
      event: emptyEventLegalBlanks(),
      collectedCategories: [],
      marketingOffered: false,
    });
    // 조직명·주소·이메일은 리터럴이 아니라 토큰으로 남는다 — resolveOrgTokens.test.ts 가 그 치환을 검증한다.
    expect(result.privacy.body).toContain(ORG_TOKEN.name);
    expect(result.privacy.body).toContain("[Event Name]");
  });

  it("조직 연락처는 리터럴이 아니라 항상 토큰으로 남는다 — 워크스페이스 값이 바뀌면 재생성 없이 갱신되게", () => {
    const result = generateConsentDocuments(baseInput());
    expect(result.privacy.body).toContain(ORG_TOKEN.name);
    expect(result.privacy.body).toContain(ORG_TOKEN.address);
    expect(result.privacy.body).not.toContain("Exporum Inc.");
    expect(result.privacy.body).not.toContain("123 Main St");
  });

  it.each(COUNTRIES)(
    "%s — 국외이전 고지는 서버 소재지 토큰을 쓴다, 운영자가 직접 손봐야 하는 운영 메모를 남기지 않는다",
    (country) => {
      const result = generateConsentDocuments(baseInput({ country }));
      expect(result.privacy.body).toContain(ORG_TOKEN.hostingRegion);
      expect(result.privacy.body).not.toMatch(/Operations note|운영 참고/);
    },
  );

  it("행사별 문의처 override 는 토큰이 아니라 그 행사에 한정된 리터럴로 남는다", () => {
    const result = generateConsentDocuments(
      baseInput({ event: { ...emptyEventLegalBlanks(), eventName: "X", contactEmail: "onsite@event.example" } }),
    );
    expect(result.privacy.body).toContain("onsite@event.example");
    expect(result.privacy.body).not.toContain(ORG_TOKEN.email);
  });

  it("알 수 없는 국가 코드는 US 로 폴백한다 — 화면이 비면 안 된다", () => {
    const result = generateConsentDocuments(baseInput({ country: "de" as Country }));
    expect(result.privacy.body).toContain("Privacy Policy");
  });
});
