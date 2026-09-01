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
    });

    expect(result.subject).toBe("Your ticket");
    expect(result.qrContentId).toBe("registration-qr");
    expect(result.html).toContain("Alex Kim");
    expect(result.html).toContain("Buyer");
    expect(result.html).toContain("Magic Box, LA");
    expect(result.html).toContain("Line one<br>Line two");
    expect(result.html).not.toContain("alex@example.com");
    expect(result.html).toContain('src="cid:registration-qr"');
    expect(result.html).not.toContain("Save the attached");
    expect(result.html).not.toContain("href=");
    expect(result.html).not.toContain("app.example.com");
  });

  /**
   * showOnTicket 을 켠 항목(예: 동반 인원 수)이 확인 메일에도 티켓 화면·완료 화면과 같이
   * 뜬다 — 세 자리 중 하나만 반영되면 "QR 은 봤는데 메일엔 없다"가 생긴다.
   */
  it("showOnTicket 을 켠 항목의 값을 Phone/E-mail 과 같은 자리에 넣는다", () => {
    const config = normalizeCollectForm({
      fields: [
        { key: "companions", label: "Companions", type: "number", enabled: true, showOnTicket: true },
        { key: "notes", label: "Notes", type: "text", enabled: true, showOnTicket: true },
      ],
      confirmationEmail: { enabled: true },
    });
    const result = buildCollectConfirmationEmail({
      config,
      sourceName: "Expo",
      locale: "en",
      registrationNo: "1234567890123",
      data: { companions: "2", notes: "should stay private" },
    });
    expect(result.html).toContain("Companions</strong>2");
    // 값이 비어 있으면(§공통 "빈 껍데기 노출 금지") 라벨도 같이 안 나간다.
    expect(result.html).not.toContain("Notes");
    expect(result.html).not.toContain("should stay private");
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
