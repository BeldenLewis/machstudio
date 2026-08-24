# IA Survival Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 IA 검토 생존 결함 5건과 그 구조적 원인을 막는 `AGENTS.md` 규칙을 큐 A의 1→6 순서로 수정하고, 각 단위를 독립적으로 회귀 검증·커밋한다.

**Architecture:** 상세 화면은 URL로 연 웨비나의 `projectId`를 클라이언트 조회·생성에 사용하고, 서버 mutation도 사이트와 웨비나의 프로젝트 일치를 검증한다. 외부로 복사되는 주소는 구성된 공개 origin으로 만들고 ESLint가 새 브라우저-origin 사용을 막는다. 나머지 결함은 현재 모드·스키마·IA를 직접 반영하는 최소 분기와 표시로 고치며 메뉴 구조는 바꾸지 않는다.

**Tech Stack:** Next.js 16.2.6 App Router, React 19 Client Components, TypeScript, Prisma 7/PostgreSQL, Vitest 2 + jsdom, ESLint 9 flat config.

## Global Constraints

- 큐 A를 Task 1→6 순서로만 실행하며, 한 Task의 구현·테스트·리뷰·커밋이 끝나기 전에 다음 Task를 수정하지 않는다.
- 로컬 dev 서버와 DB 스크립트를 실행하지 않는다. 프로덕션 DB의 교차 프로젝트 조회는 방송 일정 확인을 받은 뒤 읽기 전용 트랜잭션으로 1회만 한다.
- `prisma db push`를 실행하지 않는다. 이번 계획에는 스키마 변경이 없다.
- capture 사전등록 경로와 `fieldMappings` 동작을 바꾸지 않는다. 특히 기존 `(app)/collect/[id]/page.tsx`의 capture 설치 origin은 Task 2에서 이유 있는 ESLint 예외로 보존한다.
- 메뉴 재편, 사이드바 동기화 이펙트 이식, 대회 브레드크럼 추가, 빌더형 진입 탭 변경을 하지 않는다.
- Next.js 16 규칙을 유지한다: 동적 `params`는 `Promise`로 받고 await/use하며, Server→Client prop은 직렬화 가능한 문자열을 사용한다.
- 어드민 UI 회귀는 실제 컴포넌트를 jsdom에서 렌더하고 외부 네트워크만 경계에서 mock한다. source-text grep만 하는 테스트는 만들지 않는다.
- 사용자 문구의 줄바꿈을 보존하고, UI 구조·색상·토큰은 이번 범위에서 바꾸지 않는다.
- 신규 코드는 lint clean이어야 한다. Task마다 focused Vitest와 관련 ESLint를 통과시키고, 커밋 전 `npx tsc --noEmit` 및 `npx vitest run --exclude '.worktrees/**' src`를 실행한다.
- 커밋은 한국어·왜 중심 본문을 쓰고 `Co-Authored-By: Codex <noreply@openai.com>` 트레일러를 유지한다. PR 병합·main push는 사용자 지시 없이 하지 않는다.

---

### Task 1: URL 웨비나 소속으로 아임웹 사이트를 격리한다

**Files:**
- Modify: `src/app/(app)/webinar/[slug]/DeployTab.tsx`
- Modify: `src/app/(app)/webinar/[slug]/page.tsx`
- Modify: `src/app/api/webinar-embed-sites/route.ts`
- Modify: `src/app/api/webinar-embed-sites/[id]/route.ts`
- Create: `src/app/(app)/webinar/[slug]/__tests__/deploy-project-ownership.test.tsx`
- Create: `src/app/api/webinar-embed-sites/route.test.ts`
- Create: `src/app/api/webinar-embed-sites/[id]/route.test.ts`

**Interfaces:**
- Consumes: webinar GET payload의 `webinar.project.id: string`, workspace context의 `workspace.id: string`.
- Produces: `DeployTab`의 필수 `projectId: string` prop; POST/PATCH에서 사이트 프로젝트와 활성 웨비나 프로젝트가 다르면 HTTP 400.

