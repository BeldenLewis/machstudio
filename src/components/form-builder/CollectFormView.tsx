"use client";

/**
 * 빌더형 등록 폼의 **유일한 렌더러**.
 *
 * 옆칸 미리보기(360px)와 미리보기 페이지(/p/{token})가 같은 컴포넌트를 쓴다. 크기별로 렌더러를
 * 나누지 않는 이유는 나뉜 순간 "미리보기에선 괜찮았는데" 가 생기기 때문이다 — 폭은 부모가
 * 정하고 이 컴포넌트는 한 벌만 그린다.
 *
 * **제출은 여기서 하지 않는다.** onSubmit 이 없으면(= 지금의 미리보기) 눌러도 네트워크를 타지
 * 않고 검증 결과만 보여 준다. 실제 제출 라우트가 서면 그때 onSubmit 을 넘긴다.
 */
import { useMemo, useState } from "react";
import { AlertCircle, Check, QrCode } from "lucide-react";
import { isValidEmail } from "@/lib/webinar-config";
import { isValidPhoneForCountry, stripPhoneInput } from "@/lib/collect-phone";
import {
  localize,
  noticeValueKey,
  resolveRegistrationStatus,
  validateSubmission,
  visibleFields,
  type CollectField,
  type CollectFormConfig,
  type RegistrationStatus,
  type SubmissionIssue,
} from "@/lib/collect-form-config";

/** 화면 상태 — 등록 완료는 접수 중과 같은 창에서 폼을 대체한다. */
export type CollectScreen = "form" | "done";

const STATUS_COPY: Record<Exclude<RegistrationStatus, "open">, { title: string; body: string }> = {
  before: { title: "사전등록이 아직 시작되지 않았어요", body: "접수 시작 시각이 되면 이 자리에 등록 폼이 나타납니다." },
  closed: { title: "사전등록이 마감되었어요", body: "현장 등록은 가능합니다." },
};

const ISSUE_COPY: Record<SubmissionIssue["code"], string> = {
  required: "필수 항목이에요",
  invalid_email: "이메일 형식을 확인해 주세요",
  invalid_phone: "이 국가에서 쓸 수 없는 번호예요",
  unknown_key: "폼에 없는 값이에요",
  too_many: "선택 개수를 넘었어요",
  not_an_option: "선택지에 없는 값이에요",
  consent_required: "동의가 필요해요",
};

const inputCls =
  "w-full rounded-lg bg-background px-3 py-2 text-sm shadow-sm outline-none transition-shadow focus:shadow focus:ring-2 focus:ring-violet-500/30";

