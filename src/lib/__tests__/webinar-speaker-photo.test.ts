import { describe, expect, it } from "vitest";
import { speakerPhotoExtension, validateSpeakerPhoto } from "@/lib/webinar-speaker-photo";

describe("speaker photo validation", () => {
  it("accepts supported images within 5MB", () => {
    expect(validateSpeakerPhoto({ type: "image/webp", size: 5 * 1024 * 1024 })).toBeNull();
    expect(speakerPhotoExtension("image/jpeg")).toBe("jpg");
  });

  it("rejects unsupported or oversized files", () => {
    expect(validateSpeakerPhoto({ type: "application/pdf", size: 10 })).toContain("이미지");
    expect(validateSpeakerPhoto({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toContain("5MB");
  });
});
