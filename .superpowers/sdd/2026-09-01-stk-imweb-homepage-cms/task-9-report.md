# Task 9 report — public STK homepage renderers

## Status

Complete.

- Feature commit: `8d45829` (`feat: render STK homepage sections`)
- Fix round 1 commit: `fix: close STK public renderer lifecycle gaps` (this commit)
- Base: `54a4f8cc2cc9df162cf443b526c92d7ed0b83daa`
- Scope: Task 9 only; 25 files including this report.

## Changed files

- Added pure-DOM renderers for destination actions, campaign Hero, exhibition grid, exactly two audience groups, speaker carousel, sponsor marquee, CTA band, and shared Task 8 crop rendering.
- Connected the six STK sections to the public page dispatcher and one page-level disposal chain.
- Extended mount/runtime context with campaigns, destinations, locale, standalone mode, and reduced-motion state while retaining non-destination standalone operations.
- Added the exact STK visual tokens and responsive/focus-visible CSS, then regenerated shell CSS and the self-contained runtime.
- Added renderer, mount, CSS, runtime, and hash-boundary regressions; runtime hashing now covers every renderer dependency.

## RED and GREEN evidence

- Initial renderer RED: 4 files failed. Missing renderer modules plus absent dispatch and CSS contracts failed while the pre-existing mount coverage remained green.
- Runtime pipeline RED: 1 of 5 tests failed because new renderer sources were not yet part of the runtime hash.
- Review RED: 3 files ran with 4 failures / 29 passes. It proved analytics exceptions blocked modal opening, sponsor clones remained focusable, speaker filters used incomplete tab semantics, and speaker text lacked a neutral contrast scrim.
- Each RED was followed by a focused GREEN.
- Final required renderer/mount/CSS/runtime suite: 7 files / 196 tests passed.
- Final runtime/hash boundary: 4 files / 34 tests passed.
- Final DB-free full suite: 188 files / 2,363 tests passed.
- Typecheck and focused ESLint for every changed TypeScript/test/script passed.
- `git diff --check` passed.

## Artifact build and boundary

- `npm run build:expo-shell-css`: 23,928 → 14,266 bytes (40% reduction).
- `npm run build:expo-runtime`: 82.8KB minified; regenerated `src/generated/expo-runtime.ts`.
- The generated runtime contains no React runtime import, stored-code evaluation, or `javascript:` URL path; public text is created with `textContent`/DOM helpers.
- Runtime hash inputs explicitly include all new renderer sources plus the existing CTA dependency.

## Lifecycle and behavior self-review

- Page renderer results feed one cleanup list; Hero timers/media query, speaker pointer/keyboard listeners, mount observers, and entry diagnostic timers all dispose through the same page/mount lifecycle.
- Empty enabled data returns `null` and hides the section. Unknown or unsafe destinations return no control.
- URL/download/anchor destinations are real anchors with safe target/rel rules. Modal buttons prefer documented `SITE.openModalMenu`, then a cancelable fallback event and safe fallback URL. Host analytics errors cannot block the destination.
- Analytics event/dataLayer writes occur only in live mode; editor, preview, and iframe-preview perform zero writes.
- Reduced motion uses the Hero poster, skips parallax/typing timers, and renders one static sponsor grid. Motion-enabled sponsors alone receive a second inert, unfocusable marquee track.
- Speaker data is filtered and ordered dynamically, uses lazy shared-crop images, roving keyboard filter buttons with `aria-pressed`, horizontal pointer behavior, and one abort-driven listener chain.

## Accessibility and visual-token self-review

- Hero retains one semantic `h1` fallback while the animated display line is separate. Interactive controls have visible focus, keyboard paths, safe names, and no hidden cloned focus stops.
- Exhibition count and columns are data-driven; source-color assets transition from grayscale on hover/focus. Audience rendering requires exactly two groups.
- Speaker surface is flat `#0B0C0E` with no metallic/pattern effect. Category color is restricted to the top badge and layered bottom information gradient; the exact green/blue/mint tokens remain intact, white text receives a neutral scrim, and the mint badge uses dark ink.
- CTA is full-bleed dark with no white gutter/border, sharp cards, plain secondary brochure, orange primary inquiry, and exactly one simple `→` per action.
- Responsive layouts and `:focus-visible` rules are scoped to the embed root.

## Review and concerns

- Independent review reported no Critical finding. Its four Important/Minor observations were converted to RED tests and fixed before the final suite.
- Repository-wide `npm run lint` remains red on the pre-existing baseline (127 errors / 46 warnings); focused lint for Task 9 is clean.
- JSDOM and Vitest print existing intentional failure-path warnings and the Vite CJS deprecation; no tests failed.
- No DB/Supabase/storage access, development server, browser, deployment, feature-flag change, or Imweb action was performed. Public Imweb rendering remains a later release verification step.

## Fix round 1

- Exact RED: 4 files ran with 4 failures / 41 passes, plus the expected uncaught throwing-host error. The failures proved that a throwing `SITE.openModalMenu` skipped the cancelable fallback, repeated boot leaked the prior mount, dark audience controls inherited a low-contrast accent ring, and modal exhibition buttons contained an invalid heading child.
- Independent-review RED: 2 files ran with 2 failures / 16 passes. It proved a pending `DOMContentLoaded` callback could remount after `destroy()` and that exhibition descriptions still used non-phrasing `<p>` content inside modal buttons.
- Imweb host lookup and invocation now run inside one guarded block. A missing or throwing host continues to the existing cancelable `msx:imweb-modal` event and safe `fallbackHref` path.
- Expo re-entry clears the prior diagnostic timer and destroys the previous mount handle before replacement. The boot-twice regression proves the old handle is destroyed once and final `destroy()` reaches the newest handle. A registry identity guard also prevents pending `DOMContentLoaded` work from remounting a destroyed instance.
- Dark audience cards now override `:focus-visible` with `--msx-dark-text`; exhibition titles and descriptions use styled phrasing `span` elements, valid for both real anchors and modal buttons.
- Regenerated shell CSS: 24,028 → 14,358 bytes (40% reduction). Regenerated runtime: 83.1KB minified.
- Final renderer/view/mount/CSS/runtime/hash suite: 11 files / 235 tests passed.
- Final DB-free full suite: 188 files / 2,368 tests passed. Typecheck and focused ESLint passed. Repository-wide lint reproduced only its pre-existing 127 errors / 46 warnings; no fix-round file appears in that output. `git diff --check` passed.
- No new dependency, DB/Supabase/storage access, development server, browser, deployment, feature-flag change, or Imweb action was involved.
