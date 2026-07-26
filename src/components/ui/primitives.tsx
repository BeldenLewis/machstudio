"use client";

/**
 * 만들기 화면의 시각 프리미티브 — 표면·입력·컨트롤.
 *
 * 왜 만드는가: 측정된 드리프트가 값의 문제가 아니라 **선언 위치의 문제**였다.
 *   · `border border-border` 마감 153곳 (AGENTS: 외곽선 대신 그림자)
 *   · `inputCls` 선언 여러 곳, 실제 값 3종 상이 — 같은 입력칸이 탭마다 다르게 생겼다
 *   · 반경 6종 혼용 (rounded-md 17곳·rounded-sm 3곳은 사실상 사고)
 * 그래서 새 룩을 발명하지 않고 **한 곳에서만 정의되게** 만든다.
 *
 * 마감 규칙(실측 근거는 globals.css 토큰 옆에 기록):
 * 이 팔레트에는 3:1 을 넘는 면 경계가 없다. 라이트는 --card 와 --background 가 같은 색이고,
 * 다크는 검정 그림자가 보이지 않는다. 유일하게 남는 신호가 --border(다크 1.32:1)라서
 * **헤어라인을 그림자 선언 안에 넣는다**(아래 FINISH). border 유틸을 지우는 방향이 아니다.
 *
 * 한 파일에 모은 이유: 여섯 조각이 같은 스케일을 공유하고, 파일이 갈리면 그 스케일이
 * 다시 갈린다 — 이 컴포넌트들이 존재하는 이유 자체가 그 재발 방지다.
 *
 * 포커스는 여기서 다루지 않는다. globals.css 의 전역 규칙 한 곳이 소유하므로
 * 프리미티브·화면은 focus 관련 클래스를 쓰지 않는다(예전엔 관용구가 3종으로 갈라져 있었다).
 */


import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

/**
 * 마감을 **Tailwind 임의값**으로 쓴다(globals.css 의 손수 쓴 .finish-* 클래스가 아니라).
 * 이유: 하니스에서 실측했는데 globals.css 에 top-level 로 넣은 .finish-* 가 서브된 CSS 에
 * 하나도 나타나지 않았다 — 같은 파일의 .shadow-card·.mach-toaster 는 나타나고 내 새 클래스만
 * 0개였다(같은 파일의 다른 편집인 포커스 링 var(--ring) 은 반영됨 → 캐시 문제 아님).
 * 임의값은 소스 스캔으로 생성이 보장되므로 이 경로를 쓴다.
 */
export const FINISH = {
  /** 1단 면 — 헤어라인 + 카드 엘리베이션 */
  s1: "shadow-[inset_0_0_0_1px_var(--border),var(--shadow-card)]",
  /** 2단 면·입력 — 헤어라인만 */
  s2: "shadow-[inset_0_0_0_1px_var(--border)]",
  /**
   * 2단 면의 오류 상태. s2 **대신** 쓴다 — 덧붙이면 안 된다.
   * 둘 다 box-shadow 를 쓰는 같은 유틸(shadow-[…])이라, 한 요소에 둘을 얹으면
   * 승자가 className 순서가 아니라 **생성된 CSS 안의 순서**로 정해진다(제어 불가).
   * 그래서 조립부에서 하나를 고르게 만든다.
   */
  s2Danger: "shadow-[inset_0_0_0_1px_var(--destructive)]",
  /** 오버레이 — 다크 --popover 가 --card 와 같은 값이라 한 단 강한 --input 을 헤어라인으로 */
  overlay:
    "shadow-[inset_0_0_0_1px_var(--input),0_12px_32px_-12px_rgb(0_0_0/0.18)] " +
    "dark:shadow-[inset_0_0_0_1px_var(--input),0_16px_40px_-16px_rgb(0_0_0/0.75)]",
  /** 솔리드 컨트롤 — 헤어라인 없이 최소 리프트 */
  control: "shadow-[0_1px_1px_rgb(20_20_25/0.05)] dark:shadow-[0_1px_2px_rgb(0_0_0/0.45)]",
  /** 선택된 것의 헤어라인 — 중립 --border 대신 키 컬러로 (아래 SELECTED 참고) */
  s2Key: "shadow-[inset_0_0_0_1px_var(--ring)]",
  /**
   * 대체 요소(img·video)용 헤어라인 — **밖으로** 그린다.
   * inset 은 여기서 안 통한다: 페인트 순서가 배경 → inset 그림자 → 내용이라 이미지 픽셀이
   * 헤어라인을 덮는다. 하니스에서 실측했다(120px 원형 img 에 inset 8px 빨강 = 아예 안 보임,
   * 같은 조건 outset = 선명). border 대신 이걸 쓰는 이유는 레이아웃 크기를 바꾸지 않는 것.
   */
  hairlineOut: "shadow-[0_0_0_1px_var(--border)]",
} as const;

