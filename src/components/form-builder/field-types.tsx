"use client";

/**
 * 폼 빌더가 공유하는 **항목 형식 어휘**.
 *
 * 웨비나 등록 폼과 사전등록 빌더가 같은 6가지 형식을 쓴다. 여기 없이 각자 두면 한쪽에 형식을
 * 추가했을 때 다른 쪽이 조용히 뒤처지고, 같은 형식의 이름이 화면마다 달라진다
 * (예전 "복수 선택"/"다중 선택" 이 그렇게 갈렸다).
 *
 * ── 여기 넣지 **않은** 것: 필드 카드 ────────────────────────────────────
 * 설계는 FieldCard 까지 공용화를 말하지만, 두 빌더가 편집하는 대상이 실제로 다르다:
 *  · 웨비나 필드는 라벨이 평문이고 key 가 고정(system)이다 — 이름·연락처·이메일은 잠겨 있다.
 *  · 사전등록 필드는 라벨이 로케일 맵이고 key 를 운영자가 정하며, 분기 기준 표시가 붙는다.
 * 하나로 합치면 제네릭과 분기가 카드 안에 쌓여 **양쪽 다 읽기 어려워진다.** 갈라지면 곤란한 것은
 * 형식 어휘와 그 선택 UI 지 카드의 겉모습이 아니다 — 그래서 그 둘만 공유한다.
 */
import { useEffect, useRef, useState, type ElementType } from "react";
import { AlignLeft, ListChecks, ListPlus, Mail, Phone, SquareCheck } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";
import { CHOICE_FIELD_TYPES, type WebinarFieldType } from "@/lib/webinar-config";

/**
 * 두 빌더가 공유하는 형식.
 *
 * **새 유니온을 만들지 않고 기존 것을 재수출한다.** 같은 6개를 따로 적어 두면 일곱 번째 유형을
 * 넣을 때 한쪽만 고쳐도 컴파일이 통과하고, 그러면 빌더는 새 유형을 보여 주는데 제출 라우트는
 * 계속 거부한다(등록 경로가 조용히 갈린다).
 */
export type BuilderFieldType = WebinarFieldType;

export const REG_TYPE_META: Record<BuilderFieldType, { label: string; desc: string; icon: ElementType }> = {
  text: { label: "텍스트", desc: "한 줄 입력", icon: AlignLeft },
  email: { label: "이메일", desc: "이메일 주소", icon: Mail },
  tel: { label: "전화번호", desc: "숫자만", icon: Phone },
  select: { label: "드롭다운", desc: "하나만 선택", icon: ListChecks },
  multiple: { label: "복수 선택", desc: "여러 개 선택", icon: ListPlus },
  checkbox: { label: "체크박스", desc: "동의·확인", icon: SquareCheck },
};

// 선택형 둘(드롭다운·복수 선택)을 붙여 둔다 — 고를 때 비교하게 되는 짝이다.
export const REG_TYPE_ORDER: BuilderFieldType[] = ["text", "email", "tel", "select", "multiple", "checkbox"];

/**
 * 선택지를 쓰는 유형 — 옵션 편집·기타 허용·최대 개수가 여기 걸린다.
 * webinar-config 의 것을 **그대로 재수출**한다. 따로 적으면 편집기와 제출 라우트가 서로 다른
 * 배열을 보게 되고, 그 어긋남은 타입으로도 테스트로도 안 잡힌다(양쪽이 각자 사본을 고정한다).
 */
export const CHOICE_TYPES = CHOICE_FIELD_TYPES;

/** 바깥 클릭·Esc 로 닫히는 팝오버. 형식 메뉴가 쓰는 것과 같은 것을 빌더들이 나눠 쓴다. */
export function useRegPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

/**
 * **제네릭이다** — 웨비나·사전등록은 REG_TYPE_ORDER/REG_TYPE_META(기본값)를 그대로 쓰고,
 * 대회 신청 폼처럼 형식이 더 있는(이미지·반복 그룹 등) 빌더는 자기 order/meta 를 넘긴다.
 * 타입마다 메뉴를 따로 그리면 아이콘 팝오버와 네이티브 select 가 화면마다 섞여서, 같은
 * 서비스 안에서 "항목 형식 고르기"가 매번 다르게 생기게 된다 — 선택 UI 는 여기 하나로 모은다.
 */
export function RegTypeMenu<T extends string = BuilderFieldType>({
  current,
  onPick,
  order = REG_TYPE_ORDER as unknown as T[],
  meta: metaMap = REG_TYPE_META as unknown as Record<T, { label: string; desc: string; icon: ElementType }>,
}: {
  current: T;
  onPick: (t: T) => void;
  order?: T[];
  meta?: Record<T, { label: string; desc: string; icon: ElementType }>;
}) {
  return (
    <div className={`absolute left-0 top-full z-30 mt-1.5 w-56 bg-popover p-1.5 ${R.surface} ${FINISH.overlay}`}>
      <p className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground/70">항목 형식</p>
      {order.map((t) => {
        const meta = metaMap[t];
        const Icon = meta.icon;
        const active = current === t;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${active ? "bg-violet-500/10" : "hover:bg-secondary/70"}`}
          >
            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${active ? "bg-violet-500 text-white" : "bg-violet-500/10 text-violet-500"}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className={`block text-[13px] font-semibold ${active ? "text-violet-600 dark:text-violet-400" : ""}`}>{meta.label}</span>
              <span className="block text-[11px] text-muted-foreground">{meta.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
