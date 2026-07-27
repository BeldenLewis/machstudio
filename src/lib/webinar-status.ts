// 웨비나 상태 머신 — 단일 정의.
// 소비처: register/ping 라우트, (Phase 2) 공개 config 엔드포인트·로더, (Phase 3) 어드민 상태 바.
// 상태 문자열은 여기 값이 유일한 계약이다: upcoming / registration / live / ended
//
// 자동 판정 (일정 기반):
//   ended:        now >= liveEndAt
//   live:         liveStartAt <= now < liveEndAt
//   registration: now <= signupDeadline (그리고 시작 전)
//   upcoming:     signupDeadline < now < liveStartAt (등록 마감, 시작 대기)
// statusOverride("registration"|"live"|"ended")가 있으면 자동 판정을 덮어쓴다.

export type WebinarStatus = "upcoming" | "registration" | "live" | "ended";

export const WEBINAR_STATUS_OVERRIDES = ["registration", "live", "ended"] as const;
export type WebinarStatusOverride = (typeof WEBINAR_STATUS_OVERRIDES)[number];

// 상태별 표시 라벨·톤(배지 클래스) — 단일 정의. 허브 헤더·목록·운영 콘솔이 동일 라벨을 쓴다.
export const WEBINAR_STATUS_META: Record<WebinarStatus, { label: string; tone: string }> = {
  upcoming: { label: "시작 대기", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  registration: { label: "등록 중", tone: "bg-green-500/10 text-green-600 dark:text-green-400" },
  live: { label: "LIVE", tone: "bg-red-500/10 text-red-500" },
  ended: { label: "종료", tone: "bg-secondary text-muted-foreground" },
};

// 입장 오픈: 시작 N분 전부터 CTA가 "입장하기"로 전환 (레거시 STK watch 모드 — 13:00 오픈/14:00 시작)
export const DEFAULT_ENTRY_OPEN_BEFORE_MINUTES = 60;

/**
 * "지금 보고 있는 사람" 판정 창 — lastPingAt 이 이 시간 안이면 시청 중으로 센다.
 * ping 라우트의 SEGMENT_GAP_MS 와 같은 값이어야 한다(같은 핑 주기를 두 쪽에서 해석하므로).
 * 대시보드가 이 숫자를 리터럴로 들고 있었는데, 같은 값을 쓰는 곳이 늘면 조용히 갈라진다.
 */
export const ACTIVE_VIEWER_WINDOW_MS = 90_000;

export interface WebinarStatusInput {
  liveStartAt: Date | string;
  liveEndAt: Date | string;
  signupDeadline: Date | string;
  statusOverride?: string | null;
  components?: unknown;
}

export interface WebinarStatusResult {
  status: WebinarStatus;
  isOverridden: boolean;
  /** 입장 오픈 시각 = liveStartAt − entryOpenBeforeMinutes */
  entryOpenAt: Date;
  /** 지금 라이브 입장이 가능한가 (종료 전 + 오픈 시각 경과) */
  entryOpen: boolean;
  /** 지금 등록을 받는가 — live 중에는 components.allowLiveRegistration 을 따른다 */
  canRegister: boolean;
}

export function isWebinarStatusOverride(value: unknown): value is WebinarStatusOverride {
  return typeof value === "string" && (WEBINAR_STATUS_OVERRIDES as readonly string[]).includes(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function componentsObject(components: unknown): Record<string, unknown> {
  if (components && typeof components === "object" && !Array.isArray(components)) {
    return components as Record<string, unknown>;
  }
  return {};
}

export function getEntryOpenBeforeMinutes(components: unknown): number {
  const raw = componentsObject(components).entryOpenBeforeMinutes;
  const minutes = Number(raw);
  if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 24 * 60) return Math.floor(minutes);
  return DEFAULT_ENTRY_OPEN_BEFORE_MINUTES;
}

export function resolveWebinarStatus(webinar: WebinarStatusInput, now: Date = new Date()): WebinarStatusResult {
  const liveStartAt = toDate(webinar.liveStartAt);
  const liveEndAt = toDate(webinar.liveEndAt);
  const signupDeadline = toDate(webinar.signupDeadline);
  const t = now.getTime();

  let auto: WebinarStatus;
  if (t >= liveEndAt.getTime()) auto = "ended";
  else if (t >= liveStartAt.getTime()) auto = "live";
  else if (t <= signupDeadline.getTime()) auto = "registration";
  else auto = "upcoming";

  const isOverridden = isWebinarStatusOverride(webinar.statusOverride);
  const status = isOverridden ? (webinar.statusOverride as WebinarStatusOverride) : auto;

  const entryOpenAt = new Date(liveStartAt.getTime() - getEntryOpenBeforeMinutes(webinar.components) * 60_000);
  // 수동 override 가 있으면 시간 기반 입장오픈을 적용하지 않는다 — 운영자가 'registration'으로 되돌리면
  // (예: 종료 후 재개·테스트 후 복귀) 시각이 이미 지났어도 등록 화면을 유지해야 한다. override='live'는 첫 절로 열림.
  const entryOpen = status === "live" || (!isOverridden && status !== "ended" && t >= entryOpenAt.getTime());

  // live 중 등록: allowLiveRegistration 이 명시돼 있으면 그 값, 없으면 기존 동작 보존
  // (기존 register 라우트는 signupDeadline 만 비교 — 마감 전이면 라이브 중에도 허용이었다)
  const componentsRaw = componentsObject(webinar.components);
  const allowLive =
    typeof componentsRaw.allowLiveRegistration === "boolean"
      ? componentsRaw.allowLiveRegistration
      : t <= signupDeadline.getTime();
  const canRegister = status === "registration" || (status === "live" && allowLive);

  return { status, isOverridden, entryOpenAt, entryOpen, canRegister };
}
