"use client";

// 공용 토글 스위치 — 어드민 편집 UI(등록 폼·설문 등)에서 사용.
// 접근성: role="switch" + aria-checked, 라벨은 aria-label 로 전달.
export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${checked ? "bg-violet-500" : "bg-secondary border border-border"} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : ""}`} />
    </button>
  );
}
