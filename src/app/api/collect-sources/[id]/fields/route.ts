import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { fields } = await request.json();

  /**
   * **저장은 지우고 다시 만든다** — 그래서 화이트리스트에 없는 컬럼은 매번 사라진다.
   *
   * 앵커(matchBy/matchValue)는 대행전시 소스가 DOM 에서 필드를 찾는 유일한 단서다.
   * 이걸 이월하지 않으면 **운영자가 라벨 하나만 고쳐 저장해도 앵커가 전부 날아가고**
   * 위치 인덱스로 되돌아간다 — 수집이 조용히 멈추는데 화면은 아무 말도 하지 않는다.
   * 그래서 key 기준으로 기존 값을 읽어 이어 붙인다. 클라이언트가 명시적으로 null 을
   * 보내야만 해제된다.
   */
  const existing = await prisma.fieldMapping.findMany({
    where: { sourceId: id },
    select: { key: true, matchBy: true, matchValue: true },
  });
  const anchors = new Map(existing.map((f) => [f.key, { matchBy: f.matchBy, matchValue: f.matchValue }]));

  type IncomingField = {
    index: number; key: string; label: string;
    type?: string; isRequired?: boolean; showInDashboard?: boolean; sortOrder?: number;
    matchBy?: string | null; matchValue?: string | null;
    hidden?: boolean;
  };

  await prisma.$transaction([
    prisma.fieldMapping.deleteMany({ where: { sourceId: id } }),
    prisma.fieldMapping.createMany({
      data: (fields as IncomingField[]).map((f) => {
        const kept = anchors.get(f.key);
        return {
          sourceId: id,
          index: f.index,
          key: f.key,
          label: f.label,
          type: f.type ?? "text",
          isRequired: f.isRequired ?? false,
          showInDashboard: f.showInDashboard ?? true,
          sortOrder: f.sortOrder ?? f.index,
          // undefined = 보내지 않음 → 보존. null = 명시적 해제.
          matchBy: f.matchBy !== undefined ? f.matchBy : (kept?.matchBy ?? null),
          matchValue: f.matchValue !== undefined ? f.matchValue : (kept?.matchValue ?? null),
          // hidden 은 편집기가 항상 현재 값을 들고 있는 화면 상태라(앵커와 달리 별도 API로
          // 세팅되지 않음) 이월할 필요 없이 그대로 받는다.
          hidden: f.hidden ?? false,
        };
      }),
    }),
  ]);

  const updated = await prisma.fieldMapping.findMany({
    where: { sourceId: id },
    orderBy: { sortOrder: "asc" },
  });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: id,
    userId: user.id,
    action: "source.fields_updated",
    meta: { sourceId: id, fieldCount: updated.length },
  });

  return NextResponse.json({ fields: updated });
}
