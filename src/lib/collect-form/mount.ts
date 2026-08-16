/**
 * 등록 폼 마운트 — **하나뿐인 렌더러**(설계 §16.1).
 *
 * 세 소비처가 전부 이 함수를 탄다:
 *  · 아임웹 임베드 (`/f/{id}` 번들 → form-entry.boot)
 *  · 미리보기 링크 (`/p/{previewToken}`)
 *  · 빌더 옆칸 미리보기 (어드민)
 * 미리보기 전용 렌더러를 따로 두면 "미리보기와 실제가 다르다" 가 반드시 생긴다.
 *
 * React 를 쓰지 않는다 — 이 파일은 esbuild 로 번들되어 남의 사이트 문서에서 돈다.
 * DOM 은 `h()` 로만 만든다(innerHTML 금지 — src/lib/__tests__/embed-runtime.test.ts 가 강제).
 */
import { h, clearNode } from "@/lib/dom/h";
import { COLLECT_FORM_CSS } from "./css";
import {
  DEFAULT_LOCALE,
  localize,
  noticeValueKey,
  resolveRegistrationStatus,
  validateSubmission,
  visibleFields,
  type CollectField,
  type CollectFormConfig,
  type Localized,
  type RegistrationStatus,
  type SubmissionIssue,
} from "@/lib/collect-form-config";
import { isValidEmail } from "@/lib/webinar-config";
// 로더가 심어 둔 first-touch UTM 을 그대로 쓴다 — 파트너 사이트를 먼저 거친 방문자의 정본이다.
import { buildUtmEnvelope } from "@/lib/attribution-client";

const STYLE_ID = "msf-css";

/**
 * 미리보기 완료 화면에 쓰는 더미 등록번호(설계 §16.1 "화면 확인용 더미 번호로 렌더").
 * **체크digit 이 일부러 틀린 값**이다 — 이 번호가 어딘가로 새어 나가 현장 조회에 쓰이면
 * "없는 번호" 가 아니라 "잘못 입력하셨어요" 로 걸러진다.
 */
const PREVIEW_REG_NO = "0000000000000";

/** 안내 문구 — 로케일 대응은 §11 이후. 지금은 영어 단일 전시(LA)라 화면 문구도 여기 모은다. */
const COPY = {
  before: { title: "Registration hasn't opened yet", body: "The form will appear here once registration opens." },
  closed: { title: "Registration is closed", body: "On-site registration is available at the venue." },
  submit: "Register",
  submitting: "Submitting…",
  empty: "This form has no fields yet.",
  required: "Required",
  invalidEmail: "Check the email format",
  invalidPhone: "This number isn't valid for the selected country",
  unknownKey: "Not part of this form",
  tooMany: "Too many selected",
  notAnOption: "Not one of the options",
  consentRequired: "Please agree to continue",
  duplicate: "This email is already registered.",
  networkError: "Couldn't submit. Please try again.",
  closedNow: "Registration just closed.",
  doneTitle: "You're registered",
  regNoLabel: "Registration number — show this at the venue",
  previewFlag: "Preview — nothing is saved",
  previewDone: "Sample number — nothing was saved.",
  more: "Details",
  less: "Hide",
} as const;

const ISSUE_COPY: Record<SubmissionIssue["code"], string> = {
  required: COPY.required,
  invalid_email: COPY.invalidEmail,
  invalid_phone: COPY.invalidPhone,
  unknown_key: COPY.unknownKey,
  too_many: COPY.tooMany,
  not_an_option: COPY.notAnOption,
  consent_required: COPY.consentRequired,
};

