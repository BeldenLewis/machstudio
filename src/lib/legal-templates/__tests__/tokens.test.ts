import { describe, expect, it } from "vitest";
import { ORG_TOKEN, resolveOrgTokens } from "@/lib/legal-templates/tokens";
import { emptyOrgProfile } from "@/lib/legal-templates/types";

/**
 * `resolveOrgTokens` 는 저장된 문서 본문에 남아 있는 조직 토큰을 **노출 시점**의 워크스페이스
 * 값으로 채운다 — 이 시점 분리가 "생성 버튼을 다시 안 눌러도 주소가 갱신된다"는 요구의 핵심이다.
 */
describe("resolveOrgTokens", () => {
  it("채워진 조직 정보로 토큰을 치환한다", () => {
    const org = { legalName: "Exporum Inc.", address: "123 Main St, LA", privacyContactEmail: "privacy@exporum.com" };
    const text = `${ORG_TOKEN.name}, ${ORG_TOKEN.address} / ${ORG_TOKEN.email}`;
    expect(resolveOrgTokens(text, org, "en")).toBe("Exporum Inc., 123 Main St, LA / privacy@exporum.com");
  });

  it("비어 있으면 조용히 지우지 않고 언어별 자리표시자를 남긴다", () => {
    const org = emptyOrgProfile();
    expect(resolveOrgTokens(ORG_TOKEN.name, org, "en")).toBe("[Business Legal Name]");
    expect(resolveOrgTokens(ORG_TOKEN.name, org, "ko")).toBe("[회사명 미입력]");
  });

  it("개인정보보호책임자 이메일이 비어 있으면 일반 담당 이메일로, 그것도 비어 있으면 자리표시자로 떨어진다", () => {
    const withDpo = { ...emptyOrgProfile(), dpoContactEmail: "dpo@exporum.com" };
    expect(resolveOrgTokens(ORG_TOKEN.dpoEmail, withDpo, "en")).toBe("dpo@exporum.com");

    const withoutDpo = { ...emptyOrgProfile(), privacyContactEmail: "privacy@exporum.com" };
    expect(resolveOrgTokens(ORG_TOKEN.dpoEmail, withoutDpo, "en")).toBe("privacy@exporum.com");

    expect(resolveOrgTokens(ORG_TOKEN.dpoEmail, emptyOrgProfile(), "ko")).toBe("[담당 이메일 미입력]");
  });

  it("워크스페이스 값을 나중에 채워도 이미 저장된 본문의 토큰이 그대로 새 값을 받는다", () => {
    const text = `문의: ${ORG_TOKEN.email}`;
    const before = resolveOrgTokens(text, emptyOrgProfile(), "ko");
    const after = resolveOrgTokens(text, { ...emptyOrgProfile(), privacyContactEmail: "new@exporum.com" }, "ko");
    expect(before).not.toBe(after);
    expect(after).toBe("문의: new@exporum.com");
  });
});
