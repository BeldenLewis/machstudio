/**
 * slug 로 대회를 연다 — 어드민 상세 화면의 진입점.
 * URL 이 사람이 읽을 수 있어야 해서(/competition/pitch-2026) id 대신 slug 를 쓴다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeCompetitionConfig } from "@/lib/competition-config";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { slug } = await params;
  const competition = await prisma.competition.findUnique({ where: { slug } });
  if (!competition) return NextResponse.json({ error: "대회 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: competition.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const [rounds, entryCount] = await Promise.all([
    prisma.competitionRound.findMany({ where: { competitionId: competition.id }, orderBy: { sortOrder: "asc" } }),
    prisma.competitionEntry.count({ where: { competitionId: competition.id } }),
  ]);

  return NextResponse.json({
    competition: {
      ...competition,
      // 어드민은 꺼 둔 블록·항목도 봐야 편집할 수 있다.
      config: normalizeCompetitionConfig(competition.config, { includeDisabled: true }),
    },
    rounds,
    entryCount,
  });
}
