import { describe, expect, it } from "vitest";
import { speakerPhotoExtension, validateSpeakerPhoto, SPEAKER_PHOTO_MAX_LABEL } from "@/lib/webinar-speaker-photo";

// 상한은 4MB 다 — Vercel 서버리스 요청 본문 상한(4.5MB) 아래로 내려, 우리 검증은 통과했는데
// 플랫폼에서 잘려 "업로드 실패"만 뜨는 상황을 막는다. 라벨은 코드에서 가져와 숫자를 두 곳에 적지 않는다.
const MB = 1024 * 1024;

describe("speaker photo validation", () => {
  it("지원 형식 + 상한 이하는 통과", () => {
    expect(validateSpeakerPhoto({ type: "image/webp", size: 4 * MB })).toBeNull(); // 경계값 = 통과
    expect(validateSpeakerPhoto({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(validateSpeakerPhoto({ type: "image/png", size: 3 * MB })).toBeNull();
    expect(speakerPhotoExtension("image/jpeg")).toBe("jpg");
  });

  it("이미지가 아니면 거부", () => {
    expect(validateSpeakerPhoto({ type: "application/pdf", size: 10 })).toContain("이미지");
  });

  it("상한을 1바이트라도 넘으면 거부하고, 안내에 실제 상한을 적는다", () => {
    const msg = validateSpeakerPhoto({ type: "image/png", size: 4 * MB + 1 });
    expect(msg).toContain(SPEAKER_PHOTO_MAX_LABEL);
    expect(msg).toContain("4MB");
  });

  it("Vercel 본문 상한(4.5MB) 아래로 막는지 — 4.5MB 파일은 반드시 거부", () => {
    expect(validateSpeakerPhoto({ type: "image/jpeg", size: Math.round(4.5 * MB) })).not.toBeNull();
  });
});
