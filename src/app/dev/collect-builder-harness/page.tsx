"use client";

/**
 * 사전등록 폼 빌더 하니스.
 *
 * 어드민 화면은 로그인 벽 뒤라 브라우저로 열 수 없다 — 이 하니스가 유일한 육안 확인 경로다
 * (같은 이유로 만든 /dev/registrants-harness, /live-preview 와 같은 계열).
 * **저장은 하지 않는다**: PATCH 를 가로채 화면에 payload 만 찍는다. 실제 소스를 건드리지 않고
 * "무엇이 저장될 뻔했는가" 를 눈으로 본다.
 */
import { useEffect, useState } from "react";
import FormBuilderTab from "@/app/(app)/collect/[id]/FormBuilderTab";
import { AutosaveScope } from "@/components/ui/autosave-scope";

const SEED = {
  fields: [
    { id: "f1", key: "first_name", label: { en: "First name" }, type: "text", required: true, enabled: true, options: [] },
    { id: "f2", key: "email", label: { en: "Email" }, type: "email", required: true, enabled: true, options: [] },
    {
      id: "f3", key: "visitor_type", label: { en: "Visitor type" }, type: "select", required: true, enabled: true,
      options: [{ en: "General" }, { en: "Buyer" }, { en: "Press" }],
    },
  ],
  branch: {
    enabled: true,
    fieldKey: "visitor_type",
    groups: [{ value: "Buyer", fields: [{ id: "b1", key: "company", label: { en: "Company" }, type: "text", required: true, enabled: true, options: [] }] }],
  },
  eventInfo: { enabled: true, eventDates: ["2026-10-22", "2026-10-23"], venue: { en: "Los Angeles Convention Center" } },
  notices: [{ id: "portrait", enabled: true, placement: "above-consent", mode: "notice", title: { en: "Photography notice" }, body: { en: "행사장에서 촬영된 사진·영상이\n홍보에 사용될 수 있습니다." } }],
  consent: { privacy: { enabled: true, label: { en: "Privacy policy" } } },
};

export default function CollectBuilderHarness() {
  const [saves, setSaves] = useState<string[]>([]);

  useEffect(() => {
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.includes("/api/collect-sources/") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body ?? "{}"));
        setSaves((prev) => [`${new Date().toISOString().slice(11, 19)}  항목 ${body.formConfig?.fields?.length ?? 0}개`, ...prev].slice(0, 8));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return real(input, init);
    }) as typeof window.fetch;
    return () => { window.fetch = real; };
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="mb-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">collect builder harness</p>
        <p className="mt-1 text-xs text-muted-foreground">저장은 가로채서 화면에만 기록해요 — 실제 소스는 바뀌지 않습니다.</p>
      </header>

      <AutosaveScope>
        <FormBuilderTab sourceId="harness" initialConfig={SEED} />
      </AutosaveScope>

      <section className="mt-6">
        <h2 className="text-xs font-semibold">자동저장 기록</h2>
        <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground" data-testid="save-log">
          {saves.length === 0 ? <li>아직 없음</li> : saves.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      </section>
    </div>
  );
}
