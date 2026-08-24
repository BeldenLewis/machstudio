import { describe, expect, it } from "vitest";
import { isHexColor, normalizeHexColor, onAccentColor, paperFor } from "@/lib/color";

/**
 * 색 계산의 **공용 계약**.
 *
 * ── 왜 이 테스트가 먼저인가 ───────────────────────────────────────────
 * 같은 계산이 지금 저장소에 **세 벌** 있다: 라이브 시청 화면(LiveContentStk 의 onAccentColor),
 * 랜딩 런타임(landing/mount 의 paperFor), 대회 공고(notice/mount 의 paperFor — 주석에
 * "랜딩과 같은 계산" 이라고 적혀 있다). 홈페이지 빌더가 네 번째를 만들기 전에 한 곳으로 모은다.
 *
 * 여기 박아 둔 기대값은 **기존 구현에서 그대로 옮긴 것**이다. 나중에 라이브 화면들을
 * 이 모듈 import 로 갈아끼울 때, 그 교체가 화면 색을 바꾸지 않는다는 것을 이 표가 증명한다.
 * 임계값(YIQ 0.78 · 상대휘도 0.45)은 취향이 아니라 **실사고에서 나온 값**이라 함부로 못 바꾼다.
 */

describe("normalizeHexColor", () => {
  it("6자리로 펴고 소문자로 맞춘다", () => {
    expect(normalizeHexColor("#AABBCC")).toBe("#aabbcc");
    expect(normalizeHexColor("aabbcc")).toBe("#aabbcc");
    expect(normalizeHexColor("#ABC")).toBe("#aabbcc");
    expect(normalizeHexColor("  #FF8500  ")).toBe("#ff8500");
  });

  /** 저장된 값은 무엇이든 올 수 있다 — 던지지 않고 null 로 답한다. */
  it("hex 가 아니면 null", () => {
    for (const bad of ["", "   ", "rgb(0,0,0)", "red", "#12", "#12345", "#1234567", "#gggggg", "#-12345"]) {
      expect(normalizeHexColor(bad)).toBeNull();
    }
  });

  it("문자열이 아닌 값도 안전하다", () => {
    for (const bad of [null, undefined, 123, {}, []]) {
      expect(normalizeHexColor(bad as unknown as string)).toBeNull();
    }
  });

  it("isHexColor 는 같은 판정을 boolean 으로 준다", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#AABBCC")).toBe(true);
    expect(isHexColor("rgb(0,0,0)")).toBe(false);
    expect(isHexColor(null as unknown as string)).toBe(false);
  });
});

describe("onAccentColor — 키컬러 위 글자색", () => {
  /**
   * 임계값 0.78 의 근거(LiveContentStk 주석): 0.6 이었을 때 주황(#ff8500)이 0.605 로 간신히
   * 넘어 **검은 글자**를 받았고, 오픈채팅·등록·입장 버튼이 전부 그랬다. 이 표의 주황이
   * 흰 글자를 받는 것이 그 회귀를 막는다.
   */
  it("기존 구현과 같은 값을 낸다", () => {
    const cases: Array<[string, string]> = [
      ["#ff8500", "#ffffff"], // 주황 — 0.6 임계였을 때 검은 글자를 받던 회귀 지점
      ["#1f3a5f", "#ffffff"], // 진한 네이비(사전등록 기본색)
      ["#000000", "#ffffff"],
      ["#ffffff", "#1a1a1f"], // 흰 배경엔 진한 글자
      ["#ffff00", "#1a1a1f"], // 노랑 — 흰 글자가 형태조차 안 보인다
      ["#f0f0f0", "#1a1a1f"],
      ["#00ff00", "#ffffff"], // 순초록 YIQ 0.587 — 임계 0.78 아래라 흰 글자
      ["#008000", "#ffffff"],
      ["#00ffff", "#ffffff"], // 시안 0.701 — 0.6 임계였다면 검은 글자였을 자리
      ["#ff0000", "#ffffff"],
    ];
    for (const [accent, expected] of cases) {
      expect(`${accent} → ${onAccentColor(accent)}`).toBe(`${accent} → ${expected}`);
    }
  });

  it("3자리 축약과 대문자도 같은 결과", () => {
    expect(onAccentColor("#FFF")).toBe(onAccentColor("#ffffff"));
    expect(onAccentColor("#000")).toBe(onAccentColor("#000000"));
    expect(onAccentColor("#FF8500")).toBe(onAccentColor("#ff8500"));
  });

  /** hex 가 아니면(rgb·named) 기존 동작 유지 — 흰 글자. */
  it("hex 가 아니면 흰 글자로 떨어진다", () => {
    for (const v of ["rgb(255,133,0)", "orange", "", "  "]) {
      expect(onAccentColor(v)).toBe("#ffffff");
    }
  });
});

