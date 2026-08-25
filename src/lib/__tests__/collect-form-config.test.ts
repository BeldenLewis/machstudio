import { describe, expect, it } from "vitest";
import {
  EMPTY_FORM_CONFIG,
  canonicalBranchValue,
  localize,
  normalizeCollectForm,
  resolveRegistrationStatus,
  toLocalized,
  validateSubmission,
  visibleFields,
  type CollectFormConfig,
} from "../collect-form-config";

const deps = {
  isValidEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  isValidPhone: (v: string) => v.replace(/\D/g, "").length >= 10,
  consent: { privacy: true },
};

/** 정규화를 거친 설정을 만든다 — 테스트가 항상 실물과 같은 모양을 보게. */
function cfg(patch: Record<string, unknown>): CollectFormConfig {
  return normalizeCollectForm(patch);
}

describe("Localized — 번역이 비어도 화면이 비지 않는다", () => {
  it("문자열은 기본 로케일 맵으로 승격한다 (하위호환)", () => {
    expect(toLocalized("First name")).toEqual({ en: "First name" });
    expect(toLocalized("")).toEqual({});
  });

  it("폴백 사슬: 요청 → 기본 → 채워진 첫 값", () => {
    const v = { en: "Name", ko: "이름" };
    expect(localize(v, "ko")).toBe("이름");
    expect(localize(v, "fr")).toBe("Name"); // 없는 로케일 → 기본
    expect(localize({ fr: "Nom" }, "ko")).toBe("Nom"); // 기본도 없으면 첫 값
    expect(localize(undefined)).toBe("");
  });
});

