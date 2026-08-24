# Expo Homepage Builder W1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `using-git-worktrees`, then `executing-plans` or `subagent-driven-development`, and apply `test-driven-development` plus `verification-before-completion` task by task. Track execution with checkbox (`- [ ]`) syntax. Read this entire plan, repository `AGENTS.md`, and the referenced local Next.js 16.2.6 guides before changing code.

**Goal:** Build the first private-preview implementation of the generic Expo homepage builder: six section types, page and section snippets, templates, a three-column admin editor, self-hosted Pretendard, and a Shadow DOM runtime that is not restyled by Imweb.

**Architecture:** `ExpoSite`, `ExpoPage`, and `ExpoTemplate` are an additive schema. Admin writes one normalized page draft and publishes an immutable snapshot; `/h/` serves only published/live content while `/hp/` renders the same React-free renderer with draft or published preview data and no Mach-owned write/analytics side effects. Every first-party visual—including the nested registration form and body-level overlays—renders inside an Expo-owned open ShadowRoot. A fail-closed, versioned schema capability keeps the menu/admin/preview unavailable until checked SQL is verified, and an independent server-only public-embed release flag keeps `/h/` and its seen beacon off until the later user-approved release gate.

**Tech Stack:** Next.js 16.2.6 App Router, React 19, TypeScript, Prisma 7/PostgreSQL, Supabase Storage, esbuild IIFE runtime, Vitest/jsdom, Playwright Chromium/WebKit, Shadow DOM, FontFace API, Pretendard Variable WOFF2

---

## Global Safety Locks

- This is a generic product. Do not introduce a city, venue, event date, pilot deadline, or event-specific seed content.
- The user explicitly prohibited public publication. Do not click Imweb Publish, change Imweb page permissions, add a production menu link, expose the working page, or claim that the public Imweb renderer has passed.
- Do not open Imweb at all during implementation. The W0 page is already clean and remains untouched until the separately authorized Public Embed Launch Gate.
- Do not start `next dev`, `next start`, a Vercel dev process, or another process capable of querying the shared database until the user confirms a no-live-broadcast window. Browser isolation tests must use the DB-free dual-origin fixture in Task 19.
- Never run `prisma db push`. Do not run `prisma migrate dev`, `prisma migrate deploy`, `prisma db execute`, the schema checker against a live URL, or any production/preview database write without a separate explicit approval.
- `main` auto-deploys. Do not merge or push W1 to `main` before the checked SQL is applied and verified. Code completion, database expansion, private code deployment, and public-embed/Imweb launch verification are four separate gates.
- Keep `EXPO_PUBLIC_EMBED_RELEASE` off in Production through code completion, schema expansion, deployment, and every private prelaunch check. It is deployment-scoped, not an instant kill switch: never turn it on temporarily for verification. Set it to `on` only as part of a separately authorized public-embed launch, and leave it off under the user's current no-publication instruction.
- Do not merge the Queue A worktree or another contributor's branch as part of W1. Start implementation from fresh `origin/main`; transplant only the reviewed W0 design/evidence/plan commits.
- Preserve the existing 10 partial unique indexes. The W1 schema adds no partial unique index.
- Keep the current public form, landing, competition, live-view, capture-source, and 52,000-record paths behaviorally unchanged. In particular, a standalone `/f/{sourceId}` must keep working after target-registry support is added.
- All first-party Expo page, section, form, modal, and navigation text uses the self-hosted Pretendard alias. The only font exception is third-party content inside the sandboxed `custom-code` iframe.
- `kv.full`, video, YouTube, page-tree depth 2 UI, SEO metadata copy helpers, W2 catalog types, and full-site migration dashboard are out of W1.
- Public rendering is always double-gated: a configuration toggle and real content. Missing, disabled, unpublished, non-live, or cross-project data is removed server-side, not merely hidden in the browser.
- Any deviation from `AGENTS.md` product UI principles must be recorded in the implementation summary with a one-line reason.

## Freshness and Next.js Contract

Implementation must not continue in the current W0 worktree because it is behind `main`.

- [ ] Fetch `origin/main` and record its commit.
- [ ] Create a fresh `codex/expo-homepage-w1` worktree from that exact commit using the `using-git-worktrees` skill.
- [ ] Resolve and cherry-pick the contiguous W0 documentation range beginning at `bf998c3` through the final reviewed W1-plan commit. Do not cherry-pick Queue A.
- [ ] Confirm the new worktree is clean, and record the new base and transplanted commit list in the execution log.
- [ ] Run the baseline gates without starting a server or touching the database:

```bash
npx tsc --noEmit
npx vitest run --exclude '.worktrees/**' src
```

Before changing a Next.js route or Server/Client boundary, reread these repository-local guides in the fresh worktree:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
- `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/public-folder.md`
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/headers.md`

The W1 code must preserve these Next 16 facts:

1. Dynamic `params` and page `searchParams` are promises and are awaited.
2. Route Handlers are uncached by default. `/h/` owns explicit CDN headers; `/hp/` is `force-dynamic`, `no-store`, and `noindex`.
3. This repository does not enable Cache Components. Use the existing caching model; do not add `cacheComponents` as part of W1.
4. Client components receive serializable values. Prisma objects, Storage clients, and auth/session helpers stay server-side.

## Deployment and Capability Sequence

The only allowed production sequence is:

```text
reviewed W1 branch with both capability flags off
  -> approved no-broadcast window
  -> read-only 10/10 partial-index baseline
  -> read-only Expo schema absent check
  -> checked SQL on direct :5432 session URL
  -> read-only Expo table/index/constraint verification
  -> read-only 10/10 partial-index verification
  -> set exact schema-capability version and merge/deploy W1 code
  -> admin + token preview become ready and menu appears
  -> authenticated Mach preview verification
  -> public embed remains off
  -> private prelaunch verification ends without exercising `/h`
  -> separate explicit public-embed launch authorization
  -> set public-embed release on and deploy a new canonical Production version
  -> verify actual `/h` and authenticated unpublished Imweb admin preview
  -> user performs any publication/menu change
