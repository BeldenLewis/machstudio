import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/audit-expo-public-embeds.mjs");
const secretUrl = "postgresql://audit-user:never-print@db.example.test:5432/expo";

interface FixturePage {
  pageId: string;
  siteId: string;
  title: string;
  liveAt: string | null;
  pageDeletedAt: string | null;
  siteDeletedAt: string | null;
  published: unknown;
}

const pgStub = `
  const fixtures = JSON.parse(process.env.EXPO_AUDIT_FIXTURE_JSON || "[]");
  export class Client {
    constructor(options) {
      if (!options || options.connectionString !== process.env.DATABASE_URL) {
        throw new Error("unexpected connection target");
      }
      this.queryCount = 0;
    }
    async connect() {}
    async query(text) {
      this.queryCount += 1;
      if (this.queryCount !== 1) throw new Error("audit must execute exactly one query");
      if (text.includes(";")) throw new Error("audit must execute exactly one SQL statement");
      if (!/^\\s*SELECT\\b/i.test(text)) throw new Error("audit query must be SELECT-only");
      if (/\\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE|CALL)\\b/i.test(text)) {
        throw new Error("mutating SQL is forbidden");
      }
      const required = [
        'FROM public."ExpoPage" AS page',
        'INNER JOIN public."ExpoSite" AS site ON site."id" = page."siteId"',
        'page."deletedAt" IS NULL',
        'site."deletedAt" IS NULL',
        'page."published" IS NOT NULL',
        'AS "publishedShapeValid"',
        \"section->'embedEnabled' = 'true'::jsonb\",
        'AS "ambiguousSectionPositions"',
      ];
      for (const fragment of required) {
        if (!text.includes(fragment)) throw new Error(\`query contract missing: \${fragment}\`);
      }
      const rows = fixtures
        .filter((row) => row.pageDeletedAt === null && row.siteDeletedAt === null && row.published !== null)
        .map((row) => {
          const shapeValid = !!row.published && typeof row.published === "object" && !Array.isArray(row.published)
            && Array.isArray(row.published.sections);
          const sections = shapeValid ? row.published.sections : [];
          const ambiguousSectionPositions = sections.flatMap((section, index) => {
            if (!section || typeof section !== "object" || Array.isArray(section)) return [index + 1];
            if ("embedEnabled" in section && typeof section.embedEnabled !== "boolean") return [index + 1];
            if (section.embedEnabled === true && (typeof section.sid !== "string" || !section.sid.trim())) return [index + 1];
            return [];
          });
          return {
            pageId: row.pageId,
            siteId: row.siteId,
            title: row.title,
            liveAt: row.liveAt,
            publishedShapeValid: shapeValid,
            ambiguousSectionPositions,
            allSectionSids: sections
              .filter((section) => section && typeof section === "object" && !Array.isArray(section) && typeof section.sid === "string")
              .map((section) => section.sid),
            embedEnabledSids: sections
              .filter((section) => section && typeof section === "object" && !Array.isArray(section) && section.embedEnabled === true)
              .map((section) => typeof section.sid === "string" ? section.sid : "(missing sid)")
              .sort(),
          };
        });
      return { rows };
    }
    async end() {}
  }
`;

