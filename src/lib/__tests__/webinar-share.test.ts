import { describe, expect, it } from "vitest";
import {
  buildShareUrl,
  generateShareCode,
  isShareChannel,
  isShareSurface,
  normalizeShareCode,
  readShareCode,
  SHARE_CODE_LENGTH,
} from "@/lib/webinar-share";

/**
 * 추천 링크 — **공유가 누구에게 귀속되는가**를 결정한다. 틀리면 성과가 남에게 붙거나 사라진다.
 *
 * 가장 중요한 계약은 두 개다:
 *  1. 링크에 registrationId 를 절대 넣지 않는다(그 값은 채팅·Q&A 를 쓸 수 있는 자격증명이다)
 *  2. 남의 추천 링크를 타고 들어온 사람이 다시 공유하면 **내 코드로 바뀐다**
 */

describe("코드 발급", () => {
  it("정해진 길이·알파벳으로만 만든다", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      expect(normalizeShareCode(code)).toBe(code);
    }
  });

  /** 사람이 링크를 손으로 옮겨 적을 수 있어 0/O, 1/l/I 를 뺐다. */
  it("혼동 문자(0 O 1 l I)를 쓰지 않는다", () => {
    const bag = Array.from({ length: 300 }, () => generateShareCode()).join("");
    for (const ch of ["0", "O", "1", "l", "I"]) expect(bag).not.toContain(ch);
  });

  it("같은 코드가 연달아 나오지 않는다", () => {
    const set = new Set(Array.from({ length: 2000 }, () => generateShareCode()));
    expect(set.size).toBe(2000);
  });
});

describe("코드 검증 — 느슨하게 받으면 집계 테이블이 오염된다", () => {
  it("길이·알파벳이 어긋나면 빈 값", () => {
    for (const bad of ["", "  ", "short", "0".repeat(10), "abc!defghi", "a".repeat(11), "a".repeat(9)]) {
      expect(normalizeShareCode(bad), JSON.stringify(bad)).toBe("");
    }
  });

  it("문자열이 아니면 빈 값 — 비콘이 뭘 보내도 행이 깨지지 않게", () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      expect(normalizeShareCode(bad), JSON.stringify(bad)).toBe("");
    }
  });

  /**
   * registrationId(cuid)는 25자라 길이 검사에서 막힌다 — 실수로 그 값을 링크에 넣어도
   * 추천으로 집계되지 않는다(사칭 경로가 조용히 열리는 것보다 낫다).
   */
  it("cuid 모양의 값은 추천 코드로 인정하지 않는다", () => {
    expect(normalizeShareCode("clzk9v1230000abcd1234efgh")).toBe("");
  });
});

describe("URL 에서 읽기", () => {
  it("?ref= 를 읽는다", () => {
    const code = generateShareCode();
    expect(readShareCode(`?ref=${code}`)).toBe(code);
    expect(readShareCode(`ref=${code}&utm_source=naver`)).toBe(code);
  });

  it("없거나 이상하면 빈 값", () => {
    expect(readShareCode("?utm_source=naver")).toBe("");
    expect(readShareCode("?ref=nope")).toBe("");
    expect(readShareCode("")).toBe("");
  });
});

describe("공유 URL 만들기", () => {
  const code = generateShareCode();

  it("현재 URL 에 내 코드를 얹는다", () => {
    const out = new URL(buildShareUrl("https://x.io/webinar/abc/live", code));
    expect(out.searchParams.get("ref")).toBe(code);
    expect(out.pathname).toBe("/webinar/abc/live");
  });

  /**
   * 이걸 빼먹으면 내가 공유한 링크의 성과가 **나를 초대한 사람** 에게 계속 붙는다
   * (추천 체인이 첫 사람에게 영원히 귀속된다).
   */
  it("남의 ref 가 붙어 있으면 내 코드로 갈아탄다", () => {
    const mine = generateShareCode();
    const theirs = generateShareCode();
    const out = new URL(buildShareUrl(`https://x.io/webinar/abc/live?ref=${theirs}`, mine));
    expect(out.searchParams.get("ref")).toBe(mine);
    expect(out.searchParams.getAll("ref")).toHaveLength(1);
  });

  it("utm 은 그대로 보존한다 — 공유해도 원래 채널 성과가 이어진다", () => {
    const out = new URL(buildShareUrl(`https://x.io/w/l/abc?utm_source=naver&utm_medium=cpc`, code));
    expect(out.searchParams.get("utm_source")).toBe("naver");
    expect(out.searchParams.get("utm_medium")).toBe("cpc");
  });

  /** 운영용 파라미터가 시청자 손에 넘어가면 안 된다(미리보기는 부작용이 정지된 화면이다). */
  it("preview·view 는 공유 링크에서 지운다", () => {
    const out = new URL(buildShareUrl(`https://x.io/webinar/abc/live?preview=live&view=signup`, code));
    expect(out.searchParams.has("preview")).toBe(false);
    expect(out.searchParams.has("view")).toBe(false);
  });

  it("코드가 없으면 ref 를 붙이지 않는다 — 코드 미발급자도 공유는 된다", () => {
    const out = buildShareUrl("https://x.io/webinar/abc/live", "");
    expect(out).not.toContain("ref=");
  });

  it("URL 이 아니면 원문을 그대로 돌려준다", () => {
    expect(buildShareUrl("그냥문자열", code)).toBe("그냥문자열");
  });
});

describe("면·경로 값은 화이트리스트다", () => {
  it("정의된 값만 통과한다", () => {
    expect(isShareSurface("waiting")).toBe(true);
    expect(isShareSurface("live")).toBe(true);
    expect(isShareSurface("종료")).toBe(false);
    expect(isShareChannel("native")).toBe(true);
    expect(isShareChannel("copy")).toBe(true);
    expect(isShareChannel("carrier-pigeon")).toBe(false);
  });
});
