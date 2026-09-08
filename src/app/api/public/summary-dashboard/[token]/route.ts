import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { generateDashboardReport } from "@/app/api/dashboard-report/route";
import type { RealtimeReportData } from "@/app/(app)/dashboard/RealtimeReport";

type Context = { params: Promise<{ token: string }> };
const validToken = (token: string) => token.length >= 32 && /^[A-Za-z0-9_-]+$/.test(token);
function clientIp(request: Request) { return request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? "unknown"; }

function sanitize(report: RealtimeReportData): RealtimeReportData {
  return {
    ...report,
    project: { id: "", name: report.project.name },
    performance: {
      ...report.performance,
      currentSource: report.performance.currentSource ? { ...report.performance.currentSource, id: "" } : null,
      previousYear: report.performance.previousYear ? { ...report.performance.previousYear, sourceId: "" } : null,
    },
  };
}

export async function GET(request: Request, context: Context) {
  const { token } = await context.params;
  if (!validToken(token)) return NextResponse.json({ error: "잘못된 공유 링크입니다." }, { status: 400 });
  const limit = rateLimit(`summary-dashboard-share:${clientIp(request)}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "요청이 너무 잦아요." }, { status: 429, headers: { "Retry-After": Math.ceil(limit.retryAfterMs / 1000).toString() } });
  const workspace = await prisma.workspace.findUnique({ where: { summaryShareToken: token }, select: { id: true, name: true, deletedAt: true, summaryShareEnabled: true, channelColors: true, projects: { where: { deletedAt: null }, include: { collectSources: { where: { deletedAt: null }, select: { isActive: true } } }, orderBy: { createdAt: "desc" } } } });
  if (!workspace || workspace.deletedAt || !workspace.summaryShareEnabled) return NextResponse.json({ error: "공유가 종료되었거나 존재하지 않는 링크입니다." }, { status: 404 });
  const active = workspace.projects.filter((project) => project.collectSources.some((source) => source.isActive));
  const results = await Promise.all(active.map((project) => generateDashboardReport({ workspaceId: workspace.id, projectId: project.id })));
  const reports = results.filter((result): result is { data: RealtimeReportData } => "data" in result && Boolean(result.data)).map((result) => sanitize(result.data));
  return NextResponse.json({ workspaceName: workspace.name, channelColors: workspace.channelColors, projects: reports }, { headers: { "Cache-Control": "private, no-store" } });
}
