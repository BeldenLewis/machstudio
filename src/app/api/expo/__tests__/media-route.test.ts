// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy Expo media route transport", () => {
  it("keeps the W1 multipart route instead of proxying new signed-session bodies through it", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/api/expo/[siteId]/media/route.ts"), "utf8");
    expect(source).toContain("request.formData()");
    expect(source).toContain('form?.get("file")');
    expect(source).toContain("EXPO_LEGACY_MULTIPART_BYTES = 4 * 1024 * 1024");
    expect(source).toContain("processExpoRaster");
    expect(source).toContain('guardExpoRoute(request, { write: true, contentTypes: ["multipart/form-data"] })');
    expect(source).toContain("deriveExpoPermissions(workspaceRole, projectRole).canEdit");
    expect(source).not.toContain("media/session");
  });
});
