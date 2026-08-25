import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { buildCollectScripts } from "@/lib/collect-script";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const { script, utmScript } = buildCollectScripts({
    source: {
      id: source.id,
      apiKey: source.apiKey,
      successTrigger: source.successTrigger,
      redirectUrl: source.redirectUrl,
      formPagePatterns: source.formPagePatterns,
      fieldGroupSelector: source.fieldGroupSelector,
    },
    fieldMappings: source.fieldMappings.map((f) => ({
      index: f.index,
      key: f.key,
      label: f.label,
      // 앵커는 대행전시 소스에만 있다 — null 이면 생성물에 실리지 않고 위치 경로를 탄다.
      matchBy: f.matchBy as "id" | "name" | null,
      matchValue: f.matchValue,
      required: f.isRequired,
    })),
    baseUrl,
  });

  return NextResponse.json({ script, utmScript });
}
