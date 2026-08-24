/**
 * 홈페이지(전시 웹사이트 빌더) 기능의 **fail-closed 게이트**.
 *
 * ── 왜 있나 ───────────────────────────────────────────────────────────
 * 스키마(ExpoSite/ExpoPage/ExpoTemplate)는 코드보다 **나중에** 프로덕션에 들어간다.
 * `main` 은 자동 배포이므로 테이블이 없는 순간에 코드가 먼저 나가면 어드민이 500 으로 깨진다.
 * 그래서 "테이블이 준비됐다고 확인되기 전에는 메뉴조차 나타나지 않는다" 를 코드로 강제한다.
 *
 * 게이트는 **두 겹**이다:
 *  · `EXPO_SCHEMA_CAPABILITY` — 스키마가 이 버전으로 적용됐다는 운영자의 명시. 어드민·미리보기.
 *  · `EXPO_PUBLIC_EMBED_RELEASE` — 공개 임베드(/h/)를 바깥에 내보내도 된다는 별도 승인.
 * 스키마가 준비되고 어드민이 열려도, 공개 승인 전에는 밖으로 한 글자도 나가지 않는다.
 *
 * ── 검사 순서가 곧 안전이다 ───────────────────────────────────────────
 * 플래그(문자열 비교) → 카탈로그 조회 순이다. 스키마가 없는 배포에서 매 요청 DB 를 두드리면
 * 이 저장소가 실제로 겪은 커넥션 풀 고갈로 사전등록·라이브가 같이 죽는다(2026-08-11).
 * 가장 싼 검사가 먼저다.
 */

/**
 * 스키마 적용 버전. 다음 확장이 오면 이 문자열을 바꾼다 —
 * 옛 값이 남은 배포는 자동으로 닫힌다. **부분 적용된 스키마 위에서 코드가 도는 것**이
 * 아무것도 안 도는 것보다 나쁘기 때문이다.
 */
export const EXPO_SCHEMA_CAPABILITY_VERSION = "20260821-v1";

export interface ExpoCapabilities {
  /** 어드민 목록·편집기 */
  admin: boolean;
  /** 토큰 미리보기(/hp/) */
  preview: boolean;
  /** 공개 임베드(/h/)와 seen 비콘 */
  publicEmbed: boolean;
}

export interface DeriveInput {
  schemaFlag: string | undefined;
  publicFlag: string | undefined;
  /** 카탈로그 조회가 "이 버전의 테이블·RLS·권한이 그대로 있다" 를 확인했는가 */
  schemaProbeReady: boolean;
}

/**
 * 판정 규칙 그 자체. DB·캐시·환경변수를 모르므로 표로 검사할 수 있다.
 *
 * 근사치를 받아 주지 않는다 — `"ON"`·`"true"`·`"1"` 은 전부 거절한다.
 * 실수로 켜지는 경로를 남기지 않는 것이 이 게이트의 존재 이유다.
 */
export function deriveExpoCapabilities({ schemaFlag, publicFlag, schemaProbeReady }: DeriveInput): ExpoCapabilities {
  const schemaReady = schemaFlag === EXPO_SCHEMA_CAPABILITY_VERSION && schemaProbeReady;
  return {
    admin: schemaReady,
    preview: schemaReady,
    publicEmbed: schemaReady && publicFlag === "on",
  };
}

/**
 * 공개 핸들러의 **첫 관문**. 레이트리밋·카탈로그·모델 작업 이전에 부른다 —
 * 순수 문자열 비교라 DB 를 건드리지 않고 즉시 거절할 수 있다.
 */
export function isExpoPublicEmbedReleaseEnabled(): boolean {
  return process.env.EXPO_PUBLIC_EMBED_RELEASE === "on";
}

/**
 * 실제 판정. `probe` 는 카탈로그 조회(서버 전용 모듈이 주입한다) — 테스트는 가짜를 넣는다.
 *
 * 조회가 던지면 **닫힌 채로** 답한다. 예외가 밖으로 새면 어드민이 500 이 되는데,
 * 그건 "아직 준비 안 됨" 을 보여주는 것보다 나쁘다. 그리고 실패를 캐시에 굳히지 않는다 —
 * 굳히면 스키마를 적용한 뒤에도 한동안 닫힌 채로 남는다.
 */
export async function getExpoCapabilities(
  { probe }: { probe: () => Promise<boolean> },
): Promise<ExpoCapabilities> {
  const schemaFlag = process.env.EXPO_SCHEMA_CAPABILITY;
  const publicFlag = process.env.EXPO_PUBLIC_EMBED_RELEASE;

  // 플래그가 틀리면 여기서 끝 — 카탈로그를 조회하지 않는다.
  if (schemaFlag !== EXPO_SCHEMA_CAPABILITY_VERSION) {
    return deriveExpoCapabilities({ schemaFlag, publicFlag, schemaProbeReady: false });
  }

  let schemaProbeReady = false;
  try {
    schemaProbeReady = await probe();
  } catch {
    schemaProbeReady = false;
  }
  return deriveExpoCapabilities({ schemaFlag, publicFlag, schemaProbeReady });
}
