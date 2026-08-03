import { describe, expect, it } from "vitest";
import {
  campaignJoinKey,
  findClickId,
  foldDirectSentinel,
  inferFromReferrer,
  normalizeUtmKey,
  normalizeUtmText,
  readUtmFromSearch,
  UTM_MAX_LENGTH,
} from "@/lib/attribution-normalize";
import { ATTRIBUTION_CORE_JS } from "@/lib/attribution-core";
import { CLICK_ID_MAP, REFERRER_MAP } from "@/lib/attribution-normalize";

/**
 * UTM 정규화 — **집계 키의 계약**이다.
 *
 * 이 규칙이 경로마다 갈라져서 실제로 난 사고: utm_source=Naver 광고 하나가 분석 표에
 * naver(방문+임베드 등록) / Naver(자체 페이지 등록, 방문 0) 두 줄로 쪼개져 양쪽 등록률이 다 틀렸다.
 * 저장 경로가 넷(임베드 로더·방문 비콘·서버 파서·자체 페이지)이라, 규칙을 여기 하나로 고정하고
 * 각 경로가 이 함수를 쓰는지로 회귀를 막는다.
 */

describe("source/medium — 집계 키라 소문자로 접는다", () => {
  it("대소문자·공백 차이를 없앤다", () => {
    expect(normalizeUtmKey("Naver")).toBe("naver");
    expect(normalizeUtmKey("  NAVER  ")).toBe("naver");
    expect(normalizeUtmKey("Paid_Social")).toBe("paid_social");
  });

  it("문자열이 아니면 빈 값 — 클라이언트가 뭘 보내도 키가 깨지지 않게", () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      expect(normalizeUtmKey(bad), JSON.stringify(bad)).toBe("");
    }
  });

  /**
   * "(direct)"/"(none)" 은 임베드 로더가 **실제로 저장하던 리터럴**이다. 다른 경로는 같은 상황을
   * null·"" 로 저장했고, 집계는 셋을 다른 키로 봤다 — 표에 '직접 유입' 행이 두 줄 생긴 원인.
   */
  it("'어트리뷰션 없음' 센티널은 전부 빈 값으로 접는다", () => {
    for (const sentinel of ["(direct)", "(none)", "(not set)", "direct", "none", "(DIRECT)", " (None) "]) {
      expect(normalizeUtmKey(sentinel), sentinel).toBe("");
    }
    expect(foldDirectSentinel("(direct)")).toBe("");
    // 진짜 채널명은 건드리지 않는다
    expect(normalizeUtmKey("directmail")).toBe("directmail");
  });

  it("길이 상한은 방문·등록이 같은 값을 쓴다 — 다르면 긴 값이 두 키로 갈라진다", () => {
    const long = "a".repeat(UTM_MAX_LENGTH + 50);
    expect(normalizeUtmKey(long)).toHaveLength(UTM_MAX_LENGTH);
    expect(normalizeUtmText(long)).toHaveLength(UTM_MAX_LENGTH);
  });
});

describe("campaign/term/content — 원문 대소문자를 보존한다", () => {
  /** 사람이 읽고 광고 리포트와 대조하는 값이라 소문자로 죽이지 않는다(조인은 따로 접는다). */
  it("trim 만 하고 대소문자는 그대로", () => {
    expect(normalizeUtmText("  Spring_Sale  ")).toBe("Spring_Sale");
  });

  it("광고비 조인 키는 대소문자·공백을 무시한다", () => {
    expect(campaignJoinKey(" Spring_Sale ")).toBe(campaignJoinKey("spring_sale"));
  });
});

describe("URL 에서 읽기", () => {
  it("6종을 모두 읽고 source/medium 만 접는다", () => {
    const out = readUtmFromSearch(
      "?utm_source=Naver&utm_medium=CPC&utm_campaign=Spring_Sale&utm_term=t&utm_content=c&utm_id=42",
    );
    expect(out).toEqual({
      utmSource: "naver",
      utmMedium: "cpc",
      utmCampaign: "Spring_Sale",
      utmTerm: "t",
      utmContent: "c",
      utmId: "42",
    });
  });

  it("대문자·camelCase 키도 관용한다 — 손으로 만든 링크가 흔하다", () => {
    expect(readUtmFromSearch("?UTM_SOURCE=naver").utmSource).toBe("naver");
    expect(readUtmFromSearch("?utmSource=naver").utmSource).toBe("naver");
  });

  it("파라미터가 없으면 전부 빈 값", () => {
    expect(Object.values(readUtmFromSearch("?x=1")).every((v) => v === "")).toBe(true);
  });
});

describe("클릭ID·리퍼러 추론", () => {
  it("클릭 ID 로 광고 채널을 파생한다 — UTM 없는 광고 클릭을 유실하지 않게", () => {
    expect(findClickId("?gclid=abc")).toEqual({ id: "abc", source: "google", medium: "cpc" });
    expect(findClickId("?fbclid=xyz")?.source).toBe("facebook");
    expect(findClickId("?nothing=1")).toBeNull();
  });

  it("검색·소셜은 맵으로, 나머지는 호스트 + referral 로", () => {
    expect(inferFromReferrer("https://www.naver.com/search", "my.site")).toEqual({
      utmSource: "naver",
      utmMedium: "organic",
    });
    // 서브도메인도 같은 채널로 본다
    expect(inferFromReferrer("https://m.search.naver.com/x", "my.site")?.utmSource).toBe("naver");
    expect(inferFromReferrer("https://blog.example.com/post", "my.site")).toEqual({
      utmSource: "blog.example.com",
      utmMedium: "referral",
    });
  });

  it("같은 호스트(내부 이동)는 유입이 아니다 — 아니면 내부 클릭이 referral 로 쌓인다", () => {
    expect(inferFromReferrer("https://my.site/page", "my.site")).toBeNull();
  });

  it("깨진 리퍼러는 null", () => {
    expect(inferFromReferrer("not-a-url", "my.site")).toBeNull();
    expect(inferFromReferrer("", "my.site")).toBeNull();
  });
});

/**
 * 임베드 로더는 JS **문자열**이라 이 모듈을 import 할 수 없다 — 대신 맵을 JSON 으로 주입한다.
 * 그 주입이 끊기면(문자열에 옛 리터럴이 남으면) 같은 리퍼러가 경로마다 다른 채널로 기록되므로,
 * 문자열에 실제로 박혔는지 여기서 묶는다.
 */
describe("임베드 로더 문자열이 같은 맵을 쓴다", () => {
  it("CLICK_ID_MAP·REFERRER_MAP 이 주입돼 있다", () => {
    expect(ATTRIBUTION_CORE_JS).toContain(JSON.stringify(CLICK_ID_MAP));
    expect(ATTRIBUTION_CORE_JS).toContain(JSON.stringify(REFERRER_MAP));
  });

  it("길이 상한도 서버와 같은 값이 박힌다", () => {
    expect(ATTRIBUTION_CORE_JS).toContain(`var UTM_MAX_LEN = ${UTM_MAX_LENGTH}`);
  });

  /** 로더가 "(direct)" 를 다시 저장하기 시작하면 표에 '직접 유입' 행이 또 두 줄이 된다. */
  it("다이렉트 센티널을 저장하지 않는다", () => {
    expect(ATTRIBUTION_CORE_JS).not.toContain('utmSource: "(direct)"');
    expect(ATTRIBUTION_CORE_JS).not.toContain('utmMedium: "(none)"');
  });
});
