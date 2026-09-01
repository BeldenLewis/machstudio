# Task 14 Report — Standalone Expo HTML Export

## Status and head

- Complete; original implementation commit: `6225f2dec171e05947ae2a8850269eca8ca5ebb1` (`feat: export Expo pages as standalone HTML`).
- Official-review fixes commit: `379bbb33dbaedaaf2f0084131a66aad0442b19e6` (`fix: harden standalone Expo export review gaps`).
- Base verified before work: `9b32419c32317438ae37d6a4a0c808d79a4f11e5`.
- Scope stayed within Task 14. The ignored progress ledger was not edited.
- No database, network, storage, dev-server, browser, deploy, public-site, feature-flag, or Imweb mutation was used.

## Files and review fixes

- `src/lib/expo/export.ts` now validates media against the first raw section that actually survives normalization, including duplicate SID, discarded legacy row, singleton, section-limit, and original-index semantics.
- `src/lib/expo/types.ts` and `src/embed/expo-standalone-entry.ts` freeze campaigns as an `id -> active boolean` record; no campaign label, schedule, or override is serialized.
- The page GET route returns server-derived `exportSections` from the current published snapshot. It ignores draft divergence and `embedEnabled`, while excluding disabled, empty, and unsupported standalone section types.
- `ExpoPublishPanel` uses only that authoritative published list for section downloads and retains complete structured `path`/`sid`/severity data.
- `PageDraftWorkspace`, `SectionEditor`, and `SlotField` merge export issues into editor issues, select the affected SID, focus the matching custom-editor marker or actual generic-slot input, and keep all visible page/section scope errors synchronized.
- `use-page-draft.ts` refreshes `exportSections` after publish/rollback metadata refresh without replacing the local draft.
- Focused regressions cover first-vs-last duplicate SIDs, discarded-first duplicates, original section indexes, boolean-only campaign payloads, published-vs-draft section buttons, multi-scope issue retention, and actual field focus.
- `src/generated/expo-runtime.ts` and `src/generated/expo-standalone-runtime.ts` were regenerated through the aggregate runtime pipeline because the shared runtime type/hash boundary changed.
- `src/lib/expo/mount.ts` remains byte-for-byte unchanged from the pre-fix HEAD, preserving Task 13 staged replacement and no-network runtime boundaries.

## TDD and verification

- Official findings RED: 7 focused failures reproduced the duplicate-SID bypass, filtered-index mismatch, campaign over-serialization, missing published metadata, wrong section buttons, and missing field focus.
- Independent fix review then found 3 additional Important edge cases; exact RED tests reproduced all three before implementation.
- Final focused official/additional regression set: 117/117 passed.
- Final Task 13 + Task 14 + generated hash/manifest boundary set: 13 files, 390/390 passed, including mount 36/36.
- Final DB-free full suite with an invalid loopback database URL: 197 files, 2,504/2,504 passed.
- `npx tsc --noEmit -p tsconfig.json` passed.
- Scoped ESLint for every changed source/test file passed with zero warnings or errors.
- Aggregate generated builds completed; live Expo runtime is 84.5 KB and standalone runtime is 47.3 KB minified.
- Runtime source hash, esbuild manifest equality, build-pipeline, and generated-artifact tests passed 131/131.
- A second aggregate generation produced identical SHA-256 files: live `679017b60763e6deeaa7ff9efbee36f7a597340b63935815e72e6c6f3b79e449`, standalone `9c7d128d72482802721afaecd2576bb892797d343846cbedbee510e1a8aa0aa3`.
- `git diff --check`, unchanged-mount check, and implementation `git show --check` passed.

## Security and runtime notes

- Export authorization still derives the URL-owned page/site/project and requires project access plus `canPublish`; EDITOR/VIEWER cannot use the route.
- POST accepts only exact `{ scope: "page" }` or `{ scope: "section", sid }`. It never accepts client snapshots, time, sequence, digest, campaign overrides, or extra fields.
- The builder requires a positive canonical revision sequence and exact full normalized snapshot digest; legacy or mismatched metadata returns structured 409 `standalone-republish-required`.
- Media inspection follows normalization's actual first-surviving source row while retaining its raw content and original `sections[n]` path. Public HTTPS remains mandatory, including original video/image URLs.
- Enabled Imweb modal destinations require a public HTTPS fallback and are rewritten to ordinary URL actions. `register-form` and `custom-code` remain unsupported.
- Runtime payload JSON uses `jsonForScript()`; top-comment metadata uses a separate HTML-comment escape boundary. Filename/header tokens remain ASCII allowlisted.
- Campaign state is resolved once at server export time and serialized only as booleans. The runtime reconstructs the minimal internal map locally.
- The dedicated standalone entry still imports no seen beacon, preview bridge, remote-font loader, form bridge, or custom-code module. It contains no Mach fetch/API path, and `mode: "standalone"` suppresses shared `dataLayer` writes.
- Published section metadata exposes only SID and registry label, not published content. The UI never derives recovery downloads from draft snippets or draft `embedEnabled` state.

## Self-review result

- All 5 official findings were fixed with exact regressions. Independent post-fix review found 3 further Important edge cases; all were fixed and reverified.
- React review confirmed unconditional hooks, closed server-response parsing, focusable structured errors, and no new client data-fetch path.
- No remaining Critical or Important issue was found after the follow-up self-review.
- Existing intentional failure-path/jsdom stderr appeared in the full suite, but every assertion passed.
- Browser/dev-server verification was intentionally omitted because Task 14 prohibited it; DOM download/focus behavior and runtime invariants are covered by jsdom/node and generated-artifact tests.
