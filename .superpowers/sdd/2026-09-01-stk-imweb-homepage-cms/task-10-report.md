# Task 10 report — cloneable STK preset and deterministic importer

## Status

Complete.

- Commit: `feat: add the STK homepage preset` (this report is included in that commit).
- Base: `c906304af40fc9e1f5e268739c1733e6e1053865`.
- Scope: Task 10 only; 16 files including this report.
- No plan, spec, ledger, source attachment, generated runtime, or unrelated file was edited.

## Delivered files and integration

- Added the immutable built-in preset in `src/lib/expo/presets/stk-home-v1.json`, its typed clone boundary, and the preset registry.
- Added the DB/network-free `scripts/import-stk-home-v1.mjs` auditor/materializer.
- Integrated the built-in entry into template listing, create UI, and authenticated instantiate behavior.
- Reserved built-in ids cannot be renamed or deleted, including if a forged DB row uses the reserved id.
- Added preset/importer, template, service, route, and UI regressions. Existing custom-template authorization and media-copy behavior remain covered.

## RED and GREEN evidence

- Initial RED: the preset/importer did not exist; the required focused run had six assertion failures plus a module-load failure.
- Materialization RED: complete-map output initially failed until the deterministic operational merge was implemented.
- Independent-review RED: two regressions proved credential-bearing public URLs were accepted and mutated semantic inventories were not audited against the canonical ids.
- Review fixes reject unsafe public hosts/credentials and pin every semantic inventory; the related two regressions are GREEN. A test-order dependency in the member template-list assertion was also removed.
- Final focused suites: 5 files / 94 tests passed.
- Final DB-free full suite after review fixes: 189 files / 2,387 tests passed.
- `npx tsc --noEmit -p tsconfig.json`, focused ESLint, and `git diff --check` passed.
- Repository-wide `npm run lint` reproduced the existing baseline of 127 errors / 46 warnings; no Task 10 file appears in that output.
- Runtime source manifests were not affected, so no generated runtime rebuild was required. The DB-free full suite still passed the existing runtime manifest/load/boundary tests.

## Exact committed inventory

- Section order is exactly: `campaign-hero`, `exhibition-grid`, `audience-links`, `speaker-carousel`, `sponsor-marquee`, `cta-band`.
- Exhibition order is exactly: AI & Data Center Show; Robot Tech & Physical AI Show; AI Factory Show; Secu Tech Show; Retail & Logis Tech Show; Smart Tech Show.
- Audience links: 8 total, split 4 exhibitor and 4 visitor items.
- Speakers: 28 total — Robotics 9, AI 11, Autonomous Manufacturing 8. Category ids/badge/gradient tokens are exactly `robotics`, `ai`, and `autonomous-manufacturing`; speaker design background is `dark`.
- Sponsor groups: 4 — `nation-of-honor`, `sponsors`, `supporters`, `official-ai-translation-partner`; the shared sponsor row list is empty because no identities or logos are verified.
- Final CTA count: 2.
- JSON shape is exactly `{ config, sourceNotes }`; instantiation exposes only normalized `config`.
- The six approved attachments were treated as read-only content/data. Newsletter attachment `e6b9523e-f66c-469f-b897-ff18c252a413` is excluded exactly.

## Source notes

- Hero video/poster are omitted because rights are unconfirmed.
- Audience brochure `2026 브로슈어` and reviewed final CTA `STK 2027 브로슈어 다운로드` are retained in their separate visible contexts.
- Reviewed speaker discrepancies recorded for operators: `changguk-myung.webp` → Changquk Myung; Université de Montréal → MILA for Yoshua Bengio; `Quebec Government of Officec in Seoul` → Québec Government Office in Seoul; Mila → Polytechnique Montréal for Sarath Chandar; Mila → Université de Montréal for Bang Liu; 김용태 → Tei Kim; Posco DX → POSCO DX; Engine AI → EngineAI; Chen xianyong → Chen Xianyong; Simplatform → SimPlatform; uncommon role `Prime Researcher` retained for Jun-Hee Park.
- Placeholder sponsor marks are omitted rather than represented as real sponsors.
- CTA aria source `1대1 부스 참가 문의` and reviewed visible `1:1 부스 참가 문의` are recorded.
- Campaign/event dates, destinations, modal ids, and public URLs remain intentionally omitted operational inputs.

## Importer contract and dry-run

- Exact modes are default/explicit `--dry-run`, dry-run with any absolute local maps, or `--output` with all three complete maps. Output writes only an explicit absolute local JSON path.
- Maps must be JSON objects with exact canonical keys; missing-output arrays are sorted. Unknown, duplicate, unsafe, relative/local media, credential-bearing/non-public HTTPS, broken-reference, count/order, or semantic-id mutations exit 1.
- Missing operational inputs print sorted JSON arrays and exit 2; complete maps produce complete event/campaign/destination/media materialization. The importer never imports network or database clients.
- Final default dry-run exited 2 and printed only `missingAssets` (43: Hero video, 6 exhibition symbols, 8 audience icons, 28 speaker images), `missingDestinations` (16), and `missingSchedules` (3: `campaign.exhibitor-recruitment`, `campaign.visitor-registration`, `event`). It performed zero writes.

## Clone, immutability, and authorization self-review

- Each built-in clone regenerates section `sid` values only, preserves semantic ids, strips editor-only row keys through normalization, forces `embedEnabled:false`, and carries no foreign Storage ownership.
- Built-in descriptors and the registry are frozen; list responses expose `builtIn:true` and `canManage:false`.
- Instantiation still requires route authentication, write permission, valid body, destination project access, and destination workspace permission. Only the built-in template lookup/media-copy branch is skipped because the preset owns no DB row or Storage objects.
- Custom template lookup, ownership authorization, media copying, cleanup, and failure behavior remain unchanged and tested.
- PATCH/DELETE preserve authentication/body guards and return not-found for the reserved built-in id without DB or Storage mutation.

## Review and remaining concerns

- Independent re-review found no remaining Critical or Important issue.
- The preset is deliberately not publish-ready until operators provide all required maps, confirm Hero video rights, and verify sponsor identities/logos. Readiness reports the missing operational fields rather than inventing them.
- No live scrape/browse, network, DB, Supabase, Storage, development server, deployment, feature-flag, or Imweb action was performed.
