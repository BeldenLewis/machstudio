import { apiJson, authenticateApiRequest } from "@/lib/api-auth";
import { getApiAdPerformance, parseApiDateRange, requireApiProject } from "@/lib/external-api-data";

export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await authenticateApiRequest(request, "ads:read");
  if ("response" in auth) return auth.response;
  const { projectId } = await params;
  if (!await requireApiProject(auth.principal.workspaceId, projectId)) {
    return apiJson({ error: { code: "not_found", message: "프로젝트를 찾을 수 없습니다." } }, { status: 404 });
  }
  try {
    const url = new URL(request.url);
    const range = parseApiDateRange({ from: url.searchParams.get("from"), to: url.searchParams.get("to") });
    const data = await getApiAdPerformance({
      workspaceId: auth.principal.workspaceId,
      projectId,
      range,
      sourceType: url.searchParams.get("sourceType"),
    });
    return apiJson({ data });
  } catch (error) {
    const code = error instanceof Error ? error.message : "invalid_request";
    return apiJson({ error: { code, message: code === "date_range_too_large" ? "조회 기간은 최대 366일입니다." : "날짜 형식 또는 범위가 올바르지 않습니다." } }, { status: 400 });
  }
}