- [ ] **Step 1: 클라이언트 소속 회귀 테스트를 먼저 작성한다**

  jsdom에서 `DeployTab`을 실제 렌더한다. `useWorkspace()`는 `workspace.id = "ws-1"`, `currentProject.id = "sidebar-project"`를 반환하게 하고 prop은 `projectId="url-project"`로 준다. 첫 GET이 아래 URL을 쓰는지 단언한다.

  ```ts
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/webinar-embed-sites?workspaceId=ws-1&projectId=url-project",
  );
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes("sidebar-project"))).toBe(false);
  ```

  사이트 생성 폼을 열어 이름을 입력하고 생성한 뒤 POST body가 정확히 다음 소속을 쓰는지 단언한다.

  ```ts
  expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
    workspaceId: "ws-1",
    projectId: "url-project",
    activeWebinarId: "webinar-1",
  });
  ```

- [ ] **Step 2: 클라이언트 테스트가 현재 사이드바 프로젝트 때문에 실패하는지 확인한다**

  Run:

  ```bash
  npx vitest run --exclude '.worktrees/**' 'src/app/(app)/webinar/[slug]/__tests__/deploy-project-ownership.test.tsx'
  ```

  Expected: GET 또는 POST가 `sidebar-project`를 사용해 FAIL.

- [ ] **Step 3: 서버 교차 프로젝트 회귀 테스트를 먼저 작성한다**

  route module의 Supabase auth와 Prisma만 mock한다. POST 테스트는 같은 workspace지만 다른 `projectId`인 활성 웨비나를 주면 400이고 `webinarEmbedSite.create`가 호출되지 않음을 검증한다. PATCH 테스트는 `site.projectId = "project-a"`인데 요청 웨비나가 `project-b`일 때 400이고 `webinarEmbedSite.update`가 호출되지 않음을 검증한다. 같은 프로젝트의 정상 mutation도 각각 201/200으로 유지한다.

- [ ] **Step 4: 서버 테스트가 현재 workspace-only 검증 때문에 실패하는지 확인한다**

  Run:

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/api/webinar-embed-sites/route.test.ts' \
    'src/app/api/webinar-embed-sites/[id]/route.test.ts'
  ```

  Expected: 교차 프로젝트 요청이 성공하거나 create/update가 호출되어 FAIL.

- [ ] **Step 5: URL 소속 prop과 서버 방어를 최소 구현한다**

  `DeployTab` signature에 `projectId: string`을 추가한다. `useWorkspace()`에서는 `workspace`만 소비하고, 사이트 GET과 POST의 `projectId`, guard, `useCallback` dependency를 모두 prop으로 바꾼다. 부모는 `projectId={webinar.project?.id ?? ""}`를 전달한다.

  POST의 활성 웨비나 조회는 다음 세 조건을 함께 건다.

  ```ts
  where: { id: activeWebinarId, workspaceId, projectId }
  ```

  PATCH의 활성 웨비나 조회는 다음 세 조건을 함께 건다.

  ```ts
  where: {
    id: body.activeWebinarId,
    workspaceId: site.workspaceId,
    projectId: site.projectId,
  }
  ```

  null/빈 문자열로 활성 웨비나를 해제하는 기존 동작과 오류 status/message는 유지한다.

- [ ] **Step 6: focused GREEN과 정적 검증을 실행한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/(app)/webinar/[slug]/__tests__/deploy-project-ownership.test.tsx' \
    'src/app/api/webinar-embed-sites/route.test.ts' \
    'src/app/api/webinar-embed-sites/[id]/route.test.ts'
  npx eslint \
    'src/app/(app)/webinar/[slug]/DeployTab.tsx' \
    'src/app/(app)/webinar/[slug]/page.tsx' \
    'src/app/api/webinar-embed-sites/route.ts' \
    'src/app/api/webinar-embed-sites/[id]/route.ts' \
    'src/app/(app)/webinar/[slug]/__tests__/deploy-project-ownership.test.tsx' \
    'src/app/api/webinar-embed-sites/route.test.ts' \
    'src/app/api/webinar-embed-sites/[id]/route.test.ts'
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 7: 왜 중심 한국어 커밋을 만든다**

  Subject: `fix(웨비나): 딥링크가 URL 웨비나 소속 사이트만 바꾸게`

  본문에는 사이드바와 URL 소속이 갈릴 수 있었던 원인, 클라이언트 prop 고정, POST/PATCH 이중 방어, 테스트 수를 기록하고 Co-Author trailer를 붙인다.

---

### Task 2: 외부 복사 주소를 공개 origin으로 고정하고 ESLint로 재발을 막는다

**Files:**
- Modify: `src/app/(app)/collect/[id]/FormBuilderTab.tsx`
- Modify: `src/app/(app)/competition/[slug]/DeployTab.tsx`
- Modify: `eslint.config.mjs`
- Modify: `src/app/(app)/analytics/AnalyticsShareModal.tsx`
- Modify: `src/app/(app)/collect/[id]/page.tsx`
- Modify: `src/app/(app)/competition/[slug]/AwardsTab.tsx`
- Modify: `src/app/(app)/competition/[slug]/JudgesTab.tsx`
- Modify: `src/app/(app)/dashboard/DashboardShareModal.tsx`
- Modify: `src/app/(app)/webinar/[slug]/SurveyTab.tsx`
- Modify: `src/app/(app)/webinar/[slug]/page.tsx`
- Modify: `src/app/(app)/collect/[id]/__tests__/embed-snippet.test.tsx`
- Create: `src/lib/__tests__/app-url.test.ts`
- Create: `src/app/(app)/competition/[slug]/__tests__/deploy-snippet.test.tsx`

**Interfaces:**
- Consumes: `getPublicAppOrigin(): string` from `src/lib/app-url.ts`, configured by `NEXT_PUBLIC_APP_URL` with trailing slash removed.
- Produces: collect preview/form/check and competition install/preview URLs that use the configured public app origin; `(app)` subtree lint error for new `window.location.origin` member expressions.

- [ ] **Step 1: 공개 origin 회귀 테스트를 먼저 작성한다**

  `app-url.test.ts`는 configured URL `https://app.example.com/`이 `https://app.example.com`으로 정규화되고 브라우저 origin보다 우선하는지 검증한다. collect 기존 jsdom 테스트는 같은 env를 stub하고 폼/확인 snippet과 “링크 복사” clipboard 값이 `https://app.example.com`으로 시작하는지 검증한다. competition jsdom 테스트는 공고·예선 투표·결선 투표·결과 snippet과 `/cp/{token}` 링크가 전부 같은 origin을 쓰는지 검증한다.

