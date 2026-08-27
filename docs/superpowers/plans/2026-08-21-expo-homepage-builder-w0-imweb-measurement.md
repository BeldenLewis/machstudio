# Expo Homepage Builder W0 Imweb Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Measure the real Imweb editor and authenticated admin preview without production feature code or publication, then lock the W1 width, editor-preview, script, Shadow DOM, and rollout gates with reproducible evidence.

**Architecture:** W0 is an independent subproject because its observations determine later implementation details. A disposable probe uses two mandatory layout-marker code widgets (standard and wide), an optional full-width marker only when an isolated full-width section is safe to create, and one controller widget on the user's designated, menu-hidden Imweb working page. It performs pinned CDN GETs and a DB-free Mach OPTIONS request in authenticated admin preview, records sanitized JSON and only those probe-only crops that the browser compositor can produce without unrelated page content, then removes exactly the widgets created by this run without publication. W1 implementation planning may start after the preview contract is committed, while public launch remains blocked on a later user-approved release verification.

**Tech Stack:** Imweb code widgets, classic JavaScript, open Shadow DOM, CSSOM, FontFace capability detection, Chrome with the user's existing authenticated session, Markdown/JSON evidence, Git

## Global Constraints

- This is a generic homepage-builder measurement. Do not use LA, an event deadline, or event-specific sample data.
- Use only the user's existing authenticated browser session and the user-designated Imweb working page that is hidden from the operating menu.
- The user explicitly prohibited publication on 2026-08-21. Never click Publish, change page access permissions, or expose the page to visitors during W0.
- Do not touch an operating page, global header code, site theme, domain settings, production menu, form, registration source, webinar, or competition.
- W0 starts no local dev server and performs no build, Prisma command, database query, database write, storage write, analytics call, beacon, form submission, cookie write, or business API request.
- Do not add a production probe endpoint. The probe may issue GET only to pinned jsDelivr assets and OPTIONS only to https://machstudio.vercel.app/f/__mach_expo_w0__.
- The Mach OPTIONS request is DB-free by repository contract: src/app/f/[id]/route.ts delegates OPTIONS directly to loaderOptions, and loaderOptions returns 204 before serveFormRuntime.
- Do not use /f/{id}, /w/{id}, /w/l/{slug}, /s/{id}, or another product loader as a probe; their GET paths touch product state or data.
- Never commit an Imweb admin URL, preview token, cookie, account name, HAR, full-window screenshot, or page content outside the probe crop. If the editor does not render the probe or the browser compositor cannot produce an isolated probe crop, omit that PNG and record `screenshot-unavailable` in README instead of saving an unrelated page crop.
- The working page stays unpublished and menu-hidden. Remove the probe widgets after evidence capture, but do not delete or rename the page.
- Admin-preview external classic-script failure, missing required Shadow/FontFace APIs, CSP exclusion of the canonical Mach origin, or inability to prove cleanup blocks W1 implementation planning.
- Editor-mode script failure alone does not block W1; it selects the explicit editor-placeholder contract.
- W1 may implement kv.full only when both admin-preview desktop and mobile meet the exact geometry threshold in Task 1. Public release of kv.full still requires the later release verification.

---

## File Map

