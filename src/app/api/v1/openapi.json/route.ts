import { getPublicAppOrigin } from "@/lib/app-url";

export async function GET() {
  const origin = getPublicAppOrigin();
  const rangeParams = [
    { name: "from", in: "query", schema: { type: "string", format: "date-time" }, description: "조회 시작. 기본값은 종료 30일 전" },
    { name: "to", in: "query", schema: { type: "string", format: "date-time" }, description: "조회 종료. 기본값은 현재 시각" },
  ];
  const projectParam = { name: "projectId", in: "path", required: true, schema: { type: "string" } };
  const response = {
    openapi: "3.1.0",
    info: { title: "Machstudio Read API", version: "1.0.0", description: "프로젝트·등록·UTM·광고 성과의 비식별 읽기 전용 API" },
    servers: [{ url: origin || "https://machstudio.vercel.app" }],
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/v1/projects": { get: { summary: "프로젝트 목록", responses: { "200": { description: "프로젝트 목록" } } } },
      "/api/v1/projects/{projectId}/dashboard": { get: { summary: "통합 대시보드", parameters: [projectParam, ...rangeParams], responses: { "200": { description: "통합 집계" } } } },
      "/api/v1/projects/{projectId}/registrations": { get: { summary: "사전등록 성과", parameters: [projectParam, ...rangeParams], responses: { "200": { description: "등록 추이와 항목 분포" } } } },
      "/api/v1/projects/{projectId}/utm": { get: { summary: "UTM·앰배서더 성과", parameters: [projectParam, ...rangeParams], responses: { "200": { description: "UTM 집계" } } } },
      "/api/v1/projects/{projectId}/ads": { get: { summary: "광고 성과", parameters: [projectParam, ...rangeParams, { name: "sourceType", in: "query", schema: { type: "string", enum: ["ALL", "META", "GOOGLE", "TIKTOK", "LINKEDIN", "MANUAL"] } }], responses: { "200": { description: "광고 성과 집계" } } } },
    },
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "Machstudio API token (xfp_...)" } } },
  };
  return Response.json(response, { headers: { "Cache-Control": "public, max-age=3600", "Access-Control-Allow-Origin": "*" } });
}
