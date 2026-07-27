import { describe, expect, it } from "vitest";
import {
  CHOICE_FIELD_TYPES,
  joinMultiValue,
  maxSelectFor,
  normalizeRegistrationForm,
  splitMultiValue,
} from "@/lib/webinar-config";

/**
 * 복수 선택 답변은 **배열이 아니라 ", " 로 합친 한 문자열**로 저장된다 — customFields JSON 이
 * 문자열 맵이고, CSV 한 칸·등록자 목록 한 줄이 그대로 이 값이기 때문이다.
 * 그 결정 때문에 생기는 함정(쉼표 = 항목 경계)을 규칙으로 못박는 게 이 파일의 일이다.
 *
 * 규칙이 사는 곳이 5개 면(편집기 · 공개 폼 · 임베드 로더 · register 검증 · CSV)이라,
 * 여기가 갈라지면 "화면에는 보이는데 등록이 막히는" 종류의 고장이 난다.
 */

describe("합치기·자르기 — 왕복", () => {
  it("고른 순서를 보존한다 — 공개 폼 체크 순서가 CSV 열 안에서도 같아야 읽을 수 있다", () => {
    expect(joinMultiValue(["기획", "개발"])).toBe("기획, 개발");
    expect(splitMultiValue("기획, 개발")).toEqual(["기획", "개발"]);
  });

  it("빈 항목은 떨어뜨린다 — 편집 중 자동저장된 빈 행이 답변에 ', , ' 로 남지 않게", () => {
    expect(joinMultiValue(["기획", "  ", ""])).toBe("기획");
    expect(splitMultiValue("기획, , 개발")).toEqual(["기획", "개발"]);
  });

  it("문자열이 아니면 빈 배열 — 옛 답변이 배열로 들어와도 서버 검증이 터지지 않는다", () => {
    for (const bad of [undefined, null, 42, ["기획"], {}]) {
      expect(splitMultiValue(bad)).toEqual([]);
    }
  });

  it("쉼표 없는 한 항목은 그대로 한 개다 — 단일 선택 값과 왕복이 호환된다", () => {
    expect(splitMultiValue("기획")).toEqual(["기획"]);
  });

  /**
   * 이 케이스가 입력 시점 정규화의 근거다. 값 안의 쉼표는 항목 경계와 구별할 수 없어서,
   * 읽기에서는 고칠 방법이 없다 — 그래서 편집기의 선택지 입력과 공개 폼·로더의 기타 자유입력이
   * 쉼표를 공백으로 바꾼다(세 곳 모두). 여기서는 "고칠 수 없다" 는 사실 자체를 고정한다.
   */
  it("값에 쉼표가 있으면 항목 수가 부풀고, 읽기로는 복구할 수 없다", () => {
    expect(splitMultiValue("서울, 경기")).toHaveLength(2);
    expect(splitMultiValue(joinMultiValue(["서울, 경기"]))).not.toEqual(["서울, 경기"]);
  });
});