export interface MountCollectFormOptions {
  mount: HTMLElement;
  config: CollectFormConfig;
  /** 제출·중복확인 절대 URL 의 기준. 임베드는 호스트 도메인에서 돌아 상대경로가 깨진다. */
  origin: string;
  sourceId: string;
  /**
   * 미리보기 — **부작용을 전부 막는다**(설계 §16.1). 저장·dataLayer 가 꺼지고,
   * 검증은 실제와 똑같이 돌린 뒤 저장 직전에 멈춘다. 중복확인 조회만 허용(읽기 전용).
   */
  preview?: boolean;
  /** 미리보기에서 상태를 강제로 본다(?status=). */
  forceStatus?: RegistrationStatus;
  /** 미리보기에서 특정 유형 문항이 펼쳐진 상태로 연다(?type=). */
  forceType?: string;
  locale?: string;
  /**
   * 서버가 스크립트에 실어 보낸 시각(ISO). 상태 판정을 **방문자 시계로 하지 않는다** —
   * 기기 시계가 틀어져 있으면 마감된 폼이 열리거나 열린 폼이 마감으로 보인다.
   */
  serverNow?: string | null;
  /** 응답이 CDN 캐시에 머문 시간(ms). serverNow 가 그만큼 과거라 되돌린다. */
  ageMs?: number;
}

export interface CollectFormHandle {
  destroy(): void;
}

/** 스타일은 문서당 1벌. 폼이 두 개 붙어도 한 번만 넣는다. */
function ensureStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = COLLECT_FORM_CSS;
  document.head.appendChild(style);
}

/**
 * dataLayer 단일 창구(설계 §18). Meta 픽셀·Google Ads 를 직접 부르지 않는다 —
 * 픽셀 ID 가 코드에 박히면 전시·계정마다 배포가 필요해진다.
 * **미리보기에서는 절대 발화하지 않는다** — 미리보기 클릭이 광고 전환으로 잡히면 데이터가 오염된다.
 */
