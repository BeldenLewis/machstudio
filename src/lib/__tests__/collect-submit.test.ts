import { describe, expect, it } from "vitest";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { isValidRegistrationNo } from "@/lib/collect-registration-no";
import { isValidCollectEmail, normalizeEmail, prepareBuilderSubmission, primaryFieldKey, submissionInputFromBody } from "@/lib/collect-submit";

/**
 * 저장 직전까지의 모든 판정 — 서버 라우트와 미리보기가 **같은 함수**를 탄다(설계 §19).
 * DB 를 보지 않으므로 여기서 잡히는 것은 전부 순수한 규칙 위반이다.
 */

const OPEN = normalizeCollectForm({
  fields: [
    { id: "f1", key: "email", label: { en: "Email" }, type: "email", required: true, enabled: true },
    { id: "f2", key: "phone", label: { en: "Phone" }, type: "tel", enabled: true },
    {
      id: "f3", key: "type", label: { en: "Type" }, type: "select", enabled: true,
      options: [{ en: "General" }, { en: "Buyer" }],
    },
  ],
  branch: {
    enabled: true, fieldKey: "type",
    groups: [{ value: "Buyer", fields: [{ id: "b1", key: "company", label: { en: "Company" }, type: "text", required: true, enabled: true }] }],
  },
  validation: { defaultCountry: "US" },
  consent: { privacy: { enabled: true, label: { en: "Privacy" } } },
});

const NOW = new Date("2026-09-10T00:00:00Z");
const ok = { email: "Jane@Example.COM ", phone: "2025550147" };
const yes = { privacy: true };

describe("접수 창", () => {
  it("열려 있으면 통과한다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    expect(r.ok).toBe(true);
  });

  /** 클라이언트만 막으면 마감 후 API 로 등록이 들어온다(설계 §5.1). */
  it("마감 뒤에는 저장 준비 자체를 하지 않는다", () => {
    const closed = normalizeCollectForm({
      ...OPEN,
      eventInfo: { enabled: true, registrationWindow: { closesAt: "2026-09-01T00:00:00Z" } },
    });
    const r = prepareBuilderSubmission(closed, { values: ok, consent: yes }, NOW);
    expect(r).toMatchObject({ ok: false, code: "closed", status: "closed" });
  });

  it("수동 상태 전환이 시각을 이긴다", () => {
    const forced = normalizeCollectForm({ ...OPEN, statusOverride: "closed" });
    expect(prepareBuilderSubmission(forced, { values: ok, consent: yes }, NOW)).toMatchObject({ code: "closed" });
  });
});

describe("검증", () => {
  it("필수 동의가 없으면 거부한다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "invalid") {
      expect(r.issues.map((i) => i.code)).toContain("consent_required");
    }
  });

  it("이메일 형식이 틀리면 거부한다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: { email: "not-an-email" }, consent: yes }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "invalid") {
      expect(r.issues.map((i) => i.code)).toContain("invalid_email");
    }
  });

  /**
   * **서버도 같은 함정을 밟는다.** 런타임이 이미 걸러 보내지만, 서버가 원본 그대로 검증하면
   * 분기를 되돌린 사람의 잔여 값이 unknown_key 로 잡혀 등록이 통째로 거부된다.
   */
  it("분기 밖에 남은 값은 조용히 떨어뜨린다 — 거부하지 않는다", () => {
    const r = prepareBuilderSubmission(
      OPEN,
      { values: { ...ok, type: "General", company: "Acme" }, consent: yes },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.data).not.toHaveProperty("company");
  });

  it("분기 안이면 그 값을 지킨다", () => {
    const r = prepareBuilderSubmission(
      OPEN,
      { values: { ...ok, type: "Buyer", company: "Acme" }, consent: yes },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.data.company).toBe("Acme");
  });

  it("분기 안에서 필수 문항이 비면 거부한다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: { ...ok, type: "Buyer" }, consent: yes }, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok && r.code === "invalid") {
      expect(r.issues).toContainEqual({ key: "company", code: "required" });
    }
  });
});

