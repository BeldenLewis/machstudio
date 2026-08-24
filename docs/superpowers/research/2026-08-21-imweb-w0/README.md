# Imweb W0 authenticated admin-preview measurement

## Outcome

- Measurement window: 2026-08-21 16:52–17:13 KST
- Browser: Google Chrome 151.0.7922.170
- W1 implementation-planning verdict: **PASS**
- `editorMode`: **placeholder**
- `allowKvFull`: **false** (`full-layout-unavailable`)
- Public release: **BLOCKED until a separate user-approved release verification**

W0 proves that an open Shadow DOM can keep the probe typography and color signature stable against Imweb host styles in authenticated admin preview. It does not prove the actual self-host font file, the actual `/h` runtime, or a public rendering path.

## Safety record

- The user designated the existing working page used for this measurement.
- Its operating-menu entry was hidden before the first write and remained hidden after cleanup.
- The page remained unpublished. Only the authenticated administrator preview that includes draft changes was used.
- Publish was never clicked.
- Access permissions, site theme, global header, domain, page name, and menu state were not changed.
- The isolated full-width option was not created because changing the existing section width would also affect non-probe content.
- Exactly three temporary code widgets were created: standard marker, wide marker, and controller. Their private widget handles stayed only in browser memory and are not recorded here.

## Method

The controller used only these public probe resources:

- `https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js`
- `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2`
- `https://machstudio.vercel.app/f/__mach_expo_w0__` with a credential-free `OPTIONS` request

The browser driver exposed the observed asset inventory and page runtime results, but not raw HTTP status/MIME for the CDN assets or the main document's raw Content-Security-Policy response header. Therefore the CSP verdict is deliberately limited to exercised resources: both pinned CDN assets executed or loaded, the canonical Mach connect request succeeded, and no related `securitypolicyviolation` event occurred. Canonical `/h` script and self-host font CSP remain release-gated.

The hidden `[data-mach-expo-w0-json]` node was the canonical preview handoff because the read-only driver can hide page-created globals. The four JSON files are the exact sanitized records captured from that contract or its explicit editor no-execution fallback.

## Four-run matrix

| Run | Controller | External classic script | Exercised CSP | Mach CORS | Capabilities | Pinned Pretendard | Console |
|---|---|---|---|---|---|---|---|
| editor desktop | not observed; probe DOM count 0 | not observed | not exercised | not exercised | mutation APIs unobserved by read-only driver; adopted stylesheets and document fonts present | not exercised | no W0 runtime existed |
| editor mobile | not observed; probe DOM count 0 | not observed | not exercised | not exercised | mutation APIs unobserved by read-only driver; adopted stylesheets and document fonts present | not exercised | no W0 runtime existed |
| preview desktop 1440×1000 | inline executed | parser onload + parser execution + dynamic execution PASS | violations 0; exercised resources PASS | `204 / cors / ok=true` | 6/6 PASS | `loaded=true`, `check=true` | final W0 errors 0; two pre-existing host warning types remained |
| preview mobile 390×844 | inline executed | parser onload + parser execution + dynamic execution PASS | violations 0; exercised resources PASS | `204 / cors / ok=true` | 6/6 PASS | `loaded=true`, `check=true` | final W0 errors 0; two pre-existing host warning types remained |

The two unrelated host warning types were a disabled collect source and an existing config 404. The earlier controller self-reference error was fixed before the final desktop and mobile records; neither final run contains that error.

The required preview capabilities were `attachShadow`, `adoptedStyleSheets`, `FontFace`, `document.fonts`, `ResizeObserver`, and `MutationObserver`. All were true in both preview records.

## Editor contract

| Mode | Fixed comparison label | Native Imweb canvas | Decision |
|---|---|---:|---|
| desktop | `editor-desktop-1440x1000` | 1450×4450 | placeholder |
| mobile | `editor-mobile-390x844` | 375×5200 | placeholder |

