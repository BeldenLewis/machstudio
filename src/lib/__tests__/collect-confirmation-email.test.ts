import { describe, expect, it } from "vitest";
import { buildCollectConfirmationEmail } from "../collect-confirmation-email";
import { normalizeCollectForm } from "../collect-form-config";

describe("buildCollectConfirmationEmail", () => {
  it("등록자 티켓·유형·행사 정보와 공개 주소를 메일에 넣는다", () => {
    const config = normalizeCollectForm({
      fields: [
        { key: "full_name", label: "Full name", type: "text", enabled: true },
        { key: "email", label: "Email", type: "email", enabled: true },
        { key: "phone", label: "Phone", type: "tel", enabled: true },
        { key: "visitor_type", label: "Visitor type", type: "select", enabled: true, options: ["General", "Buyer"] },
      ],
      branch: { enabled: true, fieldKey: "visitor_type", groups: [{ value: "Buyer", fields: [] }] },
      eventInfo: { enabled: true, eventDates: ["2026-10-22"], venue: "Magic Box, LA" },
      legal: { eventName: "Korea Expo LA 2026" },
      confirmationEmail: { enabled: true, subject: "Your ticket", body: "Line one\nLine two" },
    });

    const result = buildCollectConfirmationEmail({
      config,
      sourceName: "LA preregistration",
      locale: "en",
      registrationNo: "1234567890123",
      data: {
        full_name: "Alex Kim",
        email: "alex@example.com",
        phone: "+12025550147",
        visitor_type: "Buyer",
      },
      publicOrigin: "https://app.example.com",
    });

    expect(result.subject).toBe("Your ticket");
    expect(result.ticketUrl).toBe("https://app.example.com/t/1234567890123");
    expect(result.qrUrl).toBe("https://app.example.com/api/collect/qr/1234567890123");
    expect(result.html).toContain("Alex Kim");
    expect(result.html).toContain("Buyer");
    expect(result.html).toContain("Magic Box, LA");
    expect(result.html).toContain("Line one<br>Line two");
    expect(result.html).toContain("a•••@example.com");
    expect(result.html).not.toContain("alex@example.com");
  });

  it("사용자 문구를 HTML로 실행하지 않고 공개 주소가 없으면 QR·버튼을 생략한다", () => {
    const config = normalizeCollectForm({
      confirmationEmail: { enabled: true, heading: "<script>alert(1)</script>", showQr: true },
    });
    const result = buildCollectConfirmationEmail({
      config,
      sourceName: "Expo",
      locale: "en",
      registrationNo: "1234567890123",
      data: {},
      publicOrigin: "",
    });
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.ticketUrl).toBe("");
    expect(result.qrUrl).toBe("");
  });
});
