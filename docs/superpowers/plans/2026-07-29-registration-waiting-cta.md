# Registration Completion CTA and Waiting Screen Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사전등록 체크 항목의 정렬을 통일하고, 등록 완료 CTA와 독립적인 대기 인원 밴드·안내문 CTA 설정을 자체 페이지와 외부 임베드에 일관되게 제공한다.

**Architecture:** `src/lib/webinar-config.ts`를 JSON 설정의 단일 정규화 지점으로 확장한다. 관리자 편집기는 정규화된 설정을 저장하고, 자체 페이지와 임베드 설정 API/로더는 같은 계약을 읽되 공개 링크를 렌더하기 직전에 `safeHttpUrl`로 검증한다. 대기 인원은 기존 30초 상태 폴링과 5분 프레즌스 집계를 그대로 사용하며 토글만 실제 밴드 렌더와 연결한다.

**Tech Stack:** Next.js 16.2.12 App Router, React 19, TypeScript, Tailwind CSS, Prisma JSON config, Vitest 4, jsdom, Framer Motion

## Global Constraints

- 자체 페이지와 임베드가 같은 정규화된 설정을 읽는다.
- 공개 섹션은 ON 상태와 실제 데이터가 모두 있어야 노출한다.
- 대기 인원 밴드와 안내문·CTA는 서로 영향을 주지 않는 독립 영역이다.
- 공개 URL은 `http:` 또는 `https:`만 허용한다.
- 색상과 표면은 기존 STK 테마 토큰에서 파생한다.
- 모바일 터치 영역과 여러 줄 문구를 기준으로 정렬한다.
- 기존 `components.formWidget.successMessage` 동작과 기존 웨비나의 기본 화면을 보존한다.
- Prisma 마이그레이션과 새 런타임 의존성은 추가하지 않는다.
- 기존 랜딩 페이지 변경 파일은 이 작업의 커밋에 포함하지 않는다.

---

## File Map

- `src/lib/webinar-config.ts`: 등록 완료 CTA와 대기 안내 설정 타입·기본값·정규화의 단일 소스.
- `src/lib/__tests__/webinar-public-cta.test.ts`: 새 JSON 계약, 기본값, URL 안전성 단위 테스트.
- `src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx`: 완료 CTA 인라인 편집, 자동저장, 폼/완료 미리보기, 체크 항목 미리보기 정렬.
- `src/app/webinar/[slug]/live/page.tsx`: 자체 등록 폼 체크 항목 정렬과 완료 모달 CTA 렌더.
- `src/components/webinar/choice-fields.tsx`: 자체 등록 폼 복수 선택 체크박스의 크기와 행 정렬.
- `src/app/api/webinar-embed/[siteId]/config/route.ts`: 임베드에 정규화된 완료 CTA를 안전한 URL로 전달.
- `src/lib/webinar-loader-script.ts`: 임베드 체크 항목 정렬과 완료 CTA/닫기 버튼 렌더.
- `src/lib/__tests__/webinar-loader-cta.test.ts`: 생성 로더에 CTA 보안·새 탭·닫기 계약이 포함되는지 고정.
- `src/app/(app)/webinar/[slug]/LivePageTab.tsx`: 대기 밴드 라벨 변경과 독립 안내문·CTA 인라인 편집.
- `src/app/webinar/[slug]/PreLiveWaiting.tsx`: 밴드 토글 연결, 레거시 총원 패널 제거, 안내문·CTA 렌더.
- `src/lib/webinar-exposure.ts`: 대기 밴드의 잘못된 broken 판정 제거와 안내문·CTA 노출 감사 추가.
- `src/lib/__tests__/webinar-exposure.test.ts`: 대기 화면 노출 판정 회귀 테스트.

---

### Task 1: 공개 CTA 설정 계약과 안전한 기본값

**Files:**
- Create: `src/lib/__tests__/webinar-public-cta.test.ts`
- Modify: `src/lib/webinar-config.ts:44-58`
- Modify: `src/lib/webinar-config.ts:138-212`
- Modify: `src/lib/webinar-config.ts:447-525`

