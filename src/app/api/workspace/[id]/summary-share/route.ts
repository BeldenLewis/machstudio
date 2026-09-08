import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getPublicAppOrigin } from "@/lib/app-url";
import { logActivity } from "@/lib/activity";

type Context = { params: Promise<{ id: string }> };

async function authorize(workspaceId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };
  const membership = await prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId } } });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) return { error: NextResponse.json({ error: "공유 관리 권한 없음" }, { status: 403 }) };
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace || workspace.deletedAt) return { error: NextResponse.json({ error: "워크스페이스 없음" }, { status: 404 }) };
  return { workspace, userId: user.id };
}

function payload(workspace: { summaryShareToken: string | null; summaryShareEnabled: boolean }) {
  const origin = getPublicAppOrigin();
  return {
    shareEnabled: workspace.summaryShareEnabled,
    shareToken: workspace.summaryShareToken,
    shareUrl: workspace.summaryShareEnabled && workspace.summaryShareToken && origin ? `${origin}/share/summary/${workspace.summaryShareToken}` : null,
  };
}

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  return NextResponse.json(payload(auth.workspace));
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})) as { shareEnabled?: boolean; rotate?: boolean };
  const data: { summaryShareEnabled?: boolean; summaryShareToken?: string } = {};
  if (body.shareEnabled !== undefined) data.summaryShareEnabled = Boolean(body.shareEnabled);
  if ((body.shareEnabled === true && !auth.workspace.summaryShareToken) || body.rotate === true) {
    data.summaryShareToken = randomBytes(24).toString("base64url");
    data.summaryShareEnabled = true;
  }
  const updated = await prisma.workspace.update({ where: { id }, data });
  await logActivity({ workspaceId: id, userId: auth.userId, action: body.rotate ? "summary.share_token_rotated" : updated.summaryShareEnabled ? "summary.share_enabled" : "summary.share_disabled", meta: { workspaceName: auth.workspace.name } });
  return NextResponse.json(payload(updated));
}
