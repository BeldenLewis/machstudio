import { createMcpHandler, type AuthInfo } from "@modelcontextprotocol/server";
import { authenticateApiRequest, bearerToken } from "@/lib/api-auth";
import { createMachstudioMcpServer } from "@/lib/machstudio-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler(({ authInfo }) => {
  const principal = authInfo?.extra?.principal;
  if (!principal || typeof principal !== "object") throw new Error("Missing authenticated principal");
  return createMachstudioMcpServer(principal as Parameters<typeof createMachstudioMcpServer>[0]);
}, { responseMode: "auto" });

async function handle(request: Request) {
  const auth = await authenticateApiRequest(request);
  if ("response" in auth) return auth.response;
  const authInfo: AuthInfo = {
    token: bearerToken(request),
    clientId: auth.principal.tokenId,
    scopes: auth.principal.scopes,
    extra: { principal: auth.principal },
  };
  return handler.fetch(request, { authInfo });
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