**Interfaces:**
- Produces: `WebinarLinkCtaConfig`
- Produces: `WebinarWaitingFollowUpConfig`
- Produces: `WebinarRegistrationFormConfig.successCta`
- Produces: `LivePageConfig.waiting.followUp`
- Consumes later: `normalizeRegistrationForm(config)` and `normalizeLivePageConfig(config)` return the new nested objects for admin and public renderers.

- [ ] **Step 1: Write failing normalization tests**

Create `src/lib/__tests__/webinar-public-cta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  normalizeLivePageConfig,
  normalizeRegistrationForm,
  safeHttpUrl,
} from "@/lib/webinar-config";

describe("등록 완료 CTA 설정", () => {
  it("기존 웨비나는 CTA가 꺼진 빈 설정으로 정규화된다", () => {
    expect(normalizeRegistrationForm({}).successCta).toEqual({
      enabled: false,
      label: "",
      url: "",
    });
  });

  it("운영자가 저장한 ON·문구·URL을 보존한다", () => {
    expect(normalizeRegistrationForm({
      registrationForm: {
        successCta: {
          enabled: true,
          label: "오픈채팅 입장",
          url: "https://example.com/chat",
        },
      },
    }).successCta).toEqual({
      enabled: true,
      label: "오픈채팅 입장",
      url: "https://example.com/chat",
    });
  });
});

describe("대기 안내문·CTA 설정", () => {
  it("인원 밴드와 독립된 기본값을 갖는다", () => {
    const waiting = normalizeLivePageConfig({}).waiting;
    expect(waiting.social).toBe(true);
    expect(waiting.followUp).toEqual({
      enabled: false,
      text: "",
      ctaLabel: "",
      ctaUrl: "",
    });
  });

  it("줄바꿈 문구와 CTA 설정을 보존한다", () => {
    const waiting = normalizeLivePageConfig({
      livePage: {
        waiting: {
          social: false,
          followUp: {
            enabled: true,
            text: "라이브 자료는\n종료 후 보내드려요.",
            ctaLabel: "행사 안내 보기",
            ctaUrl: "https://example.com/guide",
          },
        },
      },
    }).waiting;
    expect(waiting.social).toBe(false);
    expect(waiting.followUp).toEqual({
      enabled: true,
      text: "라이브 자료는\n종료 후 보내드려요.",
      ctaLabel: "행사 안내 보기",
      ctaUrl: "https://example.com/guide",
    });
  });
});

describe("공개 CTA URL", () => {
  it("http(s)만 통과시키고 실행 가능한 스킴은 버린다", () => {
    expect(safeHttpUrl("https://example.com")).toBe("https://example.com");
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com");
    expect(safeHttpUrl("javascript:alert(1)")).toBe("");
    expect(safeHttpUrl("data:text/html,test")).toBe("");
    expect(safeHttpUrl("/relative")).toBe("");
  });
});
```

- [ ] **Step 2: Run the test and verify the new properties fail**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-public-cta.test.ts
```

Expected: FAIL because `successCta` and `waiting.followUp` are absent.

- [ ] **Step 3: Add the normalized setting types**

In `src/lib/webinar-config.ts`, add:

```ts
export interface WebinarLinkCtaConfig {
  enabled: boolean;
  label: string;
  url: string;
}

export interface WebinarWaitingFollowUpConfig {
  enabled: boolean;
  text: string;
  ctaLabel: string;
  ctaUrl: string;
}
```

Append the new property to `WebinarRegistrationFormConfig` without changing its current fields:

```ts
successCta: WebinarLinkCtaConfig;
```

Replace only the `waiting` member of `LivePageConfig` with:

```ts
waiting: {
  agenda: boolean;
  social: boolean;
  calendar: boolean;
  share: boolean;
  notify: boolean;
  followUp: WebinarWaitingFollowUpConfig;
};
```

- [ ] **Step 4: Add minimal normalization**

Inside `normalizeRegistrationForm`, normalize a non-array object and append:

```ts
const successCtaRaw =
  raw?.successCta && typeof raw.successCta === "object" && !Array.isArray(raw.successCta)
    ? raw.successCta as Partial<WebinarLinkCtaConfig>
    : {};

