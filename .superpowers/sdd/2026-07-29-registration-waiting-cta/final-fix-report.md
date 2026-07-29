# Final fix wave report

Date: 2026-07-29

Workspace: `/Users/lynlea/mach studio/.worktrees/codex-registration-waiting-cta`

Branch: `codex/registration-waiting-cta`
Base before wave: `a4a05014b78d9a358829b7649a5e94a17b0c49c9`

## Commits

- Implementation and regression coverage: `e3362081d1c1fc0165146355707997d8b2637261`
- This report is committed separately after the implementation commit so it can record the implementation hash exactly.

## Files

### Production

- `src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx`
  - Admin completion preview now matches the public valid/fallback action hierarchy.
- `src/app/webinar/[slug]/ViewerModal.tsx`
  - Added initial focus, Tab/Shift+Tab containment, Escape close, listener cleanup, body scroll locking/restoration, and connected-opener restoration.
- `src/app/webinar/[slug]/live/page.tsx`
  - Uses the status-refresh helper for every waiting-count transition.
  - Preserves the native registration opener across the form/completion handoff and passes it to `ViewerModal`.
- `src/app/webinar/[slug]/status-refresh.ts`
  - Added the single status response boundary used by `fetchStatus`; unsuccessful/non-contract responses always produce `waitingCount: null`.
- `src/components/webinar/choice-fields.tsx`
  - Native multiple-choice rows retain a 44px target while aligning the 18px checkbox to the first 20px text line.
- `src/lib/webinar-exposure.ts`
  - Records `waiting.followUp` on both waiting and entry.
  - Explains that the social band requires a runtime waiting count of at least two.
- `src/lib/webinar-loader-script.ts`
  - Embed multiple-choice rows use the same first-line alignment and 44px target contract.
  - Inline form completion establishes the connected form card as a programmatic restore target while preserving the existing form-modal opener path.

### Tests

- `src/app/(app)/webinar/[slug]/__tests__/registration-completion-preview.test.tsx`
- `src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx`
- `src/app/webinar/[slug]/__tests__/status-refresh.test.ts`
- `src/app/webinar/[slug]/__tests__/viewer-modal.test.tsx`
- `src/components/webinar/__tests__/choice-fields-layout.test.tsx`
- `src/lib/__tests__/webinar-exposure.test.ts`
- `src/lib/__tests__/webinar-loader-cta.test.ts`
- `src/lib/__tests__/webinar-public-cta.test.ts`

## TDD evidence

### RED

1. Status refresh:

   ```bash
   npx vitest run 'src/app/webinar/[slug]/__tests__/status-refresh.test.ts'
   ```

   Failed because the production status-refresh boundary did not exist. This represented the missing state transition for non-OK, malformed, and thrown refreshes.

2. Dialog, preview, alignment, embed focus, and exposure batch:

   ```bash
   npx vitest run \
     'src/app/webinar/[slug]/__tests__/viewer-modal.test.tsx' \
     src/components/webinar/__tests__/choice-fields-layout.test.tsx \
     'src/app/(app)/webinar/[slug]/__tests__/registration-completion-preview.test.tsx' \
     src/lib/__tests__/webinar-exposure.test.ts \
     src/lib/__tests__/webinar-loader-cta.test.ts \
     src/lib/__tests__/webinar-public-cta.test.ts \
     'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx'
   ```

   Result: 11 expected behavior failures. They covered absent dialog focus/scroll ownership, `items-center` wrapped rows, quiet-only preview fallback, missing exposure explanation/surface, and missing inline embed restoration. The malformed-config and positive social renderer coverage passed immediately because those production behaviors were already safe/correct; these were deferred coverage additions rather than behavior changes.

### GREEN

1. Required final-review suite:

   ```bash
   npx vitest run \
     src/lib/__tests__/webinar-public-cta.test.ts \
     src/lib/__tests__/webinar-loader-cta.test.ts \
     src/lib/__tests__/webinar-exposure.test.ts \
     'src/app/(app)/webinar/[slug]/__tests__/registration-completion-preview.test.tsx' \
     'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx'
   ```

   Result: 5 files, 72 tests passed.