const pgStubUrl = `data:text/javascript,${encodeURIComponent(pgStub)}`;
const loader = `data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, nextResolve) {
    if (specifier === "pg") return { url: ${JSON.stringify(pgStubUrl)}, shortCircuit: true };
    return nextResolve(specifier, context);
  }
`)}`;

function runAudit(expected: string | null, fixtures: FixturePage[] = []) {
  const args = ["--no-warnings", "--experimental-loader", loader, script];
  if (expected !== null) args.push(`--expect-page-ids=${expected}`);
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: secretUrl,
      EXPO_AUDIT_FIXTURE_JSON: JSON.stringify(fixtures),
    },
    encoding: "utf8",
  });
}

const publishedPage = (over: Partial<FixturePage> = {}): FixturePage => ({
  pageId: "page-live",
  siteId: "site-1",
  title: "STK home",
  liveAt: "2026-09-01T00:00:00.000Z",
  pageDeletedAt: null,
  siteDeletedAt: null,
  published: { sections: [] },
  ...over,
});

describe("audit-expo-public-embeds --describe", () => {
  it("pg를 import하지 않고 exact-set과 읽기 전용 query 계약을 설명한다", () => {
    const rejectPgLoader = `data:text/javascript,${encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier === "pg") throw new Error("pg import attempted");
        return nextResolve(specifier, context);
      }
    `)}`;
    const result = spawnSync(process.execPath, [
      "--no-warnings", "--experimental-loader", rejectPgLoader, script, "--describe",
    ], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: secretUrl }, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(secretUrl);
    const contract = JSON.parse(result.stdout);
    expect(contract.readOnly).toBe(true);
    expect(contract.allowlist).toMatchObject({
      argument: "--expect-page-ids", emptySetSentinel: "none", delimiter: ",",
      exactSet: true, trimsIds: true, rejectsDuplicates: true,
    });
    expect(contract.publicSurface).toBe("liveAt IS NOT NULL OR any published section has embedEnabled=true; enabled is intentionally ignored");
    expect(contract.renderability).toContain("conservatively counts every raw embedEnabled=true section");
    expect(contract.query).toContain('INNER JOIN public."ExpoSite" AS site ON site."id" = page."siteId"');
    expect(contract.query).toContain('page."deletedAt" IS NULL');
    expect(contract.query).toContain('site."deletedAt" IS NULL');
    expect(contract.query).toContain('page."published" IS NOT NULL');
    expect(contract.query).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TRUNCATE|MERGE|CALL)\b/i);
  });

  it("production SQL guard가 quoted/comment semicolon은 무시하고 실제 다중 statement는 거절한다", () => {
    const moduleUrl = pathToFileURL(script).href;
    const source = `
      import { assertSingleReadOnlyStatement } from ${JSON.stringify(moduleUrl)};
      assertSingleReadOnlyStatement("SELECT ';' /* ; */ -- ;\\n");
      let rejected = false;
      try { assertSingleReadOnlyStatement("SELECT 1; SELECT 2"); } catch { rejected = true; }
      if (!rejected) throw new Error("multi-statement SQL was accepted");
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], {
      cwd: process.cwd(), encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });
});

describe("audit-expo-public-embeds exact allowlist", () => {
  it("liveAt 페이지와 enabled와 무관한 embedEnabled 구획 페이지의 완전한 집합을 통과시킨다", () => {
    const sidDisabled = "11111111-1111-1111-1111-111111111111";
    const sidPublic = "22222222-2222-2222-2222-222222222222";
    const fixtures = [
      publishedPage(),
      publishedPage({
        pageId: "page-section", liveAt: null,
        published: { sections: [
          { sid: sidDisabled, type: "kv", enabled: false, embedEnabled: true, content: { title: { ko: "Hero" } } },
          { sid: "33333333-3333-3333-3333-333333333333", enabled: true, embedEnabled: false },
          { sid: sidPublic, enabled: true, embedEnabled: true },
        ] },
      }),
    ];
    const result = runAudit(" page-section , page-live ", fixtures);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"pageId":"page-live"');
    expect(result.stdout).toContain('"pageId":"page-section"');
    expect(result.stdout).toContain(`"embedEnabledSids":["${sidDisabled}","${sidPublic}"]`);
    expect(result.stdout + result.stderr).not.toContain(secretUrl);
  });

  it("literal none만 승인된 빈 집합으로 받아들인다", () => {
    const result = runAudit("none", [publishedPage({ liveAt: null })]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("exact public page-id set verified: none");
  });

  it("누락과 예상 밖 페이지를 각각 exact-set 진단에 표시한다", () => {
    const result = runAudit("page-live,page-missing", [
      publishedPage(),
      publishedPage({ pageId: "page-unexpected" }),
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("exact page-id set mismatch");
    expect(result.stderr).toContain('missing approved ids: ["page-missing"]');
    expect(result.stderr).toContain('unexpected public ids: ["page-unexpected"]');
  });

  it.each([
    ["deleted page", publishedPage({ pageDeletedAt: "2026-09-01T01:00:00.000Z" })],
    ["deleted site", publishedPage({ siteDeletedAt: "2026-09-01T01:00:00.000Z" })],
    ["null published", publishedPage({ published: null })],
  ])("%s fixture는 공개 집합에서 제외한다", (_label, fixture) => {
    const result = runAudit("none", [fixture]);
    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain('"pageId":"page-live"');
  });

  it.each([
    ["invalid published shape", publishedPage({ published: { sections: "not-an-array" } })],
    ["ambiguous embed flag", publishedPage({ published: { sections: [{ sid: "11111111-1111-1111-1111-111111111111", embedEnabled: "true" }] } })],
    ["missing public sid", publishedPage({ published: { sections: [{ embedEnabled: true }] } })],
    ["duplicate sid", publishedPage({ published: { sections: [
      { sid: "11111111-1111-1111-1111-111111111111", embedEnabled: false },
      { sid: "11111111-1111-1111-1111-111111111111", embedEnabled: true },
    ] } })],
  ])("%s fixture는 exact-set 비교 전에 fail closed 한다", (_label, fixture) => {
    const result = runAudit("page-live", [fixture]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("malformed or ambiguous published JSON");
  });

  it.each([
    ["missing", null],
    ["empty", ""],
    ["blank", "   "],
    ["empty member", "page-1,,page-2"],
    ["mixed sentinel", "none,page-1"],
    ["whitespace in id", "page one"],
    ["duplicate", "page-1, page-1 "],
  ])("%s allowlist를 DB import 전에 거절한다", (_label, expected) => {
    const result = runAudit(expected);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("invalid --expect-page-ids");
  });
});
