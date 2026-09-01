# Task 13 Report — Dynamic Delivery and Connection Status

## Status

- Complete; commit title: `feat: harden Expo dynamic delivery and connection status`.
- Base verified before work: `9ebb52bf44c785a23572c473c3fcc641a6b9331c`.
- Scope was limited to Task 13. No plan, spec, or ledger file was edited.
- No database, network, storage, dev-server, browser, deploy, feature-flag, or Imweb operation was used.

## Files

- Hardened live/preview delivery in `src/app/h/[pageId]/loader.ts` and `src/app/hp/[token]/route.ts`, with regressions in both route suites.
- Added `src/lib/expo/connection-status.ts` and its focused tests.
- Added atomic candidate staging across `src/lib/expo/shadow.ts`, `src/lib/expo/mount.ts`, `src/lib/expo/view-page.ts`, and `src/embed/expo-entry.ts`, with shell/mount regressions. Shared form reservations now use ownership-aware leases in the target registry/form bridge.
- Returned seen metadata from the page GET and passed it through `PageDraftWorkspace` to `ExpoPublishPanel`; extended the API and panel tests.
- Regenerated `src/generated/expo-runtime.ts` and the affected shared `src/generated/form-runtime.ts`; Expo runtime source hash is `sha256:a4c6f914b78881727773ecf9bd0ae307`.

## TDD evidence

- RED: seven intended assertions failed and the new connection-status suite could not load because its module did not exist. Failures exposed the 86400-second SWR, missing stage API, destructive renderer failure, missing connection diagnostics, and schedule strings in the boot payload.
- GREEN focused command from the brief: 6 files, 164/164 tests passed.
- Final focused plus API/runtime/form-reservation boundary verification: 13 files, 375/375 tests passed.
- Runtime builds passed: Expo is 84.2 KB and the affected shared form runtime is 74.6 KB minified.
- TypeScript: `npx tsc --noEmit -p tsconfig.json` passed.
- Changed-file ESLint passed with zero findings. The repository-wide lint command still reports the pre-existing unrelated baseline of 173 findings (127 errors, 46 warnings).
- Runtime leakage checks passed: embed manifest/build/load tests passed and the generated runtime contains none of the checked React runtime markers (`react-dom`, `jsx-runtime`, React internals, or `createRoot(`).
- DB-free full suite was run once: 195 files, 2,455/2,455 tests passed.
- `git diff --check` passed.

## Self-review

- Cache/headers: every live 200/304 response uses exactly `Cache-Control: public, max-age=0, must-revalidate` and `CDN-Cache-Control: public, s-maxage=30, stale-while-revalidate=30`, merged with the existing content type, CORS allow-origin/methods, nosniff, and noindex headers. The previous 86400-second SWR is gone. `/hp/` remains `force-dynamic`, `private, no-store`, and `noindex, nofollow`.
- Payload/ETag: live resolution uses server time and never consumes preview `campaignState`. ETags hash the generated runtime source hash plus the canonical resolved boot payload, so an active campaign boundary changes the validator without a publish mutation. Schedule and override fields are absent from both live and preview boot payloads and from the generated runtime.
- Source references: both live and preview collect only selected references, query the exact owning project with `deletedAt: null` and `mode: "builder"`, and fail closed to an empty allowed set. Any unverified cross-project/deleted/non-builder ref is blanked before payload construction. Page settings and the existing whole-page/selected-`sid` gates remain intact.
- Staging: a candidate is built detached, then connected in an inert, hidden, offscreen staged state for attach/ready. The old shell remains visible, registered, and active until those lifecycle steps succeed. Render, attach, or ready failures dispose only the candidate; success reveals/registers the candidate and destroys the old shell exactly once in the same synchronous commit. Abort affects only uncommitted candidates. Register-form tests prove attach sees a connected root.
- Entry lifecycle: a failed new mount leaves the old observer/timer handle in place; the previous handle is destroyed only after the new shell commit succeeds.
- Connection: status uses the required priority, parsed lowercase hostnames, and the inclusive ten-minute boundary. Page GET includes `lastSeenAt` and `lastSeenOrigin`.
- Warnings: `pageWarnings()` combines the four-state connection diagnostic with the timestamp-based draft-ahead note. The publish panel displays these as UI-only notes; they are never passed to publish validation and never disable publish.

## Concerns

- Repository-wide lint is not green because of the unrelated existing 173-finding baseline; every Task 13 changed source/test file is lint-clean.
- The full suite emits existing intentional failure-path/jsdom stderr, but all 2,455 assertions pass.
- Browser/dev-server verification was intentionally not run because Task 13 prohibited it; connected staging and UI behavior are covered with jsdom/runtime boundary tests.

## Review fix

- Independent read-only review found one Important same-source inline-form reservation race and no Critical issues.
- RED round 1: two new mount regressions failed because a successful replacement lost the candidate reservation and an attach failure did not restore the old reservation.
- GREEN round 1: form registry/bridge/mount suites passed 57/57 after adding ownership-aware leases. A lease only releases its own current record and restores a still-connected previous record on staged failure.
- Re-review found that the already-booted old form runtime could still unconditionally unregister the successor. RED round 2 reproduced that path with the old runtime booted; 1/12 failed.
- GREEN round 2: target cleanup now deletes only the exact record it owns; form target/registry/bridge/mount suites passed 69/69.
- Final independent read-only re-review confirms the prior Important issue is fully addressed and found no new Critical or Important issue.
- The final affected focused/runtime boundary set passed 375/375. The DB-free full suite was not repeated after this review fix, preserving the requested single full-suite run.
