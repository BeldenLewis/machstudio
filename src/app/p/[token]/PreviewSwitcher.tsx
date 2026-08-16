"use client";

/**
 * 미리보기 상태 전환 — 상태·화면·언어를 **URL 로** 바꾼다.
 *
 * 컴포넌트 안 state 로 두지 않는 이유: 이 링크는 남에게 보내는 것이라 "마감 화면 좀 봐 주세요"
 * 가 링크 하나로 끝나야 한다(/p/{token}?status=closed). 상태가 URL 에 없으면 받은 사람이
 * 매번 같은 버튼을 다시 눌러야 한다.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const STATUS_TABS = [
  { value: "", label: "지금 상태" },
  { value: "before", label: "접수 전" },
  { value: "open", label: "접수 중" },
  { value: "closed", label: "마감" },
] as const;

const SCREEN_TABS = [
  { value: "form", label: "등록 폼" },
  { value: "done", label: "등록 완료" },
] as const;

export function PreviewSwitcher({
  status, screen, lang, locales,
}: {
  status?: string;
  screen: string;
  lang: string;
  locales: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.toString() ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const tab = (on: boolean) =>
    `rounded-lg px-2 py-1 text-[11px] transition-shadow ${on ? "bg-violet-500/12 font-semibold text-violet-600 shadow-sm" : "hover:bg-secondary"}`;

  return (
    <div className="mx-auto flex max-w-lg flex-wrap items-center gap-x-3 gap-y-1 px-3 pb-2">
      <div className="flex items-center gap-0.5">
        {STATUS_TABS.map((t) => (
          <button key={t.value || "auto"} type="button" onClick={() => go("status", t.value)} className={tab((status ?? "") === t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5">
        {SCREEN_TABS.map((t) => (
          <button key={t.value} type="button" onClick={() => go("screen", t.value === "form" ? "" : t.value)} className={tab(screen === t.value)}>
            {t.label}
          </button>
        ))}
      </div>
      {/* 언어는 번역이 실제로 들어 있을 때만 고를 게 있다 — 하나뿐이면 굳이 보여 주지 않는다. */}
      {locales.length > 1 && (
        <div className="flex items-center gap-0.5">
          {locales.map((l) => (
            <button key={l} type="button" onClick={() => go("lang", l)} className={tab(lang === l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