- [ ] **Step 2: 테스트가 현재 브라우저 origin 때문에 실패하는지 확인한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    src/lib/__tests__/app-url.test.ts \
    'src/app/(app)/collect/[id]/__tests__/embed-snippet.test.tsx' \
    'src/app/(app)/competition/[slug]/__tests__/deploy-snippet.test.tsx'
  ```

  Expected: collect/competition 결과가 jsdom origin을 사용해 FAIL.

- [ ] **Step 3: 지정된 세 브라우저-origin 소비처를 공개 origin으로 교체한다**

  두 Client Component에 `getPublicAppOrigin`을 import한다. `PreviewLinkRow`, `EmbedSnippetRow`, competition `DeployTab`에서 한 번 계산한 origin으로 기존 path를 조립한다. 상대 href로 새 탭을 여는 기존 UI 동작은 유지하고, clipboard/snippet 문자열만 공개 origin으로 고정한다.

- [ ] **Step 4: `(app)` 전역 ESLint 가드를 추가하고 RED를 확인한다**

  `eslint.config.mjs`에 다음 flat-config block을 추가한다.

  ```js
  {
    files: ["src/app/(app)/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.type='MemberExpression'][object.object.name='window'][object.property.name='location'][property.name='origin']",
          message: "공개 URL·설치 코드는 getPublicAppOrigin()을 사용하세요. 예외는 이유와 함께 eslint-disable 하세요.",
        },
      ],
    },
  }
  ```

  Run `npx eslint 'src/app/(app)'`; Expected: 기존 grandfathered 사용처가 FAIL해 규칙이 실제 AST를 잡음.

- [ ] **Step 5: 기존 범위 밖 사용처에는 인접한 이유 주석과 최소 disable을 단다**

  capture 설치 탭은 52,000건 운영 경로와 localhost 경고가 현재 host를 함께 쓰므로 보존한다. 나머지 기존 공유/심사/발표/설문/웨비나 링크는 이번 승인 범위에서 동작을 바꾸지 않는다는 이유를 각 expression 바로 위에 적고 한 줄 `eslint-disable-next-line no-restricted-syntax`를 단다. 이유 없는 파일-level disable은 만들지 않는다.

- [ ] **Step 6: focused GREEN, lint, 전체 검증을 실행한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    src/lib/__tests__/app-url.test.ts \
    'src/app/(app)/collect/[id]/__tests__/embed-snippet.test.tsx' \
    'src/app/(app)/competition/[slug]/__tests__/deploy-snippet.test.tsx'
  npx eslint eslint.config.mjs 'src/app/(app)' src/lib/app-url.ts src/lib/__tests__/app-url.test.ts
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 7: 왜 중심 한국어 커밋을 만든다**

  Subject: `fix(배포): 복사한 설치 코드가 공개 주소를 계속 가리키게`

  본문에는 preview/localhost 주소가 파트너 사이트에 영구 복사되던 원인, 지정 세 위치 교체, `(app)` lint 방어와 기존 예외 이유, 검증 결과를 기록한다.

---

### Task 3: 빌더형 빈 상태가 실제 등록 폼 흐름을 안내하게 한다

**Files:**
- Modify: `src/app/(app)/collect/[id]/page.tsx`
- Create: `src/app/(app)/collect/[id]/__tests__/empty-record-state.test.tsx`
- Test: `src/app/(app)/collect/[id]/__tests__/mode-tabs.test.ts`

**Interfaces:**
- Consumes: `source.mode: string` where only exact `"builder"` selects builder behavior.
- Produces: builder hint `등록 폼 탭에서 폼을 만들고 코드를 붙이면 여기 쌓여요`; capture keeps `스크립트를 설치하면 폼 제출 시 자동으로 수집돼요`.

- [ ] **Step 1: 실제 상세 페이지의 빈 상태를 렌더하는 jsdom 테스트를 작성한다**

  `useWorkspace`, router, fetch boundary를 기존 구조에 맞게 mock하고 resolved params로 실제 page를 렌더한다. source payload의 `_count.records`와 records API total을 0으로 둔다. builder는 새 문구를 보이고 capture 문구를 숨기는지, capture는 기존 문구를 그대로 보이는지 두 테스트로 분리한다.

- [ ] **Step 2: builder 테스트가 현재 공통 문구 때문에 실패하는지 확인한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/(app)/collect/[id]/__tests__/empty-record-state.test.tsx' \
    'src/app/(app)/collect/[id]/__tests__/mode-tabs.test.ts'
  ```

  Expected: builder assertion만 기존 `스크립트를 설치하면…` 때문에 FAIL; mode-tabs는 계속 PASS.