/**
 * 반경 3단. rounded-full 은 4번째 단이 아니라 **별개 축**이다 — 값이 아니라 형태이고,
 * 반경이 높이로 결정되는 것(상태 점·아바타·스위치 트랙·pill)만 해당한다.
 */
export const R = {
  /** 누르거나 타이핑하는 모든 것. rounded-md·sm·bare 를 여기로 흡수. */
  control: "rounded-lg",
  /** 승격된 면과 반복 항목 행. EditableList 행 셸이 이미 이 값이다. */
  surface: "rounded-xl",
  /** 섹션 카드·팝오버·모달처럼 가장 바깥 면. rounded-3xl 을 흡수. */
  panel: "rounded-2xl",
} as const;

/**
 * 선택 상태 — **면 색조가 아니라 키 컬러**로 표시한다.
 *
 * 승격(bg-card)으로 표현하면 테마에 따라 방향이 뒤집힌다. 레일(bg-secondary) 위에서
 * bg-card 의 명도는 라이트 L* 96.52 → 100 으로 **올라가지만** 다크는 15.20 → 7.78 로
 * **내려간다**(하니스 실측). 즉 라이트에서 솟고 다크에서 파인다. 다크에서 레일보다 밝은
 * 면이 필요한데 색조 사다리에 그런 값이 없다 — secondary 가 이미 그 사다리의 위쪽이다.
 *
 * 그래서 선택은 승격이 아니라 **정체**로 말한다. 승격은 "이건 떠 있다" 고, 선택은
 * "이거다" 다 — 애초에 다른 말이다. Segmented 가 이미 이 방식이었고, 여기로 끌어올렸다.
 *
 * 경계를 지는 건 틴트가 아니라 **키 헤어라인(s2Key)** 이다. 하니스에서 캔버스 합성으로 실측:
 *                       라이트        다크
 *   레일                245,245,245  38,38,38
 *   선택면(틴트 합성)    217,222,228  35,40,46
 *   면 대비              1.24         1.02   ← 다크는 틴트만으로는 사실상 안 보인다
 *   키 헤어라인 vs 레일  5.47:1       4.87:1 ← 실제 경계는 이것 (WCAG 1.4.11 의 3:1 통과)
 *   중립 헤어라인 vs 레일 1.16         1.37   ← --border 로는 애초에 불가능했다
 *   선택 글자 대비       10.76:1      4.78:1 (둘 다 AA 통과)
 */
export const SELECTED_SURFACE = `bg-violet-500/12 ${FINISH.s2Key}`;
export const SELECTED_TEXT = "text-violet-600 dark:text-violet-300";
export const SELECTED = `${SELECTED_SURFACE} ${SELECTED_TEXT}`;

// ─────────────────────────────────────────────────────────────────────────────
// Surface — 면. level 로 색조를 고르고 마감은 자동.
// ─────────────────────────────────────────────────────────────────────────────

