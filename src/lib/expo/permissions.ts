/**
 * 화면이 **무엇을 보여줄지** 정하는 좁은 DTO.
 *
 * ── 이건 권한이 아니다 ────────────────────────────────────────────────
 * 버튼을 숨기는 것은 authorization 이 아니다. 모든 서비스·라우트가 자기 자리에서 다시
 * 판정한다(`auth.ts`·`route-guard.ts`). 이 DTO 의 목적은 **뷰어에게 눌러도 실패할
 * 버튼을 보여주지 않는 것** 하나다 — 눌렀는데 403 이 나는 화면은 고장으로 읽힌다.
 *
 * 그래서 멤버십 행을 그대로 직렬화하지 않는다. 네 개의 boolean 만 나간다.
 *
 * ── 지금의 축소 ───────────────────────────────────────────────────────
 * 설계의 진리표는 `ProjectMember` 행(VIEWER|EDITOR|ADMIN)까지 본다. 그 배선은 아직
 * 없어서(별건), 여기서는 **워크스페이스 역할만** 본다:
 *   OWNER·ADMIN → 유효 프로젝트 ADMIN (전부 허용)
 *   MEMBER      → 유효 EDITOR (초안 편집만)
 * 이건 설계보다 **좁은** 쪽이다 — 명시적 프로젝트 ADMIN 이 있어야 할 사람이 발행을
 * 못 하는 것은 불편이고, 그 반대는 사고다. 좁은 쪽으로 틀린다.
 */
import type { WorkspaceRole } from "@/lib/expo/auth";

export interface ExpoPermissions {
  /** 초안 편집·페이지 생성·업로드·템플릿 저장·이 프로젝트로 복제. */
  canEdit: boolean;
  /** 발행·공개 스위치·미리보기 토큰 재발급. */
  canPublish: boolean;
  /** 사이트·페이지 삭제. */
  canManageSite: boolean;
  /** 워크스페이스 전역 템플릿의 이름 변경·영구 삭제. */
  canManageTemplates: boolean;
}

const NONE: ExpoPermissions = {
  canEdit: false,
  canPublish: false,
  canManageSite: false,
  canManageTemplates: false,
};

export function deriveExpoPermissions(role: WorkspaceRole | null): ExpoPermissions {
  // 멤버가 아니면 아무것도 아니다. 호출부의 소유권 판정이 이미 404 로 막았어야 한다.
  if (!role) return NONE;
  if (role === "OWNER" || role === "ADMIN") {
    return { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true };
  }
  // MEMBER — 초안은 고칠 수 있고, 밖으로 내보내는 것과 지우는 것은 못 한다.
  return { canEdit: true, canPublish: false, canManageSite: false, canManageTemplates: false };
}

/**
 * 화면이 **공개 컨트롤을 잠긴 상태로** 그릴지 판단하는 값.
 * 권한과 별개다 — 권한이 있어도 공개 승인 전에는 아무도 못 켠다.
 */
export interface ExpoRelease {
  publicEmbedEnabled: boolean;
}
