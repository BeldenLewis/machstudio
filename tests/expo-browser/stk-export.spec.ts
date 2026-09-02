import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const CDN_ORIGIN = "https://cdn.example.com";

async function fulfillSynthetic(route: Parameters<Parameters<Page["route"]>[1]>[0]) {
  const url = new URL(route.request().url());
  if (url.pathname.endsWith(".svg")) {
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#18202b"/></svg>',
    });
  } else if (url.pathname.endsWith(".mp4")) {
    await route.fulfill({ status: 404, contentType: "video/mp4", body: "" });
  } else {
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: "fixture" });
  }
}

async function guardEditorNetwork(page: Page) {
  const unexpected: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === "blob:") {
      await route.continue();
      return;
    }
    if (url.origin === CDN_ORIGIN) {
      await fulfillSynthetic(route);
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
    if (loopback && (
      url.pathname === "/dev/expo-stk-editor-harness"
      || url.pathname.startsWith("/_next/")
    )) {
      await route.continue();
      return;
    }
    unexpected.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return unexpected;
}

test("whole and section downloads carry deterministic filenames and scope", async ({ page }) => {
  const unexpected = await guardEditorNetwork(page);
  await page.goto("/dev/expo-stk-editor-harness");
  await expect(page.getByRole("button", { name: "전체 HTML 다운로드" })).toBeVisible();

  const pageDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 HTML 다운로드" }).click();
  const pageDownload = await pageDownloadPromise;
  expect(pageDownload.suggestedFilename()).toBe("mach-expo-page-r15.html");
  const pagePath = await pageDownload.path();
  expect(pagePath).not.toBeNull();
  expect(await readFile(pagePath!, "utf8")).toContain("scope=page revision=15");

  const sectionDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "STK 하위 전시 HTML 다운로드" }).click();
  const sectionDownload = await sectionDownloadPromise;
  expect(sectionDownload.suggestedFilename()).toBe("mach-expo-section-r15.html");
  const sectionPath = await sectionDownload.path();
  expect(sectionPath).not.toBeNull();
  expect(await readFile(sectionPath!, "utf8")).toContain("scope=section:");
  expect(unexpected).toEqual([]);
});

async function guardStandaloneNetwork(page: Page) {
  const unexpected: string[] = [];
  const publicAssets: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === CDN_ORIGIN) {
      publicAssets.push(route.request().url());
      await fulfillSynthetic(route);
      return;
    }
    const loopback = ["127.0.0.1", "localhost"].includes(url.hostname) && url.port === "3100";
    if (loopback && url.pathname === "/dev/expo-standalone-harness" && route.request().isNavigationRequest()) {
      await route.continue();
      return;
    }
    unexpected.push(route.request().url());
    await route.abort("blockedbyclient");
  });
  return { unexpected, publicAssets };
}

test("Task 14 standalone page freezes campaigns, rewrites modal fallback, and requests public assets only", async ({ page }) => {
  const network = await guardStandaloneNetwork(page);
  const response = await page.goto("/dev/expo-standalone-harness");
  expect(response?.headers()["x-export-filename"]).toBe("mach-expo-page-stk-standalone-harness-r15.html");
  const exportedSource = await response!.text();
  const root = page.locator("[data-mach-expo-standalone]");
  await expect(root).toHaveAttribute("data-msx-ready", "1");
  await expect(root.locator(".msx-section")).toHaveCount(6);
  expect(exportedSource).toContain("revision=15 exportedAt=2027-01-15T00:00:00.000Z campaigns=exhibitor-recruitment:on,visitor-registration:off");

  const modalFallback = root.locator(".msx-cta-action").filter({ hasText: "1:1 부스 참가 문의" });
  await expect(modalFallback).toHaveAttribute("href", `${CDN_ORIGIN}/destinations/booth-inquiry`);
  await expect(modalFallback).toHaveCount(1);
  expect(network.publicAssets.length).toBeGreaterThan(0);
  expect(network.publicAssets.every((value) => value.startsWith(`${CDN_ORIGIN}/`))).toBe(true);
  expect(network.unexpected).toEqual([]);
});

test("section standalone output contains exactly the requested section and no Mach endpoint requests", async ({ page }) => {
  const network = await guardStandaloneNetwork(page);
  const response = await page.goto("/dev/expo-standalone-harness?scope=section&type=cta-band");
  expect(response?.headers()["x-export-filename"]).toMatch(/^mach-expo-section-15100000-.*-r15\.html$/);
  const root = page.locator("[data-mach-expo-standalone]");
  await expect(root).toHaveAttribute("data-msx-ready", "1");
  await expect(root.locator(".msx-section")).toHaveCount(1);
  await expect(root.locator('[data-type="cta-band"]')).toHaveCount(1);
  expect(network.unexpected.some((value) => /\/api\/|\/h\/|\/hp\//.test(value))).toBe(false);
  expect(network.unexpected).toEqual([]);
});
