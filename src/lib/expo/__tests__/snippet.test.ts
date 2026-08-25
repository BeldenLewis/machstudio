// @vitest-environment node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPO_PAGE_MOUNT_ATTR,
  EXPO_SECTION_MOUNT_ATTR,
  expoPageSnippet,
  expoSectionSnippet,
} from "@/lib/expo/snippet";

/**
 * 아임웹에 붙일 코드.
 *
 * 여기서 나온 문자열은 **파트너 사이트 HTML 에 박혀서 회수할 수 없다.** 그래서 이 파일이
 * 붙잡는 것은 "예쁘게 나오는가" 가 아니라 **붙인 뒤에 죽지 않는가** 다:
 *  · 주소가 절대주소인가 — 상대경로면 파트너 도메인을 가리켜 404 다
 *  · 마운트 속성이 런타임이 찾는 것과 같은가 — 다르면 엉뚱한 자리에 그려진다
 *  · id 가 그대로 URL 에 들어가는가 — 이스케이프가 어긋나면 남의 페이지를 부른다
 */

const ORIGIN = "https://machstudio.example.com";
const PAGE = "pg_abc123";
const SID = "11111111-1111-4111-8111-111111111111";

describe("페이지 통짜 코드", () => {
  it("절대주소로 로더를 부른다", () => {
    const { code, src } = expoPageSnippet(ORIGIN, PAGE);
    expect(src).toBe(`${ORIGIN}/h/${PAGE}`);
    expect(code).toContain(`src="${ORIGIN}/h/${PAGE}"`);
  });

  /** 동기 스크립트면 아임웹 문서 중간에서 파싱이 멈춰 페이지 전체가 늦어진다. */
  it("async 로 부른다", () => {
    expect(expoPageSnippet(ORIGIN, PAGE).code).toContain("<script async ");
  });

  it("붙일 자리를 함께 준다", () => {
    expect(expoPageSnippet(ORIGIN, PAGE).code).toContain(`<div ${EXPO_PAGE_MOUNT_ATTR}></div>`);
  });

  /** 오리진 끝의 슬래시가 겹쳐 `//h/` 가 되면 그 주소는 404 다. */
  it("오리진 끝 슬래시를 겹치지 않는다", () => {
    expect(expoPageSnippet(`${ORIGIN}/`, PAGE).src).toBe(`${ORIGIN}/h/${PAGE}`);
  });
});

describe("구획 하나 코드", () => {
  it("페이지와 구획을 함께 가리킨다", () => {
    const { src, code } = expoSectionSnippet(ORIGIN, PAGE, SID);
    expect(src).toBe(`${ORIGIN}/h/${PAGE}/${SID}`);
    expect(code).toContain(`<div ${EXPO_SECTION_MOUNT_ATTR}></div>`);
  });

  /** 통짜와 구획은 **다른 속성**을 쓴다 — 같으면 한 문서에서 서로의 자리를 뺏는다. */
  it("통짜와 다른 자리 표시를 쓴다", () => {
    expect(EXPO_SECTION_MOUNT_ATTR).not.toBe(EXPO_PAGE_MOUNT_ATTR);
  });
});

describe("id 를 그대로 주소에 넣지 않는다", () => {
  it("경로를 벗어나는 문자를 이스케이프한다", () => {
    // 정상 경로에서는 나올 수 없는 값이지만, 이스케이프가 없으면 이런 값 하나로
    // 남의 페이지를 부르는 코드가 만들어진다.
    const { src } = expoPageSnippet(ORIGIN, "a/../b");
    expect(src).toBe(`${ORIGIN}/h/a%2F..%2Fb`);
    expect(src).not.toContain("/../");
  });

  it("따옴표가 코드 문자열을 깨지 못한다", () => {
    const { code } = expoPageSnippet(ORIGIN, 'x"onload="alert(1)');
    // src 속성이 조기에 닫히면 파트너 문서에 임의 속성이 주입된다.
    expect(code.match(/src="/g)).toHaveLength(1);
    expect(code).not.toContain('onload=');
  });
});

/**
 * **스니펫과 런타임이 같은 속성을 봐야 한다.**
 *
 * 각자 적어 두면 한쪽만 고쳐지는 날 코드는 붙었는데 런타임이 그 자리를 못 찾는다 —
 * 스크립트 태그 자리로 폴백되어 엉뚱한 데 그려지고, 아무도 못 알아챈다.
 * 지금은 상수를 공유하므로, 그 공유가 끊기지 않았는지만 확인한다.
 */
describe("런타임과 같은 자리를 가리킨다", () => {
  const entry = readFileSync(
    join(resolve(__dirname, "../../../.."), "src/embed/expo-entry.ts"),
    "utf8",
  );

  it("진입점이 상수를 가져다 쓴다", () => {
    expect(entry).toContain('from "@/lib/expo/snippet"');
    expect(entry).toContain("EXPO_SECTION_MOUNT_ATTR : EXPO_PAGE_MOUNT_ATTR");
  });

  /** 문자열을 다시 손으로 적어 두면 공유가 조용히 끊긴다. */
  it("진입점이 속성 이름을 손으로 다시 적지 않는다", () => {
    const body = entry.slice(entry.indexOf("function findContainer"));
    expect(body).not.toContain('"data-mach-expo"');
    expect(body).not.toContain('"data-mach-expo-section"');
  });
});
