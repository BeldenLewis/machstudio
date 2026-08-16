import { describe, expect, it } from "vitest";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { buildLookupCriteria, buildLookupView } from "@/lib/collect-lookup";

/**
 * 등록 확인(Find My QR) — 이메일 연동 전에는 등록자가 QR 을 되찾는 **유일한 경로**다(§2).
 * 여기서 지키는 것 둘: **설정대로만 조회한다**, **정한 것만 내보낸다**(§10.2).
 */

const base = {
  fields: [
    { id: "a", key: "first_name", label: { en: "First" }, type: "text", enabled: true },
    { id: "b", key: "last_name", label: { en: "Last" }, type: "text", enabled: true },
    { id: "c", key: "email", label: { en: "Email" }, type: "email", enabled: true },
    { id: "d", key: "company", label: { en: "Company" }, type: "text", enabled: true },
    { id: "e", key: "type", label: { en: "Type" }, type: "select", enabled: true, options: [{ en: "Buyer" }] },
  ],
  branch: { enabled: true, fieldKey: "type", groups: [{ value: "Buyer", fields: [] }] },
  validation: { defaultCountry: "US" },
};

const orConfig = normalizeCollectForm({
  ...base,
  lookup: { enabled: true, fields: ["email", "phone"], logic: "or", showQr: true },
});
const andConfig = normalizeCollectForm({
  ...base,
  lookup: { enabled: true, fields: ["email", "phone"], logic: "and", showQr: true },
});
const emailOnly = normalizeCollectForm({
  ...base,
  lookup: { enabled: true, fields: ["email"], logic: "or", showQr: true },
});

describe("조회 조건", () => {
  it("이메일은 소문자·trim 으로 맞춘다 — 저장된 값과 같은 규칙", () => {
    const c = buildLookupCriteria(orConfig, { email: "  Jane@Example.COM " });
    expect(c?.emailNormalized).toBe("jane@example.com");
  });

  /**
   * 표기를 그대로 비교하면 **본인 번호로도 못 찾는다** — 저장은 E.164 한 형태다(§6.3·§10.1).
   */
  it("전화는 E.164 로 바꿔 비교한다", () => {
    const c = buildLookupCriteria(orConfig, { phone: "(202) 555-0147" });
    expect(c?.phoneE164).toBe("+12025550147");
  });

  it("설정이 허용하지 않은 항목으로는 조회하지 않는다", () => {
    // fields: ["email"] 인데 전화만 보내면 조회할 것이 없다.
    expect(buildLookupCriteria(emailOnly, { phone: "2025550147" })).toBeNull();
  });

  it("아무것도 안 보내면 조회하지 않는다", () => {
    expect(buildLookupCriteria(orConfig, {})).toBeNull();
    expect(buildLookupCriteria(orConfig, { email: "not-an-email" })).toBeNull();
  });

  /** and 인데 한쪽만으로 조회하면 그 설정이 사실상 or 가 된다 — 유료 전시에서 남의 티켓이 열린다. */
  it("and 는 둘 다 있어야 조회한다", () => {
    expect(buildLookupCriteria(andConfig, { email: "a@b.com" })).toBeNull();
    expect(buildLookupCriteria(andConfig, { phone: "2025550147" })).toBeNull();
    const c = buildLookupCriteria(andConfig, { email: "a@b.com", phone: "2025550147" });
    expect(c).toMatchObject({ emailNormalized: "a@b.com", phoneE164: "+12025550147", logic: "and" });
  });

  it("or 는 하나만 맞아도 조회한다 — 방문자가 기억나는 쪽으로 찾는다", () => {
    expect(buildLookupCriteria(orConfig, { email: "a@b.com" })).toMatchObject({ logic: "or" });
    expect(buildLookupCriteria(orConfig, { phone: "2025550147" })).toMatchObject({ logic: "or" });
  });
});

describe("내보내는 정보", () => {
  const record = {
    registrationNo: "1234567890128",
    data: {
      first_name: "Jane", last_name: "Doe", email: "jane@example.com",
      company: "Acme Corp", type: "Buyer",
      __consent_privacy: true, __consent_marketing: false,
    },
  };

  it("이름은 이름다운 항목만 폼 순서로 잇는다", () => {
    expect(buildLookupView(orConfig, record)?.name).toBe("Jane Doe");
  });

  it("유형은 분기 기준 항목의 값이다", () => {
    expect(buildLookupView(orConfig, record)?.visitorType).toBe("Buyer");
  });

  /**
   * **§10.2 의 핵심.** or 로 열어 둔 화면은 이메일 하나만 아는 사람에게도 열린다 —
   * 거기에 회사·연락처·응답이 딸려 나오면 그건 명단 유출이다.
   */
  it("연락처·회사·다른 답변·동의 기록은 절대 나가지 않는다", () => {
    const view = buildLookupView(orConfig, record)!;
    const serialized = JSON.stringify(view);
    for (const leak of ["Acme", "jane@example.com", "__consent", "company", "email"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(view).sort()).toEqual(["name", "registrationNo", "showQr", "visitorType"]);
  });

  it("등록번호가 없으면 화면을 만들지 않는다 — 연동형 레코드가 섞여 들어와도 안전하다", () => {
    expect(buildLookupView(orConfig, { registrationNo: null, data: {} })).toBeNull();
  });

  it("showQr 설정을 그대로 전달한다 — 끄면 화면에 티켓을 띄우지 않는다", () => {
    const noQr = normalizeCollectForm({
      ...base,
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: false },
    });
    expect(buildLookupView(noQr, record)?.showQr).toBe(false);
  });

  it("이름 항목이 없으면 빈 문자열 — 화면에서 생략한다", () => {
    const noName = normalizeCollectForm({
      ...base,
      fields: [{ id: "c", key: "email", label: { en: "E" }, type: "email", enabled: true }],
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: true },
    });
    expect(buildLookupView(noName, record)?.name).toBe("");
  });
});
