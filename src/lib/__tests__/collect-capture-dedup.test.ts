import { describe, expect, it } from "vitest";
import { captureDedupKey, captureEmailNormalized } from "@/lib/collect-capture-dedup";

describe("captureDedupKey", () => {
  it("uses the first configured field that has a value", () => {
    expect(captureDedupKey({ registration_id: "", email: " A@Example.com " }, ["registration_id", "email"]))
      .toEqual({ field: "email", value: "a@example.com", lockValue: "email:a@example.com" });
  });

  it("normalizes invisible characters in email addresses", () => {
    expect(captureDedupKey({ email: "ja\u200Bne@example.com" }, ["email"])?.value)
      .toBe("jane@example.com");
  });

  it("does not invent a live dedup rule when none is configured", () => {
    expect(captureDedupKey({ email: "a@example.com" }, [])).toBeNull();
  });
});

describe("captureEmailNormalized", () => {
  it("finds conventional email field names", () => {
    expect(captureEmailNormalized({ e_mail: " PERSON@Example.com " })).toBe("person@example.com");
  });
});
