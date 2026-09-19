import { apiJson, authenticateApiRequest } from "@/lib/api-auth";
import { getApiDashboard, parseApiDateRange, requireApiProject } from "@/lib/external-api-data";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authenticateApiRequest(request, "dashboards:read");
  if ("response" in auth) return auth.response;
  const { projectId } = await params;
  if (!await requireApiProject(auth.principal.workspaceId, projectId)) {
    return apiJson({ error: { code: "not_found", message: "프로젝트를 찾을 수 없습니다." } }, { status: 404 });
  }
  try {
    const url = new URL(request.url);
    const range = parseApiDateRange({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    const report = await getApiDashboard({ workspaceId: auth.principal.workspaceId, projectId, range });
    if (!report) return apiJson({ error: { code: "not_found", message: "UTM 데이터를 찾을 수 없습니다." } }, { status: 404 });
    return apiJson({ data: {
      generatedAt: report.generatedAt,
      project: report.project,
      range: report.range,
      topCombinations: report.utmTop,
      bySource: report.utmBySource,
      byMedium: report.utmByMedium,
      bySourceMedium: report.utmBySourceMedium,
      dailyTrend: report.dailyUtmTrend ?? null,
      ambassador: { total: report.ambassadorTotal ?? 0, ranking: report.ambassadorRanking ?? [] },
    } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    return apiJson({ error: { code, message: code === "date_range_too_large" ? "조회 기간은 최대 366일입니다." : "날짜 형식 또는 범위가 올바르지 않습니다." } }, { status: 400 });
  }
}
