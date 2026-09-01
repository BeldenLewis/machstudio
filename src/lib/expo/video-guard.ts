export const EXPO_VIDEO_RULES = {
  sourceBytes: 50 * 1024 * 1024,
  mimeType: "video/mp4",
} as const;

export type Mp4Inspection = { ok: true } | {
  ok: false;
  reason: "type-not-allowed" | "too-large" | "invalid-mp4";
};

/** MP4는 확장자가 아니라 정확한 MIME과 첫 ftyp 박스를 함께 확인한다. */
export function inspectMp4(input: { declaredType: string; bytes: Uint8Array }): Mp4Inspection {
  if (input.declaredType !== EXPO_VIDEO_RULES.mimeType) {
    return { ok: false, reason: "type-not-allowed" };
  }
  if (input.bytes.length > EXPO_VIDEO_RULES.sourceBytes) {
    return { ok: false, reason: "too-large" };
  }
  if (input.bytes.length < 12) return { ok: false, reason: "invalid-mp4" };
  const boxSize = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength).getUint32(0);
  if (boxSize < 12 || boxSize > input.bytes.length) return { ok: false, reason: "invalid-mp4" };
  if (String.fromCharCode(...input.bytes.subarray(4, 8)) !== "ftyp") {
    return { ok: false, reason: "invalid-mp4" };
  }
  return { ok: true };
}
