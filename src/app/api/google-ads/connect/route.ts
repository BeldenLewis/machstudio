import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPublicAppOrigin } from "@/lib/app-url";
import { signGoogleState } from "@/lib/google-ads";
import { getAdFolderAccess } from "@/lib/ad-folder-access";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const url = new URL(request.url);
  let workspaceId = url.searchParams.get("workspaceId") || "";
  let projectId = url.searchParams.get("projectId") || "";
  const folderId = url.searchParams.get("folderId") || "";
  if (folderId) {
    const access = await getAdFolderAccess(folderId, true);
    if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
    workspaceId = access.folder.workspaceId;
    projectId = access.folder.projectId;
  }
  const [membership, project] = await Promise.all([
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } }),
  ]);
  if (!membership || membership.role === "MEMBER" || project?.workspaceId !== workspaceId) return NextResponse.json({ error: "연결 권한이 없습니다." }, { status: 403 });
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const origin = getPublicAppOrigin();
  if (!clientId || !origin) return NextResponse.json({ error: "Google Ads OAuth 설정이 완료되지 않았습니다." }, { status: 503 });
  const oauth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauth.searchParams.set("client_id", clientId);
  oauth.searchParams.set("redirect_uri", `${origin}/api/google-ads/callback`);
  oauth.searchParams.set("response_type", "code");
  oauth.searchParams.set("scope", "openid email https://www.googleapis.com/auth/adwords");
  oauth.searchParams.set("access_type", "offline");
  oauth.searchParams.set("prompt", "consent");
  oauth.searchParams.set("state", signGoogleState({ workspaceId, projectId, folderId, userId: user.id, issuedAt: Date.now() }));
  return NextResponse.redirect(oauth);
}
