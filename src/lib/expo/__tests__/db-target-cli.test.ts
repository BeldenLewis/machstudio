import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts/verify-expo-db-target.mjs");
const approved = {
  EXPO_APPROVED_DB_HOST: "db.example.test",
  EXPO_APPROVED_DB_NAME: "expo/db",
  EXPO_APPROVED_DB_USER: "expo/user",
};
const validUrl = "postgresql://expo%2Fuser:never-print-this@db.example.test:5432/expo%2Fdb";

function urlOnly(url: string) {
  return spawnSync(process.execPath, [script, "--url-only"], {
    cwd: process.cwd(),
    env: { ...process.env, ...approved, EXPO_SESSION_DATABASE_URL: url },
    encoding: "utf8",
  });
}

describe("verify-expo-db-target --url-only", () => {
  it("승인된 URL을 디코드해 DB 접속 없이 통과시키고 비밀값은 출력하지 않는다", () => {
    const result = urlOnly(validUrl);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("db.example.test");
    expect(result.stdout).toContain("expo/db");
    expect(result.stdout).toContain("expo/user");
    expect(result.stdout + result.stderr).not.toContain(validUrl);
    expect(result.stdout + result.stderr).not.toContain("never-print-this");
  });

  it.each([
    ["protocol", "postgres://expo%2Fuser:password@db.example.test:5432/expo%2Fdb"],
    ["host", "postgresql://expo%2Fuser:password@other.example.test:5432/expo%2Fdb"],
    ["port", "postgresql://expo%2Fuser:password@db.example.test:5433/expo%2Fdb"],
    ["database", "postgresql://expo%2Fuser:password@db.example.test:5432/other"],
    ["user", "postgresql://other:password@db.example.test:5432/expo%2Fdb"],
  ])("승인 값과 다른 %s 는 접속 전에 거절한다", (_field, url) => {
    const result = urlOnly(url);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).not.toContain(url);
    expect(result.stdout + result.stderr).not.toContain("password");
  });
});