export function Surface({
  level = 1,
  radius = "panel",
  as: Tag = "div",
  className = "",
  children,
  ...rest
}: {
  /**
   * 1 = 페이지 위에 놓이는 카드(bg-card).
   * 2 = 카드 **안**의 행·틴트 영역(bg-secondary).
   * 3단은 만들지 않는다 — 색조 사다리가 고갈되는 지점이 곧 위계 설계가 틀린 지점이다.
   */
  level?: 1 | 2;
  radius?: keyof typeof R;
  as?: "div" | "section" | "li";
  className?: string;
  children?: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const tone = level === 1 ? `bg-card ${FINISH.s1}` : `bg-secondary ${FINISH.s2}`;
  return (
    <Tag className={`${R[radius]} ${tone} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Field — 입력 한 벌. 여기가 유일한 선언 위치.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 입력만은 헤어라인 + 채운 배경을 **둘 다** 쓴다.
 * 헤어라인: 입력의 경계선은 장식이 아니라 어포던스 자체(타이핑 가능한 사각형의 범위)이고,
 *           입력은 카드 위·행 위·틴트 위 어디에도 놓이므로 부모에 의존하지 않는 자기 경계가 필요하다.
 * 채운 배경: 다크에서 --background(0.145)는 카드(0.205)·행(0.269)보다 어두워 '움푹 파인 우물'로
 *           읽힌다 — 이 신호를 버리면 다크에서 입력·행·카드의 톤 사다리가 붕괴한다.
 */
/**
 * 입력 클래스 문자열 — 컴포넌트로 아직 못 바꾼 곳이 **값만이라도 하나를 쓰게** 하려고 export 한다.
 * 지금 탭마다 로컬 inputCls 를 선언하고 실제 값이 3종으로 갈려 있어서(px-2.5 py-1.5 rounded-lg /
 * px-3 py-2 rounded-xl / px-3 py-2 rounded-lg) 같은 입력칸이 탭마다 다르게 생겼다.
 * 각 파일의 로컬 선언을 이 import 로 바꾸면 JSX 를 건드리지 않고 값이 통일된다.
 * 최종 목표는 <Field> 컴포넌트지만, 그 이관은 파일별로 따로 한다.
 */
/** 마감을 뺀 몸통. 마감은 항상 **한 개만** 뒤에 붙는다(s2 또는 s2Danger). */
const FIELD_BODY =
  "w-full min-h-9 bg-background px-3 py-2 text-sm text-foreground " +
  "placeholder:text-muted-foreground/50 transition-shadow " +
  "disabled:cursor-not-allowed disabled:opacity-50 " +
  R.control;

export const FIELD_CLS = `${FIELD_BODY} ${FINISH.s2}`;
/** 오류 상태 입력 — FIELD_CLS 와 **둘 중 하나**만 쓴다(위 s2Danger 주석 참고). */
export const FIELD_CLS_DANGER = `${FIELD_BODY} ${FINISH.s2Danger}`;

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Field({ className = "", invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={`${invalid ? FIELD_CLS_DANGER : FIELD_CLS} ${className}`}
        {...rest}
      />
    );
  },
);

export const FieldArea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function FieldArea({ className = "", invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={`${invalid ? FIELD_CLS_DANGER : FIELD_CLS} resize-y leading-relaxed ${className}`}
      {...rest}
    />
  );
});

export const FieldSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function FieldSelect({ className = "", children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${FIELD_CLS} ${className}`} {...rest}>
        {children}
      </select>
    );
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Btn / Chip / Segmented — 컨트롤
// ─────────────────────────────────────────────────────────────────────────────

type BtnTone = "key" | "quiet" | "danger" | "dangerQuiet" | "ghost";

/**
 * tone 이 색을 정하고 마감은 자동. violet 리터럴을 화면에서 직접 쓰지 않게 하는 게 목적이다
 * (지금 `text-violet-600 dark:text-violet-400` 같은 짝을 손으로 반복하는 곳이 많다).
 */
const BTN_TONE: Record<BtnTone, string> = {
  key: `bg-violet-500 text-white hover:bg-violet-600 ${FINISH.control}`,
  quiet: `bg-secondary text-foreground hover:bg-secondary/70 ${FINISH.control}`,
  /**
   * 다크에서 글자색이 **뒤집힌다.** --destructive 가 테마별로 명도가 반대라서다:
   *   라이트 oklch(0.577) = rgb(231,0,11)  → 흰 글자 4.77:1 ✅
   *   다크  oklch(0.704) = rgb(255,100,103) → 흰 글자 2.89:1 ❌ (AA 4.5 미달)
   *                                          → 잉크 글자 6.21:1 ✅
   * 하니스에서 눈으로 보고 계산해 잡았다 — 다크의 삭제 버튼이 연한 빨강에 흰 글자였다.
   */
  danger: `bg-destructive text-white dark:text-[oklch(0.205_0_0)] hover:opacity-90 ${FINISH.control}`,
  /**
   * 파괴적 동작을 **여는** 버튼(확인 단계를 띄우는 쪽). danger 와 다른 톤이 필요한 이유는
   * AGENTS 의 "위험한 저빈도 액션은 멀리·작게" 다 — 채운 빨강을 쓰면 아직 아무것도 지우지
   * 않는 버튼이 화면에서 가장 무거워진다. 색으로 위험을 말하고 무게는 낮춘다.
   * 마감 없음: 리프트를 주면 다시 주요 액션처럼 읽힌다.
   */
  dangerQuiet: "text-destructive hover:bg-destructive/10",
  // ghost 만 마감이 없다 — 면 위에 얹히는 텍스트 액션이라 리프트가 거짓 신호가 된다.
  ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
};

// min-h-9 — 이 코드베이스의 기존 컨트롤 높이. 44px 터치 타깃은 별건으로 남겨 둔다
// (전 컨트롤 높이를 올리면 밀도가 통째로 바뀌어 리디자인 범위를 넘는다).
const BTN_BASE = `inline-flex min-h-9 items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${R.control}`;

/**
 * 클래스 문자열만 필요한 곳을 위한 출구. 이 코드베이스의 버튼 상당수가 `motion.button`
 * (whileHover/whileTap)이라 <Btn> 으로 갈아타면 그 프레스 모션을 잃는다. 톤만 빌려 쓰면
 * 색·마감은 한 곳에서 오고 모션은 그대로 남는다.
 */
export function btnCls(tone: BtnTone = "quiet", extra = "") {
  return `${BTN_BASE} ${BTN_TONE[tone]} ${extra}`;
}

export const Btn = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { tone?: BtnTone }>(
  function Btn({ tone = "quiet", className = "", type = "button", ...rest }, ref) {
    return <button ref={ref} type={type} className={btnCls(tone, className)} {...rest} />;
  },
);

/** 상태 pill — 반경이 높이로 결정되는 것이라 rounded-full 축이다. */
export function Chip({
  tone = "neutral",
  className = "",
  children,
}: {
  tone?: "neutral" | "key" | "warn" | "ok";
  className?: string;
  children: ReactNode;
}) {
  const t = {
    neutral: "bg-secondary text-muted-foreground",
    key: "bg-violet-500/10 text-violet-600 dark:text-violet-300",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${t} ${className}`}>
      {children}
    </span>
  );
}

/**
 * 세그먼트 — 선택 칸을 **--key 계열**로 표현한다. 중립 톤 + 그림자로 하면
 * 다크에서 선택 칸이 컨테이너보다 어두워져 '눌려 들어간 홈'(=비활성 관용구)으로 읽힌다.
 * 색과 링이 두 테마에서 같은 방향을 가리키게 한다.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = "",
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; hint?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div className={`inline-flex flex-wrap gap-1 bg-secondary p-1 ${R.control} ${className}`} role="tablist" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={`min-h-8 px-3 py-1.5 text-xs font-medium transition-colors ${R.control} ${
              on
                ? SELECTED
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
