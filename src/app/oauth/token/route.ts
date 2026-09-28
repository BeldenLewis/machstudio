import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/pat";
import { oauthError, opaqueToken, tokenHash } from "@/lib/oauth";

const b64url = (value: Buffer) => value.toString("base64url");
const matchesPkce = (verifier: string, challenge: string) => {
  const actual = Buffer.from(b64url(createHash("sha256").update(verifier).digest()));
  const expected = Buffer.from(challenge);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

async function issueTokens(input: { clientId: string; userId: string; workspaceId: string; scopes: string[]; resource: string | null }) {
  const access = generateToken();
  const refresh = opaqueToken("mcp_refresh");
  await prisma.$transaction([
    prisma.apiToken.create({ data: { workspaceId: input.workspaceId, userId: input.userId, name: "AI 커넥터 OAuth", tokenHash: access.tokenHash, prefix: access.prefix, scopes: input.scopes, expiresAt: new Date(Date.now() + 60 * 60_000) } }),
    prisma.oAuthRefreshToken.create({ data: { tokenHash: tokenHash(refresh), clientId: input.clientId, userId: input.userId, workspaceId: input.workspaceId, scopes: input.scopes, resource: input.resource, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } }),
  ]);
  return { access_token: access.token, token_type: "Bearer", expires_in: 3600, refresh_token: refresh, scope: input.scopes.join(" ") };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const value = (key: string) => String(form.get(key) ?? "");
  const grantType = value("grant_type"), clientId = value("client_id");
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client) return oauthError("invalid_client", "Unknown OAuth client", 401);
  if (grantType === "authorization_code") {
    const codeHash = tokenHash(value("code"));
    const code = await prisma.oAuthAuthorizationCode.findUnique({ where: { codeHash } });
    if (!code || code.clientId !== clientId || code.redirectUri !== value("redirect_uri") || code.usedAt || code.expiresAt < new Date() || !matchesPkce(value("code_verifier"), code.codeChallenge)) return oauthError("invalid_grant", "Authorization code is invalid or expired");
    const consumed = await prisma.oAuthAuthorizationCode.updateMany({ where: { id: code.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) return oauthError("invalid_grant", "Authorization code was already used");
    return Response.json(await issueTokens(code), { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  }
  if (grantType === "refresh_token") {
    const stored = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: tokenHash(value("refresh_token")) } });
    if (!stored || stored.clientId !== clientId || stored.revokedAt || stored.expiresAt < new Date()) return oauthError("invalid_grant", "Refresh token is invalid or expired");
    await prisma.oAuthRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return Response.json(await issueTokens(stored), { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  }
  return oauthError("unsupported_grant_type", "Supported grants are authorization_code and refresh_token");
}