// in the return object
successCta: {
  enabled: successCtaRaw.enabled === true,
  label: typeof successCtaRaw.label === "string" ? successCtaRaw.label : "",
  url: typeof successCtaRaw.url === "string" ? successCtaRaw.url : "",
},
```

Inside `normalizeLivePageConfig`, normalize `w.followUp`:

```ts
const followUp = obj(w.followUp);

// inside waiting
followUp: {
  enabled: bool(followUp.enabled, false),
  text: typeof followUp.text === "string" ? followUp.text : "",
  ctaLabel: typeof followUp.ctaLabel === "string" ? followUp.ctaLabel : "",
  ctaUrl: typeof followUp.ctaUrl === "string" ? followUp.ctaUrl : "",
},
```

- [ ] **Step 5: Run contract tests**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-public-cta.test.ts src/lib/__tests__/webinar-multi-choice.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add src/lib/webinar-config.ts src/lib/__tests__/webinar-public-cta.test.ts
git commit -m "feat(웨비나): 완료 CTA와 대기 안내 설정 계약 추가"
```

---

### Task 2: 등록 폼 편집기와 자체 완료 모달

**Files:**
- Modify: `src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx:280-410`
- Modify: `src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx:480-720`
- Modify: `src/app/webinar/[slug]/live/page.tsx:1-30`
- Modify: `src/app/webinar/[slug]/live/page.tsx:1250-1320`
- Modify: `src/app/webinar/[slug]/live/page.tsx:1380-1415`
- Modify: `src/components/webinar/choice-fields.tsx:100-175`

**Interfaces:**
- Consumes: `normalizeRegistrationForm(config).successCta`
- Consumes: `safeHttpUrl(value): string`
- Produces: autosaved `config.registrationForm.successCta`
- Produces: 자체 완료 모달에서 유효한 CTA 새 탭 링크와 항상 접근 가능한 닫기 동작.

- [ ] **Step 1: Extend editor state and autosave payload**

In `RegistrationFormTab`, initialize:

```ts
const [successCta, setSuccessCta] = useState(initial.successCta);
const successCtaUrl = safeHttpUrl(successCta.url);
const successCtaUrlInvalid = successCta.url.trim() !== "" && !successCtaUrl;
```

Add `successCta` to the autosave payload:

```ts
successCta: {
  enabled: successCta.enabled,
  label: successCta.label.trim(),
  url: successCta.url.trim(),
},
```

Add `successCta` to the object passed to `useAutosave`.

- [ ] **Step 2: Add direct-manipulation completion settings**

Below `동의 문구 · 버튼`, render:

```tsx
<section className="space-y-3 pt-4 border-t border-border">
  <div>
    <h3 className="text-sm font-semibold">등록 완료 화면</h3>
    <p className="mt-1 text-xs text-muted-foreground">등록 직후 보여줄 선택 행동이에요.</p>
  </div>
  <div className="space-y-3 rounded-2xl bg-secondary/20 p-4">
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">CTA 표시</span>
      <Switch
        checked={successCta.enabled}
        onChange={(enabled) => setSuccessCta((v) => ({ ...v, enabled }))}
        label="등록 완료 CTA 표시"
      />
    </label>
    <input
      aria-label="완료 CTA 버튼 문구"
      value={successCta.label}
      onChange={(e) => setSuccessCta((v) => ({ ...v, label: e.target.value }))}
      className={inputCls}
      placeholder="예: 오픈채팅 입장하기"
    />
    <input
      aria-label="완료 CTA 연결 URL"
      type="url"
      value={successCta.url}
      onChange={(e) => setSuccessCta((v) => ({ ...v, url: e.target.value }))}
      className={successCtaUrlInvalid ? FIELD_CLS_DANGER : inputCls}
      placeholder="https://..."
    />
    {successCtaUrlInvalid && (
      <p className="text-[11px] text-destructive">http:// 또는 https:// 주소를 입력해 주세요.</p>
    )}
  </div>
</section>
```

Use the existing `Switch` component directly if no local labeled toggle exists; do not create another generic switch abstraction.

- [ ] **Step 3: Add form/completion preview modes**

Pass `successCta` into `RegistrationFormPreview`. Add local preview mode:

```ts
const [previewMode, setPreviewMode] = useState<"form" | "done">("form");
const previewCtaUrl = safeHttpUrl(successCta.url);
const showPreviewCta =
  successCta.enabled && successCta.label.trim() !== "" && previewCtaUrl !== "";
```

