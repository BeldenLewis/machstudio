# Task 12 Report — STK Three-Column Homepage Editor

## Status

- Complete; commit title: `feat: add the STK three-column homepage editor`.
- Base verified before work: `802dafe37d8f963c5a580a0d286bcd3775196b3e`.
- No database, auth, Supabase, storage, network, dev-server, browser, deploy, flag, or Imweb operation was used.

## Files

- Added `ExpoPageSettings`, `InlineEditableTable`, `DestinationPicker`, and `CampaignPicker`.
- Added six client-only STK editors plus their client registry and stable React dispatcher.
- Rewired `SectionEditor` and the one shared `PageDraftWorkspace` without adding a second draft, save path, or sidebar-project dependency.
- Added five preview-only campaign states and the `/hp/{token}` whitelist parser/forcing map.
- Added three focused suites and extended section/site/route preview regressions.

## TDD evidence

- RED: the three new suites failed on the intentionally missing table/settings/picker/registry modules; the pre-existing focused suites remained 97/97 green.
- GREEN focused command from the brief: 6 files, 120/120 tests passed.
- TypeScript: `npx tsc --noEmit -p tsconfig.json` passed.
- Changed-file ESLint passed with zero findings.
- React best-practices checklist passed after replacing a render-time component lookup with a stable dispatcher; no waterfall, render-time side effect, unstable key, or new client data owner remains.
- DB-free full suite: 194 files, 2,434/2,434 tests passed with DB/Supabase credentials explicitly empty.
- `git diff --check` passed.

## Self-review

- Settings/timezone: event, campaign, destination, action, and analytics controls map to the V2 draft paths. Date, time, and numeric UTC offset are split with a regex and concatenated directly; `ExpoPageSettings` contains no `Date` construction or parsing. Exact rejected field paths render beside their matching control.
- Settings semantics: campaign overrides update one row only; destination type changes replace only that row's action with the exact discriminated shape; analytics is restricted to the UI allowlist `select_content` and `generate_lead`.
- References: unavailable or invalid destinations are disabled. Campaign checkboxes are independent. Speaker category and sponsor group deletion returns a blocking reason while referenced; allowed deletion requires explicit confirmation.
- Table/read-only: the shared table uses a native desktop table, 390px stacked-card classes, clipped horizontal overflow, a draggable keyboard handle, explicit up/down controls, inline issues, thumbnail-compatible rows, one-click switches, and a disabled fieldset around every supplied row editor. Viewer tests cover all six editors.
- Editors/media: the client registry dispatches exactly campaign hero, exhibition grid, audience links, speaker carousel, sponsor marquee, and CTA band. Task 8 upload/crop controls are reused; speaker crop and its live card preview share one row, and Hero video rights is an explicit select.
- CTA resolution: Hero and final CTA rows show the resolved destination action, priority, fallback role, audience, and campaign conditions beside editable controls.
- Preview forcing: the select owns only local preview state and changes only the iframe query/reload key. The draft and PATCH count remain unchanged. The shared exact map covers current, exhibitor, visitor, both, and ended. Unknown values become current. Only the token preview route reads `campaignState`; live/export routes do not.
- Registry boundary: no `src/lib/expo` file imports the editor registry. The only React reference in the shared type contract remains the pre-existing `import type`, so no editor or React runtime enters the public registry/bundle.
- Context boundary: custom editors receive only `siteId`, locale, source options, same-site page targets, the current page config/issues/section, permission, and `onChange`. No sidebar project/workspace context is imported or forwarded.
- Shared draft: settings and all six editors call the existing Task 11 `updateConfig`; autosave, conflict, revision, publish/history routing, preview channel, Task 5 controls, and Task 9 renderer behavior remain under their existing owners.

## Concerns

- The full suite emits existing intentional stderr from failure-path and jsdom limitation tests, but all 2,434 assertions pass.
- Browser/dev-server visual verification was intentionally not run because Task 12 explicitly prohibited both; responsive behavior is covered structurally in jsdom and by the existing runtime CSS tests.

## Fix round 1

- Status: complete; limited to the four review findings and the handle-only drag cleanup. No plan, spec, or ledger file changed.
- RED: the new regressions failed in all four intended places: readiness issues were absent from inline fields, a selected disabled campaign could not be removed, newly added speaker categories had no public toggle, and the table exposed two headers plus row-level dragging for three cells.
- GREEN focused command: 6 files, 124/124 tests passed. TypeScript and changed-file ESLint passed with zero findings.
- React best-practices review passed: helpers remain module-level and pure, hooks are unconditional, rows keep stable ids, and the new switch/header/drag semantics are accessible without adding a client data owner or effect.
- Independent fix-diff review found no remaining Critical or Important issue.
- DB-free full suite: 194 files, 2,438/2,438 tests passed with database and Supabase credentials explicitly empty.
- Readiness issues: every path-bearing publish/live/note issue is merged with autosave rejections for settings and the selected editor. Duplicate path/message/sid entries collapse with readiness first, preserving its exact path, code, severity, and sid; section selection now exposes the matching inline error.
- References/read-only: an unavailable campaign remains unselectable, while a stale selected unavailable campaign can be unchecked. Every speaker category, including a new disabled category, now has a guarded public switch; viewer interaction remains disabled.
- Table semantics: the hidden header now has three scoped columns aligned with order, editable value, and delete cells. Only the accessible handle is draggable; table rows are drop targets but no longer claim to be draggable.
- Settings/timezone, deletion reference guards, preview forcing, editor dispatch/registry boundaries, and the Task 11 shared draft/autosave/conflict/request path were not changed by this round.
- The existing intentional full-suite stderr remains. Browser, dev server, database, network, storage, deploy, flags, and Imweb operations were not run.
