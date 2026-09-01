import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export async function getAdFolderAccess(folderId: string, requireAdmin = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증 필요", status: 401 } as const;

  const folder = await prisma.adPerformanceFolder.findUnique({ where: { id: folderId } });
  if (!folder) return { error: "광고 성과 폴더를 찾을 수 없습니다.", status: 404 } as const;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: folder.workspaceId } },
  });
  if (!membership || (requireAdmin && membership.role === "MEMBER")) {
    return { error: "접근 권한 없음", status: 403 } as const;
  }
  const project = await prisma.project.findFirst({
    where: { id: folder.projectId, workspaceId: folder.workspaceId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!project) return { error: "폴더가 속한 프로젝트를 찾을 수 없습니다.", status: 404 } as const;
  return { folder, membership, project, user } as const;
}
