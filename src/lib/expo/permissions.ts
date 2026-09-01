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
 * ── 역할 매트릭스 ─────────────────────────────────────────────────────
 * 워크스페이스 OWNER·ADMIN 은 모든 프로젝트를 관리한다. WORKSPACE MEMBER 는
 * `ProjectMember` 행(VIEWER|EDITOR|ADMIN)이 있어야 그 프로젝트를 볼 수 있고,
 * VIEWER 는 읽기만, EDITOR 는 편집·발행, 프로젝트 ADMIN 은 사이트 관리까지 한다.
 * 워크스페이스 전역 템플릿 관리는 계속 OWNER·ADMIN 전용이다.
 */
import type { ProjectRole, WorkspaceRole } from "@/lib/expo/auth";

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

export function canAccessExpoProject(
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null,
): boolean {
  return workspaceRole === "OWNER" || workspaceRole === "ADMIN" ||
    (workspaceRole === "MEMBER" && projectRole !== null);
}

export function deriveExpoPermissions(
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null = null,
): ExpoPermissions {
  if (workspaceRole === "OWNER" || workspaceRole === "ADMIN") {
    return { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: true };
  }
  if (workspaceRole !== "MEMBER") return NONE;
  switch (projectRole) {
    case "ADMIN": return { canEdit: true, canPublish: true, canManageSite: true, canManageTemplates: false };
    case "EDITOR": return { canEdit: true, canPublish: true, canManageSite: false, canManageTemplates: false };
    default: return NONE;
  }
}

/**
 * 화면이 **공개 컨트롤을 잠긴 상태로** 그릴지 판단하는 값.
 * 권한과 별개다 — 권한이 있어도 공개 승인 전에는 아무도 못 켠다.
 */
export interface ExpoRelease {
  publicEmbedEnabled: boolean;
}
