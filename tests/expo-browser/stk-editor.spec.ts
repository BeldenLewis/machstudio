import { expect, test, type Page } from "@playwright/test";

const CDN_ORIGIN = "https://cdn.example.com";
const EXHIBITION_TITLE = "산업의 경계를 다시 그리는 6개 전문 전시";
const AUDIENCE_TITLE = "STK 대상별 링크";

async function guardEditorNetwork(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "blob:") {
      await route.continue();
      return;
    }
    if (url.origin === CDN_ORIGIN) {
      if (url.pathname.endsWith(".svg")) {
        await route.fulfill({
          contentType: "image/svg+xml",
          body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#18202b"/></svg>',
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "fixture" });
      }
      return;
    }
    const loopback = ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "3100";
    if (loopback && url.pathname === "/manifest.webmanifest") {
      await route.fulfill({ contentType: "application/manifest+json", body: "{}" });
      return;
    }
    if (loopback && (url.pathname.startsWith("/__nextjs_font/") || url.pathname === "/fonts/pretendard/v1.3.9/PretendardVariable.woff2")) {
      await route.fulfill({ contentType: "font/woff2", body: "" });
      return;
    }
    if (loopback && url.pathname === "/favicon.ico") {
      await route.fulfill({ status: 204, body: "" });
      return;
    }
    if ((loopback && url.pathname === "/monitoring") || url.hostname === "va.vercel-scripts.com") {
      await route.abort("blockedbyclient");
      return;
    }
    const allowedPath = url.pathname === "/dev/expo-stk-editor-harness"
      || url.pathname.startsWith("/_next/");
    if (loopback && allowedPath) {
      await route.continue();
      return;
    }
    unexpected.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return unexpected;
}

async function openEditor(page: Page, suffix = "") {
  await page.goto(`/dev/expo-stk-editor-harness${suffix}`);
  await expect(page.getByRole("navigation", { name: "구획 구조" })).toBeVisible();
  await expect(page.getByLabel("페이지 제목")).toHaveValue("STK 2027");
}

test("tree selection edits the center, updates real preview immediately and saves after 900ms", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  await page.getByRole("button", { name: `${EXHIBITION_TITLE} 편집` }).click();
  const heading = page.getByLabel("하위 전시 제목");
  await heading.fill("브라우저에서 수정한 6개 전문 전시");
  await expect(page.getByTestId("actual-runtime-preview").locator(".msx-exhibition-section .msx-heading"))
    .toHaveText("브라우저에서 수정한 6개 전문 전시");
  await expect(page.getByTestId("save-count")).toHaveText("saves:1", { timeout: 4_000 });
  expect(unexpected).toEqual([]);
});

test("accessible drag reorders the tree and clicking the real preview selects its editor", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  const exhibitionHandle = page.getByRole("button", { name: `${EXHIBITION_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키` });
  const audienceHandle = page.getByRole("button", { name: `${AUDIENCE_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키` });
  await expect(audienceHandle).toBeVisible();
  await exhibitionHandle.focus();
  await exhibitionHandle.press("Space");
  await exhibitionHandle.press("ArrowDown");
  await exhibitionHandle.press("Space");
  await expect(page.getByTestId("move-announcement")).toContainText("이동했어요");

  await page.getByRole("button", { name: /550개 기업의 기술을[\s\S]*편집$/ }).click();
  await page.getByTestId("actual-runtime-preview").locator(".msx-exhibition-section .msx-heading").click();
  await expect(page.getByTestId("exhibition-grid-editor")).toBeVisible();
  await expect(page.getByTestId("preview-selected")).not.toHaveText("selected:none");
  expect(unexpected).toEqual([]);
});

test("VIEWER stays read-only and never exposes mutation controls", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page, "?viewer=1");
  await expect(page.getByLabel("페이지 제목")).toBeDisabled();
  await expect(page.getByLabel("아임웹 주소")).toBeDisabled();
  await expect(page.getByRole("button", { name: /구획 순서 변경/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "다시 발행" })).toHaveCount(0);
  await expect(page.getByTestId("save-count")).toHaveText("saves:0");
  expect(unexpected).toEqual([]);
});

test("409 halts autosave until the operator reloads server state", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  await page.getByTestId("conflict-next").click();
  await page.getByLabel("페이지 제목").fill("로컬 충돌 초안");
  await expect(page.getByText("다른 팀원이 먼저 저장했어요")).toBeVisible({ timeout: 4_000 });
  await expect(page.getByTestId("save-count")).toHaveText("saves:1");

  await page.getByLabel("페이지 제목").fill("충돌 중 추가 편집");
  await page.waitForTimeout(1_100);
  await expect(page.getByTestId("save-count")).toHaveText("saves:1");
  await page.getByRole("button", { name: "최신 내용 다시 불러오기" }).click();
  await expect(page.getByText("다른 팀원이 먼저 저장했어요")).toHaveCount(0);
  await expect(page.getByLabel("페이지 제목")).toHaveValue("STK 2027");
  expect(unexpected).toEqual([]);
});

test("publish, history rollback and row export issue focus use only in-memory transport", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  await page.getByRole("button", { name: "다시 발행" }).click();
  await expect(page.getByTestId("request-count")).toHaveText("requests:1");
  await expect(page.getByText("발행본과 같아요. 고친 내용이 생기면 다시 발행할 수 있어요.")).toBeVisible();

  await page.getByRole("button", { name: "발행 이력 보기" }).click();
  await expect(page.getByRole("button", { name: "버전 16 복구" })).toBeVisible();
  await page.getByRole("button", { name: "버전 16 복구" }).click();
  await page.getByRole("button", { name: "발행본으로 복구" }).click();
  await expect(page.getByText("버전 17로 복구했어요", { exact: true })).toBeVisible();

  await page.getByTestId("export-issue-next").click();
  await page.getByRole("button", { name: "STK 하위 전시 HTML 다운로드" }).click();
  await expect(page.getByTestId("exhibition-grid-editor").getByRole("alert")).toHaveText("공개 HTTPS 심볼 주소가 필요해요.");
  await expect(page.getByLabel("1번 하위 전시 심볼 주소")).toBeFocused();
  await expect(page.getByTestId("exhibition-grid-editor")).toBeVisible();
  expect(unexpected).toEqual([]);
});

test("five preview campaign states change actions without saving", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  const cases = [
    ["current", ["참가기업 신청"]],
    ["exhibitor", ["참가기업 신청"]],
    ["visitor", ["사전등록"]],
    ["both", ["참가기업 신청", "사전등록"]],
    ["ended", ["전시 안내"]],
  ] as const;
  for (const [state, labels] of cases) {
    await page.getByRole("button", { name: state, exact: true }).click();
    await expect(page.getByTestId("actual-runtime-preview").locator(".msx-hero-action")).toHaveText(labels);
  }
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("save-count")).toHaveText("saves:0");
  expect(unexpected).toEqual([]);
});
