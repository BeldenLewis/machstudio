import { describe, expect, it } from "vitest";
import { canAccessExpoProject, deriveExpoPermissions } from "@/lib/expo/permissions";

describe("Expo project permissions", () => {
  it.each([
    ["OWNER", null, true, true, true, true],
    ["ADMIN", null, true, true, true, true],
    ["MEMBER", "ADMIN", true, true, true, false],
    ["MEMBER", "EDITOR", true, true, false, false],
    ["MEMBER", "VIEWER", false, false, false, false],
    ["MEMBER", null, false, false, false, false],
  ] as const)("maps %s/%s", (workspaceRole, projectRole, canEdit, canPublish, canManageSite, canManageTemplates) => {
    expect(deriveExpoPermissions(workspaceRole, projectRole)).toEqual({
      canEdit,
      canPublish,
      canManageSite,
      canManageTemplates,
    });
  });

  it("hides an unassigned project from a workspace member", () => {
    expect(canAccessExpoProject("MEMBER", null)).toBe(false);
    expect(canAccessExpoProject("MEMBER", "VIEWER")).toBe(true);
  });
});
