import { expect, test, type Page } from "@playwright/test";

const CDN_ORIGIN = "https://cdn.example.com";
const SECTION_TYPES = [
  "campaign-hero",
  "exhibition-grid",
  "audience-links",
  "speaker-carousel",
  "sponsor-marquee",
  "cta-band",
];

async function guardRuntimeNetwork(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === CDN_ORIGIN) {
      if (url.pathname.endsWith(".svg")) {
        const label = url.pathname.split("/").pop()?.replace(".svg", "") ?? "asset";
        await route.fulfill({
          contentType: "image/svg+xml",
          body: `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#18202b"/><text x="24" y="60" fill="#ff7a00" font-size="28">${label}</text></svg>`,
        });
        return;
      }
      if (url.pathname.endsWith(".mp4")) {
        await route.fulfill({ status: 404, contentType: "video/mp4", body: "" });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "fixture" });
      return;
    }
    if (["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "3100" && (
      url.pathname === "/dev/expo-stk-runtime-harness"
      || url.pathname === "/dev/expo-hostile-harness"
      || url.pathname === "/fonts/pretendard/v1.3.9/PretendardVariable.woff2"
    )) {
      await route.continue();
      return;
    }
    unexpected.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return unexpected;
}

function runtime(page: Page) {
  return page.locator("mach-expo-section");
}

test("six STK sections and five frozen campaign states render exact Hero actions", async ({ page }) => {
  const unexpected = await guardRuntimeNetwork(page);
  const cases = [
    ["current", ["참가기업 신청"], SECTION_TYPES],
    ["exhibitor", ["참가기업 신청"], SECTION_TYPES],
    ["visitor", ["사전등록"], SECTION_TYPES.filter((type) => type !== "cta-band")],
    ["both", ["참가기업 신청", "사전등록"], SECTION_TYPES],
    ["ended", ["전시 안내"], SECTION_TYPES],
  ] as const;

  for (const [state, labels, types] of cases) {
    await page.goto(`/dev/expo-stk-runtime-harness?campaignState=${state}`);
    await expect(runtime(page).locator(".msx-root")).toHaveAttribute("data-msx-ready", "1");
    await expect(runtime(page).locator(".msx-section")).toHaveCount(types.length);
    expect(await runtime(page).locator(".msx-section").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-type")))).toEqual(types);
    await expect(runtime(page).locator(".msx-hero-action")).toHaveText(labels);
  }
  expect(unexpected).toEqual([]);
});

test("empty sections hide and long speaker content never creates page overflow", async ({ page }, testInfo) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.goto("/dev/expo-stk-runtime-harness?empty=speakers");
  await expect(runtime(page).locator('[data-type="speaker-carousel"]')).toHaveCount(0);
  await page.goto("/dev/expo-stk-runtime-harness?empty=sponsors");
  await expect(runtime(page).locator('[data-type="sponsor-marquee"]')).toHaveCount(0);

  await page.goto("/dev/expo-stk-runtime-harness?long=1");
  const autonomous = runtime(page).getByRole("button", { name: "AUTONOMOUS MANUFACTURING AND INDUSTRIAL TRANSFORMATION" });
  await expect(autonomous).toBeVisible();
  await autonomous.click();
  await expect(runtime(page).locator(".msx-speaker-meta").first()).toContainText("Principal Architect for Autonomous Manufacturing");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(testInfo.project.name).toMatch(/^(chromium|webkit)-(desktop|mobile)$/);
  expect(unexpected).toEqual([]);
});

test("speaker keyboard, pointer drag, lazy image and crop contract work", async ({ page }, testInfo) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.goto("/dev/expo-stk-runtime-harness?campaignState=current");
  const host = runtime(page);
  const ai = host.getByRole("button", { name: "AI", exact: true });
  await ai.focus();
  await ai.press("ArrowRight");
  await expect(host.getByRole("button", { name: "AUTONOMOUS MANUFACTURING", exact: true })).toBeFocused();

  await host.getByRole("button", { name: "ROBOTICS", exact: true }).click();
  const image = host.locator(".msx-speaker-image").first();
  await expect(image).toHaveAttribute("loading", "lazy");
  await expect(image).toHaveCSS("object-fit", "cover");
  await expect(image).toHaveCSS("object-position", "50% 16%");
  await expect(image).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");

  const track = host.locator(".msx-speaker-track");
  const pointerType = testInfo.project.name.endsWith("mobile") ? "touch" : "mouse";
  const before = await track.evaluate((node) => node.scrollLeft);
  await track.evaluate((node, type) => {
    const element = node as HTMLElement;
    element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, pointerType: type, clientX: 300 }));
    element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 7, pointerType: type, clientX: 80 }));
    element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 7, pointerType: type, clientX: 80 }));
  }, pointerType);
  await expect.poll(() => track.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before);
  expect(unexpected).toEqual([]);
});