The mobile label names the public-preview comparison target; it does not relabel the native 375px editor canvas. Imweb did not render or execute the probe HTML in the editor, so W1 must show an inert placeholder there and direct visual verification to authenticated admin preview or the Mach preview.

## Layout matrix at t+10000

| Preview | Layout | clientWidth | root width | root ratio | bleed width | clip L/R | document overflow | Boundary blocker |
|---|---|---:|---:|---:|---:|---:|---:|---|
| desktop | standard | 1440 | 1410 | 0.9791666667 | 1440 | 0 / 0 | 0 | body viewport boundary; no measured clipping |
| desktop | wide | 1440 | 1440 | 1 | 1440 | 0 / 0 | 0 | body viewport boundary; no measured clipping |
| mobile | standard | 390 | 360 | 0.9230769231 | 390 | 0 / 0 | 0 | html viewport boundary; no measured clipping |
| mobile | wide | 390 | 390 | 1 | 390 | 0 / 0 | 0 | html viewport boundary; no measured clipping |
| both | full | — | — | — | — | — | — | `full-layout-unavailable` |

Standard remains the default column contract. Wide is a verified layout option. Wide must not be treated as proof of a distinct full-width section, so `kv.full` is withheld.

## Host-style isolation and stability

- In both layouts and both preview widths, the light-DOM canary resolved to the host-facing Arial signature while the Shadow DOM canary resolved to `__mach_expo_w0_pretendard, Arial, sans-serif`.
- The Shadow DOM signature stayed identical from `font-loaded` through `t+10000`: 16px, weight 700, 22.4px line height, `rgb(18, 52, 86)`, normal letter spacing, no transform, visible, opacity 1.
- The pinned font reported both load and `document.fonts.check` success.
- The defense portal remained fixed at `(0,0)`, 1×1, visible, opacity 0.01, with no transform or filter at `t+10000`.
- Standard and wide widgets were naturally visible with opacity 1 by `t+2000`; no forced unhide was needed.
- Desktop and mobile document overflow was 0.

This is sufficient to proceed with the W1 isolation design, including explicit Pretendard ownership inside Shadow DOM. It is not a substitute for loading the production self-host Pretendard asset.

## Screenshot availability

| Run | Status | Reason |
|---|---|---|
| editor desktop | `screenshot-unavailable` | the editor exposed only its inert code-widget placeholder, not probe pixels |
| editor mobile | `screenshot-unavailable` | the editor exposed only its inert code-widget placeholder, not probe pixels |
| preview desktop | `screenshot-unavailable` | Chrome compositor output did not match the probe DOM position; an isolated probe-only crop could not be trusted |
| preview mobile | `screenshot-unavailable` | Chrome compositor output was blank or showed unrelated page pixels; it was deliberately omitted |

No full-window, unrelated page, credential, or session capture is stored.

## Cleanup proof

| Check | Result |
|---|---:|
| pre-install code widgets | 8 |
| during measurement | 11 |
| immediately after exact probe removal | 8 |
| after editor reload | 8 |
| temporary widget handles remaining | 0 |
| probe markers after editor reload | 0 |
| controllers after editor reload | 0 |
| portals after editor reload | 0 |
| probe global after editor reload | false |
| markers/controllers/portals/JSON nodes after preview reload | 0 / 0 / 0 / 0 |
| probe global after preview reload | false |

The editor was returned to PC mode. The working page remained unpublished and menu-hidden, and its access permissions were unchanged.

## Release boundary

W1 implementation planning is unlocked because every preview W0 gate that was actually exercised passed. Public launch remains blocked. A later, explicit user-approved release verification must recheck all of the following from the canonical Mach origin:

1. the actual self-host Pretendard WOFF2 file and its `font-src` path;
2. the actual `/h` script runtime and its `script-src` path;
3. the actual public desktop and mobile rendering path;
4. cleanup and rollback behavior on the real serving path.

Until that release verification, do not claim public readiness or complete production isolation.
