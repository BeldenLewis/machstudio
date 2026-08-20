import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/ratelimit";
import {
  extractYoutubeId,
  normalizeCompetitionConfig,
  normalizeMedia,
  type CompetitionMediaItem,
} from "@/lib/competition-config";
import { resolveCompetitionStatus } from "@/lib/competition-status";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" } });
}

/** 운영자용 목록 — 로그인 + 워크스페이스 멤버십 필요. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) return NextResponse.json({ error: "대회 없음" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: competition.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const entries = await prisma.competitionEntry.findMany({
    where: { competitionId: id },
    orderBy: [{ sortOrder: "asc" }, { submittedAt: "asc" }],
  });

  return NextResponse.json({ entries });
}

/** 참가 신청 — 공개 엔드포인트(로그인 없음). 단계·중복·형식을 서버가 검증한다. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ip = getClientIp(request);
  const limited = rateLimit(`competition-entry:${id}:${ip}`, { limit: 10, windowMs: 60_000 });
  if (!limited.allowed) {
    return NextResponse.json({ error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." }, { status: 429, headers: CORS_HEADERS });
  }

  const competition = await prisma.competition.findUnique({ where: { id } });
  if (!competition) return NextResponse.json({ error: "대회 없음" }, { status: 404, headers: CORS_HEADERS });

  // 클라이언트만 막으면 마감 후에도 API 로 들어온다 — 서버가 단계를 본다.
  const status = resolveCompetitionStatus(competition);
  if (!status.canApply) {
    return NextResponse.json({ error: "지금은 접수 기간이 아니에요." }, { status: 403, headers: CORS_HEADERS });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400, headers: CORS_HEADERS });
  }

  // 허니팟 — 봇만 채운다. 사람에겐 보이지 않는 칸이라 값이 있으면 조용히 성공으로 응답한다.
  if (typeof body._hp === "string" && body._hp.trim()) {
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  }

  if (body.agreePrivacy !== true) {
    return NextResponse.json({ error: "개인정보 수집 및 이용에 동의해주세요." }, { status: 400, headers: CORS_HEADERS });
  }

  const config = normalizeCompetitionConfig(competition.config);
  const incoming = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;

  // 정의에 없는 키는 저장하지 않는다(임의 필드 주입 차단). 필수 누락은 400.
  const data: Record<string, string> = {};
  for (const field of config.form.fields) {
    if (field.type === "image" || field.type === "youtube") continue; // 미디어는 아래에서 따로
    const raw = incoming[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (field.required && !value) {
      return NextResponse.json({ error: `${field.label} 항목을 입력해주세요.` }, { status: 400, headers: CORS_HEADERS });
    }
    if (value) data[field.key] = value;
  }

  // 미디어 — 이미지 URL 은 업로드 라우트가 만든 것, 영상은 videoId 로 정규화해서 저장한다.
  const media: CompetitionMediaItem[] = normalizeMedia(body.media);
  const youtubeField = config.form.fields.find((f) => f.type === "youtube");
  if (youtubeField) {
    const rawUrl = typeof incoming[youtubeField.key] === "string" ? (incoming[youtubeField.key] as string).trim() : "";
    if (rawUrl) {
      const videoId = extractYoutubeId(rawUrl);
      if (!videoId) {
        return NextResponse.json({ error: "YouTube 링크를 확인해주세요." }, { status: 400, headers: CORS_HEADERS });
      }
      media.push({ kind: "youtube", videoId, sortOrder: media.length });
    } else if (youtubeField.required) {
      return NextResponse.json({ error: `${youtubeField.label} 항목을 입력해주세요.` }, { status: 400, headers: CORS_HEADERS });
    }
  }

  const title = data.title || data.teamName || data.name || "제목 없음";
  const contactEmail = data.email ? data.email.toLowerCase() : null;

  // 1팀 1작품 — maxEntriesPerApplicant 를 넘으면 막는다. 이메일 기준.
  if (contactEmail) {
    const already = await prisma.competitionEntry.count({
      where: { competitionId: id, contactEmail, status: { not: "rejected" } },
    });
    if (already >= competition.maxEntriesPerApplicant) {
      return NextResponse.json(
        { error: "이미 신청하셨어요.", duplicate: true },
        { status: 409, headers: CORS_HEADERS },
      );
    }
  }

  // 참가번호 — 현장에서 "3번 팀"으로 부른다. 접수 순번을 쓰되 동시 제출 충돌은 재시도로 흡수한다.
  for (let attempt = 0; attempt < 5; attempt++) {
    const count = await prisma.competitionEntry.count({ where: { competitionId: id } });
    const entryNo = String(count + 1 + attempt);
    try {
      const entry = await prisma.competitionEntry.create({
        data: {
          competitionId: id,
          entryNo,
          title,
          teamName: data.teamName || null,
          summary: data.summary || null,
          data,
          media: JSON.parse(JSON.stringify(media)),
          contactName: data.name || null,
          contactEmail,
          contactPhone: data.phone || null,
          sortOrder: count + attempt,
          // 검증만 하고 버리던 값이었다 — 여기서부터 실제로 남긴다(§compliance).
          agreePrivacy: true,
          agreeMarketing: body.agreeMarketing === true,
          agreeThirdParty: body.agreeThirdParty === true,
        },
      });
      return NextResponse.json(
        { ok: true, entryNo: entry.entryNo, message: config.form.successMessage },
        { status: 201, headers: CORS_HEADERS },
      );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") continue; // entryNo 경합 — 다음 번호로 재시도
      console.error("[competition] entry create failed", error);
      return NextResponse.json({ error: "신청 처리에 실패했어요." }, { status: 500, headers: CORS_HEADERS });
    }
  }

  return NextResponse.json({ error: "신청이 몰리고 있어요. 잠시 후 다시 시도해주세요." }, { status: 503, headers: CORS_HEADERS });
}
