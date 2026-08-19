"use client";

import { FIELD_CLS, R } from "@/components/ui/primitives";

/**
 * 색 하나를 고르는 칸 — 견본 + HEX 입력 + 자주 쓰는 색 몇 개.
 *
 * `<input type="color">` 만 두면 운영자가 브랜드 가이드의 HEX 를 **그대로 넣을 수 없다**
 * (OS 색 선택기를 열어 손으로 찾아야 한다). 반대로 HEX 칸만 두면 지금 무슨 색인지 안 보인다.
 * 둘을 나란히 두고, 자주 쓰는 색은 눌러서 넣게 한다.
 *
 * `allowInherit` 를 켜면 **비울 수 있다**. 빈 값은 "안 정함"이고, 부르는 쪽이 그때 무엇을
 * 따르는지(보통 키컬러) 정한다 — 여기서 기본값을 넣어 버리면 키컬러를 바꿔도 안 따라온다.
 */
export function ColorField({
  label,
  note,
  value,
  onChange,
  presets = [],
  allowInherit = false,
  inheritLabel = "키컬러 따름",
  inheritedFrom,
}: {
  label: string;
  note?: string;
  value: string;
  onChange: (next: string) => void;
  presets?: { hex: string; name: string }[];
  allowInherit?: boolean;
  inheritLabel?: string;
  /** 비어 있을 때 실제로 쓰이는 색 — 견본에 그 색을 보여 준다. */
  inheritedFrom?: string;
}) {
  const empty = !value;
  const shown = empty ? inheritedFrom || "#000000" : value;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium">{label}</span>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>

      <div className="flex items-center gap-2">
        {/* 견본이자 선택기. 비어 있으면 따라가는 색을 흐리게 보여 준다. */}
        <input
          type="color"
          value={shown}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} 고르기`}
          className={`h-8 w-10 shrink-0 cursor-pointer bg-transparent p-0 ${R.control} ${empty ? "opacity-45" : ""}`}
        />
        <div className="min-w-0 flex-1">
          <input
            value={value}
            onChange={(e) => {
              const next = e.target.value.trim();
              // 앞의 # 은 있어도 없어도 받는다 — 브랜드 가이드에서 복사하면 둘 다 온다.
              onChange(next && !next.startsWith("#") ? `#${next}` : next);
            }}
            placeholder={allowInherit ? inheritLabel : "#000000"}
            spellCheck={false}
            className={`${FIELD_CLS} h-8 font-mono text-[12px] uppercase`}
          />
        </div>
        {allowInherit && !empty && (
          <button
            onClick={() => onChange("")}
            title={inheritLabel}
            className={`shrink-0 bg-secondary px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
          >
            비우기
          </button>
        )}
      </div>

      {presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {presets.map((preset) => (
            <button
              key={preset.hex}
              onClick={() => onChange(preset.hex)}
              title={`${preset.name} ${preset.hex}`}
              aria-label={`${preset.name} ${preset.hex}`}
              className={`h-5 w-5 shrink-0 transition-transform hover:scale-110 ${R.control} ${
                value.toLowerCase() === preset.hex.toLowerCase() ? "ring-2 ring-violet-500 ring-offset-1 ring-offset-background" : ""
              }`}
              style={{ background: preset.hex }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 자주 쓰는 키컬러.
 *
 * 앞의 둘은 Korea Expo 것이다 — 실측으로 확인한 값이라 눈으로 맞추지 않아도 된다.
 * (en.usa.k-expo.org 가 현재 쓰는 색이 #FF8500, 2026 LA 인쇄물이 그보다 진한 주황.)
 */
export const BRAND_PRESETS = [
  { hex: "#E2532C", name: "Korea Expo 진한 주황" },
  { hex: "#FF8500", name: "Korea Expo 주황" },
  { hex: "#6D28D9", name: "보라" },
  { hex: "#2563EB", name: "파랑" },
  { hex: "#059669", name: "초록" },
  { hex: "#DC2626", name: "빨강" },
  { hex: "#DB2777", name: "핑크" },
  { hex: "#111827", name: "먹" },
];