describe("paperFor — 배경 위 글자색", () => {
  /**
   * 상대휘도(WCAG 선형화) 0.45 기준. 상수로 두지 않는 이유는 편집 UI 가 "글자색은 배경에서
   * 자동으로 따라옵니다" 라고 안내하기 때문이다 — 운영자가 다크 배경에 흰색을 고르면
   * 상수로는 대비 1.06:1 백지가 된다.
   */
  it("기존 구현과 같은 값을 낸다", () => {
    const cases: Array<[string, string]> = [
      ["#ffffff", "#101828"],
      ["#f6f8ff", "#101828"],
      ["#111318", "#f6f8ff"], // 설계가 쓰는 다크 배경
      ["#000000", "#f6f8ff"],
      ["#1f3a5f", "#f6f8ff"],
      ["#ffff00", "#101828"], // 노랑은 휘도가 높아 잉크색
      ["#808080", "#f6f8ff"], // 중간 회색은 선형화 뒤 0.216 이라 종이색
      ["#cccccc", "#101828"],
    ];
    for (const [bg, expected] of cases) {
      expect(`${bg} → ${paperFor(bg)}`).toBe(`${bg} → ${expected}`);
    }
  });

  it("# 없이 넣어도, 대문자여도 같다", () => {
    expect(paperFor("ffffff")).toBe(paperFor("#ffffff"));
    expect(paperFor("#FFFFFF")).toBe(paperFor("#ffffff"));
  });

  /**
   * 기존 두 구현은 `bg.replace("#","")` 뒤 곧바로 파싱해서, hex 가 아니면 NaN 이 나와
   * `luminance > 0.45` 가 false → 종이색을 냈다. 그 동작을 유지한다 —
   * 다크 배경 기본값이라 무해한 쪽이다.
   */
  it("hex 가 아니면 종이색으로 떨어진다", () => {
    for (const v of ["", "rgb(0,0,0)", "transparent", "#12"]) {
      expect(paperFor(v)).toBe("#f6f8ff");
    }
  });

  /**
   * **기존 구현과 의도적으로 다른 유일한 지점.**
   *
   * 원본 두 벌은 3자리를 펴지 않고 곧바로 잘라 파싱해서 `#fff` 가 NaN → 종이색(#f6f8ff)이
   * 됐다 — 흰 배경에 흰 글자, 이 함수가 막으려던 바로 그 1.06:1 백지다. 여기서는 편다.
   *
   * 라이브 화면 교체(계획 Task 20) 때 이 차이를 알고 넘어가야 한다. 실사용에서는 색 선택
   * UI 가 6자리로 저장하므로 3자리가 들어올 경로는 운영자가 손으로 타이핑하는 경우뿐이다.
   */
  it("3자리 축약을 편다 — 원본은 안 펴서 흰 배경에 흰 글자가 됐다", () => {
    expect(paperFor("#fff")).toBe("#101828");
    expect(paperFor("#fff")).toBe(paperFor("#ffffff"));
    expect(paperFor("#000")).toBe(paperFor("#000000"));
  });
});
