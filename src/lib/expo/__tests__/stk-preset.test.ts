// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import presetSource from "@/lib/expo/presets/stk-home-v1.json";
import { builtInExpoPresets, instantiateBuiltInPreset } from "@/lib/expo/presets";
import { publishErrors } from "@/lib/expo/readiness";
import { auditStkHomeV1Source } from "../../../../scripts/import-stk-home-v1.mjs";

const script = path.join(process.cwd(), "scripts/import-stk-home-v1.mjs");
const temporary: string[] = [];

function run(args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(), encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", NEXT_PUBLIC_SUPABASE_URL: "" },
  });
}

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "stk-home-v1-"));
  temporary.push(dir);
  return dir;
}

afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true });
});

describe("stk-home-v1", () => {
  it("contains the approved managed content counts and order", () => {
    const page = instantiateBuiltInPreset("stk-home-v1");
    expect(page.schemaVersion).toBe(2);
    expect(page.preset).toBe("stk-home-v1");
    expect(page.sections.map((section) => section.type)).toEqual([
      "campaign-hero",
      "exhibition-grid",
      "audience-links",
      "speaker-carousel",
      "sponsor-marquee",
      "cta-band",
    ]);
    const exhibition = page.sections.find((section) => section.type === "exhibition-grid")!;
    const audience = page.sections.find((section) => section.type === "audience-links")!;
    const speakers = page.sections.find((section) => section.type === "speaker-carousel")!;
    const sponsors = page.sections.find((section) => section.type === "sponsor-marquee")!;
    const finalCta = page.sections.find((section) => section.type === "cta-band")!;
    expect((exhibition.content.items as Array<{ title: { en: string } }>).map((item) => item.title.en)).toEqual([
      "AI & Data Center Show",
      "Robot Tech & Physical AI Show",
      "AI Factory Show",
      "Secu Tech Show",
      "Retail & Logis Tech Show",
      "Smart Tech Show",
    ]);
    expect((audience.content.groups as Array<{ items: unknown[] }>).reduce((sum, group) => sum + group.items.length, 0)).toBe(8);
    expect((speakers.content.categories as unknown[]).length).toBe(3);
    expect((speakers.content.speakers as unknown[]).length).toBe(28);
    expect((speakers.content.categories as Array<{ id: string; badgeToken: string; gradientToken: string }>).map(({ id, badgeToken, gradientToken }) => ({ id, badgeToken, gradientToken }))).toEqual([
      { id: "robotics", badgeToken: "robotics", gradientToken: "robotics" },
      { id: "ai", badgeToken: "ai", gradientToken: "ai" },
      { id: "autonomous-manufacturing", badgeToken: "autonomous-manufacturing", gradientToken: "autonomous-manufacturing" },
    ]);
    const categoryCounts = Object.fromEntries(
      (speakers.content.categories as Array<{ id: string }>).map(({ id }) => [
        id,
        (speakers.content.speakers as Array<{ categoryId: string }>).filter((speaker) => speaker.categoryId === id).length,
      ]),
    );
    expect(categoryCounts).toEqual({ robotics: 9, ai: 11, "autonomous-manufacturing": 8 });
    expect((sponsors.content.groups as unknown[]).length).toBe(4);
    expect(sponsors.content.sponsors).toEqual([]);
    expect((finalCta.content.ctas as unknown[]).length).toBe(2);
    expect(speakers.design.bg).toBe("dark");
  });

  it("creates fresh section sid values while preserving semantic ids", () => {
    let serial = 0;
    const first = instantiateBuiltInPreset("stk-home-v1", { randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}` });
    const second = instantiateBuiltInPreset("stk-home-v1", { randomUUID: () => `00000000-0000-4000-8000-${String(++serial).padStart(12, "0")}` });
    expect(first.sections.map((section) => section.sid)).not.toEqual(second.sections.map((section) => section.sid));
    const ids = (page: typeof first) => JSON.stringify(page).match(/"id":"([a-z][a-z0-9-]*)"/g);
    expect(ids(first)).toEqual(ids(second));
    expect(first.sections.every((section) => section.embedEnabled === false)).toBe(true);
    expect(JSON.stringify(first)).not.toMatch(/_rowKey|rowKey|sourceNotes|\/expo\/|expo-templates/);
  });

  it("exposes one immutable built-in descriptor and never public source notes", () => {
    const presets = builtInExpoPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0]).toMatchObject({ id: "stk-home-v1", builtIn: true });
    expect(Object.isFrozen(presets)).toBe(true);
    expect(Object.isFrozen(presets[0])).toBe(true);
    expect((presetSource as { sourceNotes: unknown[] }).sourceNotes.length).toBeGreaterThan(0);
    expect(instantiateBuiltInPreset("stk-home-v1")).not.toHaveProperty("sourceNotes");
    expect(() => instantiateBuiltInPreset("unknown")).toThrow(/preset/i);
  });

  it("keeps unverified operations absent and lets publish readiness name the gaps", () => {
    const page = instantiateBuiltInPreset("stk-home-v1");
    expect(page.settings).toBeUndefined();
    expect(JSON.stringify(page)).not.toMatch(/https?:\/\/|modalId|rightsStatus|homepageUrl|profileUrl/);
    const errors = publishErrors(page);
    expect(errors.some((error) => error.code === "invalid-destination-reference")).toBe(true);
    expect(errors.filter((error) => error.code === "missing-required-image")).toHaveLength(28);
    expect(errors.some((error) => error.code === "empty-enabled-section" && error.path.includes("sections[4]"))).toBe(true);
  });
});

describe("STK source importer", () => {
  it("defaults to a read-only dry-run and reports sorted missing operational inputs", () => {
    const result = run();
    expect(result.status).toBe(2);
    const output = JSON.parse(result.stdout) as Record<string, string[]>;
    expect(Object.keys(output)).toEqual(["missingAssets", "missingDestinations", "missingSchedules"]);
    for (const values of Object.values(output)) expect(values).toEqual([...values].sort());
    expect(output.missingAssets).toContain("hero.video");
    expect(output.missingDestinations).toContain("booth-inquiry");
    expect(output.missingSchedules).toEqual([
      "campaign.exhibitor-recruitment",
      "campaign.visitor-registration",
      "event",
    ]);
  });

  it("audits the committed preset without local paths, placeholders, duplicate ids, or broken row references", () => {
    const result = run(["--dry-run"]);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe("");
    const source = JSON.stringify(presetSource);
    expect(source).not.toContain('href=\"#\"');
    expect(source).not.toMatch(/(?:\/Users\/|[A-Za-z]:\\\\|stk-2027-speakers[^\"]+\.webp)/);
  });

  it("refuses relative map/output paths and unsafe map values with exit code 1", () => {
    expect(run(["--output=relative.json"]).status).toBe(1);
    const dir = tempDir();
    const assets = path.join(dir, "assets.json");
    const destinations = path.join(dir, "destinations.json");
    const schedules = path.join(dir, "schedules.json");
    writeFileSync(assets, JSON.stringify({ "hero.video": { url: "file:///tmp/video.mp4" } }));
    writeFileSync(destinations, "{}");
    writeFileSync(schedules, "{}");
    const result = run(["--dry-run", `--asset-map=${assets}`, `--destination-map=${destinations}`, `--schedule-map=${schedules}`]);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr).errors[0]).toMatch(/unsafe/i);
  });

  it("uses the public application URL boundary for credentials and private hosts", () => {
    for (const unsafeUrl of [
      "https://user:pass@example.com/asset.webp",
      "https://127.0.0.1/asset.webp",
      "https://localhost/asset.webp",
      "https://[fd00::1]/asset.webp",
      "https://[fe81::1]/asset.webp",
      "https://[::ffff:127.0.0.1]/asset.webp",
    ]) {
      const dir = tempDir();
      const assets = path.join(dir, "assets.json");
      writeFileSync(assets, JSON.stringify({ "speaker.henry-jiang.image": unsafeUrl }));
      const result = run(["--dry-run", `--asset-map=${assets}`]);
      expect(result.status, unsafeUrl).toBe(1);
      expect(JSON.parse(result.stderr).errors[0]).toMatch(/unsafe/i);
    }
  });

  it("allows public 192.0.1 addresses while blocking adjacent reserved CIDR boundaries", () => {
    for (const publicUrl of [
      "https://192.0.1.0/asset.webp",
      "https://192.0.1.255/asset.webp",
    ]) {
      const dir = tempDir();
      const assets = path.join(dir, "assets.json");
      writeFileSync(assets, JSON.stringify({ "speaker.henry-jiang.image": publicUrl }));
      const result = run(["--dry-run", `--asset-map=${assets}`]);
      expect(result.status, publicUrl).toBe(2);
      expect(result.stderr, publicUrl).toBe("");
    }
    for (const blockedUrl of [
      "https://192.0.0.255/asset.webp",
      "https://192.0.2.0/asset.webp",
      "https://192.0.2.255/asset.webp",
    ]) {
      const dir = tempDir();
      const assets = path.join(dir, "assets.json");
      writeFileSync(assets, JSON.stringify({ "speaker.henry-jiang.image": blockedUrl }));
      const result = run(["--dry-run", `--asset-map=${assets}`]);
      expect(result.status, blockedUrl).toBe(1);
      expect(JSON.parse(result.stderr).errors[0]).toMatch(/unsafe/i);
    }
  });

  it("rejects typoed, duplicate, invalid, and broken semantic inventories", () => {
    const mutate = (fn: (document: typeof presetSource) => void) => {
      const document = structuredClone(presetSource);
      fn(document);
      return auditStkHomeV1Source(document);
    };
    expect(mutate((document) => {
      const exhibition = document.config.sections.find((item) => item.type === "exhibition-grid")!;
      (exhibition.content.items as Array<{ id: string }>)[1].id = (exhibition.content.items as Array<{ id: string }>)[0].id;
    })).toEqual(expect.arrayContaining([expect.stringMatching(/duplicate semantic id|unexpected exhibition ids/)]));
    expect(mutate((document) => {
      const exhibition = document.config.sections.find((item) => item.type === "exhibition-grid")!;
      (exhibition.content.items as Array<{ id: string }>)[0].id = "Not Canonical";
    })).toContain("invalid semantic id: Not Canonical");
    expect(mutate((document) => {
      const speakers = document.config.sections.find((item) => item.type === "speaker-carousel")!;
      (speakers.content.speakers as Array<{ categoryId: string }>)[0].categoryId = "missing-category";
    })).toContain("broken category reference: henry-jiang");
    expect(mutate((document) => {
      const cta = document.config.sections.find((item) => item.type === "cta-band")!;
      (cta.content.ctas as Array<{ destinationId: string }>)[0].destinationId = "brochure-dowload";
    })).toContain("unexpected destination references");
  });

  it("writes only an explicit absolute output after all three maps are complete", () => {
    const missing = JSON.parse(run().stdout) as Record<string, string[]>;
    const dir = tempDir();
    const assets = Object.fromEntries(missing.missingAssets.map((key) => [key,
      key === "hero.video"
        ? { url: "https://cdn.example.com/hero.mp4", originalUrl: "https://cdn.example.com/hero-original.mp4", mimeType: "video/mp4", rightsStatus: "confirmed" }
        : `https://cdn.example.com/${key.replaceAll(".", "/")}.webp`,
    ]));
    const destinations = Object.fromEntries(missing.missingDestinations.map((key) => [key, `https://example.com/${key}`]));
    const schedules = {
      event: {
        edition: 2027,
        startsAt: "2027-06-23T00:00:00+09:00",
        endsAt: "2027-06-26T00:00:00+09:00",
        facts: { companies: 400, sessions: 30, booths: 700 },
        arbitrary: "must-not-cross-the-boundary",
      },
      "campaign.exhibitor-recruitment": { startsAt: "2026-09-01T00:00:00+09:00", endsAt: "2027-06-23T00:00:00+09:00" },
      "campaign.visitor-registration": { startsAt: "2027-01-01T00:00:00+09:00", endsAt: "2027-06-23T00:00:00+09:00" },
    };
    const files = {
      assets: path.join(dir, "assets.json"), destinations: path.join(dir, "destinations.json"),
      schedules: path.join(dir, "schedules.json"), output: path.join(dir, "materialized.json"),
    };
    writeFileSync(files.assets, JSON.stringify(assets));
    writeFileSync(files.destinations, JSON.stringify(destinations));
    writeFileSync(files.schedules, JSON.stringify(schedules));
    const result = run([
      `--output=${files.output}`, `--asset-map=${files.assets}`,
      `--destination-map=${files.destinations}`, `--schedule-map=${files.schedules}`,
    ]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ output: files.output, written: true });
    const written = JSON.parse(readFileSync(files.output, "utf8"));
    expect(written.config.sections).toHaveLength(6);
    expect(written.config.settings.destinations).toHaveLength(missing.missingDestinations.length);
    expect(written.config.settings.campaigns).toHaveLength(2);
    expect(written.config.settings.event).toEqual({
      edition: 2027,
      startsAt: "2027-06-23T00:00:00+09:00",
      endsAt: "2027-06-26T00:00:00+09:00",
      facts: { companies: 400, sessions: 30, booths: 700 },
    });

    const missingDestination = structuredClone(written);
    missingDestination.config.settings.destinations = missingDestination.config.settings.destinations
      .filter((destination: { id: string }) => destination.id !== "booth-inquiry");
    expect(auditStkHomeV1Source(missingDestination)).toEqual(expect.arrayContaining([
      "broken destination reference: booth-inquiry",
      "unexpected settings destination ids",
    ]));

    const changedCampaign = structuredClone(written);
    changedCampaign.config.settings.campaigns[0].id = "replacement-campaign";
    expect(auditStkHomeV1Source(changedCampaign)).toEqual(expect.arrayContaining([
      "broken campaign reference: exhibitor-recruitment",
      "unexpected settings campaign ids",
    ]));
  });

  it("rejects negative, non-integer, and unknown event facts", () => {
    for (const facts of [
      { companies: -1 },
      { sessions: 1.5 },
      { attendees: 100 },
    ]) {
      const dir = tempDir();
      const schedules = path.join(dir, "schedules.json");
      writeFileSync(schedules, JSON.stringify({
        event: {
          edition: 2027,
          startsAt: "2027-06-23T00:00:00+09:00",
          endsAt: "2027-06-26T00:00:00+09:00",
          facts,
        },
      }));
      const result = run(["--dry-run", `--schedule-map=${schedules}`]);
      expect(result.status, JSON.stringify(facts)).toBe(1);
      expect(JSON.parse(result.stderr).errors[0]).toMatch(/fact/i);
    }
  });
});
