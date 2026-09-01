# Task 2 implementation report

- Status: complete
- Commit: `feat: scope Expo publishing to project roles` (created with this report)

## Changed files

- `src/lib/expo/auth.ts`, `permissions.ts`, `route-guard.ts`
- `src/lib/expo/__tests__/auth.test.ts`, `permissions.test.ts`
- Expo API project/site/page/media/publish/live/template routes and focused route tests
- `src/app/(app)/homepage/[siteId]/page.tsx`

## RED evidence

Before implementation, the focused suite failed 5 tests: `canAccessExpoProject` was absent; MEMBER project ADMIN/EDITOR/VIEWER/unassigned permission cases disagreed with the old workspace-only implementation.

## GREEN evidence

- Focused authorization suite: 4 files, 98/98 tests passed.
- `npx tsc --noEmit -p tsconfig.json`: passed.
- DB-free full suite with `DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid`: 164 files, 2165/2165 tests passed.
- `git diff --check`: passed.

## Self-review

- Project roles are loaded alongside workspace roles and restricted to projects in caller workspaces.
- Site/page access derives project identity from URL-loaded `ExpoSite` / `ExpoPage.site`; unassigned MEMBERS receive 404 and site lists filter inaccessible projects.
- EDITOR can edit/publish; project ADMIN can also manage sites; workspace OWNER/ADMIN retain full access; templates retain workspace-admin-only rename/delete.
- Template save rechecks its source site project; instantiate rechecks the resolved destination project and never trusts a supplied workspace id.

## Concerns

None. Full-suite stderr consists of existing intentional failure-path assertions and does not fail tests.
