import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { buildCollectConfirmationEmail, renderCollectTicketPng } from "../collect-confirmation-email";
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
    });

    expect(result.subject).toBe("Your ticket");
    expect(result.ticketContentId).toBe("registration-ticket");
    expect(result.html).toContain("Alex Kim");
    expect(result.html).toContain("Buyer");
    expect(result.html).toContain("Magic Box, LA");
    expect(result.html).toContain("Line one<br>Line two");
    expect(result.html).not.toContain("alex@example.com");
    expect(result.html).toContain('src="cid:registration-ticket"');
    expect(result.html).toContain("Save the attached ticket image");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("app.example.com");
  });

  it("행사 개요 공개 표시가 꺼져 있어도 이메일 토글이 켜져 있으면 일정·장소를 표시한다", () => {
    const config = normalizeCollectForm({
      eventInfo: { enabled: false, eventDates: ["2026-10-22"], venue: "Magic Box, LA" },
      confirmationEmail: { enabled: true, includeEventInfo: true },
    });
    const result = buildCollectConfirmationEmail({
      config,
      sourceName: "Expo",
      locale: "en",
      registrationNo: "1234567890123",
      data: {},
    });
    expect(result.html).toContain("2026-10-22");
    expect(result.html).toContain("Magic Box, LA");
  });

  it("배지·이름·연락처·QR·등록번호가 포함된 전체 티켓 PNG를 만든다", async () => {
    const config = normalizeCollectForm({
      fields: [
        { key: "full_name", label: "Full name", type: "text", enabled: true },
        { key: "email", label: "Email", type: "email", enabled: true },
        { key: "phone", label: "Phone", type: "tel", enabled: true },
        { key: "visitor_type", label: "Visitor type", type: "select", enabled: true, options: ["General", "Buyer"] },
      ],
      branch: { enabled: true, fieldKey: "visitor_type", groups: [{ value: "Buyer", fields: [] }] },
    });
    const png = await renderCollectTicketPng({
      config,
      registrationNo: "1234567890123",
      data: { full_name: "Alex Kim", email: "alex@example.com", phone: "+12025550147", visitor_type: "Buyer" },
    });
    const metadata = await sharp(png).metadata();
    expect(metadata.format).toBe("png");
    expect(metadata.width).toBe(720);
    expect(metadata.height).toBe(900);
  });

  it("사용자 문구를 HTML로 실행하지 않고 외부 링크를 삽입하지 않는다", () => {
    const config = normalizeCollectForm({
      confirmationEmail: { enabled: true, heading: "<script>alert(1)</script>", showQr: true },
    });
    const result = buildCollectConfirmationEmail({
      config,
      sourceName: "Expo",
      locale: "en",
      registrationNo: "1234567890123",
      data: {},
    });
    expect(result.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("href=");
  });
});
