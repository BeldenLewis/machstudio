import { describe, expect, it } from "vitest";
import { normalizeScopes, tokenHash, validRedirectUri } from "@/lib/oauth";

describe("OAuth helpers", () => {
  it("only grants supported read-only scopes", () => {
    expect(normalizeScopes("ads:read records:write dashboards:read")).toEqual(["dashboards:read", "ads:read"]);
  });

  it("accepts HTTPS callbacks and local development HTTP only", () => {
    expect(validRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(validRedirectUri("http://localhost:3334/callback")).toBe(true);
    expect(validRedirectUri("http://example.com/callback")).toBe(false);
    expect(validRedirectUri("javascript:alert(1)")).toBe(false);
  });

  it("stores opaque credentials as hashes", () => {
    expect(tokenHash("secret")).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenHash("secret")).not.toContain("secret");
  });
});
