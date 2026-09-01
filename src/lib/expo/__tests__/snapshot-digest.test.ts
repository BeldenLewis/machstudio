import { describe, expect, it } from "vitest";
import { snapshotDigest, stableJson } from "@/lib/expo/snapshot-digest";

describe("Expo snapshot digest", () => {
  it("hashes the full canonical snapshot independent of object key order", () => {
    const a = {
      schemaVersion: 2,
      settings: {
        event: {
          edition: 2027,
          startsAt: "2027-06-02T00:00:00Z",
          endsAt: "2027-06-05T00:00:00Z",
        },
      },
      sections: [],
    };
    const b = {
      sections: [],
      settings: {
        event: {
          endsAt: "2027-06-05T00:00:00Z",
          startsAt: "2027-06-02T00:00:00Z",
          edition: 2027,
        },
      },
      schemaVersion: 2,
    };

    expect(snapshotDigest(a)).toBe(snapshotDigest(b));
    expect(snapshotDigest(a)).not.toBe(snapshotDigest({
      ...a,
      settings: { event: { ...a.settings.event, edition: 2028 } },
    }));
  });

  it("canonicalizes nested objects while preserving array order", () => {
    expect(stableJson({ z: [{ b: 2, a: 1 }], a: true }))
      .toBe('{"a":true,"z":[{"a":1,"b":2}]}');
    expect(stableJson({ sections: ["first", "second"] }))
      .not.toBe(stableJson({ sections: ["second", "first"] }));
  });
});
