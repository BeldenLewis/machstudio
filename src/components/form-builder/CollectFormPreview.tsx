"use client";

/**
 * 빌더 옆칸 미리보기.
 *
 * **임베드와 같은 모델을 읽는다** — normalizeCollectForm 이 만든 CollectFormConfig 를 그대로
 * 받고, 보이는 항목은 visibleFields 로 고른다. 미리보기가 자기만의 규칙으로 그리면
 * "미리보기에선 괜찮았는데" 가 반드시 생긴다(SetupPreview 주석의 교훈).
 *
 * 지금은 React 로 그린다. 임베드 런타임(바닐라 번들)이 서면 렌더 함수를 그쪽으로 옮기고
 * 여기서는 그 함수를 부르게 바꾼다 — 그때까지 **모델과 가시성 규칙만이라도** 공유한다.
 */
import { useState } from "react";
import {
  DEFAULT_LOCALE,
  localize,
  noticeValueKey,
  resolveRegistrationStatus,
  visibleFields,
  type CollectFormConfig,
  type RegistrationStatus,
} from "@/lib/collect-form-config";

const STATUS_COPY: Record<RegistrationStatus, { title: string; body: string }> = {
  before: { title: "사전등록이 아직 시작되지 않았어요", body: "접수 시작 시각이 되면 이 자리에 등록 폼이 나타납니다." },
  open: { title: "", body: "" },
  closed: { title: "사전등록이 마감되었어요", body: "현장 등록은 가능합니다." },
};

export function CollectFormPreview({
  config,
  /** 상태를 강제로 볼 수 있게 — 마감 화면을 마감 당일에 처음 보면 늦다. */
  forceStatus,
  now = new Date(),
}: {
  config: CollectFormConfig;
  forceStatus?: RegistrationStatus;
  now?: Date;
}) {
  // 미리보기에서 고른 값 — 분기가 실제로 펼쳐지는지 보려면 값이 필요하다.
  const [values, setValues] = useState<Record<string, unknown>>({});
  const status = forceStatus ?? resolveRegistrationStatus(config, now);

  if (status !== "open") {
    const copy = STATUS_COPY[status];
    return (
      <div className="rounded-xl bg-secondary/40 p-6 text-center">
        <p className="text-sm font-semibold">{copy.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{copy.body}</p>
      </div>
    );
  }

  const fields = visibleFields(config, values);
  const onFormNotices = config.notices.filter(
    (n) => n.enabled && (n.placement === "top" || n.placement === "above-consent" || n.placement === "bottom"),
  );

  return (
    <div className="space-y-3">
      {config.eventInfo.enabled && config.eventInfo.eventDates.length > 0 && (
        <div className="rounded-xl bg-secondary/40 p-3 text-xs">
          <p className="font-semibold">{config.eventInfo.eventDates.join(" · ")}</p>
          {localize(config.eventInfo.venue, DEFAULT_LOCALE) && (
            <p className="mt-0.5 text-muted-foreground">{localize(config.eventInfo.venue, DEFAULT_LOCALE)}</p>
          )}
        </div>
      )}

      {fields.length === 0 && (
        <p className="rounded-xl bg-secondary/40 p-6 text-center text-xs text-muted-foreground">
          항목을 추가하면 여기에 폼이 그려져요
        </p>
      )}

      {fields.map((f) => {
        const label = localize(f.label, DEFAULT_LOCALE) || f.key;
        const opts = f.options.map((o) => localize(o, DEFAULT_LOCALE));
        return (
          <label key={f.id} className="block">
            <span className="mb-1 block text-xs font-medium">
              {label}
              {f.required && <span className="ml-0.5 text-amber-600">*</span>}
            </span>
            {f.type === "select" ? (
              <select
                value={String(values[f.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="w-full rounded-lg bg-background px-2.5 py-2 text-[13px] shadow-sm outline-none"
              >
                <option value="">선택</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "multiple" ? (
              <span className="flex flex-wrap gap-1.5">
                {opts.map((o) => <span key={o} className="rounded-lg bg-background px-2 py-1 text-[12px] shadow-sm">{o}</span>)}
                {opts.length === 0 && <span className="text-[11px] text-muted-foreground">선택지를 추가하세요</span>}
              </span>
            ) : f.type === "checkbox" ? (
              <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <span className="h-3.5 w-3.5 rounded bg-background shadow-sm" aria-hidden />동의/확인
              </span>
            ) : (
              <input
                readOnly
                placeholder={localize(f.placeholder, DEFAULT_LOCALE)}
                className="w-full rounded-lg bg-background px-2.5 py-2 text-[13px] shadow-sm outline-none"
              />
            )}
          </label>
        );
      })}

      {onFormNotices.map((n) => (
        <div key={n.id} className="rounded-xl bg-secondary/40 p-3">
          {localize(n.title, DEFAULT_LOCALE) && <p className="text-xs font-semibold">{localize(n.title, DEFAULT_LOCALE)}</p>}
          {/* 사용자 텍스트는 줄바꿈을 보존한다(AGENTS.md 공통). */}
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">{localize(n.body, DEFAULT_LOCALE)}</p>
          {n.mode !== "notice" && (
            <label className="mt-1.5 flex items-center gap-1.5 text-[11px]">
              <input
                type="checkbox"
                checked={values[noticeValueKey(n.id)] === true}
                onChange={(e) => setValues((v) => ({ ...v, [noticeValueKey(n.id)]: e.target.checked }))}
              />
              {n.mode === "checkbox-required" ? "[필수] 동의합니다" : "[선택] 동의합니다"}
            </label>
          )}
        </div>
      ))}

      {config.consent.privacy.enabled && (
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" defaultChecked={config.consent.privacy.defaultChecked} />
          [필수] {localize(config.consent.privacy.label, DEFAULT_LOCALE) || "개인정보 수집·이용 동의"}
        </label>
      )}
      {config.consent.marketing.enabled && (
        <label className="flex items-center gap-1.5 text-[11px]">
          <input type="checkbox" defaultChecked={config.consent.marketing.defaultChecked} />
          [선택] {localize(config.consent.marketing.label, DEFAULT_LOCALE) || "마케팅 수신 동의"}
        </label>
      )}

      <button type="button" className="w-full rounded-xl bg-violet-500 py-2.5 text-sm font-semibold text-white">
        {localize(config.submitLabel, DEFAULT_LOCALE) || "사전 등록하기"}
      </button>
    </div>
  );
}
