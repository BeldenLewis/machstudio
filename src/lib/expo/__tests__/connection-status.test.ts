import { describe, expect, it } from "vitest";
import { deriveExpoConnectionStatus, pageWarnings } from "@/lib/expo/connection-status";

describe("Expo connection status", () => {
  const now = new Date("2026-09-01T03:00:00.000Z");

  it("distinguishes never seen, wrong host, recent, and stale", () => {
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://smarttechkorea.com/214", lastSeenAt: null, lastSeenOrigin: null, now }).state).toBe("uninstalled");
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://smarttechkorea.com/214", lastSeenAt: "2026-09-01T02:59:00.000Z", lastSeenOrigin: "https://other.example", now }).state).toBe("wrong-origin");
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://smarttechkorea.com/214", lastSeenAt: "2026-09-01T02:51:00.000Z", lastSeenOrigin: "https://smarttechkorea.com", now }).state).toBe("connected");
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://smarttechkorea.com/214", lastSeenAt: "2026-09-01T02:49:59.000Z", lastSeenOrigin: "https://smarttechkorea.com", now }).state).toBe("verify");
  });

  it("uses the exact priority, parsed lowercase hosts, and inclusive ten-minute boundary", () => {
    expect(deriveExpoConnectionStatus({ imwebUrl: null, lastSeenAt: null, lastSeenOrigin: null, now }).state).toBe("uninstalled");
    expect(deriveExpoConnectionStatus({ imwebUrl: null, lastSeenAt: "2026-09-01T02:59:00.000Z", lastSeenOrigin: "https://smarttechkorea.com", now }).state).toBe("verify");
    expect(deriveExpoConnectionStatus({ imwebUrl: "not-a-url", lastSeenAt: "2026-09-01T02:59:00.000Z", lastSeenOrigin: "https://smarttechkorea.com", now }).state).toBe("verify");
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://SMARTTECHKOREA.COM/214", lastSeenAt: "2026-09-01T02:50:00.000Z", lastSeenOrigin: "https://smarttechkorea.com/path", now }).state).toBe("connected");
    expect(deriveExpoConnectionStatus({ imwebUrl: "https://smarttechkorea.com.evil.example/214", lastSeenAt: "2026-09-01T02:59:00.000Z", lastSeenOrigin: "https://smarttechkorea.com", now }).state).toBe("wrong-origin");
  });

  it("page warnings are UI-only field diagnostics and include timestamp draft-ahead", () => {
    const warnings = pageWarnings({
      imwebUrl: "https://smarttechkorea.com/214",
      lastSeenAt: "2026-09-01T02:49:59.000Z",
      lastSeenOrigin: "https://smarttechkorea.com",
      publishedAt: "2026-09-01T01:00:00.000Z",
      updatedAt: "2026-09-01T01:00:02.000Z",
      now,
    });
    expect(warnings.map((warning) => warning.code)).toEqual([
      "connection-verify", "draft-ahead-of-published",
    ]);
    expect(warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "connection", severity: "warning" }),
      expect.objectContaining({ path: "publishedAt", severity: "warning" }),
    ]));
  });
});
