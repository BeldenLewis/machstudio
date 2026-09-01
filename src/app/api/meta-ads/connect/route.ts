import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPublicAppOrigin } from "@/lib/app-url";
import { signMetaState } from "@/lib/meta-ads";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") || "";
  const projectId = url.searchParams.get("projectId") || "";
  const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } });
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  if (!membership || membership.role === "MEMBER" || project?.workspaceId !== workspaceId) {
    return NextResponse.json({ error: "연결 권한이 없습니다." }, { status: 403 });
  }
  const appId = process.env.META_APP_ID?.trim();
  const origin = getPublicAppOrigin();
  if (!appId || !origin) return NextResponse.json({ error: "Meta 앱 설정이 완료되지 않았습니다." }, { status: 503 });
  const state = signMetaState({ workspaceId, projectId, userId: user.id, issuedAt: Date.now() });
  const oauth = new URL("https://www.facebook.com/v25.0/dialog/oauth");
  oauth.searchParams.set("client_id", appId);
  oauth.searchParams.set("redirect_uri", `${origin}/api/meta-ads/callback`);
  oauth.searchParams.set("state", state);
  oauth.searchParams.set("scope", "ads_read,business_management");
  return NextResponse.redirect(oauth);
}
