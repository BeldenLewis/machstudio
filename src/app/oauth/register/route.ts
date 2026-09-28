import { prisma } from "@/lib/prisma";
import { opaqueToken, validRedirectUri } from "@/lib/oauth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { client_name?: string; redirect_uris?: string[]; token_endpoint_auth_method?: string } | null;
  const redirectUris = body?.redirect_uris?.filter(validRedirectUri) ?? [];
  if (!body || redirectUris.length === 0 || redirectUris.length !== body.redirect_uris?.length) return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  const clientId = opaqueToken("mcp_client");
  await prisma.oAuthClient.create({ data: { clientId, clientName: body.client_name?.slice(0, 120) || "MCP client", redirectUris } });
  return Response.json({ client_id: clientId, client_name: body.client_name || "MCP client", redirect_uris: redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
