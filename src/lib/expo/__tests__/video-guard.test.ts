import { describe, expect, it } from "vitest";
import { EXPO_VIDEO_RULES, inspectMp4 } from "@/lib/expo/video-guard";

const mp4 = (size = 24) => {
  const out = new Uint8Array(size);
  out.set([0, 0, 0, 24, ...Buffer.from("ftypisom")]);
  return out;
};

describe("MP4 upload safety", () => {
  it("requires exact video/mp4 and a valid ftyp box", () => {
    expect(inspectMp4({ declaredType: "video/mp4", bytes: mp4() })).toEqual({ ok: true });
    expect(inspectMp4({ declaredType: "video/mp4; charset=binary", bytes: mp4() })).toMatchObject({ ok: false });
    expect(inspectMp4({ declaredType: "application/octet-stream", bytes: mp4() })).toMatchObject({ ok: false });
    expect(inspectMp4({ declaredType: "video/mp4", bytes: new Uint8Array(24) })).toMatchObject({ ok: false });
  });

  it("rejects a truncated or oversized ftyp box", () => {
    const truncated = mp4();
    truncated.set([0, 0, 1, 0], 0);
    expect(inspectMp4({ declaredType: "video/mp4", bytes: truncated })).toMatchObject({ ok: false });
    expect(inspectMp4({ declaredType: "video/mp4", bytes: new Uint8Array(11) })).toMatchObject({ ok: false });
  });

  it("uses the exact 50MiB source limit", () => {
    expect(EXPO_VIDEO_RULES).toEqual({ sourceBytes: 50 * 1024 * 1024, mimeType: "video/mp4" });
    const oversized = new Uint8Array(EXPO_VIDEO_RULES.sourceBytes + 1);
    oversized.set(mp4());
    expect(inspectMp4({ declaredType: "video/mp4", bytes: oversized })).toMatchObject({ ok: false, reason: "too-large" });
  });
});