describe("최대 개수 — 제한이 아닌 값은 제한으로 취급하지 않는다", () => {
  const f = (maxSelect: unknown, n = 4) => ({
    type: "multiple" as const,
    maxSelect: maxSelect as number,
    options: Array.from({ length: n }, (_, i) => `o${i}`),
  });

  it("옵션 수 이상이면 null — '최대 4개' 라고 적힌 안내가 실제 제한 없이 나가는 것을 막는다", () => {
    expect(maxSelectFor(f(4))).toBeNull();
    expect(maxSelectFor(f(9))).toBeNull();
    expect(maxSelectFor(f(3))).toBe(3);
  });

  it("0·음수·소수·빈값은 제한이 아니다 — 0 이면 아무것도 고를 수 없는 폼이 나간다", () => {
    for (const bad of [0, -1, 1.5, null, undefined, NaN]) {
      expect(maxSelectFor(f(bad)), String(bad)).toBeNull();
    }
    expect(maxSelectFor(f(1))).toBe(1);
  });

  /**
   * config 는 JSON 블랍이라 숫자가 문자열로 들어오는 경로가 있다(손으로 고친 config, 옛 클라이언트).
   * 관대하게 읽는 건 좋지만 **저장 정규화와 판정이 같은 답을 내야** 한다 — 갈라지면 편집기는
   * "제한 없음" 이라 그리고 공개 폼은 제한을 걸어, 화면과 실제가 어긋난다.
   */
  it("문자열 숫자는 두 층이 똑같이 강제 변환한다 — 정규화와 판정이 갈라지지 않는다", () => {
    expect(maxSelectFor(f("2"))).toBe(2);
    const saved = normalizeRegistrationForm({
      registrationForm: {
        fields: [{ key: "job", label: "직무", type: "multiple", enabled: true, options: ["a", "b", "c", "d"], maxSelect: "2" }],
      },
    }).fields.find((x) => x.key === "job")!;
    expect(saved.maxSelect).toBe(2);
  });

  it("복수 선택이 아닌 유형은 항상 null — 드롭다운에 개수 제한을 그리면 거짓이다", () => {
    expect(maxSelectFor({ type: "select", maxSelect: 2, options: ["a", "b", "c"] })).toBeNull();
    expect(maxSelectFor({ type: "text", maxSelect: 2, options: [] })).toBeNull();
  });
});

describe("공개 필터 — 그릴 수 없는 필드를 필수로 두면 등록 자체가 막힌다", () => {
  const form = (field: Record<string, unknown>) =>
    normalizeRegistrationForm({
      registrationForm: { fields: [{ key: "job", label: "직무", enabled: true, ...field }] },
    });
  const has = (field: Record<string, unknown>) => form(field).fields.some((x) => x.key === "job");

  it("선택형 두 종류가 같은 게이트를 쓴다 — 한쪽만 걸리면 나머지가 조용히 새 구멍이 된다", () => {
    expect(CHOICE_FIELD_TYPES).toEqual(["select", "multiple"]);
    for (const type of CHOICE_FIELD_TYPES) {
      expect(has({ type, options: [] }), type).toBe(false);
      expect(has({ type, options: ["기획"] }), type).toBe(true);
    }
  });

  it("기타(직접입력)가 켜져 있으면 선택지 0개여도 남긴다 — 자유 입력으로 답할 수 있다", () => {
    expect(has({ type: "multiple", options: [], allowOther: true })).toBe(true);
    expect(has({ type: "select", options: [], allowOther: true })).toBe(true);
  });
});

describe("저장 정규화 — 못 믿을 값을 필드에 태워 보내지 않는다", () => {
  const field = (patch: Record<string, unknown>) =>
    normalizeRegistrationForm({
      registrationForm: {
        fields: [{ key: "job", label: "직무", type: "multiple", enabled: true, options: ["a", "b", "c"], ...patch }],
      },
    }).fields.find((f) => f.key === "job")!;

  it("옵션 수 이상인 maxSelect 는 저장 값에서 아예 사라진다 — 뷰가 다시 판단하지 않아도 되게", () => {
    expect(field({ maxSelect: 3 }).maxSelect).toBeUndefined();
    expect(field({ maxSelect: 2 }).maxSelect).toBe(2);
  });

  it("allowOther 는 true 일 때만 실린다 — 'false' 문자열 같은 값이 켜짐으로 새지 않게", () => {
    expect(field({ allowOther: true }).allowOther).toBe(true);
    for (const bad of ["false", "true", 1, 0, null]) {
      expect(field({ allowOther: bad }).allowOther, String(bad)).toBeUndefined();
    }
  });

  it("모르는 유형은 text 로 떨어진다 — 선택형으로 오인하면 옵션 없는 빈 목록이 나간다", () => {
    expect(field({ type: "checkboxes" }).type).toBe("text");
  });
});
