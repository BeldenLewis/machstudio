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