Place `폼` and `완료` buttons in the preview header and render the current form for `form`. For `done`, render a compact card with the existing check mark, fixed title/description, optional accent CTA, and secondary `닫기`. The preview CTA must be `type="button"` so admin preview clicks do not navigate.

- [ ] **Step 4: Align checkbox and first text line in admin preview**

Update `REG_PREVIEW_CSS`:

```css
.stk-live.regprev .rp-consent {
  display:flex;
  align-items:flex-start;
  gap:9px;
  min-height:18px;
  font-size:11.5px;
  line-height:18px;
  color:var(--muted);
}
.stk-live.regprev .rp-check {
  width:18px;
  height:18px;
  border-radius:5px;
  box-shadow:inset 0 0 0 1.5px var(--line-md);
  margin:0;
  flex:none;
  display:grid;
  place-items:center;
  color:transparent;
  font-size:11px;
  font-weight:900;
}
```

- [ ] **Step 5: Align native public check rows**

In `renderRegistrationField`, replace the custom checkbox row with:

```tsx
<label key={field.key} className="flex min-h-[18px] cursor-pointer items-start gap-2.5">
  <input
    type="checkbox"
    checked={Boolean(value)}
    onChange={(e) => setValue(e.target.checked)}
    className="m-0 h-[18px] w-[18px] shrink-0"
    style={{ accentColor: accent }}
  />
  <span className="text-xs leading-[18px] opacity-60">{commonLabel}</span>
</label>
```

For the privacy/marketing rows, replace the label and control class names:

```tsx
<label key={consent.kind} className="flex min-h-[18px] cursor-pointer items-start gap-2.5">
  <input
    type="checkbox"
    checked={consent.checked}
    onChange={(e) => consent.set(e.target.checked)}
    className="m-0 h-[18px] w-[18px] shrink-0"
    style={{ accentColor: accent }}
  />
  {consent.body ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setTermsModal({ kind: consent.kind, title: consent.text, body: consent.body });
      }}
      className="text-left text-xs leading-[18px] opacity-60 underline decoration-from-font underline-offset-2 transition-opacity hover:opacity-90"
    >
      {consent.text}
    </button>
  ) : (
    <span className="text-xs leading-[18px] opacity-60">{consent.text}</span>
  )}
</label>
```

In `src/components/webinar/choice-fields.tsx`, change both multiple-choice checkbox class names from `size-4 shrink-0` to `m-0 size-[18px] shrink-0`.

- [ ] **Step 6: Render configured CTA in the native completion modal**

Import `safeHttpUrl` from `@/lib/webinar-config` and `onAccentColor` from `../LiveContentStk`, then derive:

```ts
const completionCtaUrl = safeHttpUrl(registrationForm.successCta.url);
const showCompletionCta =
  registrationForm.successCta.enabled &&
  registrationForm.successCta.label.trim() !== "" &&
  completionCtaUrl !== "";
```

Replace the single footer button with:

```tsx
{showCompletionCta && (
  <a
    href={completionCtaUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-bold"
    style={{ background: accent, color: onAccentColor(accent) }}
  >
    {registrationForm.successCta.label}
  </a>
)}
<button
  type="button"
  onClick={() => setRegisterDone(false)}
  className={`${showCompletionCta ? "mt-2 bg-transparent" : "mt-6 text-white"} inline-flex h-11 w-full items-center justify-center rounded-xl px-6 text-sm font-bold`}
  style={showCompletionCta ? { color: soft(70) } : { background: accent }}
>
  {showCompletionCta ? "닫기" : "확인"}
</button>
```

- [ ] **Step 7: Run type-aware lint on the two editor/view files**

Run:

```bash
npx eslint 'src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx' 'src/app/webinar/[slug]/live/page.tsx' src/components/webinar/choice-fields.tsx
```

Expected: no errors.

- [ ] **Step 8: Commit the native registration UI**

```bash
git add 'src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx' 'src/app/webinar/[slug]/live/page.tsx' src/components/webinar/choice-fields.tsx
git commit -m "feat(등록): 완료 CTA 편집과 자체 모달 적용"
```

