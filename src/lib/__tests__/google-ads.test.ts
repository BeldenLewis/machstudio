import { afterEach, describe, expect, it } from "vitest";
import { googleCustomerId, signGoogleState, verifyGoogleState } from "@/lib/google-ads";

const previous = process.env.GOOGLE_ADS_CLIENT_SECRET;
afterEach(() => { process.env.GOOGLE_ADS_CLIENT_SECRET = previous; });

describe("Google Ads helpers", () => {
  it("normalizes Google customer ids", () => {
    expect(googleCustomerId("customers/123-456-7890")).toBe("1234567890");
  });
  it("signs and verifies OAuth state", () => {
    process.env.GOOGLE_ADS_CLIENT_SECRET = "test-secret";
    const state = signGoogleState({ projectId: "p1" });
    expect(verifyGoogleState<{ projectId: string }>(state)).toEqual({ projectId: "p1" });
    expect(verifyGoogleState(`${state}x`)).toBeNull();
  });
});
