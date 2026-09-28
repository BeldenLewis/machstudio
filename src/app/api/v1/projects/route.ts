import { apiJson, authenticateApiRequest } from "@/lib/api-auth";
import { listApiProjects } from "@/lib/external-api-data";

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request, "dashboards:read");
  if ("response" in auth) return auth.response;
  const projects = await listApiProjects(auth.principal.workspaceId);
  return apiJson({ data: projects, meta: { count: projects.length } });
}
