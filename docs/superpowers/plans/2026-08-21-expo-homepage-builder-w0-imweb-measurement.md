# Expo Homepage Builder W0 Imweb Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Measure the real Imweb editor and private published page without production feature code, then lock the W1 width, editor-preview, script, Shadow DOM, and rollout gates with reproducible evidence.

**Architecture:** W0 is an independent subproject because its observations determine later implementation details. A disposable probe uses three layout-marker code widgets plus one controller widget on a duplicated, private, menu-unlinked Imweb page; it performs pinned CDN GETs and a DB-free Mach OPTIONS request, records sanitized JSON and cropped screenshots, then is removed. W1 data, runtime, and admin plans are written only after this measurement contract is committed.

**Tech Stack:** Imweb code widgets, classic JavaScript, open Shadow DOM, CSSOM, FontFace capability detection, Chrome with the user's existing authenticated session, Markdown/JSON evidence, Git

## Global Constraints

- This is a generic homepage-builder measurement. Do not use LA, an event deadline, or event-specific sample data.
- Use only the user's existing authenticated browser session and a duplicated/private Imweb test page that is not linked from an operating menu.
- Do not touch an operating page, global header code, site theme, domain settings, production menu, form, registration source, webinar, or competition.
- W0 starts no local dev server and performs no build, Prisma command, database query, database write, storage write, analytics call, beacon, form submission, cookie write, or business API request.
- Do not add a production probe endpoint. The probe may issue GET only to pinned jsDelivr assets and OPTIONS only to https://machstudio.vercel.app/f/__mach_expo_w0__.
- The Mach OPTIONS request is DB-free by repository contract: src/app/f/[id]/route.ts delegates OPTIONS directly to loaderOptions, and loaderOptions returns 204 before serveFormRuntime.
- Do not use /f/{id}, /w/{id}, /w/l/{slug}, /s/{id}, or another product loader as a probe; their GET paths touch product state or data.
- Never commit an Imweb admin URL, preview token, cookie, account name, HAR, full-window screenshot, or page content outside the probe crop.
- The test page stays private and menu-unlinked. Remove the probe widgets after evidence capture, but do not delete the test page automatically.
- Published-mode external classic-script failure, missing required Shadow/FontFace APIs, CSP exclusion of the canonical Mach origin, or inability to prove cleanup blocks W1.
- Editor-mode script failure alone does not block W1; it selects the explicit editor-placeholder contract.
- W1 may expose kv.full only when both published desktop and mobile meet the exact geometry threshold in Task 1.

---

## File Map

