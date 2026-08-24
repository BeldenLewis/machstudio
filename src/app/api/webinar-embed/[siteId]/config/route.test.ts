import { describe, expect, it } from "vitest";
import { buildPublicRegistrationFormPayload } from "@/lib/webinar-public-registration-form";

describe("임베드 공개 등록 폼 payload", () => {
  it("저장된 완료 CTA의 실행 가능한 URL을 공개 payload에서 비운다", () => {
    expect(buildPublicRegistrationFormPayload({
      registrationForm: {
        successCta: { enabled: true, label: "오픈채팅 입장", url: "javascript:alert(1)" },
      },
    })).toMatchObject({
      successCta: { enabled: true, label: "오픈채팅 입장", url: "" },
    });
  });
});