test("sponsors clone only for motion and keep clones inert", async ({ page }) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/dev/expo-stk-runtime-harness");
  const host = runtime(page);
  await expect(host.locator('[data-clone="true"]')).toHaveCount(4);
  await expect(host.locator('[data-clone="true"]').first()).toHaveAttribute("inert", "");
  await expect(host.locator('[data-clone="true"] a').first()).toHaveAttribute("tabindex", "-1");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await expect(runtime(page).locator('[data-clone="true"]')).toHaveCount(0);
  await expect(runtime(page).locator(".msx-sponsor-grid")).toHaveCount(4);
  expect(unexpected).toEqual([]);
});

test("URL, anchor, download and Imweb modal destinations preserve their contracts", async ({ page }) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.addInitScript(() => {
    Object.assign(window, {
      __modalCalls: [] as string[],
      SITE: { openModalMenu(modalId: string) { (window as unknown as { __modalCalls: string[] }).__modalCalls.push(modalId); } },
    });
  });
  await page.goto("/dev/expo-stk-runtime-harness?campaignState=both");
  const host = runtime(page);
  const visitor = host.locator(".msx-hero-action").filter({ hasText: "사전등록" });
  await expect(visitor).toHaveAttribute("href", `${CDN_ORIGIN}/destinations/visitor-registration`);
  await expect(visitor).toHaveAttribute("target", "_blank");

  await host.locator(".msx-cta-action").filter({ hasText: "1:1 부스 참가 문의" }).click();
  expect(await page.evaluate(() => (window as unknown as { __modalCalls: string[] }).__modalCalls)).toEqual(["boothInquiry"]);

  await page.goto("/dev/expo-stk-runtime-harness?campaignState=ended");
  await expect(runtime(page).locator(".msx-hero-action")).toHaveAttribute("href", "#exhibitions");
  const download = runtime(page).locator(".msx-cta-action").filter({ hasText: "브로슈어 다운로드" });
  await expect(download).toHaveAttribute("href", `${CDN_ORIGIN}/documents/stk-2027-brochure.pdf`);
  await expect(download).toHaveAttribute("download", "");
  expect(unexpected).toEqual([]);
});

test("hostile CSS is contained and reinsertion/remount keep one healthy host", async ({ page }) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.goto("/dev/expo-hostile-harness");
  await expect(runtime(page)).toHaveCount(1);
  const hostileStyles = await runtime(page).evaluate((host) => {
    const root = (host as HTMLElement).shadowRoot?.querySelector<HTMLElement>(".msx-root");
    const section = (host as HTMLElement).shadowRoot?.querySelector<HTMLElement>(".msx-section");
    const ancestor = host.closest<HTMLElement>(".partner-wrap");
    return {
      hostDisplay: getComputedStyle(host).display,
      hostOpacity: getComputedStyle(host).opacity,
      rootDisplay: root ? getComputedStyle(root).display : "missing",
      sectionVisibility: section ? getComputedStyle(section).visibility : "missing",
      ancestorOpacity: ancestor ? getComputedStyle(ancestor).opacity : "missing",
    };
  });
  expect(hostileStyles).toEqual({ hostDisplay: "block", hostOpacity: "1", rootDisplay: "block", sectionVisibility: "visible", ancestorOpacity: "1" });

  await page.goto("/dev/expo-stk-runtime-harness");
  await page.getByRole("button", { name: "reinsert snippet" }).click();
  await expect(runtime(page)).toHaveCount(1);
  await page.getByRole("button", { name: "replace container" }).click();
  await expect(page.locator("#stk-runtime-container-replacement mach-expo-section")).toHaveCount(1);
  expect(await page.evaluate(() => (window as unknown as { __stkHarness: { failedRemount(): boolean } }).__stkHarness.failedRemount())).toBe(true);
  await expect(runtime(page).locator(".msx-root")).toHaveAttribute("data-msx-ready", "1");
  expect(unexpected).toEqual([]);
});

test("Hero screenshot is exact at the configured desktop or mobile viewport", async ({ page }) => {
  const unexpected = await guardRuntimeNetwork(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dev/expo-stk-runtime-harness?campaignState=both");
  const hero = runtime(page).locator(".msx-hero-section");
  await expect(hero).toBeVisible();
  await expect(hero).toHaveScreenshot("stk-hero.png", { animations: "disabled" });
  expect(unexpected).toEqual([]);
});
