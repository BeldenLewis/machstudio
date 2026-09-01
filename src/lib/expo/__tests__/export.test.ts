// @vitest-environment node
import { describe, expect, it } from "vitest";
import { prepareStandaloneExpoHtml } from "@/lib/expo/export";
import { snapshotDigest } from "@/lib/expo/snapshot-digest";
import type { ExpoPageConfigV2, ExpoSection } from "@/lib/expo/types";

const SID = "11111111-1111-1111-1111-111111111111";
const SID_2 = "22222222-2222-2222-2222-222222222222";
const theme = { accent: "#ff8500", lightBg: "#ffffff", darkBg: "#111318" };

const kv = (over: Partial<ExpoSection> = {}): ExpoSection => ({
  sid: SID,
  type: "kv",
  variant: "column",
  enabled: true,
  embedEnabled: false,
  design: { bg: "light", align: "left" },
  content: { title: { ko: "STK 2027" } },
  ...over,
});

const publishedConfig = (sections: ExpoSection[] = [kv()]): ExpoPageConfigV2 => ({
  schemaVersion: 2,
  settings: {
    campaigns: [
      {
        id: "exhibitor-recruitment",
        label: "참가기업 모집",
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-09-02T00:00:00.000Z",
        override: "auto",
        enabled: true,
      },
      {
        id: "visitor-registration",
        label: "참관객 등록",
        startsAt: "2026-09-02T00:00:00.000Z",
        endsAt: "2026-09-03T00:00:00.000Z",
        override: "auto",
        enabled: true,
      },
    ],
    destinations: [],
  },
  sections,
});

function prepare(config: ExpoPageConfigV2, over: Partial<Parameters<typeof prepareStandaloneExpoHtml>[0]> = {}) {
  return prepareStandaloneExpoHtml({
    pageId: "page-1",
    revisionSequence: 7,
    revisionCodeDigest: snapshotDigest(config),
    exportedAt: new Date("2026-09-01T03:00:00.000Z"),
    scope: { type: "page" },
    config,
    theme,
    locale: "ko",
    pages: [],
    ...over,
  });
}

function htmlOf(result: ReturnType<typeof prepareStandaloneExpoHtml>): string {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join(", "));
  return result.html;
}

