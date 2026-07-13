import { describe, expect, it } from "vitest";
import { getYouTubeVideoId } from "@/lib/youtube";

describe("getYouTubeVideoId", () => {
  const id = "dQw4w9WgXcQ";

  it.each([
    id,
    `https://youtu.be/${id}?si=share-token`,
    `https://www.youtube.com/watch?v=${id}&feature=share`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
  ])("extracts an ID from %s", (value) => {
    expect(getYouTubeVideoId(value)).toBe(id);
  });

  it("rejects unsupported or malformed values", () => {
    expect(getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(getYouTubeVideoId("https://youtu.be/not-an-id")).toBeNull();
    expect(getYouTubeVideoId("not a URL")).toBeNull();
  });
});