- Create: docs/superpowers/research/2026-08-21-imweb-w0/README.md — sanitized safety record, result matrix, verdict, and cleanup proof.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.json — fixed desktop comparison-label record; the literal native editor canvas is stored in editorCanvas.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.json — fixed 390×844 public-preview comparison-label record; the literal native editor canvas is stored in editorCanvas and is never relabeled or stretched.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-desktop.json — exact 1440×1000 authenticated admin-preview export.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-mobile.json — exact 390×844 authenticated admin-preview export.
- Create when safely available: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.png — probe-only crop; otherwise document `screenshot-unavailable`.
- Create when safely available: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.png — probe-only crop; otherwise document `screenshot-unavailable`.
- Create when safely available: docs/superpowers/research/2026-08-21-imweb-w0/preview-desktop.png — probe-only crop; otherwise document `screenshot-unavailable`.
- Create when safely available: docs/superpowers/research/2026-08-21-imweb-w0/preview-mobile.png — probe-only crop; otherwise document `screenshot-unavailable`.
- Modify: docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md — replace W0-dependent choices with measured decisions.
- Do not modify: src/**, prisma/**, public/**, scripts/**, package.json, package-lock.json, or environment files.

## Measurement Record Contract

Every JSON file uses this stable union. It intentionally omits location.href and all account/site identifiers. The no-execution branch is required when the editor or authenticated admin preview preserves HTML but does not run the controller; never invent a successful export.

~~~ts
type ExpoW0Record = ExpoW0Export | ExpoW0NoExecution;

interface ExpoW0Export {
  execution: "observed";
  runLabel:
    | "editor-desktop-1440x1000"
    | "editor-mobile-390x844"
    | "preview-desktop-1440x1000"
    | "preview-mobile-390x844";
  version: "2026-08-21.1";
  startedAt: string;
  capabilities: {
    attachShadow: boolean;
    adoptedStyleSheets: boolean;
    FontFace: boolean;
    documentFonts: boolean;
    ResizeObserver: boolean;
    MutationObserver: boolean;
  };
  inlineExecuted: boolean;
  currentScriptPreserved: boolean;
  parserExternalExecuted: boolean;
  parserOnloadObserved: boolean;
  dynamicHeadExternalExecuted: boolean;
  machCors: { status: number; type: string; ok: boolean } | { error: string };
  font:
    | { loaded: boolean; status: string }
    | { loaded: boolean; check: boolean; family?: string; error?: string };
  csp: Array<{
    at: number;
    effectiveDirective: string;
    violatedDirective: string;
    blockedURI: string;
    disposition: string;
  }>;
  cssEvents: Array<{
    at: number;
    type: "stylesheet-added" | "ancestor-attribute";
    tag: string;
    attribute?: string;
  }>;
  unhideTests: Array<{
    label: "standard" | "wide" | "full";
    visibility: string;
    opacity: string;
    display: string;
  }>;
  editorCanvas?: {
    mode: "desktop" | "mobile";
    width: number;
    height: number;
  };
  samples: Array<{
    stage: string;
    at: number;
    viewport: {
      innerWidth: number;
      innerHeight: number;
      clientWidth: number;
      documentOverflow: number;
    };
    portal: {
      left: number;
      top: number;
      width: number;
      height: number;
      position: string;
      visibility: string;
      opacity: string;
      transform: string;
      filter: string;
    };
    layouts: Array<{
      label: "standard" | "wide" | "full";
      root: Geometry;
      bleed: Geometry;
      light: StyleSignature;
      shadow: StyleSignature | null;
      widget: {
        className: string;
        visibility: string;
        opacity: string;
        display: string;
      } | null;
    }>;
  }>;
}

interface ExpoW0NoExecution {
  execution: "not-observed";
  runLabel:
    | "editor-desktop-1440x1000"
    | "editor-mobile-390x844"
    | "preview-desktop-1440x1000"
    | "preview-mobile-390x844";
  version: "2026-08-21.1";
  observedAt: string;
  dom: {
    boxCount: number;
    controllerCount: number;
    parserScriptCount: number;
  };
  globals: {
    probeType: string;
    dayjsType: string;
  };
  capabilityObservation: "unobserved-read-only-driver";
  capabilities: {
    attachShadow: null;
    adoptedStyleSheets: boolean;
    FontFace: null;
    documentFonts: boolean;
    ResizeObserver: null;
    MutationObserver: null;
  };
  editorCanvas?: {
    mode: "desktop" | "mobile";
    width: number;
    height: number;
  };
}

interface Geometry {
  left: number;
  right: number;
  width: number;
  visibleWidth: number;
  clipLeft: number;
  clipRight: number;
  blockers: Array<{
    tag: string;
    className: string;
    width: number;
    overflowX: string;
    maxWidth: string;
  }>;
}

interface StyleSignature {
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  lineHeight: string;
  color: string;
  textFill: string;
  letterSpacing: string;
  textTransform: string;
  display: string;
  visibility: string;
  opacity: string;
  boxSizing: string;
}
~~~

---

### Task 1: Measure the unpublished Imweb working page and preserve sanitized evidence

**Files:**
- Create: docs/superpowers/research/2026-08-21-imweb-w0/README.md
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-desktop.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-mobile.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-desktop.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/preview-mobile.png

**Interfaces:**
- Consumes: the approved design v2 §11 W0 contract, chrome:control-chrome, the user's existing Imweb login, data-mach-expo-w0-box markers.
- Produces: four ExpoW0Record files, zero to four safe probe-only screenshots plus an explicit availability record, a single PASS/BLOCKED decision, editorMode = render|placeholder, and allowKvFull = true|false.

- [ ] **Step 1: Connect to the existing browser without touching page state**

Use chrome:control-chrome. Before the first browser operation, follow that skill's browser selection and complete documentation-read requirements. Do not use standalone Playwright, a new profile, incognito mode, cookie inspection, or localStorage inspection.

Inspect visible tabs only. Select the already logged-in Imweb admin context. If authentication is missing, ask the user to sign in in that browser and stop. If more than one Imweb site is plausible and the intended site cannot be inferred from the focused tab, ask the user which site to use and stop.

- [ ] **Step 2: Prove the target is safe before the first write**

In the Imweb UI, verify all of the following from visible state:

1. The page is a duplicate or dedicated test page.
2. It is the exact working page designated by the user and its operating-menu entry is hidden.
3. It is absent from the operating menu.
4. No step requires Publish or an access-permission change; only draft save and authenticated admin preview are allowed.
5. No global header, site theme, or domain change is needed.

If any item is unprovable, stop before editing. Do not create or duplicate a page automatically.

- [ ] **Step 3: Record the pre-install baseline**

At desktop 1440×1000 CSS pixels, record the following. The Chrome browser-control read-only evaluator intentionally hides DOM mutation constructors, so baseline capability detection is deferred to the in-page controller. If site zoom makes the first viewport override report a different innerWidth or innerHeight, do not change browser zoom; request `Math.round(targetCssPixels * devicePixelRatio)` and require the resulting innerWidth and innerHeight to equal the target exactly.

~~~js
({
  hadProbeGlobal: Object.prototype.hasOwnProperty.call(window, "__MACH_EXPO_W0__"),
  hadDayjs: Object.prototype.hasOwnProperty.call(window, "dayjs"),
  dayjsType: typeof window.dayjs,
  existingMarkers: document.querySelectorAll("[data-mach-expo-w0-box]").length,
  viewport: {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    devicePixelRatio: window.devicePixelRatio
  },
  capabilityObservation: "deferred-to-in-page-controller"
})
~~~

The baseline must show existingMarkers = 0 and hadProbeGlobal = false. Separately record the editor's total code-widget count so cleanup can require the same count. If a prior marker exists, remove it only after confirming it belongs to this task, reload, and repeat.

- [ ] **Step 4: Add the standard marker code widget**

Create a normal content-column code widget and paste this exact markup:

~~~html
<div data-mach-expo-w0-box="standard"
  style="display:block;width:100%;box-sizing:border-box;padding:12px;background:#eef2ff;color:#111827">
  <b>W0 standard</b>
  <div data-mach-expo-w0-bleed
    style="position:relative;left:50%;width:100vw;max-width:none;height:24px;margin:8px 0 8px -50vw;background:repeating-linear-gradient(90deg,#2563eb 0 24px,#dbeafe 24px 48px)">
  </div>
  <p data-mach-expo-w0-light
    style="display:block;margin:0;padding:8px;font:700 16px/1.4 Arial,sans-serif;color:#123456;-webkit-text-fill-color:#123456">
    LIGHT 가나다 ABC 0123
  </p>
  <div data-mach-expo-w0-shadow></div>
  <pre data-mach-expo-w0-out
    style="white-space:pre-wrap;font:12px/1.4 monospace">HTML preserved · JavaScript not observed yet</pre>
</div>
~~~

- [ ] **Step 5: Add the wide marker code widget**

Create a wide-section code widget and paste this exact markup:

~~~html
<div data-mach-expo-w0-box="wide"
  style="display:block;width:100%;box-sizing:border-box;padding:12px;background:#ecfdf5;color:#111827">
  <b>W0 wide</b>
  <div data-mach-expo-w0-bleed
    style="position:relative;left:50%;width:100vw;max-width:none;height:24px;margin:8px 0 8px -50vw;background:repeating-linear-gradient(90deg,#059669 0 24px,#d1fae5 24px 48px)">
  </div>
  <p data-mach-expo-w0-light
    style="display:block;margin:0;padding:8px;font:700 16px/1.4 Arial,sans-serif;color:#123456;-webkit-text-fill-color:#123456">
    LIGHT 가나다 ABC 0123
  </p>
  <div data-mach-expo-w0-shadow></div>
  <pre data-mach-expo-w0-out
    style="white-space:pre-wrap;font:12px/1.4 monospace">HTML preserved · JavaScript not observed yet</pre>
</div>
~~~

- [ ] **Step 6: Add the full-width marker code widget only when isolated and safe**

Create a full-width-section code widget and paste this exact markup:

~~~html
<div data-mach-expo-w0-box="full"
  style="display:block;width:100%;box-sizing:border-box;padding:12px;background:#fff7ed;color:#111827">
  <b>W0 full</b>
  <div data-mach-expo-w0-bleed
    style="position:relative;left:50%;width:100vw;max-width:none;height:24px;margin:8px 0 8px -50vw;background:repeating-linear-gradient(90deg,#ea580c 0 24px,#ffedd5 24px 48px)">
  </div>
  <p data-mach-expo-w0-light
    style="display:block;margin:0;padding:8px;font:700 16px/1.4 Arial,sans-serif;color:#123456;-webkit-text-fill-color:#123456">
    LIGHT 가나다 ABC 0123
  </p>
  <div data-mach-expo-w0-shadow></div>
  <pre data-mach-expo-w0-out
    style="white-space:pre-wrap;font:12px/1.4 monospace">HTML preserved · JavaScript not observed yet</pre>
</div>
~~~

If Imweb has no distinct full-width section option, or making an existing section full-width would affect any non-probe content, do not create this widget and do not simulate one with global CSS. Record the literal result `full-layout-unavailable` and `allowKvFull = false`, then continue with the two mandatory markers and controller. This branch creates three W0 widgets total, not four.

- [ ] **Step 7: Add the one-time controller code widget**

Create one additional working-page code widget and paste this exact controller. It uses a pinned parser-inserted dayjs GET, a pinned dynamically inserted dayjs GET, a pinned Pretendard font GET, and a DB-free Mach OPTIONS request. It never sends business data.

~~~html
<div data-mach-expo-w0-controller
  style="display:block;padding:12px;background:#111827;color:#fff">
  <b>MACH W0 controller</b>
  <pre data-mach-expo-w0-dashboard
    style="white-space:pre-wrap;font:12px/1.4 monospace">Inline JavaScript not observed yet</pre>
  <pre data-mach-expo-w0-json
    style="display:none">{"execution":"not-observed"}</pre>
</div>

<script data-mach-expo-w0-baseline>
(function () {
  "use strict";
  window.__MACH_EXPO_W0_BASELINE__ = {
    hadDayjs: Object.prototype.hasOwnProperty.call(window, "dayjs"),
    dayjs: window.dayjs
  };
})();
</script>

<script
  data-mach-expo-w0-parser-script
  referrerpolicy="no-referrer"
  src="https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js"
  onload="this.dataset.machLoaded='true'"
  onerror="this.dataset.machLoaded='false'"></script>

<script data-mach-expo-w0-boot>
(function (controllerScript) {
  "use strict";

  var DAYJS =
    "https://cdn.jsdelivr.net/npm/dayjs@1.11.13/dayjs.min.js?mach-expo-w0=dynamic";
  var PRETENDARD =
    "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/woff2/PretendardVariable.woff2";
  var FONT_ALIAS = "__mach_expo_w0_pretendard";
  var MACH_CORS =
    "https://machstudio.vercel.app/f/__mach_expo_w0__";
  var baseline = window.__MACH_EXPO_W0_BASELINE__ || {
    hadDayjs: false,
    dayjs: undefined
  };
  var boxes = Array.prototype.slice.call(
    document.querySelectorAll("[data-mach-expo-w0-box]")
  );
  var timers = [];
  var shadowCanaries = new Map();

  function round(value) {
    return Math.round(value * 10) / 10;
  }

  function safeClassName(element) {
    return Array.prototype.filter.call(
      element.classList || [],
      function (name) {
        return (
          name.indexOf("_body_menu_") !== 0 &&
          !/[0-9]/.test(name)
        );
      }
    ).slice(0, 8).join(" ");
  }

  function restoreDayjs() {
    if (baseline.hadDayjs) {
      window.dayjs = baseline.dayjs;
      return;
    }
    try {
      delete window.dayjs;
    } catch (_) {
      window.dayjs = undefined;
    }
  }

  var bag = window.__MACH_EXPO_W0__ = {
    version: "2026-08-21.1",
    startedAt: new Date().toISOString(),
    capabilities: {
      attachShadow: typeof Element.prototype.attachShadow === "function",
      adoptedStyleSheets: "adoptedStyleSheets" in Document.prototype,
      FontFace: "FontFace" in window,
      documentFonts: "fonts" in document,
      ResizeObserver: "ResizeObserver" in window,
      MutationObserver: "MutationObserver" in window
    },
    inlineExecuted: true,
    currentScriptPreserved:
      !!controllerScript &&
      controllerScript.hasAttribute("data-mach-expo-w0-boot"),
    parserExternalExecuted: typeof window.dayjs === "function",
    parserOnloadObserved:
      document.querySelector("[data-mach-expo-w0-parser-script]")
        ?.dataset.machLoaded === "true",
    dynamicHeadExternalExecuted: false,
    machCors: { error: "not-finished" },
    font: { loaded: false, status: "not-started" },
    csp: [],
    cssEvents: [],
    unhideTests: [],
    samples: []
  };

  restoreDayjs();

  function makeShadow(box) {
    var host = box.querySelector("[data-mach-expo-w0-shadow]");
    if (!host || typeof host.attachShadow !== "function") return null;
    var root = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (!root.firstChild) {
      var style = document.createElement("style");
      style.textContent =
        ":host{display:block;width:100%}" +
        ".canary{all:initial;display:block;box-sizing:border-box;" +
        "margin:0;padding:8px;font:700 16px/1.4 " +
        "\"__mach_expo_w0_pretendard\",Arial,sans-serif;" +
        "color:#123456;-webkit-text-fill-color:#123456;" +
        "letter-spacing:0;text-transform:none;background:#fff}";
      var text = document.createElement("p");
      text.className = "canary";
      text.textContent = "SHADOW 가나다 ABC 0123";
      root.append(style, text);
    }
    return root.querySelector(".canary");
  }

  boxes.forEach(function (box) {
    shadowCanaries.set(box, makeShadow(box));
  });

  var portal = document.createElement("div");
  portal.setAttribute("data-mach-expo-w0-portal", "");
  [
    ["display", "block"],
    ["visibility", "visible"],
    ["position", "fixed"],
    ["left", "0"],
    ["top", "0"],
    ["width", "1px"],
    ["height", "1px"],
    ["margin", "0"],
    ["padding", "0"],
    ["border", "0"],
    ["opacity", "0.01"],
    ["transform", "none"],
    ["filter", "none"],
    ["overflow", "visible"],
    ["pointer-events", "none"],
    ["z-index", "2147483000"]
  ].forEach(function (entry) {
    portal.style.setProperty(entry[0], entry[1], "important");
  });
  if (typeof portal.attachShadow === "function") {
    portal.attachShadow({ mode: "open" });
  }
  document.body.appendChild(portal);

  function styleSignature(element) {
    if (!element) return null;
    var computed = getComputedStyle(element);
    return {
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      lineHeight: computed.lineHeight,
      color: computed.color,
      textFill: computed.webkitTextFillColor,
      letterSpacing: computed.letterSpacing,
      textTransform: computed.textTransform,
      display: computed.display,
      visibility: computed.visibility,
      opacity: computed.opacity,
      boxSizing: computed.boxSizing
    };
  }

  function geometry(element) {
    var rect = element.getBoundingClientRect();
    var visibleLeft = Math.max(0, rect.left);
    var visibleRight = Math.min(
      document.documentElement.clientWidth,
      rect.right
    );
    var blockers = [];
    var parent = element.parentElement;

    while (parent) {
      var computed = getComputedStyle(parent);
      if (/hidden|clip|auto|scroll/.test(computed.overflowX)) {
        var parentRect = parent.getBoundingClientRect();
        visibleLeft = Math.max(visibleLeft, parentRect.left);
        visibleRight = Math.min(visibleRight, parentRect.right);
        blockers.push({
          tag: parent.tagName.toLowerCase(),
          className: safeClassName(parent),
          width: round(parentRect.width),
          overflowX: computed.overflowX,
          maxWidth: computed.maxWidth
        });
      }
      if (parent === document.documentElement) break;
      parent = parent.parentElement;
    }

    return {
      left: round(rect.left),
      right: round(rect.right),
      width: round(rect.width),
      visibleWidth: round(Math.max(0, visibleRight - visibleLeft)),
      clipLeft: round(Math.max(0, visibleLeft - rect.left)),
      clipRight: round(Math.max(0, rect.right - visibleRight)),
      blockers: blockers
    };
  }

  function widgetState(box) {
    var widget = box.closest("._widget_data");
    if (!widget) return null;
    var computed = getComputedStyle(widget);
    return {
      className: safeClassName(widget),
      visibility: computed.visibility,
      opacity: computed.opacity,
      display: computed.display
    };
  }

  function portalState() {
    var rect = portal.getBoundingClientRect();
    var computed = getComputedStyle(portal);
    return {
      left: round(rect.left),
      top: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
      position: computed.position,
      visibility: computed.visibility,
      opacity: computed.opacity,
      transform: computed.transform,
      filter: computed.filter
    };
  }

  function currentRunLabel() {
    var isPreview =
      new URLSearchParams(location.search).get("preview_mode") === "1";
    var isMobile = isPreview
      ? window.innerWidth <= 500
      : document.body.classList.contains("device_type_m");
    if (isPreview) {
      return isMobile
        ? "preview-mobile-390x844"
        : "preview-desktop-1440x1000";
    }
    return isMobile
      ? "editor-mobile-390x844"
      : "editor-desktop-1440x1000";
  }

  function readEditorCanvas() {
    if (
      new URLSearchParams(location.search).get("preview_mode") === "1"
    ) return undefined;
    var canvas = document.querySelector("#edit");
    if (!canvas) return undefined;
    var rect = canvas.getBoundingClientRect();
    return {
      mode: document.body.classList.contains("device_type_m")
        ? "mobile"
        : "desktop",
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function snapshot(runLabel) {
    return {
      execution: "observed",
      runLabel: runLabel || currentRunLabel(),
      version: bag.version,
      startedAt: bag.startedAt,
      capabilities: bag.capabilities,
      inlineExecuted: bag.inlineExecuted,
      currentScriptPreserved: bag.currentScriptPreserved,
      parserExternalExecuted: bag.parserExternalExecuted,
      parserOnloadObserved: bag.parserOnloadObserved,
      dynamicHeadExternalExecuted:
        bag.dynamicHeadExternalExecuted,
      machCors: bag.machCors,
      font: bag.font,
      csp: bag.csp,
      cssEvents: bag.cssEvents,
      unhideTests: bag.unhideTests,
      editorCanvas: readEditorCanvas(),
      samples: bag.samples
    };
  }

  function writeSnapshot() {
    var json = document.querySelector("[data-mach-expo-w0-json]");
    if (json) json.textContent = JSON.stringify(snapshot(), null, 2);
  }

  function sample(stage) {
    var viewport = {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      clientWidth: document.documentElement.clientWidth,
      documentOverflow: Math.max(
        0,
        document.documentElement.scrollWidth -
          document.documentElement.clientWidth
      )
    };
    var item = {
      stage: stage,
      at: Math.round(performance.now()),
      viewport: viewport,
      portal: portalState(),
      layouts: boxes.map(function (box) {
        var value = {
          label: box.getAttribute("data-mach-expo-w0-box"),
          root: geometry(box),
          bleed: geometry(
            box.querySelector("[data-mach-expo-w0-bleed]")
          ),
          light: styleSignature(
            box.querySelector("[data-mach-expo-w0-light]")
          ),
          shadow: styleSignature(shadowCanaries.get(box)),
          widget: widgetState(box)
        };
        var output = box.querySelector("[data-mach-expo-w0-out]");
        if (output) output.textContent = JSON.stringify({
            stage: stage,
            viewport: viewport,
            root: value.root,
            bleed: value.bleed,
            widget: value.widget
          }, null, 2);
        return value;
      })
    };
    bag.samples.push(item);
    var dashboard = document.querySelector(
      "[data-mach-expo-w0-dashboard]"
    );
    if (dashboard) {
      dashboard.textContent = JSON.stringify({
        inlineExecuted: bag.inlineExecuted,
        currentScriptPreserved: bag.currentScriptPreserved,
        parserExternalExecuted: bag.parserExternalExecuted,
        parserOnloadObserved: bag.parserOnloadObserved,
        dynamicHeadExternalExecuted: bag.dynamicHeadExternalExecuted,
        machCors: bag.machCors,
        font: bag.font,
        capabilities: bag.capabilities,
        csp: bag.csp,
        cssEvents: bag.cssEvents.slice(-10)
      }, null, 2);
    }
    writeSnapshot();
    return item;
  }

  bag.onCsp = function (event) {
    bag.csp.push({
      at: Math.round(performance.now()),
      effectiveDirective: event.effectiveDirective,
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
      disposition: event.disposition
    });
  };
  document.addEventListener(
    "securitypolicyviolation",
    bag.onCsp,
    true
  );

  if (bag.capabilities.MutationObserver) {
    bag.observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (mutation) {
        if (mutation.type === "childList") {
          Array.prototype.forEach.call(
            mutation.addedNodes,
            function (node) {
              if (node.nodeType !== 1) return;
              if (
                node.matches("style,link[rel~='stylesheet']") ||
                node.querySelector("style,link[rel~='stylesheet']")
              ) {
                bag.cssEvents.push({
                  at: Math.round(performance.now()),
                  type: "stylesheet-added",
                  tag: node.tagName
                });
              }
            }
          );
          return;
        }

        var affectsProbe = boxes.some(function (box) {
          return (
            mutation.target === box ||
            (mutation.target.contains &&
              mutation.target.contains(box))
          );
        });
        if (affectsProbe) {
          bag.cssEvents.push({
            at: Math.round(performance.now()),
            type: "ancestor-attribute",
            attribute: mutation.attributeName,
            tag: mutation.target.tagName
          });
        }
      });
    });
    bag.observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "class",
        "style",
        "href",
        "media",
        "disabled"
      ]
    });
  } else {
    bag.observer = { disconnect: function () {} };
  }

  var dynamicScript = document.createElement("script");
  dynamicScript.src = DAYJS;
  dynamicScript.referrerPolicy = "no-referrer";
  dynamicScript.onload = function () {
    bag.dynamicHeadExternalExecuted =
      typeof window.dayjs === "function";
    restoreDayjs();
    dynamicScript.remove();
    sample("dynamic-script");
  };
  dynamicScript.onerror = function () {
    bag.dynamicHeadExternalExecuted = false;
    restoreDayjs();
    dynamicScript.remove();
    sample("dynamic-script-error");
  };
  document.head.appendChild(dynamicScript);

  if (bag.capabilities.FontFace && bag.capabilities.documentFonts) {
    bag.font = { loaded: false, status: "loading" };
    bag.face = new FontFace(
      FONT_ALIAS,
      'url("' + PRETENDARD + '") format("woff2")',
      { weight: "100 900", style: "normal" }
    );
    bag.face.load()
      .then(function (face) {
        document.fonts.add(face);
        return document.fonts.load(
          '700 16px "' + FONT_ALIAS + '"',
          "가나다 ABC 0123"
        );
      })
      .then(function () {
        bag.font = {
          loaded: bag.face.status === "loaded",
          check: document.fonts.check(
            '700 16px "' + FONT_ALIAS + '"',
            "가나다 ABC 0123"
          ),
          family: FONT_ALIAS
        };
        sample("font-loaded");
      })
      .catch(function (error) {
        bag.font = {
          loaded: false,
          check: false,
          error: String(error)
        };
        sample("font-error");
      });
  } else {
    bag.font = {
      loaded: false,
      check: false,
      error: "FontFace or document.fonts unavailable"
    };
  }

  fetch(MACH_CORS, {
    method: "OPTIONS",
    mode: "cors",
    credentials: "omit",
    cache: "no-store",
    referrerPolicy: "no-referrer"
  })
    .then(function (response) {
      bag.machCors = {
        status: response.status,
        type: response.type,
        ok: response.status === 204 && response.type === "cors"
      };
      sample("mach-cors");
    })
    .catch(function (error) {
      bag.machCors = { error: String(error) };
      sample("mach-cors-error");
    });

  bag.testUnhide = function (label) {
    var box = document.querySelector(
      "[data-mach-expo-w0-box='" + label + "']"
    );
    var widget = box && box.closest("._widget_data");
    if (!widget) {
      return Promise.resolve({
        label: label,
        visibility: "no-widget",
        opacity: "no-widget",
        display: "no-widget"
      });
    }

    var oldClass = widget.getAttribute("class");
    var oldStyle = widget.getAttribute("style");
    widget.classList.add("_ds_animated_except");
    widget.classList.remove("wg_animated");
    widget.style.visibility = "visible";
    widget.style.opacity = "1";

    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          var computed = getComputedStyle(widget);
          var result = {
            label: label,
            visibility: computed.visibility,
            opacity: computed.opacity,
            display: computed.display
          };
          if (oldClass === null) widget.removeAttribute("class");
          else widget.setAttribute("class", oldClass);
          if (oldStyle === null) widget.removeAttribute("style");
          else widget.setAttribute("style", oldStyle);
          bag.unhideTests.push(result);
          sample("unhide-test:" + label);
          resolve(result);
        });
      });
    });
  };

  bag.export = function (runLabel) {
    sample("export:" + runLabel);
    return JSON.stringify(snapshot(runLabel), null, 2);
  };

  bag.dispose = function () {
    bag.observer.disconnect();
    document.removeEventListener(
      "securitypolicyviolation",
      bag.onCsp,
      true
    );
    timers.forEach(clearTimeout);
    dynamicScript.remove();
    if (bag.face) document.fonts.delete(bag.face);
    portal.remove();
    restoreDayjs();
    delete window.__MACH_EXPO_W0_BASELINE__;
  };

  sample("controller");
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      sample("raf2");
    });
  });
  [500, 2000, 5000, 10000].forEach(function (milliseconds) {
    timers.push(setTimeout(function () {
      sample("t+" + milliseconds);
    }, milliseconds));
  });
})(document.currentScript);
</script>
~~~

- [ ] **Step 8: Save the unpublished draft and measure editor desktop**

Keep the page unpublished and menu-hidden. Save only the working-page draft changes. Do not click Publish. Wait 12 seconds after the editor reloads.

First capture the exact DOM text written by the in-page controller:

~~~js
document.querySelector(
  "[data-mach-expo-w0-json]"
)?.textContent
~~~

The browser-control read-only evaluator may hide page-created globals, so the DOM JSON is the canonical automation handoff. If the global is visible, also compare the exact return value of:

~~~js
window.__MACH_EXPO_W0__?.export(
  "editor-desktop-1440x1000"
)
~~~

If the DOM value is missing or still has execution not-observed, record that editor inline/controller execution is false. Separately record whether the available HTML markers and the parser script element remain in the editor DOM, whether the dayjs request appears, and whether the external response is 200 JavaScript. Do not fabricate an export. A hidden or undefined page-created global alone is not a failure when the DOM JSON reports execution observed.

When the value is undefined, save the exact return value of this fallback expression to editor-desktop.json:

~~~js
JSON.stringify({
  execution: "not-observed",
  runLabel: "editor-desktop-1440x1000",
  version: "2026-08-21.1",
  observedAt: new Date().toISOString(),
  dom: {
    boxCount: document.querySelectorAll(
      "[data-mach-expo-w0-box]"
    ).length,
    controllerCount: document.querySelectorAll(
      "[data-mach-expo-w0-controller]"
    ).length,
    parserScriptCount: document.querySelectorAll(
      "[data-mach-expo-w0-parser-script]"
    ).length
  },
  globals: {
    probeType: typeof window.__MACH_EXPO_W0__,
    dayjsType: typeof window.dayjs
  },
  capabilityObservation: "unobserved-read-only-driver",
  capabilities: {
    attachShadow: null,
    adoptedStyleSheets:
      "adoptedStyleSheets" in document,
    FontFace: null,
    documentFonts: "fonts" in document,
    ResizeObserver: null,
    MutationObserver: null
  },
  editorCanvas: (function () {
    var canvas = document.querySelector("#edit");
    if (!canvas) return undefined;
    var rect = canvas.getBoundingClientRect();
    return {
      mode: document.body.classList.contains("device_type_m")
        ? "mobile"
        : "desktop",
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  })()
}, null, 2)
~~~

Save only the exact sanitized record. Save a screenshot only when it can be cropped to the probe widgets without unrelated page content; otherwise record `screenshot-unavailable` and continue.

- [ ] **Step 9: Measure editor mobile**

Switch the editor to its native mobile device mode without changing page content. The public admin-preview target remains 390×844, but Imweb may use a different fixed editor-canvas width; record that literal editorCanvas value and never relabel or stretch it. Reload, wait 12 seconds, and capture the DOM JSON first, then compare the global export only when it is visible:

~~~js
window.__MACH_EXPO_W0__?.export(
  "editor-mobile-390x844"
)
~~~

If the editor does not execute scripts, record the same explicit false result and DOM/network evidence instead of a synthetic JSON export. Save a probe-only crop only when the inert editor placeholder itself can be isolated; otherwise record `screenshot-unavailable`.

Use the Step 8 fallback expression with runLabel changed only to editor-mobile-390x844.

- [ ] **Step 10: Open only the authenticated admin preview**

Reconfirm the target is the user-designated working page and its operating-menu entry is hidden. Open the existing authenticated admin preview from the editor. Do not click Publish, change access permissions, open a public sharing flow, use localhost, or use a dev harness. The preview must visibly identify itself as an administrator preview that includes unpublished changes; otherwise stop.

- [ ] **Step 11: Measure admin-preview desktop**

At 1440×1000, reload, wait 12 seconds, read the DOM JSON, and require all four of these runtime proofs:

1. The pinned dayjs asset is observed, parserOnloadObserved is true, and parserExternalExecuted is true. Record HTTP status and MIME only when the driver exposes them; successful classic-script execution is the required proof when it does not.
2. parserExternalExecuted is true.
3. dynamicHeadExternalExecuted is true.
4. The pinned Pretendard font reports loaded true and document.fonts.check true.

Capture the exact `[data-mach-expo-w0-json]` text. If the page-created global is visible, also compare:

~~~js
window.__MACH_EXPO_W0__?.export(
  "preview-desktop-1440x1000"
)
~~~

If the DOM JSON is missing or still reports execution not-observed, save the Step 8 fallback expression with runLabel preview-desktop-1440x1000, mark the Admin-preview classic script gate BLOCKED, continue only to capture mobile evidence and clean up, and do not unlock W1 implementation planning. Do not fail solely because the read-only evaluator hides the page-created global.

If a widget still has visibility hidden or opacity 0 at t+2000, run:

~~~js
Promise.all(
  ["standard", "wide", "full"].filter(function (label) {
    return document.querySelector(
      '[data-mach-expo-w0-box="' + label + '"]'
    );
  }).map(function (label) {
    return window.__MACH_EXPO_W0__.testUnhide(label);
  })
)
~~~

Then export the desktop run again. Save the final JSON and a probe-only crop only when the browser compositor can isolate it; otherwise record `screenshot-unavailable`.

- [ ] **Step 12: Measure admin-preview mobile**

At 390×844, reload, wait 12 seconds, and capture the exact DOM JSON first. Compare the global export only when it is visible:

~~~js
window.__MACH_EXPO_W0__?.export(
  "preview-mobile-390x844"
)
~~~

Save the exact JSON and a probe-only crop only when the browser compositor can isolate it; otherwise record `screenshot-unavailable`. Record Console errors, CSP violations, the observed dayjs and pinned Pretendard assets, the Mach OPTIONS status, and HTTP status/MIME or the main document's Content-Security-Policy response header only when the driver exposes them. When it does not, record that limitation and rely only on observed violation events plus successful exercised-resource runtime proofs. Do not save a HAR.

If the DOM JSON is missing or still reports execution not-observed, save the Step 8 fallback expression with runLabel preview-mobile-390x844 and keep the W1 implementation verdict BLOCKED.

- [ ] **Step 13: Apply the pass/fail rules**

Use these exact rules:

| Gate | PASS | Result |
|---|---|---|
| Admin-preview classic script | parserExternalExecuted and dynamicHeadExternalExecuted are true in both admin-preview runs | False blocks W1 implementation planning |
| Canonical Mach CORS | machCors is status 204, type cors, ok true | False blocks W1 |
| Exercised-resource CSP | No relevant securitypolicyviolation occurs while the pinned jsDelivr classic script and font load and the canonical Mach OPTIONS connect request succeeds | Any exercised resource blocked by CSP blocks W1; canonical `/h` script-src and self-host font-src remain release-gated |
| Required platform APIs | attachShadow, FontFace, documentFonts, ResizeObserver, MutationObserver are true | Any false blocks W1 |
| Pinned Pretendard load | font.loaded and font.check are true, with no relevant font-src violation | False blocks W1 until a working self-host path is verified |
| Shadow style stability | For each layout, shadow StyleSignature at font-loaded (or raf2 when already loaded) and t+10000 is identical, and fontFamily contains the probe Pretendard alias | Difference blocks W1 until explained and redesigned |
| Portal stability | At t+10000 portal remains fixed at 0,0, 1×1, visible, transform none, filter none | Difference blocks W1 until host defense is revised |
| wg_animated | Natural admin-preview state is visible by t+2000, or testUnhide returns visible with opacity 1 | Failure blocks W1 implementation planning |
| Editor contract | Both editor scripts true means render; otherwise placeholder | Selects contract; does not alone block |
| kv.full | Full layout exists; in both admin-preview runs full.root.visibleWidth / viewport.clientWidth is at least 0.98, full.bleed clipLeft and clipRight are at most 2px, and documentOverflow is at most 2px | True enables W1 implementation behind the release gate; false withholds it |

Column remains the default W1 kv variant even if kv.full passes; full becomes an explicit variant only.

- [ ] **Step 14: Remove the probe and prove cleanup**

In each loaded probe context, run:

~~~js
window.__MACH_EXPO_W0__?.dispose()
~~~

Remove only the exact W0 widget IDs created by this run and save the unpublished draft. This is three widgets when Step 6 recorded `full-layout-unavailable`, or four only when the isolated full marker was actually created. Never delete an additional widget merely to reach a count. Do not click Publish. Reload the editor and authenticated admin preview, then require:

~~~js
({
  markers:
    document.querySelectorAll("[data-mach-expo-w0-box]").length,
  controllers:
    document.querySelectorAll(
      "[data-mach-expo-w0-controller]"
    ).length,
  portals:
    document.querySelectorAll(
      "[data-mach-expo-w0-portal]"
    ).length,
  hasGlobal:
    Object.prototype.hasOwnProperty.call(
      window,
      "__MACH_EXPO_W0__"
    )
})
~~~

Expected: markers 0, controllers 0, portals 0, hasGlobal false after reload. Reconfirm unpublished and menu-hidden status. Do not delete or rename the working page.
Also require the editor's total code-widget count to equal the pre-install baseline from Step 3. A lower count means cleanup touched pre-existing content and is a blocking failure.

- [ ] **Step 15: Write the evidence README**

README.md must contain:

1. Measurement time and browser version, but no account or URL.
2. Literal safety-gate evidence: user-designated working page, menu-hidden, no permission change, and Publish never clicked.
3. A four-run matrix for script preservation/execution, CSP/CORS, capabilities, and console errors.
4. A layout matrix for standard/wide/full with clientWidth, root width, visible ratio, clip, overflow, and blockers.
5. The editorMode and allowKvFull decisions.
6. The final W1 PASS or BLOCKED verdict with the exact failing gate names.
7. Cleanup proof and confirmation that the working page remains unpublished and menu-hidden.
8. A note that actual self-host Pretendard, the actual /h runtime, and the real public rendering path must be reverified from the canonical Mach origin during a later user-approved release verification; preview W0 only proves APIs, pinned CDN Pretendard loading, generic external classic execution, exercised jsDelivr script/font CSP behavior, canonical Mach connect behavior, and Mach OPTIONS CORS in authenticated admin preview.
9. A screenshot availability row for each run. Use `screenshot-unavailable` when an isolated probe-only crop could not be produced; never substitute a full page or unrelated page crop.

- [ ] **Step 16: Verify evidence sanitation and commit**

Run:

~~~bash
rg -n "https?://|token|cookie|authorization|account|email|location.href" \
  docs/superpowers/research/2026-08-21-imweb-w0
~~~

Expected: no private URL, credential, token, account, or location.href values. The only permitted URLs are the two public probe origins named in README methodology.

Run:

~~~bash
git diff --check
npx tsc --noEmit
npm test
~~~

Expected: diff check exits 0, TypeScript exits 0, and all tests pass.

Commit:

~~~bash
git add docs/superpowers/research/2026-08-21-imweb-w0
git commit -m "docs: 아임웹 W0 실측 증거를 고정" \
  -m "게시나 권한 변경 없이 인증된 관리자 미리보기에서 폭·스크립트·Shadow·CSP 계약을 측정해 W1 구현 전제를 추측이 아닌 증거로 바꾼다." \
  -m "Co-Authored-By: Codex <noreply@openai.com>"
~~~

---

### Task 2: Lock the measured decisions into the approved design

**Files:**
- Modify: docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md
- Verify: docs/superpowers/research/2026-08-21-imweb-w0/README.md

**Interfaces:**
- Consumes: Task 1 W1 verdict, editorMode, allowKvFull, four ExpoW0Record files, and cleanup proof.
- Produces: a design v2 whose preview W0 section and W1 implementation gates contain only measured choices, while public launch remains blocked on release verification.

- [ ] **Step 1: Update the design status line**

If Task 1 is PASS, change the status to say preview W0 measurement complete and W1 implementation planning unlocked, with public launch still blocked on release verification. If Task 1 is BLOCKED, state preview W0 blocked and name the exact gate; do not unlock W1.

- [ ] **Step 2: Replace the W0 future-tense section with measured facts**

In §11 W0, link the research README and record:

- editorMode = render or placeholder;
- allowKvFull = true or false;
- exact standard/wide/full visible-width ratios;
- admin-preview classic-script verdict;
- canonical Mach CSP/CORS verdict;
- required API verdict;
- wg_animated/unhide verdict;
- cleanup verdict.

Do not copy account/site identifiers or URLs into the design.

- [ ] **Step 3: Update all downstream conditional copy**

Apply the measured result consistently:

- If allowKvFull is true, mark kv.full W1-available but keep column as default.
- If allowKvFull is false, remove kv.full from W1 and leave it behind a later layout redesign gate.
- If editorMode is render, remove placeholder-only instructions.
- If editorMode is placeholder, make the stable placeholder and admin-preview verification path the editor contract.
- Preserve the release requirement to load the actual self-host Pretendard file and actual /h script from https://machstudio.vercel.app through a user-approved real serving path before claiming complete isolation or public readiness.

- [ ] **Step 4: Run the plan self-review checks**

Spec coverage:

- Preview W0 unpublished/menu-hidden safety is linked to evidence.
- Standard/wide/full geometry has a measured outcome.
- Editor and authenticated admin-preview external classic execution have outcomes.
- CSP, Mach CORS, late CSS, Shadow, portal, FontFace capability, and wg_animated have outcomes.
- No local dev server or DB/product loader was used.
- Probe cleanup is proven.

Placeholder scan:

~~~bash
rg -n "T[B]D|T[O]DO|implement lat[e]r|fill[[:space:]]+in|적절한|나중에[[:space:]]+채" \
  docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md \
  docs/superpowers/research/2026-08-21-imweb-w0
~~~

Expected: no unresolved implementation or measurement placeholders.

Consistency scan:

~~~bash
rg -n "W0|kv\.full|placeholder|Pretendard|Shadow|CSP|CORS|wg_animated" \
  docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md
~~~

Read every hit and confirm it matches Task 1's literal outcome.

- [ ] **Step 5: Verify and commit the locked contract**

Run:

~~~bash
git diff --check
npx tsc --noEmit
npm test
git status --short
~~~

Expected: diff check and TypeScript exit 0, all tests pass, and only the design document is modified since Task 1.

Commit:

~~~bash
git add docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md
git commit -m "docs: 아임웹 실측으로 홈페이지 임베드 계약을 확정" \
  -m "W0에서 관찰한 폭·편집기 실행·CSP·Shadow 결과를 설계의 단일 정본으로 옮겨 이후 데이터·런타임·어드민 계획이 조건부 추측에 기대지 않게 한다." \
  -m "Co-Authored-By: Codex <noreply@openai.com>"
~~~

---

## W0 Completion Gate

Preview W0 is complete only when both tasks are committed, the worktree is clean, the working page is still unpublished and menu-hidden, Publish was never clicked, the probe is absent after editor and admin-preview reload, and the design says either:

- PREVIEW PASS — W1 implementation planning is unlocked with measured editorMode and allowKvFull values, while public launch remains blocked on release verification; or
- BLOCKED — W1 implementation planning remains stopped on named evidence, without a speculative workaround.

Do not write the W1 data, runtime, template, or admin implementation plans before this gate.