export function CollectFormView({
  config,
  locale,
  /** 상태를 강제로 볼 수 있게 — 마감 화면을 마감 당일에 처음 보면 늦다. */
  forceStatus,
  screen = "form",
  now = new Date(),
  /** 없으면 미리보기 — 검증만 하고 아무것도 보내지 않는다. */
  onSubmit,
}: {
  config: CollectFormConfig;
  locale?: string;
  forceStatus?: RegistrationStatus;
  screen?: CollectScreen;
  now?: Date;
  onSubmit?: (payload: { values: Record<string, unknown>; consent: { privacy: boolean; marketing: boolean } }) => void;
}) {
  const lang = locale || config.defaultLocale;
  const t = (v: Parameters<typeof localize>[0]) => localize(v, lang);

  const [values, setValues] = useState<Record<string, unknown>>({});
  // 동의는 항목이 아니라 별도 축이다(검증도 deps.consent 로 따로 받는다).
  const [consent, setConsent] = useState({
    privacy: config.consent.privacy.defaultChecked,
    marketing: config.consent.marketing.defaultChecked,
  });
  const [issues, setIssues] = useState<SubmissionIssue[] | null>(null);

  const status = forceStatus ?? resolveRegistrationStatus(config, now);
  const fields = useMemo(() => visibleFields(config, values), [config, values]);

  const set = (key: string, v: unknown) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    // 고치는 즉시 그 항목의 오류를 지운다 — 남겨 두면 이미 고친 칸이 계속 빨갛다.
    setIssues((prev) => (prev ? prev.filter((i) => i.key !== key) : prev));
  };

  const issueFor = (key: string) => issues?.find((i) => i.key === key);

  const submit = () => {
    /**
     * **지금 보이는 것만 보낸다.**
     *
     * 분기 유형을 바꾸면 이전 그룹에 적어 둔 값이 values 에 남는다(공통 입력값은 유지하는 게
     * 맞는 동작이라 통째로 비울 수는 없다). 그대로 검증에 넘기면 그 값들이 전부 unknown_key 로
     * 잡혀 **고칠 칸조차 화면에 없는 오류**가 뜬다 — 등록이 영영 안 된다.
     */
    const allowed = new Set(fields.map((f) => f.key));
    for (const n of config.notices) {
      if (n.enabled && n.mode !== "notice") allowed.add(noticeValueKey(n.id));
    }
    const payload = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k)));

    const found = validateSubmission(config, payload, {
      isValidEmail,
      isValidPhone: (v, country) => isValidPhoneForCountry(v, country),
      consent: {
        privacy: config.consent.privacy.enabled ? consent.privacy : true,
        marketing: consent.marketing,
      },
    });
    setIssues(found);
    if (found.length === 0) onSubmit?.({ values, consent });
  };

  if (screen === "done") return <CompletionCard config={config} lang={lang} />;

  if (status !== "open") {
    const copy = STATUS_COPY[status];
    return (
      <div className="rounded-xl bg-secondary/40 p-6 text-center">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
      </div>
    );
  }

  const noticesAt = (placement: "top" | "above-consent" | "bottom") =>
    config.notices.filter((n) => n.enabled && n.placement === placement);

  return (
    <div className="space-y-3">
      {config.eventInfo.enabled && (config.eventInfo.eventDates.length > 0 || t(config.eventInfo.venue)) && (
        <div className="rounded-xl bg-secondary/40 p-3 text-xs">
          {config.eventInfo.eventDates.length > 0 && (
            <p className="font-semibold">{config.eventInfo.eventDates.join(" · ")}</p>
          )}
          {t(config.eventInfo.venue) && <p className="mt-0.5 text-muted-foreground">{t(config.eventInfo.venue)}</p>}
          {config.eventInfo.extraRows.map((r, i) => (
            <p key={i} className="mt-0.5 text-muted-foreground">
              <span className="font-medium text-foreground/70">{t(r.label)}</span> {t(r.value)}
            </p>
          ))}
        </div>
      )}

      {noticesAt("top").map((n) => (
        <NoticeBlock key={n.id} notice={n} lang={lang} values={values} set={set} issue={issueFor(noticeValueKey(n.id))} />
      ))}

      {fields.length === 0 && (
        <p className="rounded-xl bg-secondary/40 p-6 text-center text-xs text-muted-foreground">
          항목을 추가하면 여기에 폼이 그려져요
        </p>
      )}

      {fields.map((f) => (
        <FieldRow key={f.id} field={f} lang={lang} value={values[f.key]} set={set} issue={issueFor(f.key)} />
      ))}

      {noticesAt("above-consent").map((n) => (
        <NoticeBlock key={n.id} notice={n} lang={lang} values={values} set={set} issue={issueFor(noticeValueKey(n.id))} />
      ))}

      {config.consent.privacy.enabled && (
        <ConsentRow
          required
          label={t(config.consent.privacy.label) || "개인정보 수집·이용 동의"}
          body={t(config.consent.privacy.body)}
          checked={consent.privacy}
          onChange={(v) => {
            setConsent((c) => ({ ...c, privacy: v }));
            setIssues((prev) => (prev ? prev.filter((i) => i.key !== "consent_privacy") : prev));
          }}
          issue={issueFor("consent_privacy")}
        />
      )}
      {config.consent.marketing.enabled && (
        <ConsentRow
          label={t(config.consent.marketing.label) || "마케팅 수신 동의"}
          body={t(config.consent.marketing.body)}
          checked={consent.marketing}
          onChange={(v) => setConsent((c) => ({ ...c, marketing: v }))}
        />
      )}

      {noticesAt("bottom").map((n) => (
        <NoticeBlock key={n.id} notice={n} lang={lang} values={values} set={set} issue={issueFor(noticeValueKey(n.id))} />
      ))}

      <button
        type="button"
        onClick={submit}
        className="w-full rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-shadow hover:shadow-md active:shadow-sm"
      >
        {t(config.submitLabel) || "사전 등록하기"}
      </button>

      {/* 검증 결과는 미리보기의 유일한 반응이다 — 저장도 이동도 하지 않는다. */}
      {issues?.length === 0 && !onSubmit && (
        <p className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
          <Check className="h-3.5 w-3.5 shrink-0" />검증을 통과했어요. 미리보기라 저장되지는 않았습니다.
        </p>
      )}
      {issues && issues.length > 0 && (
        <p className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {issues.length}곳을 확인해 주세요.
        </p>
      )}
    </div>
  );
}

