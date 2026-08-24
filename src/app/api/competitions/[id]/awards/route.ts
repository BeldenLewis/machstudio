/**
 * 시상 정의·배정.
 *
 * 상은 대회마다 다르다(대상 1개일 수도, 부문별 5개일 수도). 그래서 목록을 통째로 저장한다 —
 * 항목별 PATCH 로 쪼개면 순위가 겹치거나 빈 순위가 생긴 중간 상태가 화면에 남는다.
 *
 * 배정(entryId)은 비워 둘 수 있다. 상 목록을 먼저 짜 두고 발표 직전에 채우는 게 실제 순서다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: competition.workspaceId } },
  });
  return membership ? competition : null;
}

async function listAwards(competitionId: string) {
  const awards = await prisma.competitionAward.findMany({
    where: { competitionId },
    orderBy: { rank: "asc" },
    include: {
      entry: { select: { id: true, entryNo: true, title: true, teamName: true } },
    },
  });
  return awards.map((award) => ({
    id: award.id,
    name: award.name,
    rank: award.rank,
    description: award.description,
    revealedAt: award.revealedAt,
    entryId: award.entryId,
    entry: award.entry,
  }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // 배정 후보 — 본선 진출자가 있으면 그들, 없으면 공개된 참가작 전체(본선 없이 시상하는 대회도 있다).
  const advanced = await prisma.competitionEntry.findMany({
    where: { competitionId: id, advanced: true },
    orderBy: [{ finalOrder: "asc" }, { entryNo: "asc" }],
    select: { id: true, entryNo: true, title: true, teamName: true },
  });
  const candidates = advanced.length
    ? advanced
    : await prisma.competitionEntry.findMany({
        where: { competitionId: id, isPublished: true, status: { not: "rejected" } },
        orderBy: { entryNo: "asc" },
        select: { id: true, entryNo: true, title: true, teamName: true },
      });

  return NextResponse.json({
    awards: await listAwards(id),
    candidates,
    resultPublishedAt: competition.resultPublishedAt,
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (!Array.isArray(body.awards)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId: id },
    select: { id: true },
  });
  const validEntryIds = new Set(entries.map((e) => e.id));

  const rows = (body.awards as unknown[])
    .map((raw, index) => {
      if (!raw || typeof raw !== "object") return null;
      const item = raw as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name.trim() : "";
      if (!name) return null;
      const entryId = typeof item.entryId === "string" && validEntryIds.has(item.entryId) ? item.entryId : null;
      return {
        id: typeof item.id === "string" && item.id ? item.id : null,
        name: name.slice(0, 120),
        // 순위는 화면 순서를 그대로 따른다 — 사람이 숫자를 직접 맞추게 하면 반드시 겹친다.
        rank: index + 1,
        description: typeof item.description === "string" && item.description.trim()
          ? item.description.trim().slice(0, 500)
          : null,
        entryId,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const keptIds = rows.map((r) => r.id).filter((v): v is string => v !== null);

  // 전량 교체 — 삭제·추가·순서 변경이 한 번에 반영돼야 중간 상태가 안 남는다.
  await prisma.$transaction([
    prisma.competitionAward.deleteMany({
      where: { competitionId: id, ...(keptIds.length ? { id: { notIn: keptIds } } : {}) },
    }),
    ...rows.map((row) =>
      row.id
        ? prisma.competitionAward.update({
            where: { id: row.id },
            data: { name: row.name, rank: row.rank, description: row.description, entryId: row.entryId },
          })
        : prisma.competitionAward.create({
            data: {
              competitionId: id,
              name: row.name, rank: row.rank, description: row.description, entryId: row.entryId,
            },
          }),
    ),
  ]);

  await logActivity({
    workspaceId: competition.workspaceId,
    userId: user.id,
    action: "competition.award_saved",
    meta: { competitionId: id, count: rows.length },
  });

  return NextResponse.json({ awards: await listAwards(id) });
}

/** 결과 페이지 공개/비공개. 발표 전에 명단이 새면 행사가 망가지므로 명시적 토글로 둔다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const publish = body.publish === true;

  if (publish) {
    const assigned = await prisma.competitionAward.count({ where: { competitionId: id, entryId: { not: null } } });
    if (assigned === 0) {
      return NextResponse.json({ error: "수상작이 한 팀도 배정되지 않았어요." }, { status: 400 });
    }
  }

  const now = new Date();
  const updated = await prisma.competition.update({
    where: { id },
    data: {
      resultPublishedAt: publish ? now : null,
      // 개별 상의 공개 시각도 같이 맞춘다 — 결과 페이지와 따로 놀면 무엇이 공개됐는지 헷갈린다.
      awards: { updateMany: { where: {}, data: { revealedAt: publish ? now : null } } },
    },
    select: { resultPublishedAt: true },
  });

  await logActivity({
    workspaceId: competition.workspaceId,
    userId: user.id,
    action: "competition.result_published",
    meta: { competitionId: id, published: publish },
  });

  return NextResponse.json({ resultPublishedAt: updated.resultPublishedAt, awards: await listAwards(id) });
}
