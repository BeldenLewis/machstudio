import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeScopes, opaqueToken, tokenHash } from "@/lib/oauth";

export async function POST(request: Request) {
  const form = await request.formData();
  const value = (key: string) => String(form.get(key) ?? "");
  const clientId = value("client_id"), redirectUri = value("redirect_uri"), workspaceId = value("workspaceId");
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse("Authentication required", { status: 401 });
  if (!client || !client.redirectUris.includes(redirectUri)) return new NextResponse("Invalid authorization request", { status: 400 });
  if (value("decision") === "deny") {
    const denied = new URL(redirectUri); denied.searchParams.set("error", "access_denied"); if (value("state")) denied.searchParams.set("state", value("state"));
    return NextResponse.redirect(denied, 303);
  }
  const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } });
  if (!membership || !/^[A-Za-z0-9_-]{43,128}$/.test(value("code_challenge"))) return new NextResponse("Invalid authorization request", { status: 400 });
  const code = opaqueToken("mcp_code");
  await prisma.oAuthAuthorizationCode.create({ data: { codeHash: tokenHash(code), clientId, userId: user.id, workspaceId, redirectUri, scopes: normalizeScopes(value("scope")), codeChallenge: value("code_challenge"), resource: value("resource") || null, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  const target = new URL(redirectUri); target.searchParams.set("code", code); if (value("state")) target.searchParams.set("state", value("state"));
  return NextResponse.redirect(target, 303);
}