---

### Task 3: 외부 임베드 완료 CTA와 체크 정렬

**Files:**
- Create: `src/lib/__tests__/webinar-loader-cta.test.ts`
- Modify: `src/app/api/webinar-embed/[siteId]/config/route.ts:230-250`
- Modify: `src/lib/webinar-loader-script.ts:280-345`
- Modify: `src/lib/webinar-loader-script.ts:680-805`
- Modify: `src/lib/webinar-loader-script.ts:940-975`

**Interfaces:**
- Consumes: `registrationForm.successCta` from Task 1.
- Consumes: `safeHttpUrl` on the server config route.
- Produces: embed payload `registrationForm.successCta` with an empty URL when the saved scheme is unsafe.
- Produces: generated loader behavior that opens CTA in a new tab and keeps a separate close action.

- [ ] **Step 1: Write loader contract tests**

Create `src/lib/__tests__/webinar-loader-cta.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWebinarLoaderScript } from "@/lib/webinar-loader-script";

const script = buildWebinarLoaderScript({
  siteId: "site_test",
  baseUrl: "https://mach.example",
});

describe("임베드 등록 완료 CTA", () => {
  it("정규화된 완료 CTA를 읽고 새 탭 보안을 적용한다", () => {
    expect(script).toContain("form.successCta");
    expect(script).toContain('target = "_blank"');
    expect(script).toContain('rel = "noopener noreferrer"');
  });

  it("CTA와 닫기 동작을 분리한다", () => {
    expect(script).toContain("mw-done-cta");
    expect(script).toContain("mw-done-close");
  });
});
```

