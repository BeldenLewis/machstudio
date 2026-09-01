import { EXPO_READINESS_MESSAGES, hasUnpublishedChanges } from "@/lib/expo/readiness";

export type ExpoConnectionState = "connected" | "verify" | "wrong-origin" | "uninstalled";

export interface ExpoConnectionStatus {
  state: ExpoConnectionState;
  label: string;
  detail: string;
}

export interface ExpoConnectionStatusInput {
  imwebUrl: string | null;
  lastSeenAt: Date | string | null;
  lastSeenOrigin: string | null;
  now: Date;
}

export interface ExpoPageWarning {
  path: "connection" | "publishedAt";
  code: `connection-${ExpoConnectionState}` | "draft-ahead-of-published";
  message: string;
  severity: "warning";
}

export interface ExpoPageWarningsInput extends ExpoConnectionStatusInput {
  publishedAt: Date | string | null;
  updatedAt: Date | string | null;
}

const RECENT_MS = 10 * 60_000;

function hostname(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function deriveExpoConnectionStatus(input: ExpoConnectionStatusInput): ExpoConnectionStatus {
  if (input.lastSeenAt === null) {
    return {
      state: "uninstalled",
      label: "미설치",
      detail: "아직 아임웹에서 연결 신호를 받지 못했어요.",
    };
  }

  const expectedHost = hostname(input.imwebUrl);
  const seenHost = hostname(input.lastSeenOrigin);
  const seenAt = new Date(input.lastSeenAt).getTime();
  const now = input.now.getTime();
  if (!expectedHost || !seenHost || Number.isNaN(seenAt) || Number.isNaN(now)) {
    return {
      state: "verify",
      label: "확인 필요",
      detail: "아임웹 주소와 최근 연결 주소를 확인해 주세요.",
    };
  }

  if (expectedHost !== seenHost) {
    return {
      state: "wrong-origin",
      label: "다른 주소",
      detail: `최근 연결은 ${seenHost}, 등록한 주소는 ${expectedHost}예요.`,
    };
  }

  if (now - seenAt <= RECENT_MS) {
    return {
      state: "connected",
      label: "연결됨",
      detail: `${expectedHost}에서 최근 연결을 확인했어요.`,
    };
  }

  return {
    state: "verify",
    label: "확인 필요",
    detail: "최근 10분 안에 연결 신호가 없어요.",
  };
}

/** 발행 거절에는 쓰지 않는 페이지 메타데이터 진단. */
export function pageWarnings(input: ExpoPageWarningsInput): ExpoPageWarning[] {
  const connection = deriveExpoConnectionStatus(input);
  const warnings: ExpoPageWarning[] = [{
    path: "connection",
    code: `connection-${connection.state}`,
    message: `${connection.label} · ${connection.detail}`,
    severity: "warning",
  }];
  if (hasUnpublishedChanges(input)) {
    warnings.push({
      path: "publishedAt",
      code: "draft-ahead-of-published",
      message: EXPO_READINESS_MESSAGES["draft-ahead-of-published"],
      severity: "warning",
    });
  }
  return warnings;
}