2. New focused suites:

   ```bash
   npx vitest run \
     'src/app/webinar/[slug]/__tests__/status-refresh.test.ts' \
     'src/app/webinar/[slug]/__tests__/viewer-modal.test.tsx' \
     src/components/webinar/__tests__/choice-fields-layout.test.tsx
   ```

   Result: 3 files, 4 tests passed.

3. Final full suite:

   ```bash
   npx vitest run
   ```

   Result: 32 files, 325 tests passed.

4. TypeScript:

   ```bash
   npx tsc --noEmit
   ```

   Result: passed with no diagnostics.

5. Scoped lint:

   ```bash
   npx eslint \
     'src/app/webinar/[slug]/ViewerModal.tsx' \
     'src/app/webinar/[slug]/status-refresh.ts' \
     'src/components/webinar/choice-fields.tsx' \
     src/lib/webinar-exposure.ts \
     src/lib/webinar-loader-script.ts \
     'src/app/webinar/[slug]/__tests__/viewer-modal.test.tsx' \
     'src/app/webinar/[slug]/__tests__/status-refresh.test.ts' \
     src/components/webinar/__tests__/choice-fields-layout.test.tsx \
     'src/app/(app)/webinar/[slug]/__tests__/registration-completion-preview.test.tsx' \
     'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx' \
     src/lib/__tests__/webinar-public-cta.test.ts \
     src/lib/__tests__/webinar-exposure.test.ts \
     src/lib/__tests__/webinar-loader-cta.test.ts
   ```

   Result: 0 errors; one pre-existing `src/lib/webinar-exposure.ts:203` unused-variable warning.

   A full-file lint attempt also confirmed the documented pre-existing React hook/ref debt in `RegistrationFormTab.tsx` and `live/page.tsx`. The two findings introduced during this wave were removed; the unrelated legacy findings were not broadened into this fix.

6. Whitespace:

   ```bash
   git diff --check
   ```

   Result: passed.

## Self-review

- Waiting count:
  - A successful numeric count remains unchanged.
  - Non-OK, malformed/missing `waitingCount`, JSON/fetch rejection, and non-object payloads all produce `null`.
  - The existing 30-second poll and five-minute server counting contract were not changed.
  - Status/live view transitions still run from valid object payloads independently of whether `waitingCount` is valid.
- Dialog parity:
  - Shared native consumers retain overlay-pointer close.
  - Focus starts inside, wraps in both directions, Escape closes only when closable, scroll state is restored exactly, and document listeners are removed.
  - Explicit connected opener restoration is covered with the same state handoff used by the native registration page; disconnected/missing targets are guarded.
- Public completion parity:
  - Native/embed remain valid CTA + quiet close, otherwise one primary `확인`.
  - Admin preview now follows the same two branches and returns to form mode from the fallback action.
  - Server sanitization and client/runtime `http(s)` defense remain unchanged.
- Multiple choice:
  - Native and embed use 12px vertical row padding, 20px first-line height, 18px control, and 1px control offset; a single-line row is 44px and wrapped rows grow from there.
- Embed restoration:
  - Form-modal completion still restores the original external opener.
  - Inline completion restores its connected card after button, overlay, or Escape close.
- Waiting independence/defaults:
  - Positive `social: true` + count `2` rendering is now deterministic.
  - `waiting.followUp` is audited on waiting and entry without coupling it to the social band.
  - Existing public defaults remain unchanged.
  - Malformed nested CTA/follow-up values resolve to disabled/empty defaults.
- Scope:
  - No dependency, migration, landing, package, or generated file changed.

## Remaining concerns

- Pre-existing full-file React hook/ref lint debt remains in `RegistrationFormTab.tsx` and `live/page.tsx`, as explicitly deferred.
- Vitest prints the existing Vite CJS API deprecation warning.
- `src/lib/webinar-exposure.ts:203` retains its pre-existing unused-variable lint warning.