- [ ] **Step 3: 빈 상태의 두 번째 문장만 mode 분기한다**

  ```tsx
  <p className="text-xs text-muted-foreground/60 mt-1">
    {source.mode === "builder"
      ? "등록 폼 탭에서 폼을 만들고 코드를 붙이면 여기 쌓여요"
      : "스크립트를 설치하면 폼 제출 시 자동으로 수집돼요"}
  </p>
  ```

  tab 기본값, `tabsFor`, records fetch, capture UI는 건드리지 않는다.

- [ ] **Step 4: focused GREEN과 전체 검증을 실행한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/(app)/collect/[id]/__tests__/empty-record-state.test.tsx' \
    'src/app/(app)/collect/[id]/__tests__/mode-tabs.test.ts'
  npx eslint 'src/app/(app)/collect/[id]/page.tsx' 'src/app/(app)/collect/[id]/__tests__/empty-record-state.test.tsx'
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 5: 왜 중심 한국어 커밋을 만든다**

  Subject: `fix(사전등록): 빌더형 빈 상태가 존재하는 등록 폼 탭을 안내하게`

---

### Task 4: 등록번호를 검색하고 레코드 상세에서 대조하게 한다

**Files:**
- Modify: `src/app/api/collect-sources/[id]/records/route.ts`
- Modify: `src/app/(app)/collect/[id]/RecordDetailModal.tsx`
- Create: `src/app/api/collect-sources/[id]/records/route.test.ts`
- Create: `src/app/(app)/collect/[id]/__tests__/record-detail-registration-no.test.tsx`

**Interfaces:**
- Consumes: nullable top-level `CollectRecord.registrationNo`, existing escaped `%query%` ILIKE pattern.
- Produces: q search predicate includes registration number; detail modal shows a read-only registration-number row only when a number exists.

