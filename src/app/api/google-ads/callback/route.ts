import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPublicAppOrigin } from "@/lib/app-url";
import { encryptGoogleToken, verifyGoogleState } from "@/lib/google-ads";

type State = { workspaceId: string; projectId: string; folderId?: string; userId: string; issuedAt: number };
export async function GET(request: Request) {
  const origin = getPublicAppOrigin();
  const url = new URL(request.url);
  const state = verifyGoogleState<State>(url.searchParams.get("state") || "");
  const destination = state?.folderId ? `${origin}/analytics/${state.folderId}?tab=connections` : `${origin}/analytics`;
  const done = (status: string) => NextResponse.redirect(`${destination}${destination.includes("?") ? "&" : "?"}google=${status}`);
  const code = url.searchParams.get("code");
  if (!state || !code || Date.now() - state.issuedAt > 10 * 60_000) return done("error");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) return done("error");
  try {
    const [membership, project] = await Promise.all([
      prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: state.workspaceId } } }),
      prisma.project.findUnique({ where: { id: state.projectId }, select: { workspaceId: true } }),
    ]);
    if (!membership || membership.role === "MEMBER" || project?.workspaceId !== state.workspaceId) return done("error");
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_ADS_CLIENT_ID || "", client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET || "", redirect_uri: `${origin}/api/google-ads/callback`, grant_type: "authorization_code" }), cache: "no-store" });
    const token = await response.json() as { refresh_token?: string; access_token?: string; id_token?: string; error_description?: string };
    if (!response.ok || !token.refresh_token) throw new Error(token.error_description || "Google 갱신 토큰을 받지 못했습니다.");
    let googleUserId: string | undefined; let email: string | undefined;
    if (token.access_token) { const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" }); if (profileResponse.ok) { const profile = await profileResponse.json() as { sub?: string; email?: string }; googleUserId = profile.sub; email = profile.email; } }
    await prisma.googleAdConnection.upsert({ where: { projectId: state.projectId }, create: { workspaceId: state.workspaceId, projectId: state.projectId, encryptedRefreshToken: encryptGoogleToken(token.refresh_token), googleUserId, email }, update: { encryptedRefreshToken: encryptGoogleToken(token.refresh_token), googleUserId, email, status: "CONNECTED", lastSyncError: null } });
    return done("connected");
  } catch (error) { console.error("[google-ads callback]", error); return done("error"); }
}
