// 약관 전문 상속 — 워크스페이스 템플릿 ← 웨비나 오버라이드.
//
// 왜 계층을 만들었나: 약관 전문은 **웨비나마다 다시 붙여넣을 값이 아니다.** 회사의 개인정보
// 처리방침·마케팅 수신 동의문은 조직 자산이고 웨비나마다 같다. 그런데 지금은 웨비나마다
// 라벨 없는 큰 textarea 두 개에 매번 붙여넣게 돼 있고, 그게 고빈도로 만지는 필드 빌더와
// 같은 스크롤에 섞여 있었다.
//
// 마이그레이션 없이 기존 값을 살리는 방법: 웨비나 값이 있으면 **그것이 이긴다.**
// 그래서 지금까지 각 웨비나에 넣어 둔 전문은 전부 그대로 동작하고(= 오버라이드로 재해석),
// 앞으로 만드는 웨비나만 워크스페이스 템플릿을 물려받는다.

export type ConsentSource = "webinar" | "workspace" | "none";

export interface ResolvedConsent {
  /** 실제로 시청자에게 보여줄 전문. 빈 문자열이면 팝업을 띄우지 않는다. */
  body: string;
  source: ConsentSource;
}

/**
 * 웨비나 값이 워크스페이스 템플릿을 덮는다.
 * 공백만 있는 값은 "없음" 으로 본다 — 저장·렌더가 모두 trim 기준이라 여기서도 같은 기준을 쓴다.
 * (기준이 어긋나면 "화면엔 상속이라 나오는데 실제로는 공백이 덮는" 상태가 생긴다.)
 */
export function resolveConsentBody(
  webinarValue: string | null | undefined,
  workspaceTemplate: string | null | undefined,
): ResolvedConsent {
  const own = (webinarValue ?? "").trim();
  if (own) return { body: own, source: "webinar" };
  const tpl = (workspaceTemplate ?? "").trim();
  if (tpl) return { body: tpl, source: "workspace" };
  return { body: "", source: "none" };
}

/** 상속 상태를 사람이 읽는 한 줄로 — 편집 화면의 요약 배지에 쓴다. */
export function consentSourceLabel(source: ConsentSource): string {
  if (source === "webinar") return "이 웨비나 전용";
  if (source === "workspace") return "워크스페이스 공통";
  return "설정 안 함";
}