```

If SQL verification fails, stop before code deployment. If code or an environment flag is deployed while the schema is unavailable, the catalog probe must still fail closed: no homepage menu, admin route unavailable, `/h/` harmless 404 script, `/hp/` 404, and admin mutations 404. A generated Prisma delegate is not proof that its table exists.

Environment values are immutable per deployment. A later `off` deployment does not erase an older deployment URL that was built with `on`, so Preview/deployment URLs are never canonicalized into snippets. Before launch, no deployment—Production or Preview—may be built with the public flag on. The launch deployment uses only validated `getRequiredExpoPublicOrigin()` output for snippets. Emergency rollback first clears every affected page `liveAt` and republishes every affected standalone section with `embedEnabled=false`, then promotes an off-safe deployment to the canonical Production alias, invalidates the canonical `/h` CDN objects where the platform permits it, protects or removes every superseded `on` deployment URL, and verifies the canonical origin. This is not a substitute for the user's Imweb menu rollback.

## File Map

The tasks below may split large components further, but may not collapse server-only, runtime, editor, and generated-code boundaries.

**Schema and readiness**

- Modify: `prisma/schema.prisma`
- Create: `supabase/migrations/20260821230000_expo_homepage_builder.sql`
- Create: `scripts/check-expo-schema.mjs`
- Create: `src/lib/expo/capability.ts`
- Create: `src/lib/expo/__tests__/capability.test.ts`
- Modify: `src/generated/prisma/**` through `npx prisma generate`

**Shared color contract**

- Create: `src/lib/color.ts`
- Create: `src/lib/__tests__/color.test.ts`
- Later, in a confirmed no-broadcast window, modify: `src/lib/competition-render.ts`, `src/app/webinar/[slug]/LiveContentStk.tsx`, `src/lib/landing/model.ts`, `src/lib/landing/mount.ts`, `src/lib/notice/mount.ts`, `src/lib/webinar-loader-script.ts`, their direct importers, and affected generated runtimes.

**Expo model and services**

- Create: `src/lib/expo/types.ts`
- Create: `src/lib/expo/registry.ts`
- Create: `src/lib/expo/config.ts`
- Create: `src/lib/expo/model.ts`
- Create: `src/lib/expo/readiness.ts`
- Create: `src/lib/expo/payload.ts`
- Create: `src/lib/expo/template.ts`
- Create: `src/lib/expo/auth.ts`
- Create: `src/lib/expo/request.ts`
- Create: `src/lib/expo/origin.ts`
- Create: `src/lib/expo/site-service.ts`
- Create: `src/lib/expo/template-service.ts`
- Create: `src/lib/expo/media.ts`
- Create tests under: `src/lib/expo/__tests__/`

**Admin APIs**

- Create: `src/app/api/expo/route.ts`
- Create: `src/app/api/expo/[siteId]/route.ts`
- Create: `src/app/api/expo/[siteId]/pages/route.ts`
- Create: `src/app/api/expo/[siteId]/regenerate-preview-token/route.ts`
- Create: `src/app/api/expo/pages/[pageId]/route.ts`
- Create: `src/app/api/expo/pages/[pageId]/publish/route.ts`
- Create: `src/app/api/expo/pages/[pageId]/live/route.ts`
- Create: `src/app/api/expo/[siteId]/media/route.ts`
- Create: `src/app/api/expo/templates/route.ts`
- Create: `src/app/api/expo/templates/[templateId]/route.ts`
- Create: `src/app/api/expo/templates/[templateId]/instantiate/route.ts`
- Create route tests beside the routes or under `src/app/api/expo/__tests__/`.

**Shadow runtime and generated bundle**

- Create: `src/lib/collect-form/target-registry.ts`
- Modify: `src/embed/form-entry.ts`, `src/app/f/[id]/loader.ts`, `src/lib/collect-form/mount.ts`, `src/lib/collect-form/lookup-mount.ts`, `src/lib/collect-form/css.ts`
- Modify/regenerate: `src/generated/form-runtime.ts`
- Create: `src/lib/expo/expo-shell.css`
- Create: `src/lib/expo/shell-css.ts` (generated; do not hand-edit)
- Create: `src/lib/expo/css.ts`
- Create: `src/lib/expo/font.ts`
- Create: `src/lib/expo/shadow.ts`
- Create: `src/lib/expo/overlay.ts`
- Create: `src/lib/expo/mount.ts`
- Create: `src/lib/expo/view-page.ts`
- Create: `src/lib/expo/view-sections.ts`
- Create: `src/lib/expo/custom-code.ts`
- Create: `src/lib/expo/form-bridge.ts`
- Create: `src/embed/expo-entry.ts`
- Create: `scripts/build-expo-shell-css.mjs`
- Create: `scripts/build-expo-runtime.mjs`
- Modify: `scripts/runtime-hash.mjs`
- Create: `src/generated/expo-runtime.ts`
- Modify: `src/lib/__tests__/embed-runtime.test.ts`
- Modify: `src/lib/__tests__/embed-runtime-loads.test.ts`
- Modify: `package.json`, `package-lock.json`

**Pretendard asset**

- Create: `public/fonts/pretendard/v1.3.9/PretendardVariable.woff2`
- Create: `public/fonts/pretendard/v1.3.9/OFL.txt`
- Create: `scripts/check-expo-font.mjs`
- Modify: `next.config.ts`

**Public routes**

- Create: `src/app/h/[pageId]/loader.ts`
- Create: `src/app/h/[pageId]/route.ts`
- Create: `src/app/h/[pageId]/s/[sid]/route.ts`
- Create: `src/app/hp/[token]/route.ts`
- Create: `src/app/api/expo-embed/seen/route.ts`
- Modify: `src/proxy.ts`

**Admin UI**

- Create: `src/app/(app)/homepage/layout.tsx`
- Create: `src/app/(app)/homepage/page.tsx`
- Create: `src/app/(app)/homepage/new/page.tsx`
- Create: `src/app/(app)/homepage/[siteId]/page.tsx`
- Modify: `src/app/(app)/layout.tsx`
- Create: `src/components/expo/ExpoEditorShell.tsx`
- Create: `src/components/expo/ExpoNavigator.tsx`
- Create: `src/components/expo/ExpoPageTree.tsx`
- Create: `src/components/expo/ExpoSectionNavigator.tsx`
- Create: `src/components/expo/ExpoSectionCatalog.tsx`
- Create: `src/components/expo/ExpoPageSettings.tsx`
- Create: `src/components/expo/ExpoSectionEditor.tsx`
- Create: `src/components/expo/ExpoSlotEditor.tsx`
- Create: `src/components/expo/ExpoMediaField.tsx`
- Create: `src/components/expo/ExpoLinkField.tsx`
- Create: `src/components/expo/ExpoSourceField.tsx`
- Create: `src/components/expo/ExpoCodeField.tsx`
- Create: `src/components/expo/ExpoPreviewPane.tsx`
- Create: `src/components/expo/ExpoThemeEditor.tsx`
- Create: `src/components/expo/ExpoSnippetPanel.tsx`
- Create: `src/components/expo/ExpoTemplatePanel.tsx`
- Create: `src/components/expo/ExpoMigrationChecklist.tsx`
- Create: `src/components/expo/ExpoProjectSync.tsx`
- Create: `src/lib/expo/editor.ts`
- Create: `src/lib/expo/snippets.ts`
- Create component tests under `src/components/expo/__tests__/`
- Modify: `src/components/layout/sidebar.tsx`

**DB-free browser verification**

- Create: `src/app/dev/expo-harness/page.tsx`
- Create: `src/app/dev/expo-editor-harness/page.tsx`
- Create: `scripts/expo-browser-fixture.mjs`
- Create: `playwright.config.ts`
- Create: `tests/expo-hostile.spec.ts`
- Create: `tests/expo-form-bridge.spec.ts`
- Modify: `.github/workflows/ci.yml`

---

### Task 1: Freeze shared color math without touching live consumers

**Files:** `src/lib/color.ts`, `src/lib/__tests__/color.test.ts`

- [ ] Write failing table tests for six-digit hex normalization, invalid values, uppercase/lowercase equivalence, the existing YIQ 0.78 foreground threshold, and `paperFor` on light/dark boundary colors. Include fixtures copied from the current implementations so a later import-only migration cannot change output.
- [ ] Implement and export `normalizeHexColor`, `isHexColor`, `onAccentColor`, and `paperFor` in a browser-safe, React-free module. Do not edit current live consumers in this task.
- [ ] Use this module from new Expo code only. This creates the shared source before a third copy appears while deferring live-screen import changes.
- [ ] Run:

```bash
npx vitest run src/lib/__tests__/color.test.ts
npx tsc --noEmit
```

- [ ] Commit: `refactor: 홈페이지 테마가 쓸 색 계산 계약을 고정`

### Task 2: Add the additive schema, checked SQL, and fail-closed capability gate

**Files:** `prisma/schema.prisma`, `supabase/migrations/20260821230000_expo_homepage_builder.sql`, `scripts/check-expo-schema.mjs`, `src/lib/expo/capability.ts`, `src/lib/expo/__tests__/capability.test.ts`

- [ ] Write failing pure tests for `deriveExpoCapabilities({ schemaFlag, publicFlag, schemaProbeReady }): { admin, preview, publicEmbed }`, then async orchestration tests for `getExpoCapabilities(): Promise<{ admin, preview, publicEmbed }>`. `admin` and `preview` require the exact server-only `EXPO_SCHEMA_CAPABILITY=20260821-v1` plus a successful cached catalog probe; `publicEmbed` additionally requires `EXPO_PUBLIC_EMBED_RELEASE=on`. Missing/wrong flags, missing schema objects, or query errors all fail closed. A wrong schema flag short-circuits without querying the catalog.
- [ ] Add `ExpoSite`, `ExpoPage`, and `ExpoTemplate` exactly as approved in design §2—including `ExpoPage.draftRevision Int @default(0)`—plus backrelations on `Workspace`, `Project`, and `CollectSource`. Add no existing-table column and no partial unique index.
- [ ] Add one atomic checked migration: `BEGIN`, plain `CREATE` of the three tables, exact foreign keys/delete actions/defaults and exact regular/unique indexes, then enable RLS on all three tables, revoke all table privileges from `PUBLIC`, `anon`, `authenticated`, and the unused Data API `service_role`, and `COMMIT`. Create no RLS policy: Expo table access is server-route/Prisma only. Do not revoke the table owner/direct server database role. Do not use `IF NOT EXISTS`; a partial or wrong pre-existing schema must abort instead of being silently accepted. The SQL contains no drop/truncate/update/delete and does not alter an existing table.
- [ ] Implement `scripts/check-expo-schema.mjs` with `pg`, not an `Expo*` Prisma delegate. Require an explicit URL, support `--expect=absent` and `--expect=ready`, inspect exact columns/nullability/defaults/FK actions/index definitions, require `relrowsecurity=true` on all three tables, zero Expo RLS policies, and no table privileges for `PUBLIC`, `anon`, `authenticated`, or `service_role`; emit capability version `20260821-v1`, and also report the existing partial unique indexes as `10/10`.
- [ ] Implement the catalog probe in `server-only` code with one safe `pg_catalog` query and `unstable_cache`. Key it with `20260821-v1`, set an explicit short revalidation interval, cache only successful ready/not-ready fingerprints, and let query errors reject so the outer resolver returns false without persisting an exception as a long-lived false. It verifies the same versioned object/RLS/ACL fingerprint, never queries on every request, and never calls an `Expo*` Prisma delegate before readiness is known. Export a pure `isExpoPublicEmbedReleaseEnabled()` so public handlers can reject an off flag before rate-limit/catalog/model work. Every `getExpoCapabilities` caller awaits the promise.
- [ ] Validate/generate without connecting to a database:

```bash
npx prisma validate
npx prisma generate
npx vitest run src/lib/expo/__tests__/capability.test.ts
npx tsc --noEmit
```

- [ ] Do **not** set either environment flag, execute SQL, or run the live checker. Commit: `feat: 스키마 준비 전 홈페이지 기능을 닫아 둠`

### Task 3: Define the React-free section registry and normalization source of truth

**Files:** `src/lib/expo/types.ts`, `src/lib/expo/registry.ts`, `src/lib/expo/config.ts`, `src/lib/expo/model.ts`, `src/lib/expo/readiness.ts`, `src/lib/expo/payload.ts`, `src/lib/expo/__tests__/config.test.ts`, `src/lib/expo/__tests__/model.test.ts`, `src/lib/expo/__tests__/readiness.test.ts`

- [ ] Write failing tests for all six W1 types and allowed variants: `kv(column|minimal)`, `textblock(statement|prose|twocol)`, `cardgrid(multicolumn)`, `toolbox(tiles|strip)`, `register-form(inline|cta)`, and `custom-code(boxed|full)`. Assert that `kv.full` is absent.
- [ ] Cover the seven slot kinds (`text`, `textarea`, `media`, `link`, `list`, `sourceRef`, `code`), default values, list item recursion, `keepEmptyRows`, required-row removal, and immutable `sid`.
- [ ] Test normalization as a total function: malformed input never throws, unknown types are dropped, unknown variants downgrade to the first registered variant, non-HTTP links are removed, six-digit theme colors normalize, every W1 media slot accepts images only (no video/embed), and custom code is capped at 20 KB. A persisted section `sid` must be a nonempty UUID and unique within the page: strict write validation rejects invalid/duplicate IDs, while the defensive read normalizer keeps the first valid occurrence and drops invalid/later duplicates without inventing identity. New editor sections and template instantiation use `crypto.randomUUID()`; ordinary normalization never changes a valid sid.
- [ ] Test localized storage and server resolution separately. Storage stays a `Localized` map; the public payload contains strings for one locale. Import `toLocalized` and `safeHttpUrl`; do not copy their logic.
- [ ] Bound untrusted JSON before it can inflate a generated loader: at most 40 sections per page, 100 rows per list slot, 500 characters per text slot, 20 KB per textarea/code slot, 512 KiB UTF-8 per page draft, 50 active pages per site, and 2 MiB per template snapshot. Request validation strictly rejects oversize values with structured field errors before normalization. The total normalizer may defensively clamp malformed already-stored/legacy scalar values so it never throws, but a write API may not silently truncate accepted input. Enforce the template cap on both save and instantiate.
- [ ] Implement `hasContent`, `derivePageState`, home-page creation defaults, slug derivation/collision suffixing, and page/section render filtering in the same registry-driven model. `readiness.ts` derives publish/live/snippet issues from that model; `payload.ts` is the only public localization/source-resolution boundary.
- [ ] `payload.ts` batches unique internal page IDs and source references. A `page:{id}` link resolves only to a non-deleted page in the same site with a valid `imwebUrl`; otherwise it becomes empty and yields a nearby readiness issue. Never serialize the full page/source record or another site's URL.
- [ ] Assert toggle plus data gates for every W1 type, preserved line breaks, `embedEnabled` orthogonality, multiplicity/placement (`kv` one and first, `toolbox` one, `register-form` one), and `isHome` pinned semantics. A standalone section ignores page `liveAt` and section `enabled`, but requires the published section's `embedEnabled` and `hasContent`; a full page requires published + live + enabled/contentful sections.
- [ ] Run targeted tests and `tsc`; commit: `feat: 홈페이지 섹션 계약과 발행 상태를 단일화`

### Task 4: Lock template sanitization and ID/link remapping

**Files:** `src/lib/expo/template.ts`, `src/lib/expo/__tests__/template.test.ts`

- [ ] Write failing recursive tests for `design` and `full` snapshots. Strip `sid`, database IDs, `draftRevision`, `sourceRef` at any depth, preview tokens, Imweb URLs, `liveAt`, `published`, and `lastSeen*`; `design` also strips content and restores registry defaults.
- [ ] Give every template page a local `key`; preserve exactly one `isHome`, parent relationships through `parentKey`, sort order, type/variant/design, and ordinary external HTTPS links.
- [ ] Convert `page:{oldPageId}` to `template-page:{key}` at save and to `page:{newPageId}` at instantiate. Clear direct HTTP links that resolve to the original site's or page's Imweb URL and emit an `internalLinksNeedReview` checklist flag.
- [ ] Instantiate all site/page/section IDs and the preview token anew; initialize every page `draftRevision=0`, force `liveAt=null`, `published=null`, and every `embedEnabled=false`, then re-run `normalizeExpoConfig`.
- [ ] Keep the approved template snapshot shape unchanged: W1 does not store `defaultLocale` in a template, and every instantiated W1 site starts with `defaultLocale="ko"`. Localized content maps in `full` mode remain intact for later locale UI work.
- [ ] Test collisions, missing parents, multiple homes, malformed snapshots, future version rejection, and input immutability.
- [ ] Run targeted tests and `tsc`; commit: `feat: 템플릿이 이전 전시 식별자를 가져가지 않게 함`

### Task 5: Make template media independent with compensating cleanup

**Files:** `src/lib/expo/media.ts`, `src/lib/expo/__tests__/media.test.ts`

- [ ] Write failing tests with a fake Storage adapter for Mach-owned URL recognition, workspace/site prefix ownership, URL deduplication, external URL pass-through plus warning, template-path copy, site-path copy, and refusal to remove outside the exact owned prefix.
- [ ] Reuse the existing asset bucket contract and upload-time downscale helpers. Do not use Supabase image transformation URLs.
- [ ] Implement recursive media URL rewriting by registry slot definitions, not arbitrary string search.
- [ ] Expose an operation result containing copied object paths and a cleanup function. If copy or the later DB transaction fails, remove only objects created by that operation; if cleanup fails, log orphan paths and return failure to the user.
- [ ] Test template hard-delete cleanup and ensure original site objects are never deleted.
- [ ] Run targeted tests and `tsc`; commit: `feat: 홈페이지 템플릿 미디어 수명을 원본과 분리`

### Task 6: Centralize ownership and admin data mutations

**Files:** `src/lib/expo/auth.ts`, `src/lib/expo/request.ts`, `src/lib/expo/site-service.ts`, `src/lib/expo/__tests__/auth.test.ts`, `src/lib/expo/__tests__/request.test.ts`, `src/lib/expo/__tests__/site-service.test.ts`

- [ ] Write failing tests for unauthenticated 401, non-member 403 on workspace-list operations, and 404 for resource IDs belonging to another workspace/project. Detail resources are authoritative; never substitute `currentProject` from the sidebar.
- [ ] Centralize session/membership lookup, `requireOwnedProject`, `requireOwnedSite`, `requireOwnedPage`, and `requireOwnedTemplate`. Return narrow data objects rather than leaking Prisma records into client code.
- [ ] Freeze a decision-complete role truth table in tests. A current `WorkspaceMember` is mandatory; a stale `ProjectMember` never grants access after workspace removal. Workspace `OWNER|ADMIN` always has effective project `ADMIN` and is not downgraded by a project row. Workspace `MEMBER` defaults to effective `EDITOR` when no project row exists; an explicit project `VIEWER|EDITOR|ADMIN` overrides that default. Effective `VIEWER` may read, `EDITOR|ADMIN` may edit drafts/create/upload/save a template/instantiate into that target project, and only effective project `ADMIN` may publish, toggle live, rotate tokens, or delete project-owned site/page data. Workspace-global template rename/permanent delete is limited to workspace `OWNER|ADMIN`; target-project `ADMIN` alone is insufficient. Foreign or no-longer-member detail resources return opaque 404; an owned resource with insufficient role returns 403.
- [ ] Derive and return one narrow permission DTO—`{ canEdit, canPublish, canManageSite, canManageTemplates }`—from that truth table for list/detail/new responses, plus a separate safe `release: { publicEmbedEnabled:boolean }` boolean from the awaited server capability. Clients use these only to present the correct read/edit/launch-locked zone; every service still reauthorizes and rereads capability. Never serialize raw membership rows or infer permissions from the sidebar's current project.
- [ ] Put create/update/delete/publish/live operations in a service layer so routes stay transport-only and tests can inject a fake repository.
- [ ] Centralize a same-origin mutation guard. Every authenticated Expo `POST`, `PATCH`, and `DELETE` requires an `Origin` that exactly matches the normalized request origin, rejects cross-site `Sec-Fetch-Site`, accepts no admin CORS preflight, and enforces the route's exact media type (`application/json` or image-upload multipart). Test missing/malformed/mismatched origins and content types before auth/service work. Public `/h` OPTIONS and seen remain on their separate explicit CORS contract.
- [ ] Blank site creation must transactionally create the site plus exactly one pinned home page, normalized draft, a 24-byte base64url preview token, and no public state. Page creation never accepts `isHome`; all site page mutations lock the owning site row before checking home/order invariants. A parent, when present in later data, must belong to the same site.
- [ ] Give `ExpoPage` a dedicated integer `draftRevision @default(0)`. Page editor updates normalize on the server, compare-and-swap on the supplied integer, atomically increment it, and return the new `revision`, canonical draft/published digests, and `hasUnpublishedChanges`; do not use `updatedAt`, because seen/live/publish/order writes are independent and must not make autosave conflict. Return 409 plus the fresh canonical page only for a real editor-path conflict. W1 never auto-merges or retries a whole-page draft after 409; it preserves the local draft and requires an explicit operator resolution. Publish reloads and copies the normalized DB draft—never a request-body snapshot—into `published` and timestamps it.
- [ ] A site-theme write rechecks exposure in the same transaction. With zero active page/standalone-section exposure, effective `EDITOR` may autosave it. With any `liveAt` page or published `embedEnabled=true` section, require `canPublish` and an exact `confirmPublicThemeChange:true`; otherwise return 409/403 without changing the theme. Client-only confirmation is not the security boundary.
- [ ] Treat exposure-enabling mutations as release-gated server actions. While `EXPO_PUBLIC_EMBED_RELEASE` is off, reject `liveAt` null→set and any draft change or publish that would turn a section's `embedEnabled` false→true; the UI disables those controls with an inline launch-lock explanation. Turning live/section exposure off is always allowed. Live-on additionally requires a published snapshot and at least one renderable section. Once the launch lock is open it is one click after visible inline preconditions, with no second confirmation modal. The launch preflight must prove zero pre-armed `liveAt` pages and zero published `embedEnabled=true` sections before the first `on` deployment, so the flag alone cannot expose prepared content.
- [ ] Site/page deletion is W1 soft deletion. Home cannot be deleted independently; a non-home parent with active children returns 409. Deleting a page sets `liveAt=null`, `deletedAt`, and an ID-suffixed tombstone slug so the human slug becomes reusable; deleting a site soft-deletes all of its pages and clears every `liveAt` in one transaction. Count only `deletedAt=null` rows toward the 50-page cap. All admin/public queries require both site and page `deletedAt=null`. Restore, physical purge, Storage reclamation, and future parent purge semantics are explicitly deferred and must be listed in the release handoff rather than half-wired into an existing cron.
- [ ] Site/theme/source changes validate that project and `CollectSource` belong to the same workspace/project. Draft writes reject an invalid register-form `sourceRef` with a field-local error; public resolution revalidates defensively. Both accept only a same-project, non-deleted `CollectSource.mode === "builder"`; capture-mode, deleted, or foreign values never reach stored accepted draft/public payload.
- [ ] Run targeted tests and `tsc`; commit: `feat: 홈페이지 수정 권한을 URL 자원 소속으로 고정`

### Task 7: Expose the guarded admin CRUD and publish APIs

**Files:** all admin routes listed in File Map except media/templates, plus route tests

- [ ] Write route tests before each handler. Mock auth, capability, and services; do not import a live Prisma client in tests.
- [ ] Every route awaits dynamic params, awaits `getExpoCapabilities()`, checks `.admin` before using an `Expo*` delegate, returns opaque JSON 404 when false, and uses the centralized ownership contract. Every mutation applies the Task 6 same-origin/media-type guard before auth or body parsing.
- [ ] Implement:
  - `GET/POST /api/expo`
  - `GET/PATCH/DELETE /api/expo/{siteId}`
  - `POST/PATCH /api/expo/{siteId}/pages` for create and atomic reorder
  - `POST /api/expo/{siteId}/regenerate-preview-token`
  - `GET/PATCH/DELETE /api/expo/pages/{pageId}`
  - `POST /api/expo/pages/{pageId}/publish`
  - `POST /api/expo/pages/{pageId}/live` with `{ live: boolean }`
- [ ] Read each JSON body once with the Task 3 byte caps, then parse and normalize text length, slug, URLs, page draft, and theme at the input boundary. Put validation feedback in structured field errors usable inline by the editor. Site list/detail responses contain active-page summaries only, never 50 drafts; the selected page endpoint returns that one page's draft/published metadata.
- [ ] Assert cross-project and cross-workspace resource IDs return 404, home cannot be deleted/reordered away from first, publish while saving is a client concern but stale revision conflicts are a server 409 with fresh canonical data, and soft-deleted resources are invisible. A conflict response is never retried automatically; page-draft CAS writes are editor-path scoped, while reorder and theme use independent endpoints and never receive an old whole record.
- [ ] Run route tests and `tsc`; commit: `feat: 홈페이지 초안·발행·공개 API를 준비 상태 뒤에 둠`

### Task 8: Implement transactional template APIs

**Files:** `src/lib/expo/template-service.ts`, `src/app/api/expo/templates/route.ts`, `src/app/api/expo/templates/[templateId]/route.ts`, `src/app/api/expo/templates/[templateId]/instantiate/route.ts`, route tests

- [ ] Write failing route/service integration tests for list/create/rename/delete/instantiate, `design` default, explicit `full`, cross-workspace template/project 404, and malformed snapshot rejection.
- [ ] Preallocate template/site/page IDs before Storage copy. Copy owned media first, then perform one Prisma transaction; on failure invoke Task 5 compensation. Never report success if compensation fails.
- [ ] Instantiate exactly one home, parent links, sort order, internal page links, new tokens, normalized drafts, and all private gates. Return the reconnect checklist for source references, internal links, external media lifetime, and Imweb URLs.
- [ ] Permanent template delete validates/lists its exact owned prefix, hard-deletes the authorized DB row, then removes only those objects. If post-commit Storage cleanup fails, return `{ deleted:true, cleanupPending:true }` with 202, log the exact orphan prefix, and show a cleanup warning; never leave a DB template whose snapshot points to media already deleted by a failed DB operation.
- [ ] Run targeted tests and `tsc`; commit: `feat: 홈페이지 템플릿 저장과 비공개 복제를 완성`

### Task 9: Add image-only Expo upload with upload-time downscaling

**Files:** `src/app/api/expo/[siteId]/media/route.ts`, route tests, minimal shared-media changes only if tests require them

- [ ] Write failing tests for auth/capability/site ownership, allowed image MIME and a 4 MiB source limit below the Vercel Function request ceiling, MIME/magic mismatch, corrupt decode, excessive pixel dimensions, GIF/SVG/video rejection, downscale invocation/failure, post-scale byte/edge ceiling, final extension, cache control, and `{workspaceId}/expo/{siteId}/{uuid}` ownership.
- [ ] Define an Expo-only strict validator for JPEG/PNG/WebP at at most 4 MiB. Decode metadata with Sharp using a bounded input-pixel limit, require actual format to match declared MIME, positive dimensions, and safe dimension/pixel ceilings; reject corrupt/spoofed/GIF/SVG/video inputs before Storage. Reuse `downscaleUpload` and `extensionForContentType` without changing their shared fail-open behavior, then revalidate the returned bytes and require longest edge ≤1600 plus stored bytes ≤1.5 MiB. If the helper falls back and misses either ceiling, reject instead of storing the original. Reuse `ensureAssetBucket`, but do not import `validateLandingMedia`, `IMAGE_PRESETS`, or `transformedImageUrl`, and do not call a Supabase transformation URL. Use a process-free exact Storage-origin/prefix helper for ownership and serve only the verified upload-time-downscaled object URL.
- [ ] Return a stable `{ url, width?, height?, bytes? }` shape and field-local Korean errors.
- [ ] Run image tests, existing downscale/media tests, and `tsc`; commit: `feat: 홈페이지 이미지를 업로드 시점에 안전하게 축소`

### Task 10: Vendor Pretendard and build the Shadow-only stylesheet contract

**Files:** font assets/checker, `next.config.ts`, `src/lib/expo/origin.ts`, `src/lib/expo/expo-shell.css`, `src/lib/expo/shell-css.ts`, `src/lib/expo/css.ts`, `src/lib/expo/font.ts`, `scripts/build-expo-shell-css.mjs`, related tests

- [ ] Vendor the fixed official Pretendard Variable v1.3.9 WOFF2 and OFL 1.1 text under the versioned directory. Record its SHA-256 in `scripts/check-expo-font.mjs`; reject a changed file, missing license, or an unpinned external URL.
- [ ] Implement server-only `getRequiredExpoPublicOrigin()` now, before any preview/loader task. Wrap `getPublicAppOrigin()` and require exact equality to `EXPO_CANONICAL_PUBLIC_ORIGIN`, an origin-only absolute HTTPS URL, Production scope, and a host that is not the current Preview/generated deployment host. It returns a typed configuration failure—never an empty/relative/request-derived fallback. Unit-test injected env combinations.
- [ ] Add exact font response headers in `next.config.ts` for `/fonts/pretendard/v1.3.9/:path*`: `Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`, and immutable one-year cache. Add that exact versioned prefix to the proxy's unauthenticated allowlist; `public/` defaults to `max-age=0` and WOFF2 is not currently excluded by the matcher. Do not add a global stylesheet or external font preload.
- [ ] Write `expo-shell.css` using only `.msx-*` selectors inside the render root. Reject `html`, `body`, `:root`, `slot`, `::part`, `rem`, external `@import`, and `@font-face` in a static test.
- [ ] Make `build-expo-shell-css.mjs` generate the TypeScript string deterministically with normalized line endings and a source hash. The sync test must fail if the CSS source changes without regeneration. `build:expo-runtime` must invoke `build:expo-shell-css` first, and the aggregate embed build must preserve that dependency so stale CSS can never be baked into a fresh IIFE.
- [ ] Implement one window-backed FontFace registry promise for family `__mach_expo_pretendard_v1`, weight `400 900`, using the absolute Mach origin supplied by the server payload. Within a bounded timeout, execute `const loaded = await face.load(); document.fonts.add(loaded)` exactly once; rejection or a hung request reveals safe fallback content but marks the runtime status as failed. Never use `local()` or a CDN.
- [ ] Set all first-party text, controls, form descendants, overlays, and registration numbers to the alias; use `font-variant-numeric: tabular-nums` for registration numbers.
- [ ] Run font checker, CSS static/sync tests, and `tsc`; commit: `feat: 홈페이지 서체와 스타일을 자체 Shadow 경계에 고정`

### Task 11: Add explicit form targets while preserving standalone `/f`

**Files:** `src/embed/form-entry.ts`, `src/app/f/[id]/loader.ts`, `src/lib/collect-form/target-registry.ts`, `src/lib/collect-form/mount.ts`, `src/lib/collect-form/lookup-mount.ts`, `src/lib/collect-form/css.ts`, `src/lib/expo/form-bridge.ts`, `scripts/runtime-hash.mjs`, `src/generated/form-runtime.ts`, existing/new form tests

- [ ] Write failing tests for registry records `{ container, styleRoot, mode, disposeSignal }`, identity `sourceId:form:mode:instanceKey`, same source mounted twice, destroyed targets, missing target fallback, and `preview-draft`/`preview-published` side effects equal to zero. Keep `FormBootConfig.view` exclusively for its existing `form|check` meaning; the new field is `mode: live|preview-draft|preview-published`.
- [ ] Put targets in a versioned window-backed registry such as `window.__MACH_FORM_TARGETS_V1__`; a module-local Map cannot be shared by separately bundled Expo and form IIFEs. Export `registerFormTarget`, `getFormTarget`, and unregister cleanup from `target-registry.ts`.
- [ ] Refactor form and lookup style installation to accept `Document | ShadowRoot`. Existing standalone `/f` and `/f/check` continue to install once in document head; Expo installs once inside the supplied ShadowRoot and inherits `--msx-font`.
- [ ] Change `.msf` to `font-family:var(--msx-font, <the exact existing standalone stack>)`; keep standalone appearance through the fallback. Change `.msf-regno` to inherit that family and use tabular numerals instead of the current monospace override. Tests must prove every Expo form descendant resolves to the Pretendard alias while standalone fallback stays unchanged.
- [ ] Export `bootInto`. Change `__msForm.boot(payload, bootScript?)` to synchronously capture `bootScript ?? document.currentScript` and its `dataset.msFormTarget`; with a key, resolve the window-backed record and call `bootInto`; without a key, execute the exact existing marker-discovery path.
- [ ] Split form-root survival by mount mode. The explicit Shadow target path must use `root.isConnected` (or an equivalent composed-root check), never `document.contains(root)`: unrelated document mutations cause no remount, actual detach cleans up once, and a later Expo re-entry registers a new instance target. Preserve the standalone `/f` document-marker watcher unchanged. Test all three transitions and prove they do not consume the five-remount cap spuriously.
- [ ] Update `/f/[id]/loader.ts` to pass `document.currentScript` explicitly to the new boot signature, then regenerate and commit `FORM_RUNTIME_JS`. Add an esbuild-metafile parity test: the form runtime's hashed source manifest must equal the complete sorted metafile input closure, including existing transitive competition/legal files and the new target registry. A missing input is a hard stale-test failure.
- [ ] Expo registers a target before adding a classic `/f/{sourceId}` script to `document.head`, puts the key in `data-ms-form-target`, and removes the script on load/error. It must never put the script inside ShadowRoot.
- [ ] Target metadata is the only preview truth. Preview blocks submit persistence, analytics/dataLayer, seen, and redirect while keeping local validation and current read-only checks. Live preserves the current submit path exactly once and never leaks into a sibling target.
- [ ] Run all collect-form config/mount/runtime tests, generated-bundle stale tests after rebuild, and `tsc`; commit: `feat: 등록 폼을 홈페이지 Shadow target에 안전하게 연결`

### Task 12: Build the Shadow host, overlay, and six section renderers

**Files:** `src/lib/expo/shadow.ts`, `overlay.ts`, `mount.ts`, `view-page.ts`, `view-sections.ts`, `custom-code.ts`, `form-bridge.ts`, jsdom tests

- [ ] Write jsdom tests first for an open ShadowRoot per light-DOM host, stylesheet via `adoptedStyleSheets` with root-local `<style>` fallback, no document-head styles, re-entry into the same root, destroy cleanup, and a 5-remount-per-minute observer cap.
- [ ] Apply the approved inline-important host geometry reset without overriding the outer container's available width. Reset host/portal `transition` and `animation` to `none!important` so hostile cascades cannot animate geometry. Keep all content in `renderRoot` after `all:initial`, then set `direction:ltr; unicode-bidi:isolate` explicitly for the W1 Korean/default-locale contract; expose no slot or part.
- [ ] Detect zero-width/hidden/clipping outer-ancestor limitations without persistence: set a bounded `data-msx-host-status` on the light-DOM host and emit one deduplicated console warning. The admin shows a static explanation of these host limitations; W1 does not add an API or claim a dynamic persisted diagnostic.
- [ ] Build body-direct overlay hosts with their own ShadowRoot, stylesheet, ref count, `isConnected` cleanup, and shadow-chain deep-focus detection. No first-party modal or fixed navigation may render in body light DOM.
- [ ] Render the six W1 types with DOM constructors/`h()` only, preserving user line breaks and respecting `prefers-reduced-motion`. Cards/buttons/active controls use shadow rather than decorative borders.
- [ ] `register-form.inline` mounts its target in the section ShadowRoot. `register-form.cta` opens the form only in the Expo body-level Shadow portal, traps/restores deep focus, and destroys its target/script/listeners when closed; no form DOM is allowed in body light DOM.
- [ ] `custom-code` creates an iframe through DOM APIs, assigns raw code only to `iframe.srcdoc`, uses `sandbox="allow-scripts allow-popups allow-forms"`, omits `allow-same-origin`, and clamps reported height to 40–5000 px. Verify both `message.source === iframe.contentWindow` and a per-frame random channel; ignore all other messages.
- [ ] In Mach/token preview, custom code is visible as an inert placeholder until the operator explicitly chooses `외부 코드 미리보기 실행` for that session. The editor reloads `/hp` with `customCode=run`; the server converts only that query into `preview.allowCustomCode=true`. Explain inline that third-party requests/trackers may run despite sandboxing. Live rendering executes automatically. Automated/manual verification uses harmless local fixture code only.
- [ ] Test clean page, section-only, three sections, empty/disabled content, hostile host sentinel preservation, iframe late resize, spoofed messages, and cleanup. Keep `src/lib/expo` inside the existing host-mounted HTML-string ban; add no exception.
- [ ] Run targeted jsdom/static tests and `tsc`; commit: `feat: 홈페이지 여섯 섹션을 Shadow DOM 안에서만 렌더`

### Task 13: Add the Expo runtime as the sixth generated IIFE and stale guards

**Files:** `src/embed/expo-entry.ts`, `scripts/build-expo-runtime.mjs`, `scripts/runtime-hash.mjs`, `src/generated/expo-runtime.ts`, runtime tests, `package.json`

- [ ] Write failing stale-hash and bundle-smoke tests before generating output. Extend the Task 11 metafile-versus-manifest parity guard to all six generated IIFEs; each source hash covers the complete sorted esbuild input closure plus build options. The Expo closure includes every runtime-imported Expo file, shared DOM builder, color helper, form bridge dependency, and generated shell stylesheet.
- [ ] Record the inventory correction in code comments/tests: Expo is the fifth product pipeline in the design, but latest `main` already has five entry/generated files, so Expo becomes the sixth generated IIFE artifact.
- [ ] Implement `window.__msExpo`/`window.__MACH_EXPO__` boot registry with stable instance key `pageId:{sid|page}`, safe `boot(payload, bootScript?)` current-script/marker lookup, shared constructed stylesheet/font promises, widget unhide, warning-only failure, and cleanup.
- [ ] Build with esbuild as a browser IIFE, ensure no `process.env` remains, normalize line endings, and commit the generated TypeScript string plus source hash.
- [ ] Add `build:expo-shell-css` and make `build:expo-runtime` run it before esbuild; include the Expo build in `build:embed-runtimes`, `prebuild`, and `predev` through the aggregate script. Add a test that fails if the package-script dependency is removed. Do not change existing runtime order unless tests prove a dependency.
- [ ] Extend the innerHTML ban to `src/lib/expo` and add Expo bundle smoke checks. `iframe.srcdoc` is allowed; host `innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` remain banned.
- [ ] Add static/load guards proving the IIFE contains no `process.env`, never imports `src/lib/app-url.ts`, has no external/local font source, and contains no literal `</script>` before it can be embedded by `/hp`.
- [ ] Run:

```bash
npm run build:expo-runtime
npx vitest run src/lib/__tests__/embed-runtime.test.ts src/lib/__tests__/embed-runtime-loads.test.ts
npx tsc --noEmit
```

- [ ] Commit: `feat: 홈페이지 임베드를 독립 생성물로 배포 가능하게 함`

### Task 14: Serve live page/section loaders and the seen beacon

**Files:** `/h/` routes/loader, seen route, route tests, `src/proxy.ts`

- [ ] Write route tests for OPTIONS 204, CORS, IP-only rate-limit before product DB lookup, schema/public-release capability false, unknown/deleted IDs, unpublished versus published-waiting state, disabled/empty section, origin DB failure, ETag/304, and script-safe payload serialization. Comments must never contain the requested ID. A public-release-off response and seen no-op are constant and explicitly `Cache-Control: private, no-store` so an off state cannot inherit a cached live body.
- [ ] Use one common loader body. Select only needed columns, resolve/localize on the server, validate every source reference against the site's project, and omit content that fails publish/live/section gates.
- [ ] If the pure server-only public-release check is off, return the constant no-store script before rate-limit/catalog/model work. When it is on, apply the IP limiter first, then await the cached schema capability probe, then use any Expo model. OPTIONS remains 204 while disabled.
- [ ] After public capability succeeds, require `EXPO_CANONICAL_PUBLIC_ORIGIN` through `getRequiredExpoPublicOrigin()` before building payload/font/seen URLs. Invalid or Preview-scoped origin configuration returns a non-cacheable 503 and never falls back to a relative URL or request host; add route tests.
- [ ] Return bundle plus `__msExpo.boot(jsonForScript(payload), document.currentScript)` with `ETag`, `Cache-Control: public, max-age=0, must-revalidate`, `CDN-Cache-Control: public, s-maxage=60, stale-while-revalidate=86400`, `Access-Control-Allow-Origin: *`, and `X-Content-Type-Options: nosniff`. A real miss/unpublished item returns a constant short-cache comment; an unexpected DB failure returns non-cacheable 503 so CDN cannot replace stale content with a false 404.
- [ ] A published page with `liveAt=null` returns runtime plus `page:null, connectionOnly:true`: it acquires the intended host and renders no visible content. A known published section that is currently disabled/empty uses the same harmless-null handshake. This preserves preattachment observability without leaking draft/published content.
- [ ] Among Expo request routes, add `/h/`, `/hp/`, and exact `/api/expo-embed/seen` to the public proxy allowlist, preserving the exact versioned font exemption from Task 10. Do not expose `/api/expo/*` admin CRUD.
- [ ] Implement seen POST with a capped, single-read text parser, IP-only limiter, BOT_UA filter, and a server-derived safe origin. Cross-origin runtime transport serializes JSON to a plain string, calls `navigator.sendBeacon(url, json)` without a Blob/custom header, and uses a headerless `fetch(..., { method:"POST", body:json, keepalive:true, credentials:"omit" })` fallback so it remains a CORS-simple request; assert no preflight. It updates only `lastSeenAt/lastSeenOrigin` on a published, non-deleted site/page after successful host acquisition, even for connection-only waiting state; preview and unpublished/missing routes never send it. Tests prove this write does not change `draftRevision`. `lastSeenAt` means “a page or section snippet belonging to this page was observed,” not specifically that the full-page snippet is attached.
- [ ] Assert public release off causes harmless `/h` 404 and seen 204/no-op without an Expo delegate query; preview never calls seen and malformed bodies/origins are not stored. Run route/runtime tests and `tsc`; commit: `feat: 발행된 홈페이지와 섹션만 캐시 가능한 로더로 제공`

### Task 15: Serve token previews as direct HTML with the actual generated runtime

**Files:** `src/app/hp/[token]/route.ts`, preview model/tests

- [ ] Write tests for IP-only rate limit before catalog/model lookup, invalid/revoked token 404, page not belonging to token site 404, missing/invalid canonical origin 503, draft default, `?published=1`, inert custom code by default, explicit `?customCode=run&codeDigest=...`, `?container=standard|wide` with standard default, and preview flag propagation. Every 200/404/429/503 response has `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and CSP `frame-ancestors 'self'`.
- [ ] Implement a force-dynamic Route Handler, await params, and parse the URL query. A wrong schema-version flag returns 404 without work; when requested, rate-limit by IP before the cached catalog probe and any Expo delegate. Require `getRequiredExpoPublicOrigin()` for the payload/font URL; invalid/missing canonical origin returns the same hardened no-store 503 and never falls back to request host. Build the same resolved payload shape as `/h/`, but allow draft and never require `liveAt`/`embedEnabled` for editor preview. Keep the document shell neutral; the actual generated runtime attaches each visual to its ShadowRoot and registers the one document FontFace promise.
- [ ] Follow the existing `/cp` direct-HTML precedent: return a minimal HTML document containing meta viewport, a body with inline `margin:0`, a simulation wrapper, the actual committed `EXPO_RUNTIME_JS`, a host, and one `__msExpo.boot(jsonForScript(payload), document.currentScript)` call. Keep head style/font links at zero. The standard wrapper is `calc(100% - 30px)` centered (1410/1440 and 360/390); wide is 100%. Do not build a React preview renderer or copy section markup. Assert the generated runtime cannot close the inline script early.
- [ ] Compute the normalized custom-code digest on the server. `allowCustomCode` is true only when `customCode=run` and `codeDigest` exactly matches the current page digest; a stale/missing digest is inert. Emit a runtime-ready message carrying the page/digest/channel after the opted-in iframe mounts so the editor can gate publish for that exact candidate without persisting execution permission.
- [ ] In preview mode only, accept `mach-expo-preview-theme` from the exact parent source, exact Mach origin, current page ID, and channel; normalize and apply it in-memory without a write. Ignore it in live mode and on any mismatch. Selection and custom-code-ready messages use the reverse direction with the same tuple.
- [ ] On Shadow section click, post `{ type:"mach-expo-select-section", pageId, sid, channel }` to the parent. The channel comes from the preview URL/query and is echoed only; no Mach database or analytics side effect occurs. The separately confirmed custom-code opt-in remains the documented third-party network exception.
- [ ] Run preview tests and `tsc`; commit: `feat: 초안과 발행본을 같은 홈페이지 렌더러로 미리봄`

### Task 16: Build the capability-gated homepage list and creation flow

**Files:** `src/app/(app)/layout.tsx`, sidebar, homepage layout/list/new pages, `ExpoProjectListLoader.tsx`, `ExpoProjectSync.tsx`, tests

- [ ] Write component tests for menu hidden when the server prop is false and visible only when `expoHomepageEnabled` is true. A false capability must not leave a clickable blank menu item or perform a client readiness fetch.
- [ ] Make `(app)/layout.tsx` explicitly `force-dynamic`, await the cached server capability at request time, and pass `expoHomepageEnabled` to `Sidebar`; test it cannot be frozen into the build output. Do not add a `NEXT_PUBLIC_*` flag or a client capability fetch. Homepage layout and every API/public handler still gate independently; hidden navigation is not authorization.
- [ ] Add `/homepage` as a capability-tagged nav item and filter the common nav array using the server prop from `(app)/layout.tsx`.
- [ ] Make `homepage/layout.tsx` server-check readiness before rendering. Because current project selection hydrates from client storage, `ExpoProjectListLoader` waits for workspace/project context, fetches using a `workspaceId:projectId` generation plus `AbortController`, and ignores every late response after a switch. Show a calm loading/empty state and one primary action. If exactly one active site exists, use `router.replace` to its detail unless `?list=1` is present; provide a detail-level `모든 사이트` link using that escape so browser Back cannot loop forever. Test project/workspace switches and stale-response suppression.
- [ ] `/homepage/new` shows `빈 사이트` and workspace-owned `템플릿` as direct choices, with `design` explained as the default. It creates private data only; no publish/live/Imweb action.
- [ ] Consume the server permission DTO. A viewer gets the calm read-only list/detail state with no create/instantiate affordance; do not let a hidden button be the only guard. `canEdit` owns draft/page/section create-edit-upload, template save, and target-project instantiate; `canPublish` owns publish/live/token controls; `canManageSite` owns site/page delete; `canManageTemplates` owns workspace-template rename/permanent delete. Add one component test per permission boundary.
- [ ] In detail entry, fetch ownership by URL `siteId`, then sync the sidebar project to that site. If the user later changes project while detail is open, navigate to the list rather than continuing to mutate the old site invisibly.
- [ ] Run component/page tests and `tsc`; commit: `feat: 준비된 워크스페이스에만 홈페이지 진입점을 노출`

### Task 17: Build the three-column direct-manipulation editor

**Files:** `src/app/(app)/homepage/[siteId]/page.tsx`, `src/components/expo/*`, `src/lib/expo/use-page-autosave.ts`, component/hook tests

- [ ] Start with tests for the three zones: left navigator, center editor, right preview. At desktop they are adjacent; smaller widths collapse preview deliberately without hiding editable center values.
- [ ] Drive interaction from the server permission DTO. With `canEdit=false`, render values as a calm read-only zone and mount no autosave, reorder, upload, or editable field handlers. Gate site/page deletion separately on `canManageSite`, publish/live/token on `canPublish`, and template rename/delete on `canManageTemplates`; explain role boundaries inline. Server authorization remains authoritative.
- [ ] Freeze deep-linkable editor views: `view=page`, `view=section:{sid}`, `view=theme`, `view=templates`, and `view=migration`, always paired with `page={pageId}`. Mount the draft editor with `key={page.id}` so queued state cannot cross a page switch.
- [ ] Left: theme/pages/sections/templates/migration navigation, pinned home, status dots from `derivePageState`, drag/keyboard reorder, immediate `+ 페이지` creation and name focus, and 5-second undo for draft page/section deletion. Each section row always exposes drag handle, localized type label, variant select, `enabled` toggle, and content/status indicator; `enabled` is the full-page inclusion control, not the standalone snippet gate.
- [ ] Make `+ 섹션` open an inline catalog containing all six registry-driven types with Korean label, one-sentence purpose, allowed variants, and disabled reason when a multiplicity constraint is reached. Creating one assigns a fresh immutable `sid`, copies registry defaults without shared object references, inserts `kv` at index 0 and all other types after the current selection, selects the new row, focuses its first editable field, and schedules autosave. Test the one-`kv`/first-only, one-`toolbox`, one-`register-form`, 40-section, keyboard, and empty-site paths.
- [ ] Center: selected section header always exposes the same `variant`, `enabled`, standalone `embedEnabled`, and `design.bg` controls before every zero-click slot field. Keep duplicate row/header controls synchronized through one draft source. Explain `enabled` versus `embedEnabled` inline; `release.publicEmbedEnabled=false` makes `embedEnabled` launch-locked and sends no enabling write. Generate slots mechanically from registry kinds; nested lists use `EditableList`, stable `ROW_KEY`, and row-scoped upload targets. Variant changes preserve content.
- [ ] Use one Expo-specific page autosave state machine for selected-page title/slug/imwebUrl/draft and aggregate independent page-order saves through `AutosaveScope`. Strip editor-only `ROW_KEY`s recursively. Keep `draftRevision` in a transport-only ref, never in the serialized hook value: a 200 advances the ref/baseline without causing a second PATCH. A 409 stops autosave without retry, preserves the local draft, and shows the returned canonical revision with explicit `서버 내용으로 다시 불러오기`/local-copy guidance; W1 never auto-merges a whole-page JSON draft. Typing during an in-flight successful save schedules exactly one subsequent latest-value save with the new revision. Page switching flushes and awaits the current page or stays put on failure/conflict. Test 200=one PATCH, revision-only response=no PATCH, in-flight typing, 409=no retry, and page-switch flush writes only the original page ID.
- [ ] Keep section and page deletion in one editor-level pending set but use distinct commit paths. `EditableList.onPendingRemoveChange` covers draft section rows: undo emits no mutation and expiry changes the draft and emits exactly one autosave `PATCH`. A page-navigator pending-delete wrapper holds the page without editing another page's draft: undo emits no mutation and expiry emits exactly one `DELETE /api/expo/pages/{pageId}` for the Task 6 soft delete. Arm a page deletion only after the editor and page-order `AutosaveScope` flushes and is idle; failure or 409 does not start the countdown. Freeze editing while pending. After DELETE success for the selected page, unmount its keyed editor before `router.replace` to home or the first active fallback; on DELETE failure restore the row and prior selection. While either 5-second removal is pending, block publish/live/reorder/page switching and show why; a publish click emits no request. Test both expiry paths, both zero-request undo paths, selected/non-selected page deletion, pre-arm flush failure/conflict, no PATCH/DELETE race, delete→publish blocked, success fallback, failure restoration, and action re-enable only after the pending operation settles.
- [ ] Put field validation below its input before submit, preserve text line breaks, and show `내용이 없어 나가지 않아요` next to the responsible slots. Read request/config limit errors back into the nearest field/section rather than a generic toast.
- [ ] Right: iframe `/hp/` preview with collapse, fixed desktop/mobile content viewports 1440/390, and `container=standard|wide` using the W0 measured ratios with standard default. The outer same-origin Mach preview iframe is deliberately unsandboxed; only nested third-party custom-code frames receive the strict sandbox. Validate preview messages by `event.source`, exact Mach preview origin, current page ID, and per-iframe random channel before selecting a section. Browser tests hold `innerWidth` at 1440 or 390 while the root rect changes 1410↔1440 or 360↔390.
- [ ] Keep custom-code preview inert by default. Key the explicit per-session opt-in by current `pageId + normalizedCustomCodeDigest`; append `customCode=run&codeDigest=...`, rotate the channel, and reload only for that key. Any code edit, page change, editor close/reopen, or digest mismatch returns to inert mode. When a page contains custom code, disable publish until the exact iframe/source/origin/channel emits the opted-in runtime-ready digest for the current candidate; test stale ready messages and autosave reloads cannot carry permission to changed code.
- [ ] Use `ColorField` for at most accent/light/dark, but wrap it with an Expo-local draft so incomplete/invalid hex stays visible with inline error and never reaches persistence. Do not use its event-specific preset default. Show derived swatches immediately. With zero exposed pages/sections, valid theme changes autosave. If any page has `liveAt` or any published section has `embedEnabled=true`, keep theme changes staged locally, send a channel-validated preview-only theme override to `/hp`, and require `canPublish` plus explicit 적용→확인 before one PATCH carrying `confirmPublicThemeChange:true`. Cancel discards the staged values and restores canonical preview; switching preview pages keeps the site-wide staged override until apply/cancel; the service rechecks exposure in the write transaction. Test both branches, cancel, 409/live-state race, direct missing-confirm rejection, and page switching. Public ON itself remains one click after inline preconditions.
- [ ] Add restrained hover/press/focus/loading/saved motion and respect reduced motion. Cards/buttons/active controls finish with shadow, not decorative outlines.
- [ ] Run editor tests and `tsc`; commit in reviewable slices if needed, each slice green. Final task message: `feat: 홈페이지를 탐색·편집·미리보기 3열로 직접 조작`

### Task 18: Finish templates, snippets, publish/live controls, and migration guidance

**Files:** `ExpoTemplatePanel.tsx`, `ExpoSnippetPanel.tsx`, `ExpoMigrationChecklist.tsx`, associated tests

- [ ] Test template save modes, instantiate reconnect checklist, permanent template delete confirmation, and external-media warning.
- [ ] Use Task 10's `getRequiredExpoPublicOrigin()` for snippets. Missing/mismatched configuration returns a structured inline setup error and generates no snippet or relative `<script src>`. Use stable page ID/sid, never slug or `window.location.origin`; add component tests for empty, HTTP, relative, Preview, mismatched, and canonical origin results.
- [ ] Before first publish, show `발행 후 복사할 수 있어요`. After publish but before launch, allow copying and say the public loader remains disabled and connection cannot be verified yet. Recommend at most three section snippets on one Imweb page.
- [ ] Label connection state accurately: `lastSeenAt` means at least one page/section snippet for that page acquired its host. Do not claim that it proves the full-page snippet or a public visitor rendered content.
- [ ] Split the transition checklist at the real authorization boundary. Private prelaunch is Mach preview -> publish with every exposure gate off -> copy canonical snippet, then stop. Only the explicit Public Embed Launch Gate continues with a read-only exposure-zero audit while the flag is still off -> first `on` deployment -> one named unpublished Imweb embed-only test page -> guarded page/section enable -> authenticated admin-preview connection check -> exposure cleanup -> user-controlled publication/menu decision. The current UI must show the launch-locked stop instead of inviting an unavailable action.
- [ ] Explain the cache tradeoff next to rollback: a healthy origin reflects live-off normally within about 60 seconds, while stale-on-origin-failure may retain the last public response for up to one day. Restoring the Imweb menu link is the immediate rollback when visibility cannot wait.
- [ ] Always state that the Imweb editor shows a placeholder. While the release flag is off, Mach `/hp` is the current W1 verification surface; authenticated Imweb admin preview becomes available only inside the later Public Embed Launch Gate. Do not state that public Imweb has passed.
- [ ] Publish/live controls use one primary action at a time and visible inline preconditions. Once launch-unlocked, public ON is one click without a second modal; reserve confirmation for deletion, permanent template removal, and published-theme/recovery-impacting changes. Respect `canManageTemplates/canPublish`; while the public release flag is off, show live/section-exposure controls as launch-locked and send no enabling mutation.
- [ ] Run tests and `tsc`; commit: `feat: 홈페이지 템플릿·스니펫·전환 절차를 한 흐름으로 연결`

### Task 19: Add DB-free hostile CSS browser verification

**Files:** `package.json`, `package-lock.json`, `playwright.config.ts`, fixture/harness/spec files

- [ ] Add `@playwright/test` as a dev dependency. Define `test:expo-browser` to run the Chromium project and `test:expo-browser:webkit` to run the WebKit project explicitly; neither script starts Next.
- [ ] Add a CI step that installs pinned Playwright Chromium/WebKit dependencies and runs both `test:expo-browser` and `test:expo-browser:webkit`. It must not receive or require `DATABASE_URL`; the fixture is the only web server.
- [ ] Implement one Node fixture process with two loopback origins: host/Imweb simulation and Mach asset simulation. Extract and serve the exact committed `EXPO_RUNTIME_JS` and `FORM_RUNTIME_JS` string values plus the vendored font with production-equivalent CORS/MIME/cache headers; browser tests may not substitute an in-memory entry rebuild. A separate parity gate freshly builds each entry and compares byte/hash plus complete esbuild metafile inputs to the committed constants/manifests. The fixture imports no Prisma/auth code and makes no external request.
- [ ] The Mach fixture serves a deterministic `/f/{fixtureId}` loader using the committed form runtime plus boot payload. Register-form browser tests never require a real `CollectSource` or shared database.
- [ ] Serve clean, hostile-before, and hostile-after pages for page, section, three-section, duplicate-form, and custom-code cases. The exact-isolation suite attacks universal elements, headings, text, links, buttons, inputs, both light-DOM hosts, and late-added styles with `!important`, including `direction:rtl`, `unicode-bidi:bidi-override`, and geometry-changing transition/animation, while holding the provided outer width/visibility constant. A separate ancestor-limitation suite constrains or hides outer ancestors and must verify detection/diagnostics, containment, and portal escape behavior—not impossible pixel/geometry identity.
- [ ] In Chromium and WebKit at 320, 480, 768, 960, and 1440 px, compare clean versus exact-isolation hostile computed font family/size/weight/color/line-height/letter-spacing/text-transform/direction/unicode-bidi/padding/border/background, bounding boxes, and same-run element screenshots. Assert `direction:ltr`, `unicode-bidi:isolate`, host transition/animation reset, and the expected design tokens so two equally wrong renders cannot pass; do not rely only on a pixel image. For the ancestor-limitation suite, assert the runtime respects the available width, does not overflow, sets the bounded host-status attribute/emits one warning for hidden/clipped/zero-width ancestors, and never claims it can override a parent `display:none`, width cap, or clipping context.
- [ ] Assert open roots, no global style/font link, no slot/part/rem, host sentinels unchanged, font weights 400–900 available, registration tabular numerals, external font requests zero, and one shared WOFF2 request for three sections.
- [ ] Browser-test the real `currentScript` form key, two same-source independent targets, script removal, standalone fallback, preview side effects zero, live action exactly once, custom-code height clamp/source validation, and destroy/re-entry cleanup.
- [ ] `src/app/dev/expo-harness/page.tsx` uses fixture data and returns `notFound()` in production. It is for a later approved manual session; automated tests use the dual-origin server only.
- [ ] Run Playwright without a Next server, then unit/runtime gates. Commit: `test: 아임웹 적대 스타일에도 홈페이지 모양이 같음을 검증`

### Task 20: Switch existing color consumers in an approved no-broadcast window

**Hard checkpoint:** Stop and ask the user to confirm there is no live broadcast. Approval to write code or keep Imweb private is not approval for this window.

**Files:** existing color consumers/importers and their tests

- [ ] Re-run the Task 1 fixture tests and current live/landing/notice/competition tests before edits.
- [ ] Replace duplicate implementations with imports from `src/lib/color.ts`; do not change call sites or values. Delete only the superseded private/exported functions.
- [ ] Preserve existing exported names through direct re-exports where callers depend on them. Rebuild every generated runtime whose esbuild metafile now includes `src/lib/color.ts`—including form/landing/competition/notice as reported by the actual closure—and update its manifest; the metafile-parity test, not a hand-written guess, defines the affected set.
- [ ] Run targeted live-view, landing, notice, competition, runtime, and color tests plus full `tsc`/Vitest. Do not start a server.
- [ ] Review the diff as an import-only/mechanical behavior-preserving change. Commit separately: `refactor: 공개 화면 색 계산 중복을 동작 변화 없이 제거`

### Task 21: Verify code completion without database, deployment, or Imweb publication

- [ ] Regenerate all committed artifacts and require a clean diff after the second generation:

```bash
npm run build:embed-runtimes
npm run build:embed-runtimes
node scripts/build-expo-shell-css.mjs --check
node scripts/check-expo-font.mjs
npx prisma validate
npx prisma generate
git diff --check
git status --short
```

- [ ] Run full static/unit/browser gates without a Next server:

```bash
npx tsc --noEmit
npx vitest run --exclude '.worktrees/**' src
npm run test:expo-browser
npm run test:expo-browser:webkit
npm run lint -- --max-warnings=0 \
  src/lib/expo src/lib/color.ts src/lib/collect-form/target-registry.ts \
  src/lib/collect-form/mount.ts src/lib/collect-form/lookup-mount.ts src/lib/collect-form/css.ts \
  src/embed/expo-entry.ts src/embed/form-entry.ts 'src/app/h/**' 'src/app/hp/**' \
  'src/app/api/expo/**' src/components/expo 'src/app/(app)/homepage/**' \
  'src/app/(app)/layout.tsx' src/proxy.ts next.config.ts \
  scripts/build-expo-runtime.mjs scripts/build-expo-shell-css.mjs \
  scripts/check-expo-schema.mjs scripts/check-expo-font.mjs
npx eslint --max-warnings=0 \
  --rule 'react-hooks/set-state-in-effect: off' src/components/layout/sidebar.tsx
```

The sidebar override suppresses its one pre-existing line-114 diagnostic only; do not add another disabled rule or a new synchronous state-setting effect. All new files stay on the unmodified rule set.

- [ ] Search for forbidden leaks and regressions: private Imweb URLs/tokens/account identifiers, event/location-specific copy, `window.location.origin` in new admin code, external font URLs, `local(`, `rem`, slot/part, host HTML-string APIs, `allow-same-origin` in the nested custom-code path, and `/api/expo` accidentally public in proxy. The intentionally unsandboxed outer `/hp` iframe must not weaken the nested iframe rule.
- [ ] Run an independent code review focused separately on tenancy/data integrity, runtime/style isolation, and editor/direct-manipulation behavior. Fix all high/medium findings and rerun affected gates.
- [ ] Write a release handoff containing exact branch/commit, generated artifact hashes, tests, remaining manual checks, and four explicit non-actions: SQL not applied, main not merged, Imweb not opened, nothing published.
- [ ] Do not claim W1 released. Commit: `docs: 홈페이지 W1 검증과 비공개 릴리스 절차를 고정`

---

## Production Expansion Gate — Separate User Approval Required

This section is not authorized by approving implementation. When the user explicitly approves a no-broadcast database window:

- [ ] Confirm production and preview connection targets without printing secrets.
- [ ] Run the existing partial-index checker read-only and record `10/10`.
- [ ] Run `scripts/check-expo-schema.mjs --expect=absent` and stop if the state is anything else.
- [ ] Execute only `supabase/migrations/20260821230000_expo_homepage_builder.sql` through a direct PostgreSQL session URL on port 5432.
- [ ] Run `scripts/check-expo-schema.mjs --expect=ready` read-only and verify capability version `20260821-v1`, all three tables, columns, indexes, uniques, foreign keys, RLS enabled, zero policies, and no `PUBLIC`/`anon`/`authenticated`/`service_role` table privileges.
- [ ] Re-run the partial-index checker and record `10/10`.
- [ ] Stop on any mismatch. Do not repair with `db push`.
- [ ] Only after green database verification may the user authorize setting `EXPO_SCHEMA_CAPABILITY=20260821-v1` plus the validated canonical HTTPS `EXPO_CANONICAL_PUBLIC_ORIGIN` and merge/deploy. Keep `EXPO_PUBLIC_EMBED_RELEASE` off in every scope.

The approved operator uses this shape only after resolving the secret outside logs:

```bash
test -n "$EXPO_SESSION_DATABASE_URL"
node -e 'const u=new URL(process.env.EXPO_SESSION_DATABASE_URL); if (u.port !== "5432") process.exit(1)'
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/ensure-partial-unique-indexes.mjs
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=absent
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" npx prisma db execute \
  --file supabase/migrations/20260821230000_expo_homepage_builder.sql
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=ready
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/ensure-partial-unique-indexes.mjs
```

## Private Prelaunch Verification Gate — Separate User Approval Required

After deployment, with `EXPO_PUBLIC_EMBED_RELEASE` still off and without opening or publishing Imweb:

- [ ] Verify authenticated Mach admin list/editor and token `/hp` preview against a temporary private Expo site.
- [ ] Verify the actual HTTPS self-host font response headers, CORS, MIME, immutable cache, rendered font alias in `/hp`, and zero external font requests. This does not exercise `/h` or prove Imweb rendering.
- [ ] Re-run the DB-free hostile CSS suite against the deployed committed runtime and record that `/h` still returns the constant no-store disabled response before rate-limit/catalog/model work.
- [ ] Delete or soft-delete private test records through the reviewed admin path as appropriate. Leave the public flag off and state that actual `/h` plus authenticated Imweb integration remain unproven.

## Public Embed Launch Gate — Explicit Launch Authorization Required

This gate is not a temporary test window. It is forbidden under the user's current no-publication instruction. Only after the user explicitly authorizes enabling the public embed for launch:

- [ ] Confirm no prior Preview or Production deployment was built with `EXPO_PUBLIC_EMBED_RELEASE=on`, `EXPO_CANONICAL_PUBLIC_ORIGIN` resolves only to the canonical Production origin, and a read-only exposure audit proves zero active `liveAt` pages and zero published `embedEnabled=true` sections.
- [ ] Scope `EXPO_PUBLIC_EMBED_RELEASE=on` to Production only and keep Preview/Development off. Disable Rolling Releases, pause competing auto-deploy/merge promotion, require immediate 100% canonical alias promotion, and verify Standard Deployment Protection makes every generated/legacy deployment URL return 401/403 while the canonical public origin remains reachable. Record the protection/retention policy for superseded `on` deployments.
- [ ] Build the first `on` deployment and atomically promote it to the canonical Production alias. Keep the flag on as the launch state; do not use a protected/ephemeral Vercel Preview URL in Imweb code.
- [ ] Through guarded admin mutations, enable only the named unpublished test site's intended page/section. Verify actual HTTPS `/h`, self-host font headers, CORS, MIME, immutable cache, rendered font alias, zero external font requests, page/section loaders, and seen behavior.
- [ ] With the user's existing authenticated Imweb session, use only a menu-hidden, unpublished test page and authenticated admin preview. Do not change page permissions or click Publish. Verify editor placeholder plus desktop/mobile admin preview for page, section, three-section, register-form, custom-code, hostile-before/after, and cleanup.
- [ ] Before ending the verification session, turn the test page `liveAt` off and publish every tested section with `embedEnabled=false`; verify the exposure audit returns zero again, then remove every temporary widget and verify zero markers/scripts/portals remain. The public flag remains on only because this is the authorized launch state, not a temporary check.
- [ ] If verification fails, clear both page and standalone-section exposure first, change the Production flag to off for the next build, keep competing auto-deploy/merge promotion paused, build and promote an off-safe deployment, purge canonical `/h` CDN objects with the platform command/equivalent, and verify the canonical origin. Protect/remove every superseded `on` deployment and require each old URL to return 401/403/404. Record that changing an environment value alone does not revoke old deployment URLs.
- [ ] Only the user may later click Imweb Publish or change the production menu. Passing authenticated admin preview is not proof of public desktop/mobile behavior.

## W1 Code-Complete Definition

W1 is code-complete only when all of the following are true:

1. The additive schema, checked SQL, checker, and capability gate agree; no live DB action has been smuggled into tests.
2. Six W1 types, page/section loaders, preview, admin editor, snippets, upload, templates, and form bridge work from one normalized contract.
3. Every first-party visual is inside an Expo ShadowRoot and uses the self-hosted Pretendard alias; the only exception is third-party iframe content.
4. Clean/hostile-before/hostile-after computed style—including explicit LTR/bidi isolation—and geometry match in Chromium and WebKit across the required widths when outer available geometry is held constant; separately constrained/hidden ancestors produce the documented diagnostic instead of a false isolation claim.
5. Standalone `/f`, existing public runtimes, capture paths, live views, and all existing tests remain green.
6. The branch is reviewed and documented but is not merged, deployed, connected to Imweb, or publicly published.