- [ ] **Step 1: route와 상세 UI의 실패하는 회귀 테스트를 작성한다**

  route test는 auth/Prisma boundary를 mock하고 `q=1234567890128` GET을 실행한 뒤 실제 `$queryRaw`에 전달된 Prisma SQL의 string/value structure가 `registrationNo` predicate와 escaped pattern을 포함하는지 검증한다. modal test는 실제 컴포넌트와 GET response를 사용해 `등록번호`와 `1234567890128`이 필드 섹션 첫 부분에 보이는지 검증한다. null 번호인 capture fixture에서는 빈 `등록번호 -` 행을 만들지 않는다.

- [ ] **Step 2: 현재 predicate/type/UI 때문에 두 테스트가 실패하는지 확인한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/api/collect-sources/[id]/records/route.test.ts' \
    'src/app/(app)/collect/[id]/__tests__/record-detail-registration-no.test.tsx'
  ```

  Expected: SQL에 `registrationNo`가 없고 modal에 번호가 없어 FAIL.

- [ ] **Step 3: 기존 검색 그룹과 상세 필드 영역에 최소 구현한다**

  검색 OR group의 같은 pattern을 사용한다.

  ```ts
  OR COALESCE("registrationNo",'') ILIKE ${pattern}
  ```

  modal의 `CollectRecord` type에 `registrationNo: string | null`을 추가한다. `record.registrationNo`가 truthy일 때만 mapped field rows보다 앞에 read-only `등록번호` row를 렌더한다. 등록번호는 편집 payload에 넣지 않는다. 기존 full CSV의 builder-only 등록번호 열은 이미 있으므로 변경하지 않는다.

- [ ] **Step 4: focused GREEN과 전체 검증을 실행한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/api/collect-sources/[id]/records/route.test.ts' \
    'src/app/(app)/collect/[id]/__tests__/record-detail-registration-no.test.tsx'
  npx eslint \
    'src/app/api/collect-sources/[id]/records/route.ts' \
    'src/app/(app)/collect/[id]/RecordDetailModal.tsx' \
    'src/app/api/collect-sources/[id]/records/route.test.ts' \
    'src/app/(app)/collect/[id]/__tests__/record-detail-registration-no.test.tsx'
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 5: 왜 중심 한국어 커밋을 만든다**

  Subject: `fix(사전등록): 현장에서 등록번호로 검색하고 상세 대조하게`

---

### Task 5: 운영 안내가 현재 만들기 IA를 정확히 가리키게 한다

**Files:**
- Modify: `src/app/(app)/webinar/[slug]/LiveConsoleTab.tsx`
- Modify: `src/app/(app)/webinar/[slug]/LivePageTab.tsx`
- Create: `src/app/(app)/webinar/[slug]/__tests__/live-console-navigation-copy.test.tsx`
- Modify: `src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx`

**Interfaces:**
- Consumes: current paths `만들기 → 시청 화면 → 라이브 → 참여 구성` and `만들기 → 원본 정보`.
- Produces: four visible instructions that no longer mention removed `라이브 페이지`/`세션 탭` menu names.

- [ ] **Step 1: 실제 콘솔 렌더를 통한 실패 테스트를 작성한다**

  default-export `LiveConsoleTab`을 실제 렌더하고 dashboard를 non-live 상태로 반환한다. `실시간 채팅`과 `문의·폼 응답` disclosure를 클릭해 실제 panel을 마운트한다. fetch fixture는 dashboard·curve·activity, inquiry total 0, chat disabled/empty state의 완전한 실제 response shape를 URL별로 반환한다. 사용자가 보는 copy가 아래 path를 포함하고 `만들기 → 라이브 페이지`를 포함하지 않는지 검증한다.

  ```text
  만들기 → 시청 화면 → 라이브의 CTA 버튼
  만들기 → 시청 화면 → 라이브 → 참여 구성에서 채팅
  ```

  기존 `pre-live-waiting.test.tsx`에는 waiting state를 렌더해 아젠다 설명이 `만들기 → 원본 정보에 등록한 시간표`를 포함하고 `세션 탭`을 포함하지 않는 assertion을 추가한다.

- [ ] **Step 2: 현재 stale copy 때문에 RED인지 확인한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/(app)/webinar/[slug]/__tests__/live-console-navigation-copy.test.tsx' \
    'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx'
  ```

  Expected: 네 기존 위치가 removed menu name을 사용해 FAIL.

