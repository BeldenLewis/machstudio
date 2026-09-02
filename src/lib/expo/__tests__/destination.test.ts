import { describe, expect, it } from "vitest";
import { isSafePublicUrl, resolveDestinations } from "@/lib/expo/destination";

describe("Expo destinations", () => {
  it("only resolves enabled destinations", () => {
    expect(resolveDestinations([
      { id: "apply", label: "신청", action: { type: "url", href: "https://example.com" }, enabled: true },
      { id: "hidden", label: "숨김", action: { type: "anchor", target: "footer" }, enabled: false },
    ])).toEqual([{ id: "apply", label: "신청", action: { type: "url", href: "https://example.com" } }]);
  });

  it("rejects non-public HTTPS targets and credential URLs", () => {
    expect(isSafePublicUrl("http://example.com")).toBe(false);
    expect(isSafePublicUrl("https://user:pass@example.com")).toBe(false);
    expect(isSafePublicUrl("https://127.0.0.1/private")).toBe(false);
    expect(isSafePublicUrl("https://example.com/public")).toBe(true);
  });
});