- Create: docs/superpowers/research/2026-08-21-imweb-w0/README.md — sanitized safety record, result matrix, verdict, and cleanup proof.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.json — exact 1440×1000 editor export.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.json — exact 390×844 editor export.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-desktop.json — exact 1440×1000 private-published export.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-mobile.json — exact 390×844 private-published export.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.png — probe-only crop.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.png — probe-only crop.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-desktop.png — probe-only crop.
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-mobile.png — probe-only crop.
- Modify: docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md — replace W0-dependent choices with measured decisions.
- Do not modify: src/**, prisma/**, public/**, scripts/**, package.json, package-lock.json, or environment files.

## Measurement Record Contract

Every JSON file uses this stable union. It intentionally omits location.href and all account/site identifiers. The no-execution branch is required when the editor or published page preserves HTML but does not run the controller; never invent a successful export.

~~~ts
type ExpoW0Record = ExpoW0Export | ExpoW0NoExecution;

interface ExpoW0Export {
  execution: "observed";
  runLabel:
    | "editor-desktop-1440x1000"
    | "editor-mobile-390x844"
    | "published-desktop-1440x1000"
    | "published-mobile-390x844";
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
    | "published-desktop-1440x1000"
    | "published-mobile-390x844";
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
  capabilities: {
    attachShadow: boolean;
    adoptedStyleSheets: boolean;
    FontFace: boolean;
    documentFonts: boolean;
    ResizeObserver: boolean;
    MutationObserver: boolean;
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

### Task 1: Measure the private Imweb page and preserve sanitized evidence

**Files:**
- Create: docs/superpowers/research/2026-08-21-imweb-w0/README.md
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-desktop.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-mobile.json
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-desktop.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/editor-mobile.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-desktop.png
- Create: docs/superpowers/research/2026-08-21-imweb-w0/published-mobile.png

**Interfaces:**
- Consumes: the approved design v2 §11 W0 contract, chrome:control-chrome, the user's existing Imweb login, data-mach-expo-w0-box markers.
- Produces: four ExpoW0Record files, four probe-only screenshots, a single PASS/BLOCKED decision, editorMode = render|placeholder, and allowKvFull = true|false.

- [ ] **Step 1: Connect to the existing browser without touching page state**

Use chrome:control-chrome. Before the first browser operation, follow that skill's browser selection and complete documentation-read requirements. Do not use standalone Playwright, a new profile, incognito mode, cookie inspection, or localStorage inspection.

Inspect visible tabs only. Select the already logged-in Imweb admin context. If authentication is missing, ask the user to sign in in that browser and stop. If more than one Imweb site is plausible and the intended site cannot be inferred from the focused tab, ask the user which site to use and stop.

- [ ] **Step 2: Prove the target is safe before the first write**

In the Imweb UI, verify all of the following from visible state:

1. The page is a duplicate or dedicated test page.
2. Its visibility is private.
3. It is absent from the operating menu.
4. Publishing that page does not publish unrelated site changes.
5. No global header, site theme, or domain change is needed.

If any item is unprovable, stop before editing. Do not create or duplicate a page automatically.

- [ ] **Step 3: Record the pre-install baseline**

At desktop 1440×1000, record:

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
    scrollWidth: document.documentElement.scrollWidth
  },
  capabilities: {
    attachShadow: typeof Element.prototype.attachShadow === "function",
    adoptedStyleSheets: "adoptedStyleSheets" in Document.prototype,
    FontFace: "FontFace" in window,
    documentFonts: "fonts" in document,
    ResizeObserver: "ResizeObserver" in window,
    MutationObserver: "MutationObserver" in window
  }
})
~~~

The baseline must show existingMarkers = 0 and hadProbeGlobal = false. If not, remove only a prior W0 probe after confirming it belongs to this task, reload, and repeat.

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

- [ ] **Step 6: Add the full-width marker code widget**

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

If Imweb has no distinct full-width section option, do not simulate one with global CSS. Record the literal result full-layout-unavailable and allowKvFull = false, then continue with standard and wide.

- [ ] **Step 7: Add the one-time controller code widget**

Create one additional private-page code widget and paste this exact controller. It uses a pinned parser-inserted dayjs GET, a pinned dynamically inserted dayjs GET, and a DB-free Mach OPTIONS request. It never sends business data.

~~~html
<div data-mach-expo-w0-controller
  style="display:block;padding:12px;background:#111827;color:#fff">
  <b>MACH W0 controller</b>
  <pre data-mach-expo-w0-dashboard
    style="white-space:pre-wrap;font:12px/1.4 monospace">Inline JavaScript not observed yet</pre>
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
        "margin:0;padding:8px;font:700 16px/1.4 Arial,sans-serif;" +
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
          className: String(parent.className || "").slice(0, 120),
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
      className: String(widget.className || ""),
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

  function sample(stage) {
    var item = {
      stage: stage,
      at: Math.round(performance.now()),
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: document.documentElement.clientWidth,
        documentOverflow: Math.max(
          0,
          document.documentElement.scrollWidth -
            document.documentElement.clientWidth
        )
      },
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
            viewport: item.viewport,
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
        capabilities: bag.capabilities,
        csp: bag.csp,
        cssEvents: bag.cssEvents.slice(-10)
      }, null, 2);
    }
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
    return JSON.stringify({
      execution: "observed",
      runLabel: runLabel,
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
      csp: bag.csp,
      cssEvents: bag.cssEvents,
      unhideTests: bag.unhideTests,
      samples: bag.samples
    }, null, 2);
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

- [ ] **Step 8: Save the private draft and measure editor desktop**

Keep the page private and unlinked. Save only the test-page changes. Wait 12 seconds after the editor reloads.

Capture the exact return value of:

~~~js
window.__MACH_EXPO_W0__?.export(
  "editor-desktop-1440x1000"
)
~~~

If the value is undefined, record that editor inline/controller execution is false. Separately record whether the three HTML markers and the parser script element remain in the editor DOM, whether the dayjs request appears, and whether the external response is 200 JavaScript. Do not fabricate an export.

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
  capabilities: {
    attachShadow:
      typeof Element.prototype.attachShadow === "function",
    adoptedStyleSheets:
      "adoptedStyleSheets" in Document.prototype,
    FontFace: "FontFace" in window,
    documentFonts: "fonts" in document,
    ResizeObserver: "ResizeObserver" in window,
    MutationObserver: "MutationObserver" in window
  }
}, null, 2)
~~~

Save only the exact sanitized record and crop the screenshot to the probe widgets.

- [ ] **Step 9: Measure editor mobile**

Switch the editor to its 390×844 mobile preview without changing page content. Reload, wait 12 seconds, and capture:

~~~js
window.__MACH_EXPO_W0__?.export(
  "editor-mobile-390x844"
)
~~~

If the editor does not execute scripts, record the same explicit false result and DOM/network evidence instead of a synthetic JSON export. Save the probe-only crop.

Use the Step 8 fallback expression with runLabel changed only to editor-mobile-390x844.

- [ ] **Step 10: Publish only the private test page**

Reconfirm the page is private and menu-unlinked immediately before publishing. Publish only that page. If Imweb indicates unrelated changes will be published, cancel and stop.

Open its private published view in a new tab. Do not use localhost or a dev harness.

- [ ] **Step 11: Measure published desktop**

At 1440×1000, reload, wait 12 seconds, and require all three of these script proofs:

1. The pinned dayjs response is 200 JavaScript.
2. parserExternalExecuted is true.
3. dynamicHeadExternalExecuted is true.

Capture:

~~~js
window.__MACH_EXPO_W0__?.export(
  "published-desktop-1440x1000"
)
~~~

If the controller is undefined, save the Step 8 fallback expression with runLabel published-desktop-1440x1000, mark the Published classic script gate BLOCKED, continue only to capture mobile evidence and clean up, and do not unlock W1.

If a widget still has visibility hidden or opacity 0 at t+2000, run:

~~~js
Promise.all(
  ["standard", "wide", "full"].map(function (label) {
    return window.__MACH_EXPO_W0__.testUnhide(label);
  })
)
~~~

Then export the desktop run again. Save the final JSON and probe-only crop.

- [ ] **Step 12: Measure published mobile**

At 390×844, reload, wait 12 seconds, and capture:

~~~js
window.__MACH_EXPO_W0__?.export(
  "published-mobile-390x844"
)
~~~

Save the exact JSON and probe-only crop. Record Console errors, CSP violations, the dayjs request status/MIME, the Mach OPTIONS status, and the main document's Content-Security-Policy response header in README.md. Do not save a HAR.

If the controller is undefined, save the Step 8 fallback expression with runLabel published-mobile-390x844 and keep the W1 verdict BLOCKED.

- [ ] **Step 13: Apply the pass/fail rules**

Use these exact rules:

| Gate | PASS | Result |
|---|---|---|
| Published classic script | parserExternalExecuted and dynamicHeadExternalExecuted are true in both published runs | False blocks W1 |
| Canonical Mach CORS | machCors is status 204, type cors, ok true | False blocks W1 |
| Canonical Mach CSP | No enforced script-src, connect-src, font-src, or fallback default-src rule excludes https://machstudio.vercel.app; no relevant securitypolicyviolation | Any exclusion blocks W1 |
| Required platform APIs | attachShadow, FontFace, documentFonts, ResizeObserver, MutationObserver are true | Any false blocks W1 |
| Shadow style stability | For each layout, shadow StyleSignature at raf2 and t+10000 is identical | Difference blocks W1 until explained and redesigned |
| Portal stability | At t+10000 portal remains fixed at 0,0, 1×1, visible, transform none, filter none | Difference blocks W1 until host defense is revised |
| wg_animated | Natural published state is visible by t+2000, or testUnhide returns visible with opacity 1 | Failure blocks W1 |
| Editor contract | Both editor scripts true means render; otherwise placeholder | Selects contract; does not alone block |
| kv.full | Full layout exists; in both published runs full.root.visibleWidth / viewport.clientWidth is at least 0.98, full.bleed clipLeft and clipRight are at most 2px, and documentOverflow is at most 2px | True enables kv.full; false withholds it |

Column remains the default W1 kv variant even if kv.full passes; full becomes an explicit variant only.

- [ ] **Step 14: Remove the probe and prove cleanup**

In each loaded probe context, run:

~~~js
window.__MACH_EXPO_W0__?.dispose()
~~~

Remove only the four W0 code widgets from the private test page, save, and publish that private page again. Reload editor and private published view, then require:

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

Expected: markers 0, controllers 0, portals 0, hasGlobal false after reload. Reconfirm private and menu-unlinked status. Do not delete the test page.

- [ ] **Step 15: Write the evidence README**

README.md must contain:

1. Measurement time and browser version, but no account or URL.
2. Literal safety-gate evidence: duplicated/private/menu-unlinked and no unrelated publish.
3. A four-run matrix for script preservation/execution, CSP/CORS, capabilities, and console errors.
4. A layout matrix for standard/wide/full with clientWidth, root width, visible ratio, clip, overflow, and blockers.
5. The editorMode and allowKvFull decisions.
6. The final W1 PASS or BLOCKED verdict with the exact failing gate names.
7. Cleanup proof and confirmation that the private page remains private and unlinked.
8. A note that actual self-host Pretendard and /h runtime requests must be reverified from the canonical Mach origin during W1 release; W0 only proves APIs, generic external classic execution, canonical-origin script/connect/font CSP inspection, and Mach OPTIONS CORS.

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
  -m "운영 페이지나 제품 로더를 건드리지 않고 비공개 복제 페이지에서 폭·스크립트·Shadow·CSP 계약을 측정해 W1의 전제를 추측이 아닌 증거로 바꾼다." \
  -m "Co-Authored-By: Codex <noreply@openai.com>"
~~~

---

### Task 2: Lock the measured decisions into the approved design

**Files:**
- Modify: docs/superpowers/specs/2026-08-21-expo-homepage-builder-design.md
- Verify: docs/superpowers/research/2026-08-21-imweb-w0/README.md

**Interfaces:**
- Consumes: Task 1 W1 verdict, editorMode, allowKvFull, four ExpoW0Record files, and cleanup proof.
- Produces: a design v2 whose W0 section and W1 gates contain only measured choices, ready for the data/runtime/admin implementation plans.

- [ ] **Step 1: Update the design status line**

If Task 1 is PASS, change the status to say W0 measurement complete and W1 planning unlocked. If Task 1 is BLOCKED, state W0 blocked and name the exact gate; do not unlock W1.

- [ ] **Step 2: Replace the W0 future-tense section with measured facts**

In §11 W0, link the research README and record:

- editorMode = render or placeholder;
- allowKvFull = true or false;
- exact standard/wide/full visible-width ratios;
- published classic-script verdict;
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
- If editorMode is placeholder, make the stable placeholder and published/our-preview verification path the only editor contract.
- Preserve the W1 release requirement to load the actual self-host Pretendard file and actual /h script from https://machstudio.vercel.app on the same private page before claiming complete isolation.

- [ ] **Step 4: Run the plan self-review checks**

Spec coverage:

- W0 private-page safety is linked to evidence.
- Standard/wide/full geometry has a measured outcome.
- Editor and private-published external classic execution have outcomes.
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

W0 is complete only when both tasks are committed, the worktree is clean, the private page is still private and menu-unlinked, the probe is absent after reload, and the design says either:

- PASS — W1 planning is unlocked with measured editorMode and allowKvFull values; or
- BLOCKED — W1 remains stopped on named evidence, without a speculative workaround.

Do not write the W1 data, runtime, template, or admin implementation plans before this gate.
