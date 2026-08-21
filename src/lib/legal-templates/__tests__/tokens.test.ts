import { describe, expect, it } from "vitest";
import { ORG_TOKEN, encodeOrgTokens, resolveOrgTokens } from "@/lib/legal-templates/tokens";
import { emptyOrgProfile } from "@/lib/legal-templates/types";

/**
 * `resolveOrgTokens` 는 저장된 문서 본문에 남아 있는 조직 토큰을 **노출 시점**의 워크스페이스
 * 값으로 채운다 — 이 시점 분리가 "생성 버튼을 다시 안 눌러도 주소가 갱신된다"는 요구의 핵심이다.
 */
describe("resolveOrgTokens", () => {
  it("채워진 조직 정보로 토큰을 치환한다", () => {
    const org = { ...emptyOrgProfile(), legalName: "Exporum Inc.", address: "123 Main St, LA", privacyContactEmail: "privacy@exporum.com" };
    const text = `${ORG_TOKEN.name}, ${ORG_TOKEN.address} / ${ORG_TOKEN.email}`;
    expect(resolveOrgTokens(text, org, "en")).toBe("Exporum Inc., 123 Main St, LA / privacy@exporum.com");
  });

  it("서버 소재지가 비어 있으면 자리표시자, 채워지면 그대로 치환된다", () => {
    expect(resolveOrgTokens(ORG_TOKEN.hostingRegion, emptyOrgProfile(), "en")).toBe("[server hosting region — set in Workspace Settings]");
    expect(resolveOrgTokens(ORG_TOKEN.hostingRegion, emptyOrgProfile(), "ko")).toBe("[서버 소재지 미입력 — 워크스페이스 설정에서 입력]");
    const org = { ...emptyOrgProfile(), hostingRegion: "대한민국" };
    expect(resolveOrgTokens(ORG_TOKEN.hostingRegion, org, "ko")).toBe("대한민국");
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

/**
 * `encodeOrgTokens` 는 `resolveOrgTokens` 의 역방향 — 편집 칸이 항상 실제 값만 보여주고
 * ({{ORG_ADDRESS}} 같은 중괄호 문법 없이), 저장할 때만 다시 토큰으로 접어 넣는다.
 * "이런거 없게 입력할 수 있게 해줘" 피드백이 이 왕복(resolve → 편집 → encode)의 근거다.
 */
describe("encodeOrgTokens", () => {
  const org = { ...emptyOrgProfile(), legalName: "Exporum Inc.", address: "123 Main St, LA", privacyContactEmail: "privacy@exporum.com" };

  it("resolveOrgTokens 로 풀었던 값을 그대로 되돌리면 원문과 같다 — 왕복이 무손실이다", () => {
    const original = `${ORG_TOKEN.name}, ${ORG_TOKEN.address} 문의: ${ORG_TOKEN.email}`;
    const resolved = resolveOrgTokens(original, org, "en");
    expect(encodeOrgTokens(resolved, org)).toBe(original);
  });

  it("조직 값과 무관한 나머지 문장은 그대로 둔다", () => {
    const resolved = `이 문서는 ${org.legalName} 가 작성했습니다. 그 외 내용은 자유 서술입니다.`;
    expect(encodeOrgTokens(resolved, org)).toBe(`이 문서는 ${ORG_TOKEN.name} 가 작성했습니다. 그 외 내용은 자유 서술입니다.`);
  });

  it("아직 비어 있는 필드는 되돌릴 원본이 없어 손대지 않는다", () => {
    const text = "[Business Legal Name] 가 작성했습니다.";
    expect(encodeOrgTokens(text, emptyOrgProfile())).toBe(text);
  });

  it("개인정보보호책임자 이메일이 일반 담당 이메일과 다르면 각자의 토큰으로 구분해서 되돌린다", () => {
    const withDistinctDpo = { ...org, dpoContactEmail: "dpo@exporum.com" };
    const text = `일반 문의: ${org.privacyContactEmail}, 보호책임자: dpo@exporum.com`;
    expect(encodeOrgTokens(text, withDistinctDpo)).toBe(`일반 문의: ${ORG_TOKEN.email}, 보호책임자: ${ORG_TOKEN.dpoEmail}`);
  });
});