type DataLayerWindow = Window & { dataLayer?: unknown[] };
function track(preview: boolean, event: string, params?: Record<string, unknown>): void {
  if (preview) return;
  try {
    const w = window as DataLayerWindow;
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event, ...(params ?? {}) });
  } catch {
    /* 호스트를 깨뜨리지 않는다 */
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function mountCollectForm(opts: MountCollectFormOptions): CollectFormHandle {
  ensureStyles();

  const { config, mount } = opts;
  const preview = opts.preview === true;
  const lang = opts.locale || config.defaultLocale || DEFAULT_LOCALE;
  const t = (v: Localized | undefined) => localize(v, lang);

  /**
   * 서버 시각 오프셋. Age 를 더하지 않으면 CDN 에 굳은 serverNow 를 "지금" 으로 믿어
   * 최대 s-maxage+SWR 만큼 과거가 된다(웨비나 로더가 실제로 겪은 지연).
   */
  let serverOffsetMs = 0;
  if (opts.serverNow) {
    const parsed = Date.parse(opts.serverNow);
    if (!Number.isNaN(parsed)) {
      serverOffsetMs = parsed + (opts.ageMs && opts.ageMs > 0 ? opts.ageMs : 0) - Date.now();
    }
  }
  const nowDate = () => new Date(Date.now() + serverOffsetMs);

  // ── 상태 ────────────────────────────────────────────────────────────
  /**
   * 값은 **JS 에 둔다.** 웨비나 로더는 DOM 을 스냅샷해서 되돌리는데(data-mw-key), 그러면
   * 재렌더마다 DOM 이 정본이라 허니팟·동의처럼 스냅샷에서 빼야 할 것을 매번 따로 챙겨야 한다.
   * 상태를 우리가 들고 있으면 유형을 바꿔도 공통 입력값이 그냥 남는다(설계 §4).
   */
  const values: Record<string, unknown> = {};
  const consent = {
    privacy: config.consent.privacy.defaultChecked,
    marketing: config.consent.marketing.defaultChecked,
  };
  let issues: SubmissionIssue[] = [];
  let submitting = false;
  /** 중복확인이 "이미 있음" 이라고 답한 상태 — 제출 버튼을 잠근다. */
  let duplicate = false;
  let doneRegNo: string | null = null;
  let banner: { tone: "warn" | "ok"; text: string } | null = null;
  let startedTracked = false;
  let dupTimer: ReturnType<typeof setTimeout> | null = null;
  let dupSeq = 0;
  let destroyed = false;

  if (opts.forceType) {
    // ?type=buyer — 분기 기준 항목에 값을 미리 넣어 그 유형 문항이 펼쳐진 채로 연다.
    if (config.branch.enabled && config.branch.fieldKey) values[config.branch.fieldKey] = opts.forceType;
  }

  const issueFor = (key: string) => issues.find((i) => i.key === key);
  const clearIssue = (key: string) => {
    issues = issues.filter((i) => i.key !== key);
  };

  const root = h("div", { class: "msf" });
  const stack = h("div", { class: "msf-stack" });
  root.appendChild(stack);

  // ── 안내 블록 ───────────────────────────────────────────────────────
  function renderNotice(n: CollectFormConfig["notices"][number]): HTMLElement {
    const body = t(n.body);
    const box = h("div", { class: "msf-notice" });
    const title = t(n.title);
    if (title) box.appendChild(h("div", { class: "msf-notice-title" }, title));

    // 사용자 텍스트는 줄바꿈을 보존한다(AGENTS.md 공통) — CSS 의 white-space:pre-wrap.
    const bodyEl = h("div", { class: "msf-notice-body" }, body);
    if (body) box.appendChild(bodyEl);

    if (n.collapsible && body) {
      let open = false;
      bodyEl.style.display = "none";
      const btn = h("button", { type: "button", class: "msf-more" }, COPY.more);
      btn.addEventListener("click", () => {
        open = !open;
        bodyEl.style.display = open ? "" : "none";
        btn.textContent = open ? COPY.less : COPY.more;
      });
      box.appendChild(btn);
    }

    if (n.mode !== "notice") {
      const key = noticeValueKey(n.id);
      const cb = h("input", { type: "checkbox" }) as HTMLInputElement;
      cb.checked = values[key] === true;
      cb.addEventListener("change", () => {
        values[key] = cb.checked;
        clearIssue(key);
        errSlot.textContent = "";
        updateSubmitState();
      });
      const mark = n.mode === "checkbox-required" ? "[required] " : "[optional] ";
      box.appendChild(h("label", { class: "msf-check" }, cb, h("span", null, mark + "I agree")));
      const errSlot = h("div", { class: "msf-err" }, issueFor(key) ? ISSUE_COPY[issueFor(key)!.code] : "");
      box.appendChild(errSlot);
    }
    return box;
  }

  const noticesAt = (placement: "top" | "above-consent" | "bottom") =>
    config.notices.filter((n) => n.enabled && n.placement === placement);

  // ── 항목 ────────────────────────────────────────────────────────────
  const fieldsHost = h("div", { class: "msf-stack" });

  function renderField(f: CollectField): HTMLElement {
    const wrap = h("div", { class: "msf-field" });
    const labelText = t(f.label) || f.key;
    const inputId = `msf-${opts.sourceId}-${f.key}`;

    wrap.appendChild(
      h("label", { class: "msf-label", for: inputId },
        labelText,
        f.required ? h("span", { class: "msf-req" }, "*") : null,
      ),
    );

    const issue = issueFor(f.key);
    const err = h("div", { class: "msf-err" }, issue ? ISSUE_COPY[issue.code] : "");
    const invalid = issue ? "true" : "false";

    const options = f.options.map((o) => t(o)).filter(Boolean);

    if (f.type === "select") {
      const sel = h("select", { class: "msf-select", id: inputId, "aria-invalid": invalid }) as HTMLSelectElement;
      sel.appendChild(h("option", { value: "" }, t(f.placeholder) || "Select"));
      for (const o of options) sel.appendChild(h("option", { value: o }, o));
      sel.value = str(values[f.key]);
      sel.addEventListener("change", () => {
        values[f.key] = sel.value;
        clearIssue(f.key);
        markStarted();
        if (config.branch.enabled && config.branch.fieldKey === f.key) {
          track(preview, "ms_visitor_type_selected", { visitor_type: sel.value });
          // 분기 기준이 바뀌면 항목 목록 자체가 달라진다 — 이 영역만 다시 그리고 포커스를 되돌린다.
          renderFields();
          const again = fieldsHost.querySelector<HTMLSelectElement>(`#${cssId(inputId)}`);
          if (again) again.focus();
        } else {
          err.textContent = "";
        }
        updateSubmitState();
      });
      wrap.appendChild(sel);
    } else if (f.type === "multiple") {
      if (options.length === 0) {
        wrap.appendChild(h("div", { class: "msf-hint" }, "No options configured"));
      } else {
        const picked = () => (Array.isArray(values[f.key]) ? (values[f.key] as unknown[]).map(str) : []);
        const chips = h("div", { class: "msf-chips" });
        const atMax = () => f.maxSelect != null && picked().length >= f.maxSelect;
        const paint = () => {
          const list = picked();
          for (const el of Array.from(chips.children) as HTMLElement[]) {
            const v = el.getAttribute("data-v") ?? "";
            const on = list.indexOf(v) !== -1;
            el.setAttribute("data-on", on ? "1" : "0");
            el.setAttribute("data-disabled", !on && atMax() ? "1" : "0");
            const box = el.querySelector("input") as HTMLInputElement | null;
            if (box) { box.checked = on; box.disabled = !on && atMax(); }
          }
        };
        for (const o of options) {
          const box = h("input", { type: "checkbox" }) as HTMLInputElement;
          const chip = h("label", { class: "msf-chip", "data-v": o }, box, h("span", null, o));
          box.addEventListener("change", () => {
            const list = picked();
            values[f.key] = box.checked ? list.concat([o]) : list.filter((x) => x !== o);
            clearIssue(f.key);
            err.textContent = "";
            markStarted();
            paint();
            updateSubmitState();
          });
          chips.appendChild(chip);
        }
        paint();
        wrap.appendChild(chips);
        if (f.maxSelect != null) wrap.appendChild(h("div", { class: "msf-hint" }, `Choose up to ${f.maxSelect}`));
      }
    } else if (f.type === "checkbox") {
      const cb = h("input", { type: "checkbox", id: inputId }) as HTMLInputElement;
      cb.checked = values[f.key] === true;
      cb.addEventListener("change", () => {
        values[f.key] = cb.checked;
        clearIssue(f.key);
        err.textContent = "";
        markStarted();
        updateSubmitState();
      });
      wrap.appendChild(h("label", { class: "msf-check" }, cb, h("span", null, t(f.placeholder) || labelText)));
    } else {
      const input = h("input", {
        class: "msf-input",
        id: inputId,
        type: f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text",
        placeholder: t(f.placeholder),
        "aria-invalid": invalid,
        autocomplete: f.type === "email" ? "email" : f.type === "tel" ? "tel" : "on",
      }) as HTMLInputElement;
      input.value = str(values[f.key]);

      if (f.type === "tel") {
        input.inputMode = "numeric";
        /**
         * 하이픈·괄호·공백은 **타이핑 즉시** 지운다(AGENTS.md "입력은 소스에서 정규화").
         * 값이 실제로 달라졌을 때만 되쓴다 — 매번 대입하면 커서가 끝으로 튄다.
         */
        input.addEventListener("input", () => {
          const digits = input.value.replace(/[^0-9+]/g, "");
          if (input.value !== digits) {
            const atEnd = input.selectionStart === input.value.length;
            input.value = digits;
            if (atEnd) input.setSelectionRange(digits.length, digits.length);
          }
          values[f.key] = input.value;
          clearIssue(f.key);
          err.textContent = "";
          markStarted();
          updateSubmitState();
        });
      } else {
        input.addEventListener("input", () => {
          values[f.key] = input.value;
          clearIssue(f.key);
          err.textContent = "";
          markStarted();
          if (f.type === "email") scheduleDuplicateCheck(input.value, err);
          updateSubmitState();
        });
      }

      if (f.type === "tel") {
        // 국가코드는 설정값 하나(LA 는 US) — 아닌 사람만 국제표기(+…)로 직접 적는다(§6.3).
        wrap.appendChild(
          h("div", { class: "msf-tel" },
            h("span", { class: "msf-tel-cc" }, config.validation.defaultCountry),
            input,
          ),
        );
      } else {
        wrap.appendChild(input);
      }
    }

    wrap.appendChild(err);
    return wrap;
  }

  /** querySelector 용 id 이스케이프. 항목 key 는 운영자가 정하므로 점·콜론이 들어올 수 있다. */
  function cssId(id: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/[^\w-]/g, "\\$&");
  }

  function renderFields(): void {
    clearNode(fieldsHost);
    const fields = visibleFields(config, values);
    if (fields.length === 0) {
      fieldsHost.appendChild(h("div", { class: "msf-hint" }, COPY.empty));
      return;
    }
    for (const f of fields) fieldsHost.appendChild(renderField(f));
  }

  function markStarted(): void {
    if (startedTracked) return;
    startedTracked = true;
    track(preview, "ms_form_start");
  }

  // ── 실시간 중복 확인(§6.2) ──────────────────────────────────────────
  /**
   * 유효한 이메일이 된 뒤 600ms 조용하면 조회한다. 조회는 **읽기 전용이라 미리보기에서도 돈다**
   * (설계 §16.1 표: 중복 확인 조회는 허용).
   *
   * 타이핑하는 순간 잠금을 먼저 푼다 — 고치는 중에 버튼이 잠겨 있으면 고장으로 보인다.
   * 그래서 이건 **안내이지 방어선이 아니다.** 진짜 방어선은 서버의 409 다(DB 유니크).
   */
  function scheduleDuplicateCheck(raw: string, errSlot: HTMLElement): void {
    if (dupTimer) clearTimeout(dupTimer);
    const mySeq = ++dupSeq;
    if (duplicate) { duplicate = false; updateSubmitState(); }
    const value = raw.trim().toLowerCase();
    if (!isValidEmail(value)) return;
    if (config.validation.onDuplicate !== "block") return;

    dupTimer = setTimeout(() => {
      fetch(`${opts.origin}/api/collect/${encodeURIComponent(opts.sourceId)}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ email: value }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { exists?: boolean } | null) => {
          if (destroyed || mySeq !== dupSeq) return;
          duplicate = Boolean(d && d.exists);
          if (duplicate) {
            errSlot.textContent = COPY.duplicate;
            track(preview, "ms_form_duplicate");
          }
          updateSubmitState();
        })
        // 조회 실패는 통과시킨다(fail-open) — 네트워크가 잠깐 흔들렸다고 등록을 막을 수는 없다.
        .catch(() => {});
    }, 600);
  }

  // ── 동의 ────────────────────────────────────────────────────────────
  function renderConsentRow(
    item: CollectFormConfig["consent"]["privacy"],
    required: boolean,
    fallbackLabel: string,
    issueKey: string,
    onChange: (v: boolean) => void,
    initial: boolean,
  ): HTMLElement {
    const wrap = h("div", { class: "msf-field" });
    const cb = h("input", { type: "checkbox" }) as HTMLInputElement;
    cb.checked = initial;
    const err = h("div", { class: "msf-err" }, issueFor(issueKey) ? COPY.consentRequired : "");
    cb.addEventListener("change", () => {
      onChange(cb.checked);
      clearIssue(issueKey);
      err.textContent = "";
      updateSubmitState();
    });

    const label = h("label", { class: "msf-check" },
      cb,
      h("span", null, `[${required ? "required" : "optional"}] ${t(item.label) || fallbackLabel}`),
    );
    wrap.appendChild(label);

    const body = t(item.body);
    if (body) {
      let open = false;
      const detail = h("div", { class: "msf-notice-body" }, body);
      detail.style.display = "none";
      const btn = h("button", { type: "button", class: "msf-more" }, COPY.more);
      btn.addEventListener("click", () => {
        open = !open;
        detail.style.display = open ? "" : "none";
        btn.textContent = open ? COPY.less : COPY.more;
      });
      wrap.appendChild(btn);
      wrap.appendChild(detail);
    }
    wrap.appendChild(err);
    return wrap;
  }

  // ── 제출 ────────────────────────────────────────────────────────────
  const submitBtn = h("button", { type: "button", class: "msf-submit" },
    t(config.submitLabel) || COPY.submit,
  ) as HTMLButtonElement;
  const bannerEl = h("div", { class: "msf-banner" });
  bannerEl.style.display = "none";

  function updateSubmitState(): void {
    submitBtn.disabled = submitting || duplicate;
    submitBtn.textContent = submitting ? COPY.submitting : t(config.submitLabel) || COPY.submit;
  }

  function showBanner(tone: "warn" | "ok", text: string): void {
    banner = { tone, text };
    bannerEl.setAttribute("data-tone", tone);
    bannerEl.textContent = text;
    bannerEl.style.display = "";
  }
  function hideBanner(): void {
    banner = null;
    bannerEl.style.display = "none";
  }

  /** 제출에 실을 값 — **지금 보이는 항목만**. 분기를 되돌렸을 때 남은 값이 unknown_key 가 되지 않게. */
  function payloadValues(): Record<string, unknown> {
    const fields = visibleFields(config, values);
    const allowed = new Set(fields.map((f) => f.key));
    for (const n of config.notices) {
      if (n.enabled && n.mode !== "notice") allowed.add(noticeValueKey(n.id));
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(values)) if (allowed.has(k)) out[k] = values[k];
    return out;
  }

  function focusFirstIssue(): void {
    const first = issues[0];
    if (!first) return;
    const el = fieldsHost.querySelector<HTMLElement>(`#${cssId(`msf-${opts.sourceId}-${first.key}`)}`);
    if (el && typeof el.focus === "function") el.focus();
  }

  async function submit(): Promise<void> {
    if (submitting || duplicate) return;
    hideBanner();

    const visitorType = config.branch.enabled ? str(values[config.branch.fieldKey]) : undefined;
    track(preview, "ms_form_submit", visitorType ? { visitor_type: visitorType } : undefined);

    // 접수 창을 **누를 때 다시 본다.** 폼을 열어 둔 채로 마감 시각이 지나갈 수 있다.
    if (!opts.forceStatus && resolveRegistrationStatus(config, nowDate()) !== "open") {
      render();
      return;
    }

    const body = payloadValues();
    issues = validateSubmission(config, body, {
      isValidEmail,
      // 전화 검증은 서버가 libphonenumber 로 한다 — 그 메타데이터를 번들에 넣으면
      // 임베드가 수백 KB 커진다(collect-phone.ts 주석). 여기서는 비어 있지 않은지만 본다.
      isValidPhone: (v) => v.trim().length > 0,
      consent,
    });
    if (issues.length > 0) {
      renderFields();
      renderConsent();
      focusFirstIssue();
      track(preview, "ms_form_error", { error_code: issues[0].code });
      return;
    }

    /**
     * ── 미리보기는 **저장 직전에 멈춘다**(설계 §16.1) ────────────────
     * 검증까지는 실제와 똑같이 돌린 뒤 여기서 끊고, 완료 화면은 **더미 번호**로 그린다.
     * 배너 한 줄로 끝내면 운영자가 완료 화면을 영영 못 본다 — 이메일 연동 전에는 그 화면이
     * 등록자가 번호를 받는 유일한 경로라 확인이 꼭 필요하다(§2).
     */
    if (preview) {
      doneRegNo = PREVIEW_REG_NO;
      render();
      return;
    }

    submitting = true;
    updateSubmitState();
    try {
      const res = await fetch(`${opts.origin}/api/collect/${encodeURIComponent(opts.sourceId)}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          values: body,
          consent,
          locale: lang,
          _hp: honeypot.value || "",
          _utm: utmEnvelope(),
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { registrationNo?: string; rid?: string; issues?: SubmissionIssue[]; duplicateField?: string; status?: string }
        | null;

      if (res.status === 201 && data?.registrationNo) {
        doneRegNo = data.registrationNo;
        track(preview, "generate_lead", {
          visitor_type: visitorType,
          transaction_id: data.rid ?? data.registrationNo,
        });
        render();
        return;
      }
      if (res.status === 409) {
        duplicate = true;
        track(preview, "ms_form_duplicate");
        showBanner("warn", COPY.duplicate);
      } else if (res.status === 403 && data?.status) {
        // 마감이 서버에서 확정됐다 — 화면을 마감으로 바꾼다.
        showBanner("warn", COPY.closedNow);
        render();
      } else if (res.status === 400 && Array.isArray(data?.issues)) {
        issues = data.issues;
        renderFields();
        renderConsent();
        focusFirstIssue();
        track(preview, "ms_form_error", { error_code: issues[0]?.code ?? "invalid" });
      } else {
        showBanner("warn", COPY.networkError);
        track(preview, "ms_form_error", { error_code: "http_" + res.status });
      }
    } catch {
      showBanner("warn", COPY.networkError);
      track(preview, "ms_form_error", { error_code: "network" });
    } finally {
      submitting = false;
      updateSubmitState();
    }
  }

  submitBtn.addEventListener("click", () => { void submit(); });

  /** 봇이 자동완성하는 hidden 필드. 사람에게는 보이지 않고 스크린리더도 건너뛴다. */
  const honeypot = h("input", {
    type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true",
  }) as HTMLInputElement;
  honeypot.style.cssText = "position:absolute;left:-9999px;width:1px;height:1px;opacity:0";

  /** UTM 봉투 — 저장소 접근이 막힌 브라우저(사파리 프라이빗 등)에서 던질 수 있어 감싼다. */
  function utmEnvelope(): Record<string, unknown> | null {
    try {
      return buildUtmEnvelope();
    } catch {
      return null;
    }
  }

  // ── 렌더 ────────────────────────────────────────────────────────────
  const consentHost = h("div", { class: "msf-stack" });
  function renderConsent(): void {
    clearNode(consentHost);
    if (config.consent.privacy.enabled) {
      consentHost.appendChild(
        renderConsentRow(config.consent.privacy, true, "I agree to the privacy policy", "consent_privacy",
          (v) => { consent.privacy = v; }, consent.privacy),
      );
    }
    if (config.consent.marketing.enabled) {
      consentHost.appendChild(
        renderConsentRow(config.consent.marketing, false, "Send me updates", "consent_marketing",
          (v) => { consent.marketing = v; }, consent.marketing),
      );
    }
  }

  function render(): void {
    clearNode(stack);

    if (preview) stack.appendChild(h("div", { class: "msf-preview-flag" }, COPY.previewFlag));

    // 완료 화면 — 이메일 연동 전에는 **여기가 등록자가 번호를 받는 첫 경로**다(설계 §2·§8).
    if (doneRegNo) {
      stack.appendChild(
        h("div", { class: "msf-done" },
          h("div", { class: "msf-done-title" }, COPY.doneTitle),
          h("div", { class: "msf-regno" }, doneRegNo),
          h("div", { class: "msf-regno-label" }, preview ? COPY.previewDone : COPY.regNoLabel),
        ),
      );
      return;
    }

    const status = opts.forceStatus ?? resolveRegistrationStatus(config, nowDate());
    if (status !== "open") {
      const copy = status === "before" ? COPY.before : COPY.closed;
      stack.appendChild(
        h("div", { class: "msf-state" },
          h("div", { class: "msf-state-title" }, copy.title),
          h("div", { class: "msf-state-body" }, copy.body),
        ),
      );
      track(preview, "ms_form_view", { form_status: status });
      return;
    }

    if (config.eventInfo.enabled) {
      const dates = config.eventInfo.eventDates;
      const venue = t(config.eventInfo.venue);
      if (dates.length > 0 || venue) {
        const info = h("div", { class: "msf-info" });
        if (dates.length > 0) info.appendChild(h("div", { class: "msf-info-date" }, dates.join(" · ")));
        if (venue) info.appendChild(h("div", { class: "msf-info-row" }, venue));
        for (const r of config.eventInfo.extraRows) {
          const label = t(r.label);
          const value = t(r.value);
          if (!label && !value) continue;
          info.appendChild(h("div", { class: "msf-info-row" }, h("b", null, label), value ? " " + value : ""));
        }
        stack.appendChild(info);
      }
    }

    for (const n of noticesAt("top")) stack.appendChild(renderNotice(n));
    renderFields();
    stack.appendChild(fieldsHost);
    for (const n of noticesAt("above-consent")) stack.appendChild(renderNotice(n));
    renderConsent();
    stack.appendChild(consentHost);
    for (const n of noticesAt("bottom")) stack.appendChild(renderNotice(n));
    stack.appendChild(honeypot);
    stack.appendChild(submitBtn);
    stack.appendChild(bannerEl);
    if (banner) showBanner(banner.tone, banner.text);
    updateSubmitState();

    track(preview, "ms_form_view", { form_status: status });
  }

  clearNode(mount);
  mount.appendChild(root);
  render();

  return {
    destroy() {
      destroyed = true;
      if (dupTimer) clearTimeout(dupTimer);
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
