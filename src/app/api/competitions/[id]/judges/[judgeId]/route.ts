import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { hashSharePassword } from "@/lib/share-password";
import { logActivity } from "@/lib/activity";

async function authorize(competitionId: string, judgeId: string, userId: string) {
  const judge = await prisma.competitionJudge.findUnique({
    where: { id: judgeId },
    include: { competition: { select: { id: true, workspaceId: true } } },
  });
  if (!judge || judge.competitionId !== competitionId) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: judge.competition.workspaceId } },
  });
  return membership ? judge : null;
}

function generatePassword(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  return Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; judgeId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, judgeId } = await params;
  const judge = await authorize(id, judgeId, user.id);
  if (!judge) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const data: Record<string, unknown> = {};
  let newPassword: string | null = null;

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (body.email !== undefined) data.email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  if (body.affiliation !== undefined) {
    data.affiliation = typeof body.affiliation === "string" && body.affiliation.trim() ? body.affiliation.trim() : null;
  }
  if (typeof body.weight === "number" && body.weight >= 1) data.weight = Math.floor(body.weight);

  // 비밀번호는 해시로만 저장하므로 **복구가 아니라 재설정**이다. 잊었으면 새로 만들어 전달한다.
  if (body.resetPassword === true) {
    const password = typeof body.password === "string" && body.password.trim() ? body.password.trim() : generatePassword();
    newPassword = password;
    data.passwordHash = hashSharePassword(password);
  }
  // 링크가 샜을 때 — 토큰을 새로 발급하면 옛 링크는 즉시 죽는다.
  if (body.rotateToken === true) data.accessToken = randomBytes(16).toString("base64url");

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });

  const updated = await prisma.competitionJudge.update({ where: { id: judgeId }, data });

  await logActivity({
    workspaceId: judge.competition.workspaceId,
    userId: user.id,
    action: "competition.judge_updated",
    meta: { competitionId: id, judgeId, name: updated.name },
  });

  return NextResponse.json({
    judge: {
      id: updated.id, name: updated.name, email: updated.email, affiliation: updated.affiliation,
      accessToken: updated.accessToken, weight: updated.weight, hasPassword: !!updated.passwordHash,
      lastSeenAt: updated.lastSeenAt,
    },
    ...(newPassword ? { password: newPassword } : {}),
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; judgeId: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id, judgeId } = await params;
  const judge = await authorize(id, judgeId, user.id);
  if (!judge) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  await prisma.competitionJudge.delete({ where: { id: judgeId } });

  await logActivity({
    workspaceId: judge.competition.workspaceId,
    userId: user.id,
    action: "competition.judge_deleted",
    meta: { competitionId: id, judgeId, name: judge.name },
  });

  return NextResponse.json({ ok: true });
}
