# Task 11 Report — Shared Expo Page Draft

## Status

- Complete; commit title: `refactor: share one Expo page draft across the editor`.
- Fix round 1 complete; follow-up commit title: `fix: harden the shared Expo page draft workspace`.
- Fix round 2 complete; follow-up commit title: `fix: invalidate stale Expo autosave outcomes`.
- Fix round 3 complete; follow-up commit title: `fix: protect shared Expo draft from late loads`.
- Base verified before work: `8a945354cba317b6ca4e266b604c8948f6eb631b`.
- No database, auth, Supabase, storage, network, dev-server, browser, deploy, flag, or Imweb operation was used.

## Files

- Added the React-free DTO/transport boundary and the single shared page-draft hook.
- Added the three-column page workspace and accessible section tree.
- Rewired the site editor, selected-section editor, publish/revision request routing, page-title ownership, and existing preview.
- Added shared-state/conflict/request-routing/tree tests and updated read-only/preview integration tests.
- Added the Vitest-to-Testing-Library fake-timer compatibility bridge required by the brief's exact timer lifecycle.

## TDD evidence

- RED: the new shared-state and tree suites failed on the intentionally missing `PageDraftWorkspace` and `ExpoSectionTree` modules; the pre-existing focused suites remained 59/59 green.
- GREEN focused command from the brief: 4 files, 67/67 tests passed.
- Publish/revision routing regression: 2 files, 21/21 tests passed.
- Page-tree regression: 1 file, 24/24 tests passed.
- TypeScript: `npx tsc --noEmit -p tsconfig.json` passed.
- Task 11 changed-file lint (excluding the pre-existing `editable-list.tsx` baseline findings) passed with zero findings.
- Repository-wide lint was run and remains blocked by the existing baseline: 128 errors and 48 warnings outside this task, plus pre-existing ref-access findings in `editable-list.tsx`; Task 11 introduced no new lint finding.
- DB-free full suite (run once): 191 files, 2,401/2,401 tests passed.
- `git diff --check` passed.

### Fix round 1

- RED: six exact regressions failed before implementation: deferred saves could update the replacement transport/page and update after unmount; read-only nested list/design controls remained active; the campaign-hero shortcut did not persist and direct string titles rendered blank; repeated keyboard moves did not produce distinct position announcements.
- GREEN focused shared/tree/section/preview/publish/revision suites: 6 files, 93/93 tests passed.
- TypeScript, Task 11 changed-file lint, and `git diff --check` passed.
- DB-free full suite (run once for this fix round): 191 files, 2,407/2,407 tests passed.

### Fix round 2

- RED: two precise transport-rerender races failed while the replacement load was still pending; stale `saved` advanced the old CAS anchor and stale `conflict` froze the shared autosave, so the new transport received no save.
- GREEN focused hook/workspace/autosave suites: 3 files, 68/68 tests passed.
- TypeScript, Task 11 changed-file lint, and `git diff --check` passed.
- DB-free full suite (run once for this fix round): 191 files, 2,409/2,409 tests passed.

### Fix round 3

- RED: the exact late-load race failed because a replacement load resolving after the new transport's successful retry replaced `홈 오래됨` revision 8 with older server data at revision 7.
- GREEN focused hook/workspace/autosave suites: 3 files, 69/69 tests passed. The regression also proves the next save uses revision 8 and no extra save loop starts.
- TypeScript, Task 11 changed-file lint, and `git diff --check` passed.
- DB-free full suite (run once for this fix round): 191 files, 2,410/2,410 tests passed.

## Self-review

- One owner: `useExpoPageDraft` alone owns title, Imweb URL, config, revision, autosave, conflict, and immutable-`sid` selection. Workspace children receive values/callbacks and have no shadow draft or direct draft-save request.
- Autosave: retained the existing 900ms CAS state machine, one PATCH per edit burst, server revision handoff, and row-key stripping at the transport boundary.
- Conflict: 409 freezes subsequent autosaves, preserves the local draft, and only replaces it after the explicit reload action; there is no automatic merge or discard.
- Selection: preview/tree use immutable `sid`; reordering preserves selection; deleting selects the next neighbor then the previous neighbor.
- Request routing: injected transport owns load/save and its request function receives publish, live, history, and rollback; the routing test confirms global fetch is untouched.
- Three columns: left is page/section structure, status, and issues; center is page settings plus the selected existing section editor; right is the existing preview plus publish/history.
- Accessibility: the tree reuses `EditableList`, removes drag/delete controls for read-only users, gives item-specific drag labels and keyboard move controls, and announces moves through a polite live region.
- Review closure: the final review findings were fixed by refreshing readiness/snippets after saves without replacing the draft, applying pinned-first order, restoring section creation in the tree, and only exposing a section-title shortcut for an existing or registry-valid title key.
- React review: no new waterfall, render-time side effect, shadow derived state, unstable list key, or unnecessary bundle boundary was found; small bounded section scans are acceptable at the 40-section limit.
- Async ownership: page/transport epochs plus a mounted guard now reject stale load/save/metadata completions before every post-await state update; autosave still owns stale-save rejection and keeps its existing CAS behavior.
- Read-only enforcement: variant/design controls and every nested-list mutation path are hidden or gated by `canEdit`; tests cover both absent controls and unchanged data.
- Title mapping: the shortcut now uses only registry-declared writable fields, maps campaign-hero edits to `typingLines[0]`, and preserves direct string values and storage shape.
- Move announcements: keyboard moves include the resulting one-based position, so repeated moves always produce distinct screen-reader text.
- Stale autosave boundary: the draft owner converts obsolete transport outcomes into an internal autosave-only sentinel. A mounted replacement epoch retries the same dirty snapshot through the current save callback without advancing the old revision or accepting its conflict; unmount discards it without a state update or retry. Current-epoch saved/conflict behavior remains covered and unchanged.
- Late-load protection: automatic same-page/site loads capture edit/save activity and cannot install over a draft that was dirty when they started or changed while pending. Normal first loads and new page/site scopes still install, while the explicit conflict reload deliberately bypasses the automatic-load watermark and remains authoritative.

## Concerns

- Full-repository lint is not green because of the documented pre-existing baseline. No baseline file outside Task 11 was repaired.
- The request-routing test passes but React emits an existing asynchronous `act(...)` advisory from the revision panel's fire-and-forget load; it is non-failing and does not indicate a production error.
