/**
 * 섹션 **카탈로그** — 타입 × 변형 × 슬롯의 단일 출처.
 *
 * 슬롯 정의 하나가 편집 위젯·정규화·렌더를 동시에 결정한다. 그래서 타입을 추가할 때
 * 손댈 곳이 여기 한 곳이고, 타입별 수제 정규화 코드가 생기지 않는다.
 *
 * ── 레퍼런스 ──────────────────────────────────────────────────────────
 * genesis.com/kr/ko 를 실측해 뽑은 문법이다(2026-08-21). 그 사이트 자체가 변형 기반
 * 섹션 시스템이고, 클래스 이름이 문법을 그대로 말한다(kv-basic · cardroller-textoverlay ·
 * cardroller-imgfocus · toolbox · card-newsfeed · card-dualshape · card-multicolumn).
 * 같은 타입을 한 페이지에 두 번 쓰는 것도 거기서 확인했다(card-dualshape ×2).
 *
 * ── 변형은 슬롯을 공유한다 ────────────────────────────────────────────
 * 변형을 바꿔도 **콘텐츠가 사라지지 않는다**. 슬롯이 정말 달라져야 한다면 그건 다른 타입이다.
 *
 * W1 은 6타입이다. `kv.full`(전폭 히어로)은 **없다** — 아임웹 실측에서 코드블럭 전폭 배치가
 * 불가능한 것으로 나왔다(W0: `allowKvFull=false`, `full-layout-unavailable`).
 */
import type { SectionDef } from "@/lib/expo/types";

/** 배경 톤 — 전 타입 공통 디자인 노브. 렌더가 data-bg 로 쓴다. */
const BG = { bg: ["light", "dark"] };

export const EXPO_SECTIONS: readonly SectionDef[] = [
  {
    type: "kv",
    label: "키비주얼",
    // 첫 번째가 기본. W0 실측으로 full 은 카탈로그에 넣지 않는다.
    variants: [
      { id: "column", label: "콘텐츠 폭" },
      { id: "minimal", label: "텍스트만" },
    ],
    slots: [
      { key: "eyebrow", kind: "text", label: "윗줄" },
      { key: "title", kind: "text", label: "제목", required: true },
      { key: "subtitle", kind: "text", label: "부제" },
      { key: "media", kind: "media", label: "배경 이미지" },
      { key: "cta", kind: "link", label: "버튼" },
    ],
    multi: false,
    pinnedFirst: true,
    design: { ...BG, align: ["left", "center"] },
  },
  {
    type: "textblock",
    label: "본문",
    variants: [
      { id: "statement", label: "한 문단 크게" },
      { id: "prose", label: "제목 + 본문" },
      { id: "twocol", label: "2단" },
    ],
    slots: [
      { key: "heading", kind: "text", label: "제목" },
      { key: "body", kind: "textarea", label: "본문", required: true },
      { key: "media", kind: "media", label: "이미지" },
    ],
    multi: true,
    design: BG,
  },
  {
    type: "cardgrid",
    label: "카드",
    variants: [{ id: "multicolumn", label: "3열" }],
    slots: [
      { key: "heading", kind: "text", label: "제목" },
      {
        key: "items",
        kind: "list",
        label: "카드",
        keepEmptyRows: true,
        itemSlots: [
          { key: "media", kind: "media", label: "이미지" },
          { key: "tag", kind: "text", label: "태그" },
          { key: "title", kind: "text", label: "제목", required: true },
          { key: "description", kind: "textarea", label: "설명" },
          { key: "link", kind: "link", label: "링크" },
        ],
      },
    ],
    multi: true,
    design: BG,
  },
  {
    type: "toolbox",
    label: "퀵 액션",
    variants: [
      { id: "tiles", label: "타일" },
      { id: "strip", label: "가로 바" },
    ],
    slots: [
      {
        key: "items",
        kind: "list",
        label: "버튼",
        keepEmptyRows: true,
        itemSlots: [
          { key: "label", kind: "text", label: "이름", required: true },
          { key: "link", kind: "link", label: "링크", required: true },
        ],
      },
    ],
    multi: false,
    design: BG,
  },
  {
    type: "register-form",
    label: "사전등록 폼",
    variants: [
      { id: "inline", label: "그 자리에 폼" },
      { id: "cta", label: "요약 + 버튼" },
    ],
    slots: [
      /**
       * **필수다.** 렌더러는 소스가 없으면 이 구획을 통째로 건너뛴다
       * (`view-page.ts`: "소스가 안 붙어 있으면 그릴 것이 없다"). 필수로 걸어 두지 않으면
       * 제목 한 줄만 있어도 `hasContent` 가 true 라 편집기는 "멀쩡함", 발행 점검도 통과,
       * 그런데 공개 화면에는 아무것도 안 나온다 — 어디에도 단서가 없다.
       */
      { key: "sourceRef", kind: "sourceRef", label: "사전등록 소스", required: true },
      { key: "heading", kind: "text", label: "제목" },
      { key: "note", kind: "textarea", label: "안내" },
    ],
    multi: false,
    design: BG,
  },
  {
    type: "custom-code",
    label: "직접 넣은 코드",
    variants: [
      { id: "boxed", label: "콘텐츠 폭" },
      { id: "full", label: "전폭" },
    ],
    slots: [
      { key: "heading", kind: "text", label: "제목" },
      { key: "code", kind: "code", label: "코드", required: true },
    ],
    multi: true,
    design: BG,
  },
] as const;

const BY_TYPE = new Map(EXPO_SECTIONS.map((s) => [s.type, s]));

export function sectionDef(type: string): SectionDef | null {
  return BY_TYPE.get(type) ?? null;
}

export function isKnownSectionType(type: unknown): boolean {
  return typeof type === "string" && BY_TYPE.has(type);
}

/** 모르는 변형은 첫 변형으로 강등한다 — 화면이 비는 것보다 낫다. */
export function resolveVariant(def: SectionDef, variant: unknown): string {
  const found = def.variants.find((v) => v.id === variant);
  return (found ?? def.variants[0]).id;
}

/** 용량 상한 — 신뢰할 수 없는 JSON 이 생성 로더를 부풀리지 못하게 한다. */
export const EXPO_LIMITS = {
  sectionsPerPage: 40,
  rowsPerList: 100,
  textChars: 500,
  /** textarea·code 슬롯의 바이트 상한. */
  longTextBytes: 20 * 1024,
  pageDraftBytes: 512 * 1024,
  activePagesPerSite: 50,
  templateSnapshotBytes: 2 * 1024 * 1024,
} as const;
