import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/expo-browser",
  outputDir: "test-results/expo-browser",
  expect: { timeout: 10_000 },
  webServer: {
    command: "DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid EXPO_SCHEMA_CAPABILITY=disabled EXPO_PUBLIC_EMBED_RELEASE=off npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/dev/expo-stk-runtime-harness",
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium-desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    { name: "chromium-mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, hasTouch: true } },
    { name: "webkit-desktop", use: { browserName: "webkit", viewport: { width: 1280, height: 800 } } },
    { name: "webkit-mobile", use: { browserName: "webkit", viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
});