- [ ] **Step 3: 네 안내 문구만 현행 IA로 교체한다**

  - inquiry empty: `만들기 → 시청 화면 → 라이브의 CTA 버튼에 폼을 연결하면…`
  - chat intro: `만들기 → 시청 화면 → 라이브 → 참여 구성에서 채팅을 켜야…`
  - chat disabled non-fill hint: 같은 path로 통일한다.
  - waiting agenda desc: `만들기 → 원본 정보에 등록한 시간표가 타임라인으로 표시돼요`.

  navigation callback, tab IDs, section/state 구조는 바꾸지 않는다.

- [ ] **Step 4: focused GREEN과 전체 검증을 실행한다**

  ```bash
  npx vitest run --exclude '.worktrees/**' \
    'src/app/(app)/webinar/[slug]/__tests__/live-console-navigation-copy.test.tsx' \
    'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx'
  npx eslint \
    'src/app/(app)/webinar/[slug]/LiveConsoleTab.tsx' \
    'src/app/(app)/webinar/[slug]/LivePageTab.tsx' \
    'src/app/(app)/webinar/[slug]/__tests__/live-console-navigation-copy.test.tsx' \
    'src/app/webinar/[slug]/__tests__/pre-live-waiting.test.tsx'
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 5: 왜 중심 한국어 커밋을 만든다**

  Subject: `fix(웨비나): 운영 안내가 현행 만들기 메뉴를 가리키게`

---

### Task 6: 새 면의 URL·소속·copy·column 점검 규칙을 저장소 지침에 봉인한다

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1~5에서 확인한 네 구조적 원인.
- Produces: 새 제품·방식·탭을 만들 때 적용되는 저장소 전역 지침.

- [ ] **Step 1: Next.js 규칙 다음, 제품 UI 원칙 앞에 새 절을 추가한다**

  아래 문구를 그대로 추가한다.

  ```md
  # 새 면을 만들 때

  새 제품·방식·탭을 추가할 때 같은 종류의 기존 면을 먼저 열어 확인한다:
  ① 밖으로 나가는 주소(스니펫·공유 링크)는 `getPublicAppOrigin()` — `window.location.origin` 금지
  ② 상세 화면이 형제 자원을 조회·변경할 땐 사이드바 컨텍스트가 아니라 **URL 자원의 소속**을 쓰고 서버도 검증
  ③ 복사해 온 안내 문구·빈 상태가 새 면에서 참인지, 새 컬럼이 검색·CSV·상세에 등록됐는지
  ```

- [ ] **Step 2: 문서 변경을 검증한다**

  사람용 지침의 source text를 고정하는 테스트는 만들지 않는다. 대신 diff를 직접 읽어 기존 Next.js 및 product-design block이 그대로이고 새 절이 둘 사이 한 번만 들어갔는지 확인한다.

  ```bash
  git diff --check
  git diff -- AGENTS.md
  npx tsc --noEmit
  npx vitest run --exclude '.worktrees/**' src
  ```

- [ ] **Step 3: 왜 중심 한국어 커밋을 만든다**

  Subject: `docs: 새 면에서 소속과 외부 주소가 어긋나지 않게`

---

## Final Review and Handoff

- [ ] 모든 Task 커밋을 포함한 merge-base diff review package를 만들고 가장 강한 reviewer에게 spec compliance와 code quality를 함께 검토시킨다.
- [ ] review finding은 한 fix wave로 수정하고 scoped re-review한다.
- [ ] `npx prisma generate`, `npx tsc --noEmit`, `npx vitest run --exclude '.worktrees/**' src`, 관련 `(app)` ESLint를 최종 실행한다.
- [ ] 방송 일정 확인을 받았다면 read-only transaction으로 교차 프로젝트 `WebinarEmbedSite`를 1회 조회하고, 결과가 있으면 사용자에게 site/webinar/project IDs를 보고한다. 확인이 없으면 조회를 실행하지 않고 배포 전 pending으로 명시한다.
- [ ] 병합·main push는 하지 않고 브랜치 상태와 각 커밋, 검증 수, 남은 운영 확인 사항을 사용자에게 전달한다.
