# Task 15 report — DB-free Chromium/WebKit browser verification

## Result

- Added Playwright 1.51.1 with Chromium/WebKit desktop and mobile projects.
- Added production-404 runtime, editor, and standalone harnesses backed only by
  the real pure renderer/editor/exporter code and in-memory fixtures/transport.
- Added 72 browser assertions across runtime, editor, conflict/revision/export,
  hostile CSS, remount, network isolation, and four exact Hero baselines.
- Added a separate secret-free `expo-browser` CI job after `verify`. It pins
  `macos-14` to match the committed Darwin screenshot platform and uploads
  browser artifacts only on failure. Playwright and its browser revision owner
  are exact-locked at 1.51.1.

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
# 72 passed (49.7s)
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
# 197 files passed; 2,515 tests passed

npx tsc --noEmit -p tsconfig.json
# passed

npx eslint playwright.config.ts tests/expo-browser/*.ts \
  src/app/dev/expo-hostile-harness/route.ts \
  src/app/dev/expo-sections-harness/page.tsx \
  src/app/dev/expo-stk-runtime-harness/route.ts \
  src/app/dev/expo-stk-editor-harness/page.tsx \
  src/app/dev/expo-standalone-harness/route.ts \
  src/embed/expo-entry.ts \
  src/embed/__tests__/expo-entry-visibility.test.ts
# passed

npm run build:embed-runtimes
# rebuilt twice with identical generated-runtime hashes

# Static production/import isolation checks across all five harness files
# production guards: 5/5
# forbidden Prisma/Supabase/auth/route-handler direct imports: 0
# database/service markers in harnesses: 0

# CI job inspection
# needs verify; macos-14; no secrets/env; Chromium + WebKit; failure-only artifact upload

git diff --check
# passed
```

The final Task 15 HEAD is the commit containing this report and can be resolved
with `git rev-parse HEAD`; its literal hash is recorded in the parent handoff
after the requested commit is created.

## Official review fix round

Review base HEAD: `a45dce5f869b3b1fbef99c18f3a593eb4d7b1284`.

1. The hostile harness now directly attacks `[data-mach-expo]`. The production
   runtime applies a narrow inline-important mount reset before the Shadow host
   mounts, preserving unrelated inline style. A jsdom regression and the real
   Chromium/WebKit test verify container display, opacity, visibility,
   transform, filter, and non-zero layout.
2. `expo-sections-harness` injects one in-memory request router for publish,
   live, whole-page export, revision history, and rollback. A catch-all browser
   network guard aborts and fails any fallback Mach API request while the test
   exercises all five routes.
3. Keyboard DnD remains covered. A separate regression uses Playwright mouse
   input on Chromium/WebKit and a Playwright CDP native touch stream on Chromium
   mobile, asserts the observed pointer type, and verifies the resulting DOM
   order. WebKit mobile additionally receives a native Playwright touchscreen
   tap before its browser-level pointer drag; no DOM event dispatch is used.
4. The editor harness records input-relative 700ms and 1400ms checkpoints plus
   the monotonic input-to-save delay. Tests prove zero saves at the early
   checkpoint, delay at least 850ms around the 900ms debounce, and exactly one
   save at settlement while the real preview updates.
5. Browser CI is pinned to `macos-14`; `@playwright/test`, `playwright`, and
   `playwright-core` resolve to exact 1.51.1 via `npm ci`, matching the committed
   Darwin baselines and browser revision.

Fix-round evidence:

```text
Hostile mount RED: actual [data-mach-expo] received hidden / opacity 0
Sections transport RED: request counter absent and fallback API path attempted
Autosave/DnD RED: timing and native-input observables absent
Focused four-project autosave: 4 passed
Final Chromium/WebKit desktop/mobile matrix: 72 passed (49.7s)
Full DB-free Vitest: 197 files, 2,515 tests passed (33.60s)
TypeScript and expanded scoped ESLint: passed
Production guards: 5/5
Forbidden harness imports and DB/service markers: 0
Browser CI secrets/env: none
Generated runtimes: deterministic and current
git diff --check: passed
```
