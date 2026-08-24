/**
 * 홈페이지 빌더의 **어휘**. React 를 쓰지 않고 DOM 도 만지지 않는다 —
 * 어드민·서버·임베드 번들이 같은 파일을 읽는다(collect-form-config 와 같은 계약).
 */
import type { Localized } from "@/lib/collect-form-config";

export type { Localized };

/** 슬롯이 담는 것의 종류. 이 7개로 닫는다 — 늘리면 편집 위젯·정규화·렌더가 같이 늘어난다. */
export type SlotKind = "text" | "textarea" | "media" | "link" | "list" | "sourceRef" | "code";

/**
 * 미디어 한 칸. W1 은 **이미지만** 받는다 — 영상·YouTube 는 W2 다.
 * 업로드와 링크 첨부를 구분해 저장하지 않는다: 우리 Storage 주소인지는 URL 로 판정한다.
 */
export interface MediaValue {
  kind: "image";
  url: string;
  /** 접근성 — 비면 렌더가 장식용으로 다룬다. */
  alt?: string;
}

/** 링크 한 칸. `href` 는 http(s) 절대주소이거나 `page:{pageId}` 내부 참조다. */
export interface LinkValue {
  label: string;
  href: string;
}

export interface SlotDef {
  key: string;
  kind: SlotKind;
  /** 편집기 라벨 — 운영자가 보는 말. */
  label: string;
  required?: boolean;
  /** `list` 전용 — 행 하나의 슬롯들(재귀). */
  itemSlots?: SlotDef[];
  /** 편집기가 빈 행을 지우지 않고 남긴다(타이핑 중인 행이 사라지면 못 쓴다). */
  keepEmptyRows?: boolean;
}

export interface VariantDef {
  id: string;
  label: string;
}

export interface SectionDef {
  type: string;
  label: string;
  /** 첫 번째가 기본값이다 — 모르는 변형은 여기로 강등된다. */
  variants: VariantDef[];
  slots: SlotDef[];
  /** 페이지에 여러 개 놓을 수 있는가. */
  multi: boolean;
  /** 페이지 맨 위에 한 번만 — 키비주얼이 그렇다. */
  pinnedFirst?: boolean;
  /** 디자인 노브의 허용값. 값은 렌더가 data-* 속성으로 쓴다. */
  design?: Record<string, string[]>;
}

/**
 * 페이지에 놓인 섹션 하나.
 *
 * `sid` 는 **불변**이다 — 섹션 단위 스니펫 URL 이 이 값을 참조하므로, 정렬·변형 전환·발행에
 * 살아남아야 한다. 정규화는 유효한 sid 를 절대 새로 만들지 않는다.
 */
export interface ExpoSection {
  sid: string;
  type: string;
  variant: string;
  /** 페이지 렌더에 포함하는가(이중 게이트의 토글 절반). */
  enabled: boolean;
  /**
   * 이 섹션만 따로 임베드해도 되는가. `enabled` 와 **직교**다 —
   * "페이지는 아직인데 히어로만 아임웹에 먼저" 가 부분 이행의 정의다.
   */
  embedEnabled: boolean;
  design: Record<string, string>;
  content: Record<string, unknown>;
}

export interface ExpoTheme {
  accent: string;
  lightBg: string;
  darkBg: string;
}

/** 페이지의 편집 상태(draft)와 발행 스냅샷(published)이 같은 모양이다. */
export interface ExpoPageConfig {
  sections: ExpoSection[];
}

/** 운영자가 보는 페이지 상태. 판정은 `derivePageState` 한 곳에서만 한다. */
export type ExpoPageState = "draft" | "published" | "live";
