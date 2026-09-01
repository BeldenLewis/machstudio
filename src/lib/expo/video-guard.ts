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
  if (input.bytes.length < 16) return { ok: false, reason: "invalid-mp4" };
  const boxSize = new DataView(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength).getUint32(0);
  // size=1 moves the real size into an eight-byte extended header. This guard intentionally
  // rejects that variant instead of partially parsing it as the ordinary ftyp layout.
  if (boxSize === 1 || boxSize < 16 || boxSize > input.bytes.length || (boxSize - 16) % 4 !== 0) {
    return { ok: false, reason: "invalid-mp4" };
  }
  if (String.fromCharCode(...input.bytes.subarray(4, 8)) !== "ftyp") {
    return { ok: false, reason: "invalid-mp4" };
  }
  const majorBrand = String.fromCharCode(...input.bytes.subarray(8, 12));
  if (!/^[\x20-\x7e]{4}$/.test(majorBrand)) return { ok: false, reason: "invalid-mp4" };
  // Bytes 12..15 are the required four-byte minor version. Compatible brands, if present,
  // start at byte 16 and the alignment check above guarantees complete four-byte entries.
  return { ok: true };
}
