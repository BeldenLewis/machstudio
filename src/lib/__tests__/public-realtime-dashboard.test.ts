import { describe, expect, it } from "vitest";
import { isInvalidDashboardShareToken } from "@/lib/public-realtime-dashboard";

describe("public dashboard share token", () => {
  it("accepts the generated base64url token shape", () => {
    expect(isInvalidDashboardShareToken("aB0_-23456789012345678901234567890")).toBe(false);
  });

  it("rejects short tokens and URL control characters", () => {
    expect(isInvalidDashboardShareToken("short")).toBe(true);
    expect(isInvalidDashboardShareToken("a".repeat(31) + "?admin=true")).toBe(true);
  });
});
