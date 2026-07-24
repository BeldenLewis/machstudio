/**
 * 랜딩 상세페이지 데이터 형태 — 단독 페이지 / 어드민 미리보기 / 외부 사이트 임베드 공통.
 * React 나 Next 에 의존하지 않는다(브라우저 번들에 그대로 들어간다).
 */

export interface LandingSession {
  id: string;
  number: number;
  type?: string;
  title: string;
  speaker: string | null;
  speakerCompany?: string | null;
  speakerPhotoUrl?: string | null;
  description?: string | null;
  speakerBio?: string | null;
  startTime: string;
  endTime: string;
}

export interface LandingWebinar {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  liveStartAt: string;
  theme: Record<string, string>;
  config: Record<string, unknown>;
  sessions: LandingSession[];
}

export interface LandingTocItem {
  id: string;
  label: string;
}

/**
 * 렌더 직전까지 모든 파생을 끝낸 모델. 뷰 함수는 여기서만 값을 읽는다
 * (뷰에 조건 분기가 흩어지지 않게 — 단독/미리보기/임베드가 같은 결론을 보게 하려는 목적).
 */
export interface LandingModel {
  webinar: LandingWebinar;
  lp: import("@/lib/webinar-config").LandingPageConfig;
  /** 인스턴스 고유 접두 — 한 페이지에 랜딩이 둘 이상 붙어도 id 가 안 부딪히게. */
  uid: string;
  accent: string;
  onPrimary: string;
  brand: string;
  titleLines: string[];
  subtitle: string;
  dateStr: string;
  registerUrl: string;
  introTitle: string;
  introBody: string;
  sessionCards: LandingSession[];
  timetableRows: LandingSession[];
  faqCategories: string[];
  tocItems: LandingTocItem[];
  showIntro: boolean;
  showPrograms: boolean;
  showHighlights: boolean;
  showJoin: boolean;
  showFaq: boolean;
  /** 세션 카드 클릭 시 상세 팝업 사용 여부. */
  detailPopup: boolean;
  /** 임베드로 마운트된 경우 true — 링크 target, 랜드마크 태그 선택에 쓴다. */
  embedded: boolean;
  isPreview: boolean;
  /** 섹션 id 를 uid 접두 붙여 만든다. */
  sectionId: (base: string) => string;
}