describe("standalone Expo export", () => {
  it("freezes campaign state and contains no Mach network side effect", () => {
    const config = publishedConfig();
    const html = htmlOf(prepare(config));

    expect(html).toContain("pageId=page-1 revision=7");
    expect(html).toContain("exhibitor-recruitment:on");
    expect(html).toContain("visitor-registration:off");
    expect(html).not.toContain("2026-09-02T00:00:00.000Z");
    expect(html).not.toMatch(/fetch\s*\(|\/api\/|\/hp\/|reportExpoSeen/);
    expect(html).toContain("<style>");
    expect(html).toContain("<script>");
    expect(html).toContain('"mode":"standalone"');
  });

  it("exports every enabled renderable page section without requiring embedEnabled", () => {
    const config = publishedConfig([
      kv(),
      kv({ sid: SID_2, type: "textblock", variant: "prose", content: { heading: { ko: "안내" }, body: { ko: "본문" } } }),
      kv({ sid: "33333333-3333-3333-3333-333333333333", enabled: false, content: { title: { ko: "숨김" } } }),
    ]);
    const html = htmlOf(prepare(config));
    expect(html).toContain(SID);
    expect(html).toContain(SID_2);
    expect(html).not.toContain("33333333-3333-3333-3333-333333333333");
  });

  it("exports exactly one enabled renderable section and ignores embedEnabled", () => {
    const config = publishedConfig([
      kv(),
      kv({ sid: SID_2, type: "textblock", variant: "prose", content: { body: { ko: "둘째" } } }),
    ]);
    const html = htmlOf(prepare(config, { scope: { type: "section", sid: SID_2 } }));
    expect(html).toContain(SID_2);
    expect(html).not.toContain(`"sid":"${SID}"`);
  });

  it.each([
    ["missing", "99999999-9999-9999-9999-999999999999", publishedConfig()],
    ["disabled", SID, publishedConfig([kv({ enabled: false })])],
    ["empty", SID, publishedConfig([kv({ content: {} })])],
  ])("rejects an unavailable %s section", (_name, sid, config) => {
    const result = prepare(config, { scope: { type: "section", sid } });
    expect(result).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ path: "scope.sid", code: "standalone-section-unavailable", sid }],
    });
  });

  it.each(["register-form", "custom-code"])("rejects enabled %s sections", (type) => {
    const section = kv({
      type,
      variant: type === "register-form" ? "inline" : "boxed",
      content: type === "register-form" ? { sourceRef: "source-1" } : { code: "<b>stored</b>" },
    });
    const config = publishedConfig([section]);
    expect(prepare(config)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ code: "standalone-unsupported", sid: SID }],
    });
  });

  it.each([
    "http://cdn.example.com/image.jpg",
    "https://127.0.0.1/private.jpg",
    "data:image/png;base64,AAAA",
  ])("rejects non-public media URL %s", (url) => {
    const config = publishedConfig([kv({ content: { title: { ko: "미디어" }, media: { kind: "image", url } } })]);
    expect(prepare(config)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ code: "standalone-media-public-https" }],
    });
  });

  it("keeps validated public HTTPS media in the frozen payload", () => {
    const config = publishedConfig([kv({
      content: { title: { ko: "미디어" }, media: { kind: "image", url: "https://cdn.example.com/image.jpg" } },
    })]);
    expect(htmlOf(prepare(config))).toContain("https://cdn.example.com/image.jpg");
  });

  it("inspects the first duplicate sid selected by normalization instead of a later safe duplicate", () => {
    const config = publishedConfig([
      kv({ content: { title: { ko: "첫 구획" }, media: { kind: "image", url: "http://127.0.0.1/private.jpg" } } }),
      kv({ content: { title: { ko: "중복 구획" }, media: { kind: "image", url: "https://cdn.example.com/safe.jpg" } } }),
    ]);
    expect(prepare(config)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ path: "sections[0].content.media.url", code: "standalone-media-public-https", sid: SID }],
    });
  });

  it("inspects the first duplicate sid that survives normalization", () => {
    const discarded = kv({
      type: "retired-section",
      content: { title: { ko: "정규화에서 탈락" } },
    });
    const config = publishedConfig([
      discarded,
      kv({ content: { title: { ko: "실제 렌더" }, media: { kind: "image", url: "http://127.0.0.1/private.jpg" } } }),
    ]);
    expect(prepare(config)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ path: "sections[1].content.media.url", code: "standalone-media-public-https", sid: SID }],
    });
  });

  it("reports unsafe media with its original section index after filtering", () => {
    const config = publishedConfig([
      kv({ enabled: false, content: { title: { ko: "숨김" } } }),
      kv({
        sid: SID_2, type: "textblock", variant: "prose",
        content: { body: { ko: "둘째" }, media: { kind: "image", url: "http://127.0.0.1/private.jpg" } },
      }),
    ]);
    expect(prepare(config)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ path: "sections[1].content.media.url", code: "standalone-media-public-https", sid: SID_2 }],
    });
  });

  it("requires a public HTTPS modal fallback and rewrites the action to a URL", () => {
    const withoutFallback = publishedConfig();
    withoutFallback.settings!.destinations = [{
      id: "inquiry", label: "문의", action: { type: "imweb-modal", modalId: "mInquiry" }, enabled: true,
    }];
    expect(prepare(withoutFallback)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ path: "settings.destinations[0].action.fallbackHref", code: "standalone-modal-fallback-required" }],
    });

    const unsafeFallback = publishedConfig();
    unsafeFallback.settings!.destinations = [{
      id: "inquiry", label: "문의",
      action: { type: "imweb-modal", modalId: "mInquiry", fallbackHref: "http://127.0.0.1/private" },
      enabled: true,
    }];
    expect(prepare(unsafeFallback)).toMatchObject({
      ok: false,
      status: 422,
      issues: [{ code: "standalone-modal-fallback-required" }],
    });

    const withFallback = publishedConfig();
    withFallback.settings!.destinations = [{
      id: "inquiry", label: "문의",
      action: { type: "imweb-modal", modalId: "mInquiry", fallbackHref: "https://smarttechkorea.com/214" },
      enabled: true,
    }];
    const html = htmlOf(prepare(withFallback));
    expect(html).toContain('"action":{"type":"url","href":"https://smarttechkorea.com/214"}');
    expect(html).not.toContain("mInquiry");
  });

  it("requires canonical sequence and full-snapshot digest", () => {
    const config = publishedConfig();
    for (const over of [
      { revisionSequence: null },
      { revisionCodeDigest: null },
      { revisionCodeDigest: "not-the-published-snapshot" },
    ]) {
      expect(prepare(config, over)).toMatchObject({
        ok: false,
        status: 409,
        issues: [{ code: "standalone-republish-required" }],
      });
    }
  });

  it("serializes frozen campaigns as an id-to-boolean map without labels", () => {
    const config = publishedConfig();
    config.settings!.campaigns![0].label = "SERIALIZED_LABEL_MUST_NOT_LEAK";
    const html = htmlOf(prepare(config));
    expect(html).toContain('\"campaigns\":{\"exhibitor-recruitment\":true,\"visitor-registration\":false}');
    expect(html).not.toContain("SERIALIZED_LABEL_MUST_NOT_LEAK");
  });

  it("escapes script JSON and comment metadata through separate boundaries", () => {
    const config = publishedConfig([kv({
      content: { title: { ko: "</script><!--A\u2028B\u2029C" } },
    })]);
    const html = htmlOf(prepare(config, { pageId: "page--><script>alert(1)</script>" }));
    expect(html).not.toContain("</script><!--");
    expect(html).not.toContain("page--><script>");
    expect(html).toContain("\\u003C/script\\u003E\\u003C!--A\\u2028B\\u2029C");
    expect(html.match(/<script>/g)).toHaveLength(1);
  });

  it("returns an ASCII-only download filename", () => {
    const config = publishedConfig();
    const result = prepare(config, { pageId: "페이지/한글" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toMatch(/^[\x20-\x7e]+\.html$/);
    expect(result.filename).not.toContain("/");
  });
});
