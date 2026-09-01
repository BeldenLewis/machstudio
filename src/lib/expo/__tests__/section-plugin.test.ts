// @vitest-environment node
import { resolve } from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { normalizeExpoPage } from "@/lib/expo/config";
import {
  collectPluginMediaUrls,
  resolvePluginContent,
  rewritePluginMediaUrls,
} from "@/lib/expo/plugin-content";
import { buildExpoPayload } from "@/lib/expo/payload";
import { EXPO_SECTIONS } from "@/lib/expo/registry";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("plugin content walkers", () => {
  const content = {
    heading: { ko: "연사", en: "Speakers" },
    rows: [{
      name: { ko: "홍길동", en: "Gildong Hong" },
      image: {
        kind: "image",
        url: "https://cdn.example.com/a.webp",
        originalUrl: "https://cdn.example.com/a-original.webp",
        alt: "홍길동",
        crop: { x: 0.25, y: 0.5 },
      },
      video: {
        kind: "video",
        url: "https://cdn.example.com/talk.mp4",
        originalUrl: "https://cdn.example.com/talk-original.mp4",
        poster: { kind: "image", url: "https://cdn.example.com/poster.webp" },
      },
    }],
    design: { mobile: "stack", desktop: "grid" },
    notLocalized: { ko: "문자열", en: 7 },
    code: '<img src="https://cdn.example.com/in-code.webp">',
  };

  it("localizes nested text without dropping arrays, media, crop, or design objects", () => {
    expect(resolvePluginContent(content, "ko")).toEqual({
      heading: "연사",
      rows: [{
        name: "홍길동",
        image: {
          kind: "image",
          url: "https://cdn.example.com/a.webp",
          originalUrl: "https://cdn.example.com/a-original.webp",
          alt: "홍길동",
          crop: { x: 0.25, y: 0.5 },
        },
        video: {
          kind: "video",
          url: "https://cdn.example.com/talk.mp4",
          originalUrl: "https://cdn.example.com/talk-original.mp4",
          poster: { kind: "image", url: "https://cdn.example.com/poster.webp" },
        },
      }],
      design: { mobile: "stack", desktop: "grid" },
      notLocalized: { ko: "문자열", en: 7 },
      code: '<img src="https://cdn.example.com/in-code.webp">',
    });
  });

  it("recognizes localized maps only when every key and value match the contract", () => {
    expect(resolvePluginContent({ region: { "ko-KR": "서울", en: "Seoul" } }, "ko-KR"))
      .toEqual({ region: "서울" });
    expect(resolvePluginContent({ crop: { ko: "keep", x: "also keep" } }, "ko"))
      .toEqual({ crop: { ko: "keep", x: "also keep" } });
    expect(resolvePluginContent({ mixed: { ko: "keep", en: false } }, "ko"))
      .toEqual({ mixed: { ko: "keep", en: false } });
  });

  it("collects and rewrites nested image and video URL fields but never code strings", () => {
    expect(collectPluginMediaUrls(content)).toEqual([
      "https://cdn.example.com/a.webp",
      "https://cdn.example.com/a-original.webp",
      "https://cdn.example.com/talk.mp4",
      "https://cdn.example.com/talk-original.mp4",
      "https://cdn.example.com/poster.webp",
    ]);

    const rewritten = rewritePluginMediaUrls(content, new Map([
      ["https://cdn.example.com/a.webp", "https://cdn.example.com/b.webp"],
      ["https://cdn.example.com/talk.mp4", "https://cdn.example.com/talk-new.mp4"],
      ["https://cdn.example.com/poster.webp", "https://cdn.example.com/poster-new.webp"],
      ["https://cdn.example.com/in-code.webp", "https://cdn.example.com/should-not-appear.webp"],
    ])) as typeof content;

    expect(rewritten.rows[0].image.url).toBe("https://cdn.example.com/b.webp");
    expect(rewritten.rows[0].video.url).toBe("https://cdn.example.com/talk-new.mp4");
    expect(rewritten.rows[0].video.poster.url).toBe("https://cdn.example.com/poster-new.webp");
    expect(rewritten.rows[0].image.crop).toEqual({ x: 0.25, y: 0.5 });
    expect(rewritten.code).toContain("https://cdn.example.com/in-code.webp");
  });
});

describe("hookless W1 compatibility", () => {
  it("keeps textblock payload output byte-for-byte stable", () => {
    const page = normalizeExpoPage({ sections: [{
      sid: uid(1), type: "textblock", variant: "prose", content: { body: "본문" },
    }] });
    const payload = buildExpoPayload(page, {
      locale: "ko", pages: [], now: new Date("2027-01-01T00:00:00.000Z"),
    });

    expect(JSON.stringify(payload.sections[0])).toBe(
      `{"sid":"${uid(1)}","type":"textblock","variant":"prose","design":{"bg":"light"},"content":{"body":"본문"}}`,
    );
  });
});

describe("shared registry runtime boundary", () => {
  it("does not assign client-only editor components", () => {
    expect(EXPO_SECTIONS.some((plugin) => Object.hasOwn(plugin, "editor"))).toBe(false);
  });

  it("bundles without a React runtime dependency", async () => {
    const root = resolve(__dirname, "../../../..");
    const result = await build({
      entryPoints: [resolve(root, "src/lib/expo/registry.ts")],
      bundle: true,
      write: false,
      metafile: true,
      platform: "browser",
      alias: { "@": resolve(root, "src") },
    });
    const inputs = Object.keys(result.metafile?.inputs ?? {});
    expect(inputs.filter((path) => /node_modules[/\\]react(?:[/\\]|$)/.test(path))).toEqual([]);
  });
});
