# Landing Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the deployed landing page TOC, session CTA, and FAQ card contrast without hardcoded theme-specific component colors.

**Architecture:** Keep the existing generated CSS architecture and add component-scoped semantic tokens. Synchronize each fixed TOC link with the section surface behind its vertical center so a section boundary can cross the navigation without creating a low-contrast item.

**Tech Stack:** TypeScript, CSS custom properties, Vitest, jsdom, Next.js 16

## Global Constraints

- Public landing colors derive from accent/text/surface tokens.
- Cards use shadow finishing instead of outlines.
- Preserve reduced-motion behavior and existing preview guards.
- Verify desktop and mobile layouts.

---

### Task 1: Add contrast regression tests

**Files:**
- Modify: `src/lib/landing/__tests__/bg-mode-css.test.ts`
- Create: `src/lib/landing/__tests__/toc-spy.test.ts`

**Interfaces:**
- Consumes: `LANDING_CSS`, `attachTocSpy(root, toc, sectionIds, mirror, topBg)`
- Produces: Regression coverage for component tokens and observer timing

- [ ] **Step 1: Write the failing CSS tests**

Assert that the dark TOC uses a paper-derived foreground, the session CTA uses a
session-local accent, and the light FAQ uses a white card with a compact two-layer shadow.

- [ ] **Step 2: Write the failing TOC timing test**

Install a fake `IntersectionObserver`, call `attachTocSpy`, and assert each link receives
the background mode at its vertical center and removes that state during cleanup.

- [ ] **Step 3: Run the focused tests**

Run: `npm test -- src/lib/landing/__tests__/bg-mode-css.test.ts src/lib/landing/__tests__/toc-spy.test.ts`

Expected: FAIL because the new tokens, selectors, and observer band do not exist.

### Task 2: Implement token-based contrast fixes

**Files:**
- Modify: `src/lib/landing/css.ts`
- Modify: `src/lib/landing/effects.ts`

**Interfaces:**
- Consumes: `--primary`, `--paper`, `--card`, existing background modes
- Produces: `--session-accent`, `--faq-card`, `--faq-shadow`, per-link TOC background modes

- [ ] **Step 1: Add component semantic tokens**

Add dark/light defaults for FAQ surface and shadow, plus a session-card-local accent mixed
from `--primary` and `--paper`.

- [ ] **Step 2: Apply the new tokens**

Use the paper-derived dark-mode TOC colors, `--session-accent` for session focus/CTA, and
FAQ-specific surface/shadow variables.

- [ ] **Step 3: Synchronize each TOC link surface**

On scroll and resize, compare each fixed link center with section rectangles and assign the
matching `data-bg`. Remove listeners and attributes during cleanup.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/lib/landing/__tests__/bg-mode-css.test.ts src/lib/landing/__tests__/toc-spy.test.ts`

Expected: PASS.

### Task 3: Verify the finished behavior

**Files:**
- Verify: `src/lib/landing/css.ts`
- Verify: `src/lib/landing/effects.ts`

**Interfaces:**
- Consumes: Implemented CSS and effect changes
- Produces: Test, type, and browser evidence

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: PASS with zero failed tests.

- [ ] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Rebuild the landing runtime**

Run: `npm run build:landing-runtime`

Expected: generated runtime includes the updated CSS and effect code.

- [ ] **Step 4: Verify desktop and mobile in a browser**

Open the local landing preview at 1440×1000 and 390×844. Confirm the TOC and session CTA
are readable, FAQ cards have crisp separation, and no horizontal overflow appears.
