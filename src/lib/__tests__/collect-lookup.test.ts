import { describe, expect, it } from "vitest";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { buildLookupCriteria, buildLookupView, buildTicketView } from "@/lib/collect-lookup";

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
   * 거기에 회사·응답이 딸려 나오면 그건 명단 유출이다.
   *
   * 연락처는 **가려서만** 나간다. 이름만으로는 동명이인을 못 가려 "내 거 맞나" 를 확인할
   * 수 없다는 실제 불편이 있어 열었지만, 가리는 것이 조건이다 — 이메일만 아는 사람이
   * 남의 전화번호를 가져가면 안 된다.
   */
  it("회사·다른 답변·동의 기록은 절대 나가지 않는다", () => {
    const view = buildLookupView(orConfig, record)!;
    const serialized = JSON.stringify(view);
    for (const leak of ["Acme", "__consent", "company"]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(view).sort()).toEqual([
      "maskedEmail", "maskedPhone", "name", "registrationNo", "showQr", "visitorType",
    ]);
  });

  it("연락처는 **원문 그대로 나가지 않는다** — 가린 형태만", () => {
    const view = buildLookupView(orConfig, record)!;
    const serialized = JSON.stringify(view);
    // 원문이 통째로 들어 있으면 가린 게 아니다.
    expect(serialized).not.toContain("jane@example.com");
    expect(view.maskedEmail).toBe("j•••@example.com");
    // 로컬파트는 첫 글자만 남아야 한다.
    expect(view.maskedEmail).not.toContain("jane");
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

  /**
   * **번호가 곧 티켓이다.** `/t/{regNo}` 는 번호만 알면 이름·유형·QR 을 전부 연다.
   * `or` + `showQr:false` 는 "이메일 하나만 아는 사람에게 티켓을 주지 않겠다" 는
   * 설정인데, 응답에 번호를 실어 보내면 화면에서 감춰 봐야 소용이 없다.
   */
  it("showQr 를 끄면 등록번호를 아예 내보내지 않는다", () => {
    const noQr = normalizeCollectForm({
      ...base,
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: false },
    });
    const view = buildLookupView(noQr, record)!;
    expect(view.registrationNo).toBeNull();
    expect(JSON.stringify(view)).not.toContain("1234567890128");
    // 본인 확인용 표시는 남는다 — 그게 없으면 "찾았다" 는 사실도 전달되지 않는다.
    expect(view.name).toBe("Jane Doe");
  });
});

/**
 * 티켓 화면은 조회 화면과 **정책이 다르다.** 번호를 이미 손에 쥔 사람이고, 완료 화면에서
 * 이어지는 §2 의 주 QR 전달 경로다 — 조회 설정 하나로 그 경로가 같이 끊기면 안 된다.
 */
describe("티켓 화면", () => {
  const record = {
    registrationNo: "1234567890128",
    data: { first_name: "Jane", last_name: "Doe", email: "jane@example.com", company: "Acme Corp", type: "Buyer" },
  };

  it("showQr 를 꺼도 번호가 그대로 있다", () => {
    const noQr = normalizeCollectForm({
      ...base,
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: false },
    });
    expect(buildTicketView(noQr, record)?.registrationNo).toBe("1234567890128");
  });

  it("조회 화면과 같은 최소 노출 규칙을 쓴다", () => {
    const view = buildTicketView(orConfig, record)!;
    expect(Object.keys(view).sort()).toEqual(["name", "registrationNo", "visitorType"]);
    expect(JSON.stringify(view)).not.toContain("Acme");
  });

  it("등록번호가 없으면 화면을 만들지 않는다", () => {
    expect(buildTicketView(orConfig, { registrationNo: null, data: {} })).toBeNull();
  });

  /**
   * **적대적 리뷰가 잡은 것.** key 는 운영자가 손으로 적는 자유 문자열이고 빌더 기본값은
   * `field`·`field_2` 다 — key 만 보면 라벨을 제대로 적은 폼에서도 이름이 사라진다.
   */
  it("key 가 기본값이어도 라벨로 이름을 찾는다", () => {
    const labelOnly = normalizeCollectForm({
      ...base,
      fields: [
        { id: "a", key: "field", label: { en: "First name" }, type: "text", enabled: true },
        { id: "b", key: "field_2", label: { en: "Last name" }, type: "text", enabled: true },
      ],
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: true },
    });
    const view = buildLookupView(labelOnly, {
      registrationNo: "1234567890128",
      data: { field: "Jane", field_2: "Doe" },
    });
    expect(view?.name).toBe("Jane Doe");
  });

  /** 앵커가 없으면 참관 인원수·회사명이 티켓의 이름 자리에 인쇄된다(§10.2 위반). */
  it("이름처럼 생겼을 뿐인 항목은 잡지 않는다", () => {
    const trap = normalizeCollectForm({
      ...base,
      fields: [
        { id: "a", key: "family_members", label: { en: "Family members" }, type: "text", enabled: true },
        { id: "b", key: "first_visit_company_name", label: { en: "Company" }, type: "text", enabled: true },
        { id: "c", key: "given_referral", label: { en: "Referral" }, type: "text", enabled: true },
      ],
      lookup: { enabled: true, fields: ["email"], logic: "or", showQr: true },
    });
    const view = buildLookupView(trap, {
      registrationNo: "1234567890128",
      data: { family_members: "4", first_visit_company_name: "Acme", given_referral: "friend" },
    });
    expect(view?.name).toBe("");
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
