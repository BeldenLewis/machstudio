import { generateDashboardReport } from "@/app/api/dashboard-report/route";
import { prisma } from "@/lib/prisma";

export function isInvalidDashboardShareToken(token: string) {
  return !token || token.length < 32 || !/^[A-Za-z0-9_-]+$/.test(token);
}

export async function getPublicDashboardProject(token: string) {
  if (isInvalidDashboardShareToken(token)) return null;

  const project = await prisma.project.findUnique({
    where: { dashboardShareToken: token },
    select: {
      id: true,
      name: true,
      workspaceId: true,
      deletedAt: true,
      dashboardShareEnabled: true,
      dashboardSharePasswordHash: true,
      workspace: { select: { name: true } },
    },
  });

  if (!project || project.deletedAt || !project.dashboardShareEnabled) return null;
  return project;
}

export async function getPublicDashboardReport(project: { id: string; workspaceId: string }) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400_000);
  const result = await generateDashboardReport({
    workspaceId: project.workspaceId,
    projectId: project.id,
    from: from.toISOString(),
    to: now.toISOString(),
  });

  if ("error" in result) return { error: result.error } as const;
  return {
    data: {
      ...result.data,
      project: { id: "", name: result.data.project.name },
    },
  } as const;
}
