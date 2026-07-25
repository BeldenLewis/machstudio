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
