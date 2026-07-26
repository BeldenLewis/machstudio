// 워크스페이스 스코프 해석 — 클라이언트가 보낸 workspaceId 를 **그대로 믿지 않는다**.
//
// 이 파일이 생긴 이유: utm-presets/utm-templates 라우트가 각자
//   async function getWorkspaceId(workspaceId, userId) {
//     if (workspaceId) return workspaceId;              // ← 멤버십 검사 없음
//     …첫 소속 워크스페이스로 폴백
//   }
// 를 들고 있었다. 요청 파라미터에 남의 workspaceId 를 넣으면 그대로 통과했고,
// PATCH/DELETE 는 그마저도 안 거쳐 body 의 레코드 id 만으로 update/delete 를 실행했다
// → 로그인만 한 사용자가 다른 테넌트의 UTM 프리셋·템플릿을 고치고 지울 수 있었다
// (게다가 logActivity 가 피해자 워크스페이스에 기록돼 로그까지 오염됐다).
import { prisma } from "@/lib/prisma";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER";

/**
 * 초대·역할 부여에서 **누가 어떤 역할을 줄 수 있는가**. 이 불변식이 한 곳에만 있어야 한다.
 *
 * 원래는 역할 변경(members PATCH)만 `['ADMIN','MEMBER']` 화이트리스트로 OWNER 부여를 막았고,
 * 초대 경로 두 곳이 그걸 우회했다:
 *   · invite-email — 화이트리스트에 OWNER 가 들어 있고 게이트는 `role !== "MEMBER"` 뿐이라
 *     ADMIN 이 OWNER 로 초대할 수 있었다
 *   · members POST — `const { email, role = "MEMBER" }` 로 검증 없이 upsert 의 role 로 직행
 * 수락 경로는 `role: invitation.role` 을 그대로 create 하므로, 이렇게 만들어진 OWNER 는
 * members PATCH/DELETE 의 OWNER 가드 때문에 강등·제거도 불가능했다.
 *
 * 규칙: OWNER 는 누구든 부여 가능, ADMIN 은 자기보다 낮거나 같은 것만(ADMIN·MEMBER).
 */
export function canGrantRole(actorRole: string, targetRole: WorkspaceRole): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "ADMIN" || targetRole === "MEMBER";
  return false; // MEMBER 는 초대 자체가 불가
}

/**
 * 요청이 보낸 role 을 검증한다. 부여 권한이 없거나 알 수 없는 값이면 null →
 * 호출자가 403 으로 끝낸다(조용히 MEMBER 로 낮추지 않는다 — 의도와 다른 결과를 만든다).
 */
export function parseGrantableRole(raw: unknown, actorRole: string): WorkspaceRole | null {
  const role = raw === undefined || raw === null || raw === "" ? "MEMBER" : raw;
  if (role !== "OWNER" && role !== "ADMIN" && role !== "MEMBER") return null;
  return canGrantRole(actorRole, role) ? role : null;
}

/** 이 사용자가 해당 워크스페이스의 멤버인가. */
export async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const m = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  return Boolean(m);
}

/**
 * 요청이 지정한 workspaceId 를 **멤버십 확인 후** 돌려준다.
 * - 지정했고 멤버다 → 그 값
 * - 지정했지만 멤버가 아니다 → null (호출자가 403/빈 결과로 처리)
 * - 지정 안 했다 → 가장 먼저 가입한 내 워크스페이스
 */
export async function resolveMemberWorkspaceId(
  requested: string | null | undefined,
  userId: string,
): Promise<string | null> {
  if (requested) {
    return (await isWorkspaceMember(userId, requested)) ? requested : null;
  }
  const m = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true },
  });
  return m?.workspaceId ?? null;
}
