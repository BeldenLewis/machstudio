import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { hashSharePassword } from "@/lib/share-password";
import { logActivity } from "@/lib/activity";

async function authorize(competitionId: string, userId: string) {
  const competition = await prisma.competition.findUnique({ where: { id: competitionId } });
  if (!competition) return null;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: competition.workspaceId } },
  });
  return membership ? competition : null;
}

/** 사람이 옮겨 적기 쉬운 비밀번호 — 혼동되는 글자(0/O, 1/l)를 뺀다. */
function generatePassword(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const judges = await prisma.competitionJudge.findMany({
    where: { competitionId: id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, email: true, affiliation: true, accessToken: true,
      weight: true, roundKind: true, lastSeenAt: true, createdAt: true,
      // 해시는 내려보내지 않는다 — 설정 여부만 알면 화면이 그려진다.
      passwordHash: true,
      _count: { select: { scores: true } },
    },
  });

  // 제출 완료 건수 — "누가 아직 안 냈는지"가 운영에서 제일 자주 보는 값이다.
  const submitted = await prisma.competitionJudgeScore.groupBy({
    by: ["judgeId"],
    where: { judge: { competitionId: id }, submitted: true },
    _count: { _all: true },
  });
  const submittedMap = new Map(submitted.map((s) => [s.judgeId, s._count._all]));

  return NextResponse.json({
    judges: judges.map(({ passwordHash, _count, ...judge }) => ({
      ...judge,
      hasPassword: !!passwordHash,
      savedCount: _count.scores,
      submittedCount: submittedMap.get(judge.id) ?? 0,
    })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await authorize(id, user.id);
  if (!competition) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "심사위원 이름을 입력해주세요" }, { status: 400 });

  // 비밀번호는 항상 설정한다 — 링크만으로 열리면 메신저·화면 공유로 새어 나간다.
  // 운영자가 비워 두면 우리가 만들어서 **한 번만** 돌려준다(해시만 저장하므로 다시 못 본다).
  const password = typeof body.password === "string" && body.password.trim() ? body.password.trim() : generatePassword();
  const roundKind = body.roundKind === "prelim" ? "prelim" : "final";

  const judge = await prisma.competitionJudge.create({
    data: {
      competitionId: id,
      name,
      email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null,
      affiliation: typeof body.affiliation === "string" && body.affiliation.trim() ? body.affiliation.trim() : null,
      accessToken: randomBytes(16).toString("base64url"),
      passwordHash: hashSharePassword(password),
      weight: typeof body.weight === "number" && body.weight >= 1 ? Math.floor(body.weight) : 1,
      roundKind,
    },
  });

  await logActivity({
    workspaceId: competition.workspaceId,
    userId: user.id,
    action: "competition.judge_created",
    meta: { competitionId: id, judgeId: judge.id, name: judge.name },
  });

  return NextResponse.json(
    {
      judge: { id: judge.id, name: judge.name, email: judge.email, affiliation: judge.affiliation, accessToken: judge.accessToken, weight: judge.weight, roundKind: judge.roundKind, hasPassword: true, savedCount: 0, submittedCount: 0, lastSeenAt: null },
      // 이 응답에서만 평문을 준다. 저장은 해시라 나중에는 재설정만 가능하다.
      password,
    },
    { status: 201 },
  );
}
