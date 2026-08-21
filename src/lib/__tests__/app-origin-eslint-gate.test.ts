import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("(app) 공개 origin lint gate", () => {
  it("전체 앱 트리에 억제되지 않은 window.location.origin 사용이 없다", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(["src/app/(app)/**/*.{ts,tsx}"]);
    const violations = results.flatMap((result) =>
      result.messages.filter((message) => message.ruleId === "no-restricted-syntax"),
    );

    expect(violations).toEqual([]);
  }, 30_000);
});