// ── 항목 한 줄 ────────────────────────────────────────────────────────
function FieldRow({
  field: f, lang, value, set, issue,
}: {
  field: CollectField;
  lang: string;
  value: unknown;
  set: (key: string, v: unknown) => void;
  issue?: SubmissionIssue;
}) {
  const t = (v: Parameters<typeof localize>[0]) => localize(v, lang);
  const label = t(f.label) || f.key;
  const opts = f.options.map((o) => t(o)).filter(Boolean);
  const picked = Array.isArray(value) ? value.map(String) : [];
  const atMax = f.maxSelect != null && picked.length >= f.maxSelect;

  const control = () => {
    if (f.type === "select") {
      return (
        <select value={String(value ?? "")} onChange={(e) => set(f.key, e.target.value)} className={inputCls}>
          <option value="">선택</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === "multiple") {
      if (opts.length === 0) return <p className="text-[11px] text-muted-foreground">선택지를 추가하세요</p>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {opts.map((o) => {
            const on = picked.includes(o);
            return (
              <label
                key={o}
                className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[12px] shadow-sm transition-shadow ${on ? "bg-violet-500 text-white" : "bg-background hover:shadow"} ${!on && atMax ? "opacity-50" : ""}`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={on}
                  // 최대 개수를 넘기면 **누르기 전에** 막는다 — 눌러 놓고 제출에서 되돌려 주는 것보다 낫다.
                  disabled={!on && atMax}
                  onChange={() => set(f.key, on ? picked.filter((p) => p !== o) : [...picked, o])}
                />
                {o}
              </label>
            );
          })}
        </div>
      );
    }
    if (f.type === "checkbox") {
      return (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={value === true} onChange={(e) => set(f.key, e.target.checked)} />
          {t(f.placeholder) || "동의합니다"}
        </label>
      );
    }
    return (
      <input
        type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
        inputMode={f.type === "tel" ? "tel" : undefined}
        value={String(value ?? "")}
        // 전화는 **입력 시점에** 정규화한다(AGENTS.md 공통) — 안내 문구로 미루지 않는다.
        onChange={(e) => set(f.key, f.type === "tel" ? stripPhoneInput(e.target.value) : e.target.value)}
        placeholder={t(f.placeholder)}
        className={inputCls}
      />
    );
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium">
        {label}
        {f.required && <span className="ml-0.5 text-amber-600">*</span>}
      </label>
      {control()}
      {f.type === "multiple" && f.maxSelect != null && (
        <p className="mt-1 text-[10px] text-muted-foreground">최대 {f.maxSelect}개</p>
      )}
      {/* 검증 피드백은 해당 항목 **바로 아래** 인라인으로(AGENTS.md 공통). */}
      {issue && <p className="mt-1 text-[11px] text-amber-600">{ISSUE_COPY[issue.code]}</p>}
    </div>
  );
}

// ── 안내 블록 ─────────────────────────────────────────────────────────
function NoticeBlock({
  notice: n, lang, values, set, issue,
}: {
  notice: CollectFormConfig["notices"][number];
  lang: string;
  values: Record<string, unknown>;
  set: (key: string, v: unknown) => void;
  issue?: SubmissionIssue;
}) {
  const t = (v: Parameters<typeof localize>[0]) => localize(v, lang);
  const [open, setOpen] = useState(!n.collapsible);
  const key = noticeValueKey(n.id);
  const body = t(n.body);

  return (
    <div className="rounded-xl bg-secondary/40 p-3">
      {t(n.title) && <p className="text-xs font-semibold">{t(n.title)}</p>}
      {/* 사용자 텍스트는 줄바꿈을 보존한다(AGENTS.md 공통). */}
      {open && body && <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{body}</p>}
      {n.collapsible && body && (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] font-medium text-violet-600 underline-offset-2 hover:underline">
          {open ? "접기" : "자세히"}
        </button>
      )}
      {n.mode !== "notice" && (
        <label className="mt-1.5 flex cursor-pointer items-center gap-1.5 text-[11px]">
          <input type="checkbox" checked={values[key] === true} onChange={(e) => set(key, e.target.checked)} />
          {n.mode === "checkbox-required" ? "[필수] 동의합니다" : "[선택] 동의합니다"}
        </label>
      )}
      {issue && <p className="mt-1 text-[11px] text-amber-600">{ISSUE_COPY[issue.code]}</p>}
    </div>
  );
}

function ConsentRow({
  label, body, checked, onChange, required, issue,
}: {
  label: string;
  body: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  required?: boolean;
  issue?: SubmissionIssue;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        [{required ? "필수" : "선택"}] {label}
        {body && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setOpen((v) => !v); }}
            className="font-medium text-violet-600 underline-offset-2 hover:underline"
          >
            자세히
          </button>
        )}
      </label>
      {open && body && (
        <p className="mt-1 whitespace-pre-wrap rounded-lg bg-secondary/40 p-2 text-[11px] leading-relaxed text-muted-foreground">{body}</p>
      )}
      {issue && <p className="mt-1 text-[11px] text-amber-600">{ISSUE_COPY[issue.code]}</p>}
    </div>
  );
}

// ── 등록 완료 ─────────────────────────────────────────────────────────
/**
 * 이메일 연동 전에는 **이 화면이 등록자가 QR 을 받는 첫 경로다**(설계 §2·§8).
 * 미리보기에서는 이동하지 않고 "어디로 이동하는지" 만 적는다 — 미리보기가 남의 페이지로
 * 튀어 버리면 확인하려던 화면을 못 본다.
 */
function CompletionCard({ config, lang }: { config: CollectFormConfig; lang: string }) {
  const t = (v: Parameters<typeof localize>[0]) => localize(v, lang);
  const notices = config.notices.filter((n) => n.enabled && n.placement === "completion");

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-secondary/40 p-5 text-center">
        <p className="text-sm font-semibold">등록이 완료되었어요</p>
        {config.completion.showQr ? (
          <>
            <div className="mx-auto mt-3 grid h-28 w-28 place-items-center rounded-xl bg-background shadow-sm">
              <QrCode className="h-14 w-14 text-muted-foreground/50" aria-hidden />
            </div>
            <p className="mt-2 font-mono text-xs tracking-widest text-muted-foreground">A-0001</p>
            <p className="mt-1 text-[11px] text-muted-foreground">현장에서 이 QR 을 보여 주세요</p>
          </>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">QR 표시가 꺼져 있어요 — 등록자는 이메일로만 티켓을 받습니다.</p>
        )}
      </div>

      {notices.map((n) => (
        <div key={n.id} className="rounded-xl bg-secondary/40 p-3">
          {t(n.title) && <p className="text-xs font-semibold">{t(n.title)}</p>}
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{t(n.body)}</p>
        </div>
      ))}

      {config.completion.redirectUrlTemplate && (
        <p className="rounded-lg bg-secondary/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          등록 후 이 주소로 이동합니다 — 미리보기에서는 이동하지 않아요.
          <br />
          <span className="break-all font-mono text-[10px]">{config.completion.redirectUrlTemplate}</span>
        </p>
      )}
    </div>
  );
}