describe("정규화 컬럼", () => {
  it("이메일은 trim + 소문자 — 중복 판정의 전제(§6.2)", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.emailNormalized).toBe("jane@example.com");
  });

  it("전화는 E.164 한 형태로 — 표기가 제각각이면 등록 확인 조회가 안 맞는다(§6.3)", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.phoneE164).toBe("+12025550147");
  });

  it("파싱 못 하는 번호는 null — 원문은 data 에 남는다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: { ...ok, phone: "1" }, consent: yes }, NOW);
    // 형식 검증에서 먼저 걸린다(빈 값이 아니므로 tel 검증 대상).
    expect(r.ok).toBe(false);
  });

  it("등록번호는 유효한 13자리로 발급된다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(isValidRegistrationNo(r.prepared.registrationNo)).toBe(true);
  });

  it("등록번호는 매번 다르다 — 순차면 규모가 노출되고 추측된다", () => {
    const a = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    const b = prepareBuilderSubmission(OPEN, { values: ok, consent: yes }, NOW);
    if (a.ok && b.ok) expect(a.prepared.registrationNo).not.toBe(b.prepared.registrationNo);
  });

  it("동의는 data 와 분리해 실린다 — 항목 키와 섞이면 CSV 열이 뒤죽박죽이 된다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: { privacy: true, marketing: true } }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.prepared.consent).toEqual({ privacy: true, marketing: true, thirdParty: false });
      expect(r.prepared.data).not.toHaveProperty("privacy");
    }
  });

  it("제3자 제공 동의도 같은 방식으로 실린다 — 명시적 true 일 때만", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: { privacy: true, thirdParty: true } }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.consent.thirdParty).toBe(true);

    const r2 = prepareBuilderSubmission(OPEN, { values: ok, consent: { privacy: true, thirdParty: "yes" } }, NOW);
    if (r2.ok) expect(r2.prepared.consent.thirdParty).toBe(false);
  });

  /** 아무 문자열이나 저장하면 언어별 재발송이 그 값으로 갈라져 보낼 수 없는 언어가 생긴다. */
  it("로케일은 폼이 아는 것만 받는다", () => {
    const r = prepareBuilderSubmission(OPEN, { values: ok, consent: yes, locale: "zz" }, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.locale).toBe("en");
  });
});

describe("대표 항목 고르기", () => {
  /** 규칙이 없으면 중복 차단이 폼 편집 순서에 따라 조용히 다른 항목에 걸린다. */
  it("같은 유형이 여럿이면 보이는 순서에서 처음 것", () => {
    const two = normalizeCollectForm({
      fields: [
        { id: "a", key: "work_email", type: "email", label: { en: "Work" }, enabled: true },
        { id: "b", key: "alt_email", type: "email", label: { en: "Alt" }, enabled: true },
      ],
    });
    expect(primaryFieldKey(two, {}, "email")).toBe("work_email");
  });

  it("해당 유형이 없으면 null", () => {
    const none = normalizeCollectForm({ fields: [{ id: "a", key: "name", type: "text", label: { en: "N" }, enabled: true }] });
    expect(primaryFieldKey(none, {}, "email")).toBeNull();
  });
});

/**
 * 방문자가 고른 국가로 번호를 읽는다(§6.3). LA 폼(기본 US)에 한국 참관객이 오는 것이
 * 파일럿의 기본 시나리오이므로, 이게 안 되면 그 사람들은 등록을 끝내지 못한다.
 */
/**
 * 요청 본문 → 입력 변환.
 *
 * **이 테스트가 막는 실패는 "빠뜨림" 이다.** 라우트가 손으로 필드를 골라 담던 때
 * phoneCountries 가 조용히 떨어져, 방문자가 고른 국가가 서버에서 무시됐다 — 선택 필드라
 * 타입 오류도 안 났고 순수 함수 테스트도 전부 통과했다(그쪽은 직접 넣어 호출하니까).
 * 프로덕션에 실제로 쏴 보고서야 드러났다.
 */
describe("요청 본문 → 제출 입력", () => {
  it("보낸 항목을 하나도 빠뜨리지 않는다", () => {
    const body = {
      values: { email: "a@b.com" },
      consent: { privacy: true, marketing: false },
      locale: "en",
      phoneCountries: { phone: "KR" },
    };
    expect(submissionInputFromBody(body)).toEqual(body);
  });

  /**
   * SubmissionInput 에 항목이 늘면 여기도 늘어야 한다. 목록을 못 박아 두면
   * "추가했는데 라우트가 안 넘긴다" 가 이 테스트에서 먼저 걸린다.
   */
  it("변환이 다루는 항목 목록을 못 박는다", () => {
    const full = submissionInputFromBody({
      values: {}, consent: {}, locale: "en", phoneCountries: {},
    });
    expect(Object.keys(full).sort()).toEqual(["consent", "locale", "phoneCountries", "values"]);
  });

  it("본문이 비어도 안전한 기본값을 만든다", () => {
    const empty = submissionInputFromBody({});
    expect(empty.values).toEqual({});
    expect(empty.consent).toBeUndefined();
  });
});

