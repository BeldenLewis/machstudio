// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const routeExists = (segments: string) =>
  existsSync(join(ROOT, "src/app/(app)", segments, "page.tsx"));

/**
 * **화면이 만드는 링크가 실제로 존재하는가.**
 *
 * ── 왜 이 파일이 있나 ─────────────────────────────────────────────────
 * 2026-08-24 프로덕션에서 실제로 났다. 목록(Task 16)을 배포하고 메뉴를 켰는데
 * 상세 화면(Task 17)이 아직 없었다. 목록의 모든 카드와 "빈 사이트" 생성 직후 이동이
 * 전부 `/homepage/{siteId}` 로 가는데 그 라우트가 없어서 **404 로 끝났다** —
 * 즉 기능이 켜진 채로 어느 경로로도 쓸 수 없었다.
 *
 * 타입 검사도 린트도 이걸 못 잡는다. `router.replace("/homepage/" + id)` 는 그냥
 * 문자열이다. 그래서 여기서 문자열과 파일 시스템을 직접 맞춰 본다.
 *
 * 새 화면을 붙일 때 이 목록에 한 줄 추가할 것.
 */
describe("홈페이지 화면이 만드는 링크는 전부 실재한다", () => {
  it("상세 라우트가 있다", () => {
    expect(routeExists("homepage/[siteId]")).toBe(true);
  });

  it("목록과 만들기 라우트가 있다", () => {
    expect(routeExists("homepage")).toBe(true);
    expect(routeExists("homepage/new")).toBe(true);
  });

  /** 사이트가 하나뿐일 때 목록이 자동으로 이동하는 그 주소다. */
  it("목록의 자동 이동 대상이 실재하는 라우트다", () => {
    const loader = read("src/components/expo/ExpoProjectListLoader.tsx");
    expect(loader).toContain("/homepage/${outcome.sites[0].id}");
    expect(routeExists("homepage/[siteId]")).toBe(true);
  });

  it("만들기 화면이 생성 뒤 보내는 곳도 실재한다", () => {
    const create = read("src/components/expo/ExpoCreateChoices.tsx");
    expect(create).toContain("/homepage/${site.id}");
    expect(routeExists("homepage/[siteId]")).toBe(true);
  });

  /**
   * 상세에서 목록으로 돌아가는 링크에는 `?list=1` 이 있어야 한다 —
   * 없으면 사이트가 하나뿐인 워크스페이스에서 목록이 상세로 도로 튕겨 무한 왕복이 된다.
   */
  it("목록으로 돌아가는 링크에 탈출구가 붙어 있다", () => {
    for (const file of [
      "src/components/expo/ExpoSiteEditor.tsx",
      "src/components/expo/ExpoCreateChoices.tsx",
      "src/components/expo/ExpoProjectSync.tsx",
    ]) {
      const source = read(file);
      const backLinks = [...source.matchAll(/["'`]\/homepage(\?[^"'`]*)?["'`]/g)].map((m) => m[0]);
      for (const link of backLinks) {
        expect(`${file} ${link}`).toContain("list=1");
      }
    }
  });
});
