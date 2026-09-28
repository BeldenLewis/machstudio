import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { generateToken, SCOPES } from "@/lib/pat";
import { logActivity } from "@/lib/activity";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  if (!workspaceId) return NextResponse.json({ error: "workspaceId 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const tokens = await prisma.apiToken.findMany({
    where: { workspaceId },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true, userId: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tokens });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, name, scopes, expiresInDays } = body as { workspaceId?: string; name?: string; scopes?: string[]; expiresInDays?: number };
  if (!workspaceId || !name) return NextResponse.json({ error: "workspaceId, name 필요" }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });
  }

  const allowedScopes = new Set<string>(SCOPES.map((scope) => scope.id));
  const normalizedScopes = Array.isArray(scopes)
    ? Array.from(new Set(scopes.filter((scope): scope is string => typeof scope === "string" && allowedScopes.has(scope))))
    : [];
  const { token, tokenHash, prefix } = generateToken();
  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 86400_000) : null;

  const created = await prisma.apiToken.create({
    data: {
      workspaceId,
      userId: user.id,
      name: name.trim(),
      tokenHash,
      prefix,
      scopes: normalizedScopes,
      expiresAt,
    },
  });

  await logActivity({
    workspaceId,
    userId: user.id,
    action: "apiToken.created",
    meta: {
      tokenId: created.id,
      tokenName: created.name,
      scopes: created.scopes,
      prefix: created.prefix,
      expiresAt: created.expiresAt?.toISOString() ?? null,
    },
  });

  // token 평문은 응답에만 — DB 에는 저장 안 됨
  return NextResponse.json({
    token: { id: created.id, prefix, name: created.name, scopes: created.scopes, expiresAt: created.expiresAt },
    accessToken: token,
  });
}