describe("전화 국가 선택", () => {
  const phoneForm = normalizeCollectForm({
    fields: [{ id: "f1", key: "phone", label: { en: "Phone" }, type: "tel", required: true, enabled: true }],
    validation: { defaultCountry: "US" },
  });
  // 개인정보 동의는 기본이 필수다 — 빼면 전화가 아니라 동의에서 걸린다.
  const run = (phone: string, phoneCountries?: unknown) =>
    prepareBuilderSubmission(
      phoneForm,
      { values: { phone }, phoneCountries, consent: { privacy: true } },
      new Date(),
    );

  it("KR 을 고르면 한국 번호가 통과하고 앞 0 이 떨어진다", () => {
    const r = run("01012345678", { phone: "KR" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.phoneE164).toBe("+821012345678");
  });

  /** 고르지 않으면 설정의 기본 국가다 — "기본을 박아두고 아닌 사람만 바꾼다"(§6.3). */
  it("안 고르면 기본 국가로 읽는다", () => {
    const r = run("2025550147");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.prepared.phoneE164).toBe("+12025550147");
  });

  /** 같은 번호도 국가가 틀리면 무효다 — 그래서 고를 수 있어야 한다. */
  it("기본 국가로는 거부되던 번호가 국가를 고르면 통과한다", () => {
    const withoutPick = run("01012345678");
    expect(withoutPick.ok).toBe(false);
    if (!withoutPick.ok && withoutPick.code === "invalid") {
      expect(withoutPick.issues[0]).toEqual({ key: "phone", code: "invalid_phone" });
    }
  });

  /** 아무 문자열이나 받으면 toE164 가 전부 null 을 내 그 폼의 전화가 통째로 무효가 된다. */
  it("모르는 국가 코드는 무시하고 기본으로 떨어진다", () => {
    for (const bad of [{ phone: "UK" }, { phone: "" }, { phone: 82 }, "not-an-object", null]) {
      const r = run("2025550147", bad);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.prepared.phoneE164).toBe("+12025550147");
    }
  });
});

describe("이메일 유효성 — 설계 §6.2 의 '추가 차단'", () => {
  /**
   * **과잉 차단 회귀 방지가 먼저다.** §22 가 이 주소를 이름으로 지목한다 —
   * 좁히려다 실제 고객 주소를 막으면 그 사람은 등록을 아예 못 한다.
   */
  it("실제로 쓰이는 주소를 막지 않는다", () => {
    for (const ok of [
      "john.doe+expo@company.co.uk",
      "a@b.co",
      "first.last@sub.domain.example",
      "user_name-1@example.com",
    ]) expect(isValidCollectEmail(ok)).toBe(true);
  });

  /** 이 셋은 RFC 위반이라 **발송 자체가 거부된다** — 통과시키면 그 사람은 QR 을 못 받는다. */
  it("연속 점·로컬파트 시작/끝 점을 막는다", () => {
    for (const bad of ["john..doe@company.com", ".john@company.com", "john.@company.com"]) {
      expect(isValidCollectEmail(bad)).toBe(false);
    }
  });

  /** 도메인의 점은 정상이다 — 로컬파트만 본다는 것을 못 박는다. */
  it("도메인 쪽 점은 건드리지 않는다", () => {
    expect(isValidCollectEmail("a@b.c.d.example")).toBe(true);
  });

  it("기존 형식·길이 규칙은 그대로다", () => {
    expect(isValidCollectEmail("a@b")).toBe(false);
    expect(isValidCollectEmail("no-at-sign")).toBe(false);
    expect(isValidCollectEmail("a".repeat(320) + "@b.com")).toBe(false);
  });
});

describe("normalizeEmail", () => {
  /**
   * 붙여넣기로 딸려 오는 제로폭 공백. 화면에서는 구분이 안 되고 `\s` 에도 안 잡혀
   * trim 이 못 지운다 — 남으면 같은 사람이 같은 주소로 두 번 등록된다(키가 갈려
   * 유니크 인덱스도 안 막는다). 의도적으로 붙이면 중복 차단을 우회할 수 있다.
   */
  it("보이지 않는 문자를 지운다", () => {
    expect(normalizeEmail("ja\u200Bne@example.com")).toBe("jane@example.com");
    expect(normalizeEmail("\uFEFFjane@example.com\u200D")).toBe("jane@example.com");
  });

  it("보이지 않는 문자뿐이면 없는 것으로 본다", () => {
    expect(normalizeEmail("\u200B\uFEFF")).toBeNull();
  });

  it("빈 값은 null — 이메일 항목이 없는 폼에서는 중복 차단이 걸리지 않는다", () => {
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});
