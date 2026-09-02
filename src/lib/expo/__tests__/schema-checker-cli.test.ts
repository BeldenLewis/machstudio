import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/check-expo-schema.mjs");

describe("check-expo-schema --describe", () => {
  it("DB 클라이언트 없이 V1과 revision-ready 계약을 JSON으로 설명한다", () => {
    const secretUrl = "postgresql://expo_user:do-not-print@db.example.test:5432/expo_db";
    const result = spawnSync(process.execPath, [script, "--describe"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: secretUrl },
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).not.toContain(secretUrl);

    const description = JSON.parse(result.stdout);
    expect(description.modes.v1.requiredTables).toEqual(["ExpoSite", "ExpoPage", "ExpoTemplate"]);
    expect(description.modes.v1.absentTables).toEqual(["ExpoPageRevision"]);
    expect(description.modes.ready.requiredTables).toEqual([
      "ExpoSite", "ExpoPage", "ExpoTemplate", "ExpoPageRevision",
    ]);
    expect(description.partialUniqueBaseline).toBe(10);
    expect(description.indexes).toContain("ExpoPageRevision_pageId_sequence_key");
    expect(description.foreignKeys).toContain("ExpoPageRevision_pageId_fkey");
  });
});
