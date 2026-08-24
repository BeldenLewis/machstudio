/**
 * 미리보기 링크(/p/{previewToken}) 재발급.
 *
 * 이 링크는 **로그인 없이 열린다** — 검토자가 워크스페이스 멤버가 아니어도 보라고 만든 것이다.
 * 그래서 한 번 나간 링크를 끊을 방법이 반드시 있어야 한다(메신저·메일로 흘러간 뒤 회수 불가).
 * 여기가 그 유일한 수단이라 apiKey 재발급과 같은 권한(관리자 이상)을 요구한다.
 */
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });
  if (membership.role === "MEMBER") return NextResponse.json({ error: "권한 없음" }, { status: 403 });

  // 연동형에는 미리보기로 그릴 폼 자체가 없다 — 토큰을 만들면 열리지 않는 링크만 남는다.
  if (source.mode !== "builder") {
    return NextResponse.json({ error: "빌더형 소스에만 미리보기 링크가 있어요" }, { status: 409 });
  }

  // previewToken 은 unique 다 — 충돌하면 다시 뽑는다(현실적으로 일어나기 어렵지만).
  let previewToken = newToken();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.collectSource.findUnique({ where: { previewToken }, select: { id: true } });
    if (!exists) break;
    previewToken = newToken();
  }

  const updated = await prisma.collectSource.update({ where: { id }, data: { previewToken } });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "source.preview_token_regenerated",
    meta: { name: source.name },
  });

  return NextResponse.json({ previewToken: updated.previewToken });
}
