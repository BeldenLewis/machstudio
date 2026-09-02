# Task 8 report — safe Expo media derivatives and crop

## Status

Complete.

- Feature commit: `a5d849362eaca82ebcc070aaa21b300a4a65e684` (`feat: add safe Expo media derivatives and crop`)
- Fix round 1 commit: `fix: close Expo retained-media validation gaps` (this commit)
- Base: `4e28c680de3bc2eaa5990c9c24fa51f67827c481`
- Scope: Task 8 only; 37 files including this report.

## Changed files

- Added the private quarantine bucket verifier/provisioning helper, target-only CLI check, upload-session/finalize services, and JSON routes.
- Added Expo-only raster/SVG/MP4 inspection and Sharp derivative processing.
- Preserved the W1 multipart route's 4MiB transport while moving new STK fields to session → signed upload → finalize.
- Extended owned media copying/normalization for `url`, `originalUrl`, PNG/SVG/MP4, and the validated SVG-original public-bucket ceiling.
- Added accessible media upload, external HTTPS, alt/decorative, Hero video-rights, and image-crop controls with the shared crop formula.
- Updated affected tests and regenerated `src/generated/expo-runtime.ts`.

## RED and GREEN evidence

- Initial required-suite RED: 9 files failed / 1 passed; 4 failed assertions and 6 missing suites, with 49 passing of 53 collected tests. Missing guards, routes, and UI plus the old limits/extensions caused the expected failures.
- Additional RED regressions covered legacy `originalUrl` copying, W1 multipart transport, common multipart origin guarding, canonical media retention, SVG public allowlisting, invalid UTF-8 SVG, and cleanup of an owned quarantine object with an invalid declared type.
- Every RED was followed by a focused GREEN before broader verification.
- Final required focused suite: 10 files / 108 tests passed.
- Final affected runtime/hash boundary: 5 files / 126 tests passed after `npm run build:expo-runtime`.
- Final DB-free full suite: 186 files / 2,320 tests passed.
- Typecheck: `npx tsc --noEmit -p tsconfig.json` passed.
- Focused ESLint for all changed TypeScript/TSX/tests/scripts passed; the final cleanup change and regression also passed ESLint.
- `git diff --check` passed; `src/lib/image-downscale.ts` has no diff.

## Fix round 1 — Important findings

- Exact RED: 5 files ran with 7 failures / 50 passes. The failures proved that `xml:base`, `animate`, and `set` bypassed SVG reference checks; a 12-byte `ftyp` passed; target-only CLI execution imported Supabase; the finalize route skipped target-verified public-bucket preparation; and the public bucket had no exact reread verifier.
- Cleanup-order RED: 2 files ran with 3 failures / 23 passes. This fixed public-bucket preparation inside the finalizer so a settings failure still reaches quarantine `finally` cleanup and preparation occurs after byte validation but before the first public upload.
- SVG now rejects `xml:base` plus SMIL URI-changing elements (`animate`, `animateColor`, `animateMotion`, `animateTransform`, `set`, and `discard`), including the supplied fragment-plus-external regression.
- The target-verified admin returned by quarantine setup is used to create/update/reread exact public `webinar-assets` settings, including the SVG MIME ceiling, before either public original or derivative upload. A preparation failure creates no public object and still removes owned quarantine.
- MP4 now requires at least the full 16-byte ordinary `ftyp` layout, a printable four-byte major brand, and a compatible-brand area aligned to four bytes. Extended-size `ftyp` is explicitly rejected.
- `--check-target` returns before dynamically importing `@supabase/supabase-js`. Its regression installs an import-blocking loader and throwing `fetch`, proving both no client import and no network attempt.
- Fix round 1 final required media/route/UI suite: 10 files / 116 tests passed.
- Fix round 1 runtime/hash boundary: 5 files / 126 tests passed after regenerating with no generated diff.
- Fix round 1 DB-free full suite: 186 files / 2,328 tests passed.
- Fix round 1 typecheck and focused ESLint passed; final diff checks passed.

## Dependency

- Installed only exact `@xmldom/xmldom@0.9.12`; both package files pin `0.9.12` without a range.
- No audit fix or unrelated dependency upgrade was run.

## Storage, target, validation, and cleanup self-review

- `expo-quarantine` is private, capped at 50MiB, and limited to exact JPEG/PNG/WebP/SVG/MP4 MIME values. Session keys are random and exact `${workspaceId}/expo-quarantine/${siteId}/${userId}/...` children with `upsert:false` signed uploads.
- URL project ref, independently approved ref, and canonical DB ref (or matching signed change record) fail closed before the admin client is constructed. Only the offline/no-network `--check-target` path was exercised; neither online `--check` nor `--apply` was run. Secrets, URLs, and passwords are not logged.
- Finalize rechecks site/project/user authorization, exact path ownership and type, server metadata/MIME/size before download, exact downloaded length, then magic/structure/pixel limits before creating public objects.
- Keys reject empty, leading/trailing, dot, dot-dot, backslash, control-character, nested-file, and sibling-prefix confusion. Client MIME, size, and path are never sufficient for acceptance.
- Expo Sharp rules are exactly 12MiB source, 1.5MiB derivative, 1,400px edge, and 50MP. Raster originals retain detected extensions; transparent PNG stays PNG and other supported rasters derive WebP.
- SVG uses the pinned XML parser and rejects malformed/invalid UTF-8, DOCTYPE, processing instructions, executable/foreign elements, event attributes, non-fragment references, dangerous CSS, CSS escapes, and external `url()`. A validated SVG original is retained and only its PNG derivative is rendered.
- MP4 requires exact `video/mp4`, a structurally valid first `ftyp` box, and at most 50MiB, then creates one immutable object with `url === originalUrl`.
- Owned quarantine is removed in `finally`, including invalid declared-type failures. Foreign paths are untouched. A derivative failure removes only public paths successfully created by that request. Session creation best-effort cleans that user's objects older than 24 hours.
- Media copying handles both canonical URLs and PNG/SVG/MP4 while retaining exact source/destination prefix safety.

## UI self-review

- New fields use session → direct signed upload → finalize, expose stage status/retry, and read the latest `value`/`onChange` when a long upload completes.
- External media accepts only credential-free safe HTTPS. New uploaded or external video starts at `rightsStatus:"unconfirmed"`; the adjacent Hero control is the only rights confirmation control.
- Image mode exposes labelled alt and explicit decorative controls. Empty alt without decorative remains a publish-blocking schema issue and is shown inline.
- Crop has labelled keyboard-operable fit/x/y/scale controls, Reset, and an adjacent preview using the shared object-position/scale/transform-origin formula.
- UI behavior was verified with jsdom tests. No development server or browser preview was started because Task 8 explicitly prohibited starting the dev server.

## Concerns

- `npm install` reported the repository's existing audit findings (62 total); they were intentionally not changed under the exact-dependency constraint.
- Vitest prints the existing Vite CJS deprecation and intentional failure-path/jsdom stderr. They did not cause failures.
- No Supabase/DB connection, bucket provisioning, asset upload, migration, development server, deployment, feature-flag change, or Imweb action was performed.
