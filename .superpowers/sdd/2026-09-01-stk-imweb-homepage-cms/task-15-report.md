# Task 15 report — DB-free Chromium/WebKit browser verification

## Result

- Added Playwright 1.51.1 with Chromium/WebKit desktop and mobile projects.
- Added production-404 runtime, editor, and standalone harnesses backed only by
  the real pure renderer/editor/exporter code and in-memory fixtures/transport.
- Added 64 browser assertions across runtime, editor, conflict/revision/export,
  hostile CSS, remount, network isolation, and four exact Hero baselines.
- Added a separate secret-free `expo-browser` CI job after `verify`. It uses a
  Darwin runner to match the committed exact screenshot platform and uploads
  browser artifacts only on failure.

## TDD evidence

Base HEAD before Task 15:

```text
eae86de26b07bca2aedb69eeaba36b26cd1ef020
```

RED:

```bash
npx playwright test tests/expo-browser/stk-runtime.spec.ts \
  --project=chromium-desktop --reporter=line
```

The first run timed out waiting for the deliberately missing runtime harness.
After the harness existed, the brief's illustrative selectors also failed until
the specs were aligned to the real pure renderer contract (`.msx-hero-section`
and the accessible filter buttons).

Focused GREEN:

```text
runtime / chromium-desktop: 7 passed
editor + export / chromium-desktop: 9 passed
chromium desktop + mobile after final refactor: 32 passed (26.6s)
```

Final four-project GREEN:

```bash
npm run test:expo-browser -- --reporter=line
# 64 passed (44.1s)
```

This final run exercised Chromium and WebKit at 1280x800 and 390x844. Every
spec installed a catch-all request guard: synthetic CDN assets were fulfilled,
known framework-local resources were handled explicitly, and any unhandled
request was aborted and failed the test. The server used only:

```text
DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid
EXPO_SCHEMA_CAPABILITY=disabled
EXPO_PUBLIC_EMBED_RELEASE=off
```

No real database, Supabase, storage, public site, deployment, or Imweb endpoint
was accessed.

## Repository verification

```bash
DATABASE_URL=postgresql://invalid:invalid@127.0.0.1:1/invalid \
EXPO_SCHEMA_CAPABILITY=disabled EXPO_PUBLIC_EMBED_RELEASE=off \
npx vitest run --exclude '.worktrees/**' src
# 197 files passed; 2,514 tests passed

npx tsc --noEmit -p tsconfig.json
# passed

npx eslint playwright.config.ts tests/expo-browser/*.ts \
  src/app/dev/expo-hostile-harness/route.ts \
  src/app/dev/expo-sections-harness/page.tsx \
  src/app/dev/expo-stk-runtime-harness/route.ts \
  src/app/dev/expo-stk-editor-harness/page.tsx \
  src/app/dev/expo-standalone-harness/route.ts
# passed

npm run build:embed-runtimes
git diff --exit-code -- src/generated
# rebuilt; no generated drift

# Static production/import isolation checks across all five harness files
# production guards: 5/5
# forbidden Prisma/Supabase/auth/route-handler direct imports: 0
# database/service markers in harnesses: 0

# CI job inspection
# needs verify; no secrets/env; Chromium + WebKit; failure-only artifact upload

git diff --check
# passed
```

The final Task 15 HEAD is the commit containing this report and can be resolved
with `git rev-parse HEAD`; its literal hash is recorded in the parent handoff
after the requested commit is created.
