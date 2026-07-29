import { describe, expect, it } from "vitest";
import { buildWebinarLoaderScript } from "@/lib/webinar-loader-script";

const script = buildWebinarLoaderScript({
  siteId: "site_test",
  baseUrl: "https://mach.example",
});

describe("임베드 등록 완료 CTA", () => {
  it("정규화된 완료 CTA를 읽고 새 탭 보안을 적용한다", () => {
    expect(script).toContain("form.successCta");
    expect(script).toContain('target = "_blank"');
    expect(script).toContain('rel = "noopener noreferrer"');
  });

  it("CTA와 닫기 동작을 분리한다", () => {
    expect(script).toContain("mw-done-cta");
    expect(script).toContain("mw-done-close");
  });
});
