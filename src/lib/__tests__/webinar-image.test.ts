import { describe, expect, it } from "vitest";
import { IMAGE_PRESETS, transformedImageUrl } from "@/lib/webinar-image";

/**
 * 이미지 변환 URL — 이걸 잘못 만들면 **이미지가 잘리거나 안 보인다.**
 *
 * 배경: 업로드 원본을 그대로 서빙해 랜딩 1회 로드가 5.24MB 였고, 그게 Supabase Cached Egress
 * 쿼터를 태워 Storage 가 402 로 차단됐다(라이브 사이트 이미지 전부 안 보이는 사고).
 * 변환 URL 로 0.19MB(96%↓)가 되지만, 파라미터 하나를 빠뜨리면 새 사고가 난다 — 그걸 여기서 묶는다.
 */

const OBJ = "https://x.supabase.co/storage/v1/object/public/webinar-assets/ws/wb/logos/a.png";

describe("resize=contain 을 반드시 붙인다 — 없으면 이미지가 잘린다", () => {
  /**
   * Supabase 기본 모드는 cover(꽉 채우며 크롭)다. width 만 주면 높이를 원본으로 유지한 채
   * 폭을 잘라낸다 — 실측: 1926×352 와이드 로고가 240×352 로 크롭돼 글자가 "UT" 만 남았다.
   * contain 이면 285×52 로 비율이 유지된다(실측 확인).
   */
  it("모든 프리셋 결과에 resize=contain 이 들어간다", () => {
    for (const [name, preset] of Object.entries(IMAGE_PRESETS)) {
      const out = transformedImageUrl(OBJ, preset);
      expect(out, name).toContain("resize=contain");
    }
  });

  it("width·height·quality 를 프리셋 값 그대로 싣는다", () => {
    const out = new URL(transformedImageUrl(OBJ, IMAGE_PRESETS.sessionLogo));
    expect(out.searchParams.get("width")).toBe(String(IMAGE_PRESETS.sessionLogo.width));
    expect(out.searchParams.get("height")).toBe(String(IMAGE_PRESETS.sessionLogo.height));
    expect(out.searchParams.get("quality")).toBe(String(IMAGE_PRESETS.sessionLogo.quality));
  });

  it("object → render 경로로 바꾼다", () => {
    const out = transformedImageUrl(OBJ, IMAGE_PRESETS.sessionCardPhoto);
    expect(out).toContain("/storage/v1/render/image/public/");
    expect(out).not.toContain("/storage/v1/object/public/");
  });
});

describe("건드리면 안 되는 입력은 원본 그대로 — 빈 화면보다 낫다", () => {
  /** 벡터를 래스터화하면 흐려지고 용량도 커질 수 있다 — 줄이려는 목적과 반대다. */
  it("SVG 는 변환하지 않는다", () => {
    const svg = OBJ.replace(".png", ".svg");
    expect(transformedImageUrl(svg, IMAGE_PRESETS.sessionLogo)).toBe(svg);
    const svgz = OBJ.replace(".png", ".SVGZ");
    expect(transformedImageUrl(svgz, IMAGE_PRESETS.sessionLogo)).toBe(svgz);
  });

  /** 어드민이 붙여넣은 외부 이미지 URL — 우리 Storage 가 아니라 변환 엔드포인트가 없다. */
  it("우리 Storage 가 아닌 URL 은 그대로 둔다", () => {
    const ext = "https://cdn.partner.com/hero.jpg";
    expect(transformedImageUrl(ext, IMAGE_PRESETS.heroBackground)).toBe(ext);
  });

  it("이미 변환된 URL 을 두 번 변환하지 않는다", () => {
    const once = transformedImageUrl(OBJ, IMAGE_PRESETS.sessionLogo);
    expect(transformedImageUrl(once, IMAGE_PRESETS.modalPhoto)).toBe(once);
  });

  it("빈 값·공백·null 은 빈 문자열", () => {
    for (const bad of [null, undefined, "", "   "]) {
      expect(transformedImageUrl(bad, IMAGE_PRESETS.modalAvatar)).toBe("");
    }
  });
});

describe("프리셋 크기 — 표시 크기의 2배(레티나)여야 한다", () => {
  /**
   * 실측한 CSS 표시 크기: 세션 카드 최대 372px, 모달 아바타 52×52,
   * 로고 120×26(SESSION_LOGO_WIDTH/HEIGHT). 이 숫자보다 작아지면 화질이 눈에 보이게 나빠진다.
   */
  it("카드 사진 ≥ 744, 아바타 ≥ 104, 로고 높이 ≥ 52", () => {
    expect(IMAGE_PRESETS.sessionCardPhoto.width).toBeGreaterThanOrEqual(744);
    expect(IMAGE_PRESETS.modalAvatar.width).toBeGreaterThanOrEqual(104);
    expect(IMAGE_PRESETS.sessionLogo.height).toBeGreaterThanOrEqual(52);
  });

  /** 로고·글자는 낮은 품질에서 경계에 링잉이 보인다 — 사진보다 높게 유지한다. */
  it("로고 품질이 사진 품질보다 높다", () => {
    expect(IMAGE_PRESETS.sessionLogo.quality).toBeGreaterThan(IMAGE_PRESETS.sessionCardPhoto.quality);
  });

  /** 와이드 로고가 폭에 걸려 세로로 눌리지 않게 폭 상자를 넉넉히 둔다(5.47:1 실측 사례). */
  it("로고 상자는 6:1 보다 넓은 비율까지 담는다", () => {
    expect(IMAGE_PRESETS.sessionLogo.width / IMAGE_PRESETS.sessionLogo.height).toBeGreaterThan(6);
  });
});