- [ ] **Step 2: Run the loader test and verify it fails**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-loader-cta.test.ts
```

Expected: FAIL because the loader does not read `form.successCta` or render the two actions.

- [ ] **Step 3: Add safe CTA to the embed config payload**

Import `safeHttpUrl` alongside `normalizeRegistrationForm` in the embed route and append:

```ts
successCta: {
  enabled: registrationForm.successCta.enabled,
  label: registrationForm.successCta.label,
  url: safeHttpUrl(registrationForm.successCta.url),
},
```

- [ ] **Step 4: Align embed checkbox rows**

Replace the general checkbox strings with:

```js
".mw-check { display:flex; align-items:flex-start; gap:9px; min-height:20px; font-size:13px; line-height:20px; color:#555; margin-bottom:10px; cursor:pointer; }",
".mw-check input { width:18px; height:18px; flex:none; margin:1px 0 0; accent-color:" + t.accent + "; }",
```

Keep `.mw-multi .mw-check` at a 44px touch target and remove any conflicting input `margin-top` override.

- [ ] **Step 5: Render optional CTA and separate close button**

Add this defensive URL helper inside the generated loader:

```js
function safeHttpCtaUrl(value) {
  try {
    var parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch (e) {
    return "";
  }
}
```

Inside `openDonePopup`, read:

```js
var form = CFG.registrationForm || {};
var successCta = form.successCta || {};
var successCtaUrl = safeHttpCtaUrl(successCta.url);
var showCta = successCta.enabled === true && !!String(successCta.label || "").trim() && !!successCtaUrl;
```

When `showCta`, create:

```js
var cta = el("a", "mw-done-btn mw-done-cta", String(successCta.label).trim());
cta.href = successCtaUrl;
cta.target = "_blank";
cta.rel = "noopener noreferrer";
cta.style.background = accent;
card.appendChild(cta);

var closeBtn = el("button", "mw-done-close", "닫기");
closeBtn.type = "button";
closeBtn.addEventListener("click", close);
card.appendChild(closeBtn);
```

When `showCta` is false, keep the existing accent `확인` button and close behavior. Add CSS so `.mw-done-cta` is an inline-flex 46px primary action and `.mw-done-close` is a 44px quiet action with visible focus.

- [ ] **Step 6: Run loader and config tests**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-loader-cta.test.ts src/lib/__tests__/webinar-public-cta.test.ts
```

Expected: PASS.

- [ ] **Step 7: Lint embed files**

Run:

```bash
npx eslint 'src/app/api/webinar-embed/[siteId]/config/route.ts' src/lib/webinar-loader-script.ts
```

Expected: no errors.

- [ ] **Step 8: Commit the embed implementation**

```bash
git add 'src/app/api/webinar-embed/[siteId]/config/route.ts' src/lib/webinar-loader-script.ts src/lib/__tests__/webinar-loader-cta.test.ts
git commit -m "feat(임베드): 등록 완료 CTA와 체크 정렬 적용"
```

---

### Task 4: 대기 인원 밴드와 독립 안내문·CTA

**Files:**
- Modify: `src/app/(app)/webinar/[slug]/LivePageTab.tsx:205-230`
- Modify: `src/app/(app)/webinar/[slug]/LivePageTab.tsx:440-480`
- Modify: `src/app/webinar/[slug]/PreLiveWaiting.tsx:1-295`
- Modify: `src/lib/webinar-exposure.ts:150-165`
- Modify: `src/lib/webinar-exposure.ts:315-335`
- Modify: `src/lib/__tests__/webinar-exposure.test.ts:180-215`

**Interfaces:**
- Consumes: `LivePageConfig.waiting.followUp` from Task 1.
- Consumes: existing `waitingCount?: number | null`.
- Consumes: `safeHttpUrl(value): string`.
- Produces: band gate `live.waiting.social && waitingCount >= 2`.
- Produces: independent follow-up gate `enabled && (text || complete safe CTA)`.

- [ ] **Step 1: Update exposure tests for the fixed band and new follow-up**

Change the broken-count test:

```ts
it("렌더 약속이 없는 항목은 문의처 1건뿐이다", () => {
  const r = make();
  const broken = r.elements.filter((e) => e.state === "broken").map((e) => e.id);
  expect(broken).toEqual(["live.infoContact"]);
  expect(r.brokenCount).toBe(1);
});
```

Add:

```ts
describe("대기 화면 인원 밴드와 안내 CTA", () => {
  it("인원 밴드는 토글 상태를 반영하고 실제 인원은 런타임 조건으로 설명한다", () => {
    expect(row(make(), "waiting.social").state).toBe("on");
    expect(row(make({ config: { livePage: { waiting: { social: false } } } }), "waiting.social").state).toBe("off");
  });

  it("안내 영역은 ON이어도 문구와 완성 CTA가 모두 없으면 empty다", () => {
    const empty = make({ config: { livePage: { waiting: { followUp: { enabled: true } } } } });
    expect(row(empty, "waiting.followUp").state).toBe("empty");
    const on = make({
      config: {
        livePage: {
          waiting: {
            followUp: { enabled: true, text: "안내", ctaLabel: "", ctaUrl: "" },
          },
        },
      },
    });
    expect(row(on, "waiting.followUp").state).toBe("on");
  });
});
```

- [ ] **Step 2: Run exposure tests and verify they fail**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-exposure.test.ts
```

Expected: FAIL because `waiting.social` is still broken and `waiting.followUp` does not exist.

- [ ] **Step 3: Add direct waiting settings UI**

In `LivePageTab`, limit the boolean setter:

```ts
type WaitingToggleKey = "agenda" | "social" | "calendar" | "share" | "notify";
const setW = (k: WaitingToggleKey, v: boolean) =>
  setScreens((s) => ({ ...s, waiting: { ...s.waiting, [k]: v } }));
const setFollowUp = (patch: Partial<LivePageConfig["waiting"]["followUp"]>) =>
  setScreens((s) => ({
    ...s,
    waiting: {
      ...s.waiting,
      followUp: { ...s.waiting.followUp, ...patch },
    },
  }));
```

Rename the toggle:

```tsx
<Toggle
  label="함께 기다리는 인원 밴드"
  checked={screens.waiting.social}
  onChange={(v) => setW("social", v)}
  desc="현재 대기 중인 사람이 2명 이상일 때만 표시돼요"
/>
```

Add a separate block:

```tsx
<Blk title="안내문 · CTA" goes={goesFor("waiting", "entry")} hint="인원 밴드와 별개로 표시되는 안내 영역이에요.">
  <div className="space-y-3">
    <Toggle
      label="안내 영역 표시"
      checked={screens.waiting.followUp.enabled}
      onChange={(enabled) => setFollowUp({ enabled })}
    />
    <textarea
      aria-label="대기 화면 안내 문구"
      value={screens.waiting.followUp.text}
      onChange={(e) => setFollowUp({ text: e.target.value })}
      className={FIELD_CLS}
      rows={3}
      placeholder={"예: 라이브 자료는 종료 후\n등록 이메일로 보내드려요."}
    />
    <input
      aria-label="대기 CTA 버튼 문구"
      value={screens.waiting.followUp.ctaLabel}
      onChange={(e) => setFollowUp({ ctaLabel: e.target.value })}
      className={FIELD_CLS}
      placeholder="예: 행사 안내 보기"
    />
    <input
      aria-label="대기 CTA 연결 URL"
      type="url"
      value={screens.waiting.followUp.ctaUrl}
      onChange={(e) => setFollowUp({ ctaUrl: e.target.value })}
      className={waitingFollowUpUrlInvalid ? FIELD_CLS_DANGER : FIELD_CLS}
      placeholder="https://..."
    />
    {waitingFollowUpUrlInvalid && (
      <p className="text-[11px] text-destructive">http:// 또는 https:// 주소를 입력해 주세요.</p>
    )}
  </div>
</Blk>
```

Derive `waitingFollowUpUrlInvalid` using `safeHttpUrl`.

- [ ] **Step 4: Gate the existing band and remove the dead total panel**

In `PreLiveWaiting`:

```ts
const showTogether =
  live.waiting.social &&
  mounted &&
  typeof waitingCount === "number" &&
  waitingCount >= 2;
```

Render the pill only when `showTogether`. Remove:

- `registrantCount?: number`
- `AV_COLORS`
- `showSocial`
- `.plw-proof` and `.plw-avatars` CSS
- the fake avatar/total registrant block

Keep the informational/agenda band when `showAgenda`; it must no longer depend on `showSocial`.

- [ ] **Step 5: Render the independent follow-up block**

Import `safeHttpUrl`, then derive:

```ts
const followUp = live.waiting.followUp;
const followUpText = followUp.text.trim();
const followUpUrl = safeHttpUrl(followUp.ctaUrl);
const showFollowUpCta =
  followUp.ctaLabel.trim() !== "" && followUpUrl !== "";
const showFollowUp =
  followUp.enabled && (followUpText !== "" || showFollowUpCta);
```

Immediately after the together-band slot, render:

```tsx
{showFollowUp && (
  <div className="plw-follow-up">
    {followUpText && <p>{followUp.text}</p>}
    {showFollowUpCta && (
      <a href={followUpUrl} target="_blank" rel="noopener noreferrer">
        {followUp.ctaLabel}
      </a>
    )}
  </div>
)}
```

Add STK-token CSS:

```css
.plw-follow-up {
  width:min(100%, 560px);
  margin:14px auto 0;
  display:flex;
  flex-direction:column;
  align-items:center;
  gap:12px;
  text-align:center;
}
.plw-follow-up p {
  margin:0;
  color:var(--muted);
  font-size:14px;
  line-height:1.65;
  white-space:pre-line;
  word-break:keep-all;
}
.plw-follow-up a {
  min-height:44px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:0 18px;
  border-radius:12px;
  background:var(--key);
  color:var(--on-key);
  font-size:13px;
  font-weight:800;
  box-shadow:var(--btn-shadow-key);
}
```

- [ ] **Step 6: Fix the exposure report**

Remove `waiting.social` from `BROKEN` and replace its row with:

```ts
add(W(
  "waiting.social",
  "함께 기다리는 인원 밴드",
  ["waiting"],
  "waiting",
  gate(live.waiting.social, true, ""),
));
```

Add:

```ts
const followUp = live.waiting.followUp;
const hasFollowUp =
  !!str(followUp.text) ||
  (!!str(followUp.ctaLabel) && !!safeHttpUrl(followUp.ctaUrl));
add(W(
  "waiting.followUp",
  "대기 안내문 · CTA",
  ["waiting"],
  "waiting",
  gate(followUp.enabled, hasFollowUp, "영역을 켰지만 안내 문구나 완성된 CTA가 없어요."),
));
```

Import `safeHttpUrl` from `webinar-config`.

- [ ] **Step 7: Run waiting and contract tests**

Run:

```bash
npx vitest run src/lib/__tests__/webinar-public-cta.test.ts src/lib/__tests__/webinar-exposure.test.ts
```

Expected: PASS.

- [ ] **Step 8: Lint waiting files**

Run:

```bash
npx eslint 'src/app/(app)/webinar/[slug]/LivePageTab.tsx' 'src/app/webinar/[slug]/PreLiveWaiting.tsx' src/lib/webinar-exposure.ts
```

Expected: no errors.

- [ ] **Step 9: Commit the waiting screen**

```bash
git add 'src/app/(app)/webinar/[slug]/LivePageTab.tsx' 'src/app/webinar/[slug]/PreLiveWaiting.tsx' src/lib/webinar-exposure.ts src/lib/__tests__/webinar-exposure.test.ts
git commit -m "feat(대기): 인원 밴드와 독립 안내 CTA 연결"
```

---

### Task 5: 통합 검증과 반응형 확인

**Files:**
- Verify only: all files modified in Tasks 1-4

**Interfaces:**
- Consumes: all preceding tasks.
- Produces: test, lint, production build, and browser evidence for the complete viewer journey.

- [ ] **Step 1: Run the focused regression suite**

Run:

```bash
npx vitest run \
  src/lib/__tests__/webinar-public-cta.test.ts \
  src/lib/__tests__/webinar-loader-cta.test.ts \
  src/lib/__tests__/webinar-multi-choice.test.ts \
  src/lib/__tests__/webinar-exposure.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run lint on every touched source file**

Run:

```bash
npx eslint \
  src/lib/webinar-config.ts \
  'src/app/(app)/webinar/[slug]/RegistrationFormTab.tsx' \
  'src/app/webinar/[slug]/live/page.tsx' \
  src/components/webinar/choice-fields.tsx \
  'src/app/api/webinar-embed/[siteId]/config/route.ts' \
  src/lib/webinar-loader-script.ts \
  'src/app/(app)/webinar/[slug]/LivePageTab.tsx' \
  'src/app/webinar/[slug]/PreLiveWaiting.tsx' \
  src/lib/webinar-exposure.ts
```

Expected: no errors.

- [ ] **Step 3: Build the production bundle**

Before editing or debugging any Next.js-specific behavior, read the relevant installed guide under `node_modules/next/dist/docs/`. Then run:

```bash
npm run build
```

Expected: Prisma generation and Next.js production build complete successfully.

- [ ] **Step 4: Verify admin registration settings at desktop and mobile widths**

Start the local app and open the registration-form editor.

Verify:

- checkbox and first text line share the same visual baseline;
- completion CTA toggle, label, and URL autosave;
- invalid URL feedback appears immediately below the URL field;
- form/completion preview switch shows the same CTA hierarchy as the viewer;
- at 375px width, no checkbox text or completion action is clipped.

- [ ] **Step 5: Verify native and embed registration completion**

Use a non-production test webinar and submit unique registration data.

Verify:

- native completion modal shows configured CTA and `닫기`;
- CTA opens a new tab and the original waiting page remains;
- incomplete CTA falls back to the original single `확인`;
- embed completion popup matches the same hierarchy and new-tab behavior;
- long success text scrolls without hiding either action.

- [ ] **Step 6: Verify waiting-screen independence**

In owner preview, exercise:

1. Band ON + waiting count 2 or more: band visible.
2. Band OFF + follow-up ON: band hidden, follow-up visible.
3. Band ON + waiting count 0 or 1: band hidden, follow-up visible.
4. Follow-up ON with text only: text visible.
5. Follow-up ON with CTA only: CTA visible.
6. Follow-up ON with unsafe/incomplete CTA and no text: entire follow-up hidden.
7. Follow-up OFF with populated values: follow-up hidden.

At 375px and 1440px widths, verify the follow-up remains above calendar/share/notify actions and uses theme-derived colors.

- [ ] **Step 7: Inspect the final diff and commit any verification-only corrections**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated landing files remain unstaged.

If verification required a correction, stage only the files changed for this feature and commit:

```bash
git commit -m "fix(웨비나): 등록 완료와 대기 CTA 검증 보완"
```