describe("normalizeCollectForm — 어떤 쓰레기가 와도 던지지 않는다", () => {
  it("null·문자열·배열을 넣어도 빈 설정으로 떨어진다", () => {
    for (const bad of [null, undefined, "", 0, [], "text"]) {
      expect(() => normalizeCollectForm(bad)).not.toThrow();
      expect(normalizeCollectForm(bad).fields).toEqual([]);
    }
  });

  it("key 없는 항목은 버린다 — 그려도 값이 저장될 자리가 없다", () => {
    const c = cfg({ fields: [{ label: "이름" }, { key: "email", label: "Email" }] });
    expect(c.fields.map((f) => f.key)).toEqual(["email"]);
  });

  it("중복 key 는 뒤엣것을 버린다 — 저장 값이 서로를 덮어쓴다", () => {
    const c = cfg({ fields: [{ key: "email", label: "A" }, { key: "email", label: "B" }] });
    expect(c.fields).toHaveLength(1);
    expect(localize(c.fields[0].label)).toBe("A");
  });

  it("빈 선택지는 걸러진다 — 공개 폼에 빈 드롭다운 줄이 생기지 않게", () => {
    const c = cfg({ fields: [{ key: "t", type: "select", options: ["General", "", "  ", "Buyer"] }] });
    expect(c.fields[0].options.map((o) => localize(o))).toEqual(["General", "Buyer"]);
  });

  it("maxSelect 가 옵션 수 이상이면 저장하지 않는다 — 무제한과 같다", () => {
    const two = { key: "m", type: "multiple", options: ["a", "b"] };
    expect(cfg({ fields: [{ ...two, maxSelect: 1 }] }).fields[0].maxSelect).toBe(1);
    expect(cfg({ fields: [{ ...two, maxSelect: 2 }] }).fields[0].maxSelect).toBeUndefined();
    expect(cfg({ fields: [{ ...two, maxSelect: 0 }] }).fields[0].maxSelect).toBeUndefined();
  });

  it("모르는 유형은 text 로 — 렌더러가 분기에서 떨어지지 않게", () => {
    expect(cfg({ fields: [{ key: "x", type: "date" }] }).fields[0].type).toBe("text");
  });

  /**
   * 분기 기준 항목을 지웠는데 분기가 켜진 채로 남으면, 렌더러가 없는 key 의 값을 기다리며
   * 유형 문항을 영영 그리지 않는다 — 빌더에서 항목을 지우는 건 흔한 일이라 반드시 막는다.
   */
  it("분기는 기준 항목이 실제로 있을 때만 켜진다", () => {
    const groups = [{ value: "buyer", fields: [{ key: "budget" }] }];
    expect(cfg({ fields: [{ key: "type", type: "select" }], branch: { enabled: true, fieldKey: "type", groups } }).branch.enabled).toBe(true);
    expect(cfg({ fields: [{ key: "email" }], branch: { enabled: true, fieldKey: "type", groups } }).branch.enabled).toBe(false);
  });

  it("테마 색은 비어 있으면 기본값(빈 문자열 = CSS 기본색)으로 떨어진다", () => {
    expect(cfg({}).theme).toEqual({ accentColor: "", textColor: "", surfaceColor: "" });
  });

  it("테마 색은 6자리 HEX 형식일 때만 저장한다 — 아니면 CSS 기본값으로 떨어진다", () => {
    expect(cfg({ theme: { accentColor: "#FF8500" } }).theme.accentColor).toBe("#FF8500");
    expect(cfg({ theme: { accentColor: "orange" } }).theme.accentColor).toBe("");
    expect(cfg({ theme: { accentColor: "#fff" } }).theme.accentColor).toBe("");
  });

  it("운영시간은 날짜가 없는 행을 걸러낸다", () => {
    const c = cfg({ eventInfo: { openingHours: [{ date: "2026-10-22", open: "10:00", close: "17:00" }, { date: "", open: "09:00" }] } });
    expect(c.eventInfo.openingHours).toHaveLength(1);
    expect(c.eventInfo.openingHours[0]).toEqual({ date: "2026-10-22", open: "10:00", close: "17:00", lastEntrance: "" });
  });

  it("동의 사전 체크는 명시적 true 일 때만 — 기본은 항상 미체크", () => {
    expect(cfg({}).consent.privacy.defaultChecked).toBe(false);
    expect(cfg({ consent: { privacy: { defaultChecked: "yes" } } }).consent.privacy.defaultChecked).toBe(false);
    expect(cfg({ consent: { privacy: { defaultChecked: true } } }).consent.privacy.defaultChecked).toBe(true);
  });

  it("제3자 제공 동의는 기본 꺼짐 — 모든 소스가 제3자에게 정보를 주는 게 아니다", () => {
    expect(cfg({}).consent.thirdParty.enabled).toBe(false);
    expect(cfg({ consent: { thirdParty: { enabled: true, defaultChecked: true } } }).consent.thirdParty.enabled).toBe(true);
    // 마케팅과 같은 규칙 — 사전 체크는 명시적 true 일 때만.
    expect(cfg({ consent: { thirdParty: { defaultChecked: "yes" } } }).consent.thirdParty.defaultChecked).toBe(false);
  });

  it("legal.country 는 지원 국가만 통과하고, 모르는 값은 기본(US)으로 — 화면이 비면 안 된다", () => {
    expect(cfg({}).legal.country).toBe("us");
    expect(cfg({ legal: { country: "kr" } }).legal.country).toBe("kr");
    expect(cfg({ legal: { country: "de" } }).legal.country).toBe("us");
  });

  it("legal.thirdParties 는 이름 없는 항목을 거른다 — 빈 카드가 문서에 안 남게", () => {
    const c = cfg({
      legal: { thirdParties: [{ name: "Sponsor Co.", purpose: "경품 발송" }, { name: "", purpose: "이름 없음" }] },
    });
    expect(c.legal.thirdParties).toEqual([{ name: "Sponsor Co.", purpose: "경품 발송" }]);
  });

  it("legal.onSitePhotography 는 명시적 true 일 때만", () => {
    expect(cfg({}).legal.onSitePhotography).toBe(false);
    expect(cfg({ legal: { onSitePhotography: "yes" } }).legal.onSitePhotography).toBe(false);
    expect(cfg({ legal: { onSitePhotography: true } }).legal.onSitePhotography).toBe(true);
  });

  it("읽을 수 없는 접수 창 시각은 제한 없음(null)으로 — 폼이 잠기지 않게", () => {
    const c = cfg({ eventInfo: { registrationWindow: { opensAt: "언젠가", closesAt: "2026-09-01T00:00:00Z" } } });
    expect(c.eventInfo.registrationWindow.opensAt).toBeNull();
    expect(c.eventInfo.registrationWindow.closesAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("조회 항목이 비면 기본값으로 되돌린다 — 열 수 없는 등록 확인 화면 방지", () => {
    expect(cfg({ lookup: { fields: [] } }).lookup.fields).toEqual(EMPTY_FORM_CONFIG.lookup.fields);
    expect(cfg({ lookup: { fields: ["email", "카톡"] } }).lookup.fields).toEqual(["email"]);
  });

  it("자동 확인 메일은 기본 꺼짐이고 명시적으로 켠 설정만 보존한다", () => {
    expect(cfg({}).confirmationEmail).toEqual(EMPTY_FORM_CONFIG.confirmationEmail);
    const c = cfg({
      confirmationEmail: {
        enabled: true,
        subject: "Registration confirmed",
        heading: "You're registered",
        body: "Line one\nLine two",
        buttonLabel: "Open ticket",
        replyTo: "help@example.com",
        showQr: false,
        includeEventInfo: false,
      },
    });
    expect(c.confirmationEmail).toMatchObject({
      enabled: true,
      subject: { en: "Registration confirmed" },
      heading: { en: "You're registered" },
      body: { en: "Line one\nLine two" },
      buttonLabel: { en: "Open ticket" },
      replyTo: "help@example.com",
      showQr: false,
      includeEventInfo: false,
    });
  });

  it("국가 코드는 2글자만 — 아니면 기본값 US", () => {
    expect(cfg({ validation: { defaultCountry: "kr" } }).validation.defaultCountry).toBe("KR");
    expect(cfg({ validation: { defaultCountry: "Korea" } }).validation.defaultCountry).toBe("US");
  });
});

/**
 * 아래는 전부 **코드 리뷰가 실행으로 잡아낸 결함**들의 회귀 테스트다.
 * 처음 작성분은 tsc·기존 테스트를 전부 통과했는데도 조용히 틀려 있었다.
 */
describe("리뷰가 잡은 결함 — 회귀 방지", () => {
  it("필수 체크박스는 false 로 통과되지 않는다", () => {
    const c = cfg({ fields: [{ key: "agree", type: "checkbox", required: true }], consent: { privacy: { enabled: false } } });
    const run = (v: Record<string, unknown>) => validateSubmission(c, v, { ...deps, consent: {} }).map((i) => i.code);
    // String(false) === "false" 라 "값이 있음" 으로 통과하던 자리 — 안 누른 동의가 서버까지 갔다.
    expect(run({ agree: false })).toContain("required");
    expect(run({ agree: 0 })).toContain("required");
    expect(run({})).toContain("required");
    expect(run({ agree: true })).toEqual([]);
  });

  it("localize 는 상속 속성을 라벨로 내주지 않는다 — 로케일은 뷰어가 정한다", () => {
    const label = toLocalized("Name");
    for (const evil of ["constructor", "toString", "valueOf", "hasOwnProperty", "__proto__"]) {
      expect(typeof localize(label, evil)).toBe("string");
      expect(localize(label, evil)).toBe("Name"); // 기본 로케일로 폴백
    }
  });

  it("원시 변환기가 망가진 객체에도 던지지 않는다", () => {
    const evil = JSON.parse('{"toString":1,"valueOf":2}');
    expect(() => normalizeCollectForm({ fields: [{ key: "a", label: { en: evil } }] })).not.toThrow();
    const c = cfg({ fields: [{ key: "email", type: "email" }], consent: { privacy: { enabled: false } } });
    expect(() => validateSubmission(c, { email: evil }, { ...deps, consent: {} })).not.toThrow();
  });

  it("분기는 어느 로케일 라벨로 골라도 같은 그룹을 찾는다", () => {
    const c = cfg({
      fields: [{ key: "type", type: "select", options: [{ en: "Buyer", ko: "바이어" }] }],
      branch: { enabled: true, fieldKey: "type", groups: [{ value: "Buyer", fields: [{ key: "budget", required: true }] }] },
      consent: { privacy: { enabled: false } },
    });
    // 한국어로 고른 사람도 분기 문항이 보여야 한다 — 예전엔 통째로 사라졌다.
    expect(visibleFields(c, { type: "바이어" }).map((f) => f.key)).toEqual(["type", "budget"]);
    expect(validateSubmission(c, { type: "바이어" }, { ...deps, consent: {} }).map((i) => i.code)).toContain("required");
    // 채워 넣은 답이 unknown_key 로 거부되지 않는다
    expect(validateSubmission(c, { type: "바이어", budget: "1억" }, { ...deps, consent: {} })).toEqual([]);
  });

  it("canonicalBranchValue 는 어느 로케일 라벨을 골라도 같은 canonical 값을 낸다 — 분석 이벤트가 언어별로 안 갈라진다", () => {
    const c = cfg({
      fields: [{ key: "type", type: "select", options: [{ en: "Buyer", ko: "바이어" }] }],
      branch: { enabled: true, fieldKey: "type", groups: [{ value: "Buyer", fields: [] }] },
    });
    expect(canonicalBranchValue(c, "바이어")).toBe("Buyer");
    expect(canonicalBranchValue(c, "Buyer")).toBe("Buyer");
    // 매칭되는 그룹이 없으면 원본을 그대로 돌려준다 — 이벤트가 최소한 뭔가는 싣게.
    expect(canonicalBranchValue(c, "Press")).toBe("Press");
  });

  it("분기 항목이 공통 항목과 key 가 겹치면 하나만 남는다", () => {
    const c = cfg({
      fields: [{ key: "type", type: "select", options: ["buyer"] }, { key: "company" }],
      branch: { enabled: true, fieldKey: "type", groups: [{ value: "buyer", fields: [{ key: "company", required: true }] }] },
    });
    const keys = visibleFields(c, { type: "buyer" }).map((f) => f.key);
    expect(keys).toEqual([...new Set(keys)]);
  });

  it("기본 조회 항목을 고쳐도 모듈 상수가 오염되지 않는다", () => {
    const before = [...EMPTY_FORM_CONFIG.lookup.fields];
    const c = cfg({ lookup: { fields: [] } });
    c.lookup.fields.push("email");
    expect(EMPTY_FORM_CONFIG.lookup.fields).toEqual(before);
    expect(cfg({}).lookup.fields).toEqual(before);
  });

  /**
   * 이 저장소는 naive timestamp 로 이미 9시간 오진을 겪었다.
   *
   * 처음엔 오프셋 없는 값을 **거부**했는데, 2차 리뷰가 그게 더 나쁜 실패라고 지적했다 —
   * null 은 "제한 없음"이라 운영자가 입력한 마감이 조용히 무제한이 된다(화면엔 마감일이
   * 그대로 보이는데 폼은 계속 받는다). 그래서 UTC 로 **결정적으로** 읽는다. 저장소의
   * "naive timestamp = UTC" 규약과도 같다. 판정이 실행 환경에 의존하지 않는 게 핵심이다.
   */
  it("오프셋 없는 시각은 UTC 로 읽는다 — 서버·브라우저가 같은 결론을 낸다", () => {
    const w = (v: string) => cfg({ eventInfo: { registrationWindow: { closesAt: v } } }).eventInfo.registrationWindow.closesAt;
    expect(w("2026-09-01T18:00")).toBe("2026-09-01T18:00:00.000Z");      // datetime-local
    expect(w("2026-09-01T18:00:00")).toBe("2026-09-01T18:00:00.000Z");
    expect(w("2026-09-01T18:00:00Z")).toBe("2026-09-01T18:00:00.000Z");
    expect(w("2026-09-01T18:00:00+09:00")).toBe("2026-09-01T09:00:00.000Z");
    // 느슨한 값은 여전히 거부 — Date.parse 가 그럴싸한 시각을 만들어 오타가 접수 창이 된다.
    expect(w("2026")).toBeNull();
    expect(w("Dec 5")).toBeNull();
  });

  it("등록 확인은 꺼진 채로 시작한다 — 이메일만 알면 남의 QR 이 열리는 화면이다", () => {
    expect(cfg({}).lookup.enabled).toBe(false);
    expect(cfg({ lookup: { enabled: true } }).lookup.enabled).toBe(true);
  });

  it("분기 기준 항목의 '표시'를 끄면 분기도 꺼진다", () => {
    const groups = [{ value: "buyer", fields: [{ key: "budget", required: true }] }];
    const on = cfg({ fields: [{ key: "type", type: "select", options: ["buyer"] }], branch: { enabled: true, fieldKey: "type", groups } });
    const off = cfg({ fields: [{ key: "type", type: "select", options: ["buyer"], enabled: false }], branch: { enabled: true, fieldKey: "type", groups } });
    expect(on.branch.enabled).toBe(true);
    expect(off.branch.enabled).toBe(false);
    // 꺼졌으면 그룹 문항이 맨 뒤에 붙지도 않는다(§4 순서 계약)
    expect(visibleFields(off, { type: "buyer" }).map((f) => f.key)).toEqual([]);
  });

  it("항목 key 는 안내 체크박스 접두를 쓸 수 없다 — 필수 동의 우회 경로였다", () => {
    const c = cfg({
      fields: [{ key: "notice_portrait", type: "checkbox" }, { key: "email", type: "email" }],
      notices: [{ id: "portrait", mode: "checkbox-required" }],
    });
    expect(c.fields.map((f) => f.key)).toEqual(["email"]);
  });

  it("안내 id 가 겹치면 하나만 남는다", () => {
    const c = cfg({ notices: [{ id: "x", mode: "checkbox-required" }, { id: "x", mode: "notice" }] });
    expect(c.notices).toHaveLength(1);
  });

  it("완료 화면·이메일에 놓인 안내는 필수 체크를 요구하지 않는다 — 누를 컨트롤이 없다", () => {
    const c = cfg({
      fields: [{ key: "email", type: "email" }],
      notices: [{ id: "p", mode: "checkbox-required", placement: "completion" }],
      consent: { privacy: { enabled: false } },
    });
    expect(validateSubmission(c, { email: "a@b.co" }, { ...deps, consent: {} })).toEqual([]);
  });

  it("숫자 선택지가 사라지지 않는다 — 사라지면 선택지 대조가 꺼져 아무 값이나 통과했다", () => {
    const c = cfg({ fields: [{ key: "year", type: "select", options: [2026, 2027] }], consent: { privacy: { enabled: false } } });
    expect(c.fields[0].options.map((o) => localize(o))).toEqual(["2026", "2027"]);
    expect(validateSubmission(c, { year: "아무거나" }, { ...deps, consent: {} }).map((i) => i.code)).toContain("not_an_option");
  });

  it("maxSelect 는 정수만 — webinar-config 와 판정을 맞춘다", () => {
    const base = { key: "m", type: "multiple", options: ["a", "b", "c"] };
    expect(cfg({ fields: [{ ...base, maxSelect: 2 }] }).fields[0].maxSelect).toBe(2);
    expect(cfg({ fields: [{ ...base, maxSelect: 2.7 }] }).fields[0].maxSelect).toBeUndefined();
    expect(cfg({ fields: [{ ...base, maxSelect: true }] }).fields[0].maxSelect).toBeUndefined();
  });

  it("완료 URL 은 http(s) 만 통과한다 — 공개 화면이 이 값으로 이동한다", () => {
    const t = (v: string) => cfg({ completion: { redirectUrlTemplate: v } }).completion.redirectUrlTemplate;
    expect(t("javascript:alert(1)")).toBe("");
    expect(t("https://k-expo.org/done?type={type}")).toContain("k-expo.org");
  });
});

describe("resolveRegistrationStatus — 서버도 같은 함수를 쓴다", () => {
  const win = (opensAt: string | null, closesAt: string | null) =>
    cfg({ eventInfo: { registrationWindow: { opensAt, closesAt } } });

  it("창 앞·안·뒤를 시각으로 가른다", () => {
    const c = win("2026-09-01T00:00:00Z", "2026-10-20T00:00:00Z");
    expect(resolveRegistrationStatus(c, new Date("2026-08-15T00:00:00Z"))).toBe("before");
    expect(resolveRegistrationStatus(c, new Date("2026-09-15T00:00:00Z"))).toBe("open");
    expect(resolveRegistrationStatus(c, new Date("2026-10-21T00:00:00Z"))).toBe("closed");
  });

  it("창이 비면 계속 열려 있다 — 설정 전에 폼이 잠기면 안 된다", () => {
    expect(resolveRegistrationStatus(win(null, null), new Date())).toBe("open");
  });

  it("수동 override 가 시각을 이긴다 — 마감을 앞당기거나 연장할 일이 실제로 생긴다", () => {
    const c = { ...win("2026-09-01T00:00:00Z", null), statusOverride: "closed" as const };
    expect(resolveRegistrationStatus(c, new Date("2026-09-15T00:00:00Z"))).toBe("closed");
  });
});

describe("visibleFields — 유형 문항은 기준 항목 바로 아래", () => {
  const c = cfg({
    fields: [{ key: "name" }, { key: "type", type: "select", options: ["general", "buyer"] }, { key: "email", type: "email" }],
    branch: { enabled: true, fieldKey: "type", groups: [{ value: "buyer", fields: [{ key: "budget" }] }] },
  });

  it("고른 유형의 문항이 기준 항목 다음에 끼워진다 (화면 순서 = 검증 순서)", () => {
    expect(visibleFields(c, { type: "buyer" }).map((f) => f.key)).toEqual(["name", "type", "budget", "email"]);
  });

  it("유형을 안 골랐거나 없는 값이면 공통 항목만", () => {
    expect(visibleFields(c, {}).map((f) => f.key)).toEqual(["name", "type", "email"]);
    expect(visibleFields(c, { type: "press" }).map((f) => f.key)).toEqual(["name", "type", "email"]);
  });
});

describe("validateSubmission — 런타임과 서버가 같이 부른다", () => {
  const base = cfg({
    fields: [
      { key: "email", type: "email", required: true },
      { key: "phone", type: "tel" },
      { key: "topic", type: "select", options: ["A", "B"] },
      { key: "tags", type: "multiple", options: ["x", "y", "z"], maxSelect: 2 },
    ],
  });

  const run = (values: Record<string, unknown>, consent: { privacy?: boolean; marketing?: boolean } = { privacy: true }) =>
    validateSubmission(base, values, { ...deps, consent }).map((i) => `${i.key}:${i.code}`);

  it("필수 누락을 잡는다", () => {
    expect(run({})).toContain("email:required");
  });

  it("정의에 없는 키는 거부한다 — 받아 두면 data 가 임의 입력으로 오염된다", () => {
    expect(run({ email: "a@b.co", evil: "x" })).toContain("evil:unknown_key");
  });

  it("형식 검증은 값이 있을 때만 — 빈 선택 항목이 형식 오류로 잡히면 안 된다", () => {
    expect(run({ email: "a@b.co", phone: "" })).toEqual([]);
    expect(run({ email: "not-an-email" })).toContain("email:invalid_email");
    expect(run({ email: "a@b.co", phone: "123" })).toContain("phone:invalid_phone");
  });

  it("최대 선택 개수를 넘기면 잡는다", () => {
    expect(run({ email: "a@b.co", tags: ["x", "y", "z"] })).toContain("tags:too_many");
    expect(run({ email: "a@b.co", tags: ["x", "y"] })).toEqual([]);
  });

  it("선택지 밖 값은 거부한다", () => {
    expect(run({ email: "a@b.co", topic: "C" })).toContain("topic:not_an_option");
  });

  /** allowOther 를 켜면 저장 값이 사용자가 쓴 문장이다 — 선택지 대조를 하면 기타 답이 전부 막힌다. */
  it("기타(직접입력)를 켜면 선택지 대조를 하지 않는다", () => {
    const c = cfg({ fields: [{ key: "topic", type: "select", options: ["A"], allowOther: true }] });
    expect(validateSubmission(c, { topic: "직접 쓴 답" }, deps)).toEqual([]);
  });

  it("필수 동의를 안 하면 막는다", () => {
    expect(run({ email: "a@b.co" }, {})).toContain("consent_privacy:consent_required");
  });

  /**
   * 파리(droit à l'image)처럼 안내를 필수 동의로 승격한 경우 — mode 만 바꿔도 검증이 따라온다.
   * 회귀 방지: 안내 체크박스 값(notice_*)이 허용 목록에 없어 **동의한 제출이 unknown_key 로
   * 거부되던 버그**를 이 테스트가 잡았다. 안내 체크박스는 정당한 폼 입력이다.
   */
  it("필수 체크로 승격된 안내 블록도 같은 규칙으로 본다", () => {
    const c = cfg({
      fields: [{ key: "email", type: "email" }],
      notices: [{ id: "portrait", mode: "checkbox-required" }],
      consent: { privacy: { enabled: false } },
    });
    const miss = validateSubmission(c, { email: "a@b.co" }, { ...deps, consent: {} });
    expect(miss.map((i) => i.key)).toContain("notice_portrait");
    const ok = validateSubmission(c, { email: "a@b.co", notice_portrait: true }, { ...deps, consent: {} });
    expect(ok).toEqual([]);
  });

  it("분기로 나타난 문항의 필수도 검증한다", () => {
    const c = cfg({
      fields: [{ key: "type", type: "select", options: ["buyer"] }],
      branch: { enabled: true, fieldKey: "type", groups: [{ value: "buyer", fields: [{ key: "company", required: true }] }] },
      consent: { privacy: { enabled: false } },
    });
    const issues = validateSubmission(c, { type: "buyer" }, { ...deps, consent: {} });
    expect(issues.map((i) => `${i.key}:${i.code}`)).toContain("company:required");
  });
});
