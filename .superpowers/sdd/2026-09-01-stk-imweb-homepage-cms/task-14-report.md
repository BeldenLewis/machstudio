# Task 14 Report — Standalone Expo HTML Export

## Status and head

- Complete; implementation commit: `6225f2dec171e05947ae2a8850269eca8ca5ebb1` (`feat: export Expo pages as standalone HTML`).
- Base verified before work: `9b32419c32317438ae37d6a4a0c808d79a4f11e5`.
- Scope stayed within Task 14. The ignored progress ledger was not edited.
- No database, network, storage, dev-server, browser, deploy, public-site, feature-flag, or Imweb mutation was used.

## Files

- Added the pure frozen builder and focused tests in `src/lib/expo/export.ts` and `src/lib/expo/__tests__/export.test.ts`.
- Added the dedicated browser entry, build script, generated runtime, source manifest/hash coverage, and generated-artifact tests in `src/embed/expo-standalone-entry.ts`, `scripts/build-expo-standalone-runtime.mjs`, `src/generated/expo-standalone-runtime.ts`, `scripts/runtime-hash.mjs`, and the three embed pipeline/runtime suites.
- Added the authenticated download route and route tests in `src/app/api/expo/pages/[pageId]/export/route.ts` and `src/app/api/expo/__tests__/export-route.test.ts`.
- Added whole-page and per-section download controls, frozen-campaign guidance, and structured issue display in `src/components/expo/ExpoPublishPanel.tsx` and its test suite.
- Added the closed standalone runtime payload type and narrowed the resolved payload section type in `src/lib/expo/types.ts` and `src/lib/expo/payload.ts`.
- Added `build:expo-standalone-runtime` to `package.json` and the aggregate runtime build. `package-lock.json` did not change because no dependency metadata changed.
- Regenerated `src/generated/expo-runtime.ts` because the shared `types.ts` source hash changed; its runtime behavior is unchanged.
- `src/lib/expo/mount.ts` was deliberately left unchanged: the dedicated entry does not reuse live mounting, preserving Task 13 staged replacement and its existing live/section semantics.

## TDD and verification

- RED: the focused command failed on the missing export service and route modules, while four new publish-panel assertions failed; the existing panel assertions remained green.
- GREEN focused final: exporter, route, panel, build pipeline, runtime hash, and manifest suites passed 182/182.
- Task 13 boundary regression set (mount/action/payload plus Task 14 suites) passed 242/242 before final full verification.
- Generated builds passed and were byte-for-byte idempotent: live Expo runtime 84.5 KB and standalone runtime 47.3 KB minified.
- Manifest-to-esbuild-input equality and generated source-hash checks passed.
- Final DB-free full suite with invalid loopback database URLs: 197 files, 2,496/2,496 tests passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- Scoped ESLint for every changed source/test/script file passed with zero findings.
- `git diff --check` and post-commit `git show --check` passed.

## Security and runtime notes

- The route derives page, site, project, published snapshot, site theme/locale, same-site internal-link targets, latest revision metadata, and export time on the server. URL-owned page authorization, project access, and `canPublish` are all enforced before export work.
- POST accepts only exact `{ scope: "page" }` or `{ scope: "section", sid }` bodies. Client snapshot, time, campaign state/override, sequence, digest, or extra fields are rejected with 400.
- The builder requires a positive canonical revision sequence and an exact full normalized snapshot digest. Missing or mismatched legacy metadata returns structured 409 `standalone-republish-required`.
- Campaign schedules and overrides are resolved once at server `exportedAt`; the artifact contains only frozen resolved campaign states, not schedule timestamps or override controls.
- Page export includes enabled sections with content regardless of live state. Section export requires an existing enabled section with content and deliberately ignores `embedEnabled`.
- Enabled `register-form` and `custom-code` sections return structured 422 `standalone-unsupported` issues.
- Selected media is inspected before lossy public normalization and must use public HTTPS URLs. Enabled Imweb modal destinations require a public HTTPS fallback and are rewritten to normal URL actions. Self-review added a route regression proving the stored snapshot reaches this pre-normalization inspection boundary.
- Runtime payload JSON uses `jsonForScript()`. Top-comment metadata uses a separate HTML-comment escaping boundary. Locale and ASCII filename tokens are allowlisted; response headers use attachment, no-store, and nosniff.
- The standalone esbuild manifest imports none of `seen.ts`, `preview-bridge.ts`, `font.ts`, `form-bridge.ts`, or `custom-code.ts`. The generated bundle contains no `fetch(`, `/api/`, `/hp/`, `reportExpoSeen`, `FontFace`, `@font-face`, preview token, `process.env`, `</script`, eval, or `new Function` path.
- Shared destination analytics code remains bundled for managed CTA rendering but is hard-gated to `mode === "live"`; the standalone context is fixed to `mode: "standalone"`, and action/mount regressions prove no `dataLayer` writes.
- CSS and runtime are inline. No font loader or font-face rule is present, so the existing system-font fallback is used. Only validated public image/video resources may load externally.

## Self-review result

- Found and fixed one normalization-boundary issue before the implementation commit: an unsafe legacy media URL or modal fallback could otherwise be discarded before the pure builder inspected it. The route now passes the stored published snapshot to the builder while using a normalized copy only to collect internal link IDs; destination serialization still uses the normalized configuration.
- Post-commit review found no remaining Critical or Important issue. Generated forbidden-literal checks, import-manifest equality, Task 13 no-network/staged-mount boundaries, and repository cleanliness all remained green.
- Existing intentional failure-path/jsdom stderr appeared in the full suite, but every assertion passed.
- Browser/dev-server verification was intentionally omitted because Task 14 prohibited it; DOM download behavior and runtime invariants are covered by jsdom/node and generated-artifact tests.
