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
- Intent ordering prevents a slower earlier selection from overriding a newer selection.

### 4. Live runtime mode

- Public loader payloads explicitly select `live` mode.
- Runtime mount defaults an omitted mode to `live`; `standalone` behavior is available only when explicitly requested.
- Runtime tests prove live CTA analytics and navigation behavior versus analytics-free standalone behavior.
- Expo and standalone artifacts were regenerated from the corrected source.

### 5. Transactional render failure

- Section renderer exceptions now propagate instead of becoming an empty section.
- Candidate-shell mounting tracks completed resources and listeners, aborts them on a later render failure, and preserves the staged old shell and its listeners.
- The regression test mounts a candidate with a completed speaker plugin followed by a throwing STK section, verifies cleanup, exercises the old CTA listener, then proves a later successful swap.

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

## Verification

- `npx tsc --noEmit -p tsconfig.json` — passed.
- Scoped ESLint for every changed source and test file — passed.
- Focused server suites — 5 files, 122/122 tests passed.
- Autosave/editor suites — 54/54 plus 59/59 tests passed.
- Live/render suites — 87/87 tests passed.
- Native gesture matrix — 4/4 projects passed.
- Generated runtime build executed twice with identical outputs:
  - Expo SHA-256: `45cfe00c5afd4d944131b09a80f6396d0de3dbe230f2ad36bc57dbce646733c1`
  - Standalone SHA-256: `d812037204658d3ffb43dbdf5f7e03c65d69263e272d0a4f1da8a4d14f72b85b`
- Manifest/hash/build suites — 3 files, 131/131 tests passed.
- Full DB-free Vitest run — 198 files, 2,553/2,553 tests passed.
- Full Playwright run — Chromium/WebKit desktop/mobile, 72/72 projects passed.
- `git diff --check` — passed.

The full Vitest run used an invalid loopback `DATABASE_URL`, disabled schema capability and public embed release, and blank Supabase variables. Browser tests used the repository's invalid-loopback/public-off configuration plus request interception. Expected negative-path stderr was present; there were no unexpected test failures or external service calls.

## Review

- Manual self-review found no remaining contract or cleanup regression.
- Independent read-only review found no Critical, Important, or Minor issues and judged the changes ready after report and commit.
- Public loader, cache, runtime, export, and editor contracts from prior tasks remain intact.
