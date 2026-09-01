import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";

const CDN_ORIGIN = "https://cdn.example.com";
const EXHIBITION_TITLE = "산업의 경계를 다시 그리는 6개 전문 전시";
const AUDIENCE_TITLE = "STK 대상별 링크";

async function guardEditorNetwork(page: Page, harnessPath = "/dev/expo-stk-editor-harness") {
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
    const allowedPath = url.pathname === harnessPath
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

async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("drag handles must have browser geometry");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 8, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function dragWithChromiumTouch(
  context: BrowserContext,
  page: Page,
  source: Locator,
  target: Locator,
) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error("touch drag handles must have browser geometry");
  const session = await context.newCDPSession(page);
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  try {
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 0, radiusX: 4, radiusY: 4, force: 1 }] });
    await page.waitForTimeout(16);
    for (let step = 1; step <= 12; step += 1) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{
          id: 0,
          x: start.x + ((end.x - start.x) * step) / 12,
          y: start.y + ((end.y - start.y) * step) / 12,
          radiusX: 4,
          radiusY: 4,
          force: 1,
        }],
      });
      await page.waitForTimeout(16);
    }
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await session.detach();
  }
}

test("tree selection edits the center, updates real preview immediately and saves after 900ms", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  await page.getByRole("button", { name: `${EXHIBITION_TITLE} 편집` }).click();
  const heading = page.getByLabel("하위 전시 제목");
  await heading.fill("브라우저에서 수정한 6개 전문 전시");
  await expect(page.getByTestId("actual-runtime-preview").locator(".msx-exhibition-section .msx-heading"))
    .toHaveText("브라우저에서 수정한 6개 전문 전시");
  await expect(page.getByTestId("early-save-count")).toHaveText("early-saves:0");
  await expect(page.getByTestId("save-count")).toHaveText("saves:1", { timeout: 2_500 });
  const observedDelay = Number((await page.getByTestId("last-save-delay").textContent())?.replace("delay:", ""));
  expect(observedDelay).toBeGreaterThanOrEqual(850);
  await expect(page.getByTestId("settled-save-count")).toHaveText("settled-saves:1");
  expect(unexpected).toEqual([]);
});

test("keyboard drag reorders the tree and clicking the real preview selects its editor", async ({ page }) => {
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

test("native mouse and touch input reorder the dnd-kit section tree", async ({ context, page }, testInfo) => {
  const unexpected = await guardEditorNetwork(page);
  await openEditor(page);
  const exhibitionHandle = page.getByRole("button", { name: `${EXHIBITION_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키` });
  const audienceHandle = page.getByRole("button", { name: `${AUDIENCE_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키` });

  if (testInfo.project.name === "chromium-mobile") {
    // Playwright 1.51 exposes tap only on Touchscreen. A Playwright CDP session
    // supplies the real Chromium touch stream without DOM event dispatch.
    await dragWithChromiumTouch(context, page, exhibitionHandle, audienceHandle);
    await expect(page.getByTestId("last-pointer-type")).toHaveText("pointer:touch");
  } else {
    if (testInfo.project.name === "webkit-mobile") {
      await exhibitionHandle.scrollIntoViewIfNeeded();
      const box = await exhibitionHandle.boundingBox();
      if (!box) throw new Error("WebKit touch handle must have geometry");
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.getByTestId("last-pointer-type")).toHaveText("pointer:touch");
    }
    await dragWithMouse(page, exhibitionHandle, audienceHandle);
    await expect(page.getByTestId("last-pointer-type")).toHaveText("pointer:mouse");
  }

  const handles = page.getByRole("button", { name: /구획 순서 변경 — 끌거나 포커스 후 방향키/ });
  await expect(handles.nth(1)).toHaveAccessibleName(`${AUDIENCE_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키`);
  await expect(handles.nth(2)).toHaveAccessibleName(`${EXHIBITION_TITLE} 구획 순서 변경 — 끌거나 포커스 후 방향키`);
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

test("sections publish panel routes publish, live, export and revisions only through memory", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page, "/dev/expo-sections-harness");
  await page.goto("/dev/expo-sections-harness");

  await page.getByRole("button", { name: "발행하기" }).click();
  await expect(page.getByTestId("sections-request-count")).toHaveText("requests:1");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 HTML 다운로드" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("mach-expo-sections-harness-page.html");

  await page.getByRole("button", { name: "발행 이력 보기" }).click();
  await expect(page.getByRole("button", { name: "버전 7 복구" })).toBeVisible();
  await page.getByRole("button", { name: "버전 7 복구" }).click();
  await page.getByRole("button", { name: "발행본으로 복구" }).click();
  await expect(page.getByText("버전 8로 복구했어요", { exact: true })).toBeVisible();

  await page.getByRole("switch", { name: "홈 아임웹에 내보내기" }).click();
  await page.getByRole("button", { name: "공개하기" }).click();
  // React dev StrictMode loads the opened history twice; rollback loads it once more.
  await expect(page.getByTestId("sections-request-count")).toHaveText("requests:7");
  await expect(page.getByTestId("sections-request-log")).toContainText("POST /api/expo/pages/harness-page/publish");
  await expect(page.getByTestId("sections-request-log")).toContainText("POST /api/expo/pages/harness-page/export");
  await expect(page.getByTestId("sections-request-log")).toContainText("GET /api/expo/pages/harness-page/revisions");
  await expect(page.getByTestId("sections-request-log")).toContainText("POST /api/expo/pages/harness-page/revisions/revision-7/rollback");
  await expect(page.getByTestId("sections-request-log")).toContainText("POST /api/expo/pages/harness-page/live");
  expect(unexpected).toEqual([]);
});
