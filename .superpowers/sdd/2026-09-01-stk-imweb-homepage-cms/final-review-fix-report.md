# Final integrated review fixes report

## Scope

- Base commit: `a2eef8714f49b778162fd41ec896c5b10d663dbd`
- Final commit: the commit containing this report (`git rev-parse HEAD`)
- Constraint: one writer, test-first changes, no real database, network, storage, service, deployment, feature-flag, or Imweb access.

## Completed fixes

### 1. Atomic draft compare-and-swap

- Replaced the read-then-write draft revision check with a single conditional `updateManyAndReturn` mutation.
- The mutation requires the expected draft revision, an undeleted page, and an undeleted parent site, and increments the revision in the database.
- A deterministic two-request barrier test proves that two requests with the same expected revision produce one `200`, one `409`, and one stored revision increment.

### 2. Active parent-site scope and deletion races

- Audited every child Expo page endpoint and service: page read/update/delete, live, publish, export, revisions, rollback, and the public loader.
- All child lookups now require both an active page and active parent site.
- Publish and rollback pass the owning site into the revision transaction.
- Revision locking now joins and locks both page and site, rechecks their deletion state inside the transaction, and returns `404` when deletion wins the race.
- Route and service tests cover known child pages beneath deleted parent sites and deletion between the preflight read and transaction lock.

### 3. Autosave-aware navigation and deletion

- `flush()` now returns a meaningful result describing clean, saved, disabled, validation, conflict, and request-failure outcomes.
- Page selection, page creation, and selected-page deletion wait for a successful flush before changing the visible page.
- Validation (`422`), conflict (`409`), and transport (`503`) failures keep the current page and visible edits in place while retaining inline feedback.
- Every navigation-producing action now owns an intent from its start. Selection, creation, and deletion fallback recheck it after flush and after their asynchronous POST/DELETE boundary.
- A stale create waiting on flush sends no POST; a create whose POST already succeeded remains in the refreshed page list but cannot override a newer selection. Creation no longer calls selection and therefore does not flush twice.
- Selected-page deletion carries its original intent through the undo window and DELETE response, so its fallback cannot override a newer page choice.

### 4. Live runtime mode

- Public loader payloads explicitly select `live` mode.
- Runtime mount defaults an omitted mode to `live`; `standalone` behavior is available only when explicitly requested.
- Runtime tests prove live CTA analytics and navigation behavior versus analytics-free standalone behavior.
- Expo and standalone artifacts were regenerated from the corrected source.

### 5. Transactional render failure

- Section renderer exceptions now propagate instead of becoming an empty section.
- Candidate-shell mounting tracks completed resources and listeners, aborts them on a later render failure, and preserves the staged old shell and its listeners.
- The regression test mounts a candidate with a completed speaker plugin followed by a throwing STK section, verifies cleanup, exercises the old CTA listener, then proves a later successful swap.
- A shared idempotent renderer lifecycle now guards every resourceful STK renderer (`campaign-hero`, `exhibition-grid`, `audience-links`, `speaker-carousel`, and `cta-band`) while it is still under construction.
- Hero registers its typing timer with that lifecycle immediately after creation. A later shell failure clears the timer, aborts its listener controller exactly once, disposes the candidate, and leaves the old shell and CTA listener active.

### 6. Native gesture coverage

- Carousel gesture tests now use native Playwright pointer/touch input rather than DOM event dispatch or evaluated synthetic gestures.
- Chromium mobile uses CDP touch input; supported browser projects use native Playwright mouse input.
- Native dragging exposed browser image-drag takeover, fixed by preventing `dragstart` in the carousel listener lifecycle.
- Desktop/mobile Chromium/WebKit gesture coverage and the complete browser matrix pass.

## Test-first evidence

- Server RED: 14 focused failures exposed non-atomic CAS and missing active-parent checks; GREEN: 122/122.
- Editor RED: 5 focused failures exposed ungated selection/deletion; GREEN: 54/54 editor tests and 59/59 hook/tree tests.
- Runtime RED: 4 focused failures exposed implicit standalone mode and swallowed render exceptions; GREEN: 87/87.
- Gesture RED: Chromium desktop native dragging failed before `dragstart` handling; GREEN: 4/4 focused gesture projects and 72/72 full browser projects.
- Re-review navigation RED: stale create sent one POST and create/deletion paths flushed three times, allowing old navigation to win; GREEN: three deterministic intent tests pass with two action flushes and one newest selection.
- Re-review lifecycle RED: Hero partial failure produced only the candidate-shell abort and all five resourceful renderers produced zero local aborts; GREEN: Hero timer/listener cleanup and five construction guards pass exactly once.

## Verification

- `npx tsc --noEmit -p tsconfig.json` — passed.
- Scoped ESLint for every changed source and test file — passed.
- Focused server suites — 5 files, 122/122 tests passed.
- Autosave/editor suites — 54/54 plus 59/59 tests passed.
- Live/render suites — 87/87 tests passed.
- Re-review focused suites — 3 files, 54/54 tests passed; broader affected suites — 7 files, 167/167 tests passed.
- Native gesture matrix — 4/4 projects passed.
- Generated runtime build executed twice with identical outputs:
  - Expo SHA-256: `b07f75270139ae261e1674786ca9172fe51d31152729c1f7c591c8293808821a`
  - Standalone SHA-256: `202b02e37d2f7709d8b8f77e62c9625659ca2388df2801cbe16780c4bb0be59a`
- Manifest/hash/build suites — 4 files, 144/144 tests passed.
- Full DB-free Vitest run — 199 files, 2,563/2,563 tests passed.
- Full Playwright run — Chromium/WebKit desktop/mobile, 72/72 projects passed.
- `git diff --check` — passed.

The full Vitest run used an invalid loopback `DATABASE_URL`, disabled schema capability and public embed release, and blank Supabase variables. Browser tests used the repository's invalid-loopback/public-off configuration plus request interception. Expected negative-path stderr was present; there were no unexpected test failures or external service calls.

## Review

- The final integrated re-review found two Important gaps: incomplete navigation intent coverage and resources created inside a throwing renderer. Both are covered by the follow-up RED/GREEN regressions above.
- Manual React and lifecycle self-review additionally invalidated pending intents on site change/unmount and made renderer cleanup idempotent.
- Independent scoped re-review found no remaining Critical, Important, or Minor issue and judged both findings addressed and ready.
- Public loader, cache, runtime, export, and editor contracts from prior tasks remain intact.
