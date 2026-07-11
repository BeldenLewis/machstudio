import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

type DuplicateMode = "skip" | "include" | "update";

interface RegistrationInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  industry?: string | null;
  agreeMarketing?: boolean;
  agreePrivacy?: boolean;
  memo?: string | null;
}

const sortMap = {
  name: "name",
  phone: "phone",
  email: "email",
  company: "company",
  department: "department",
  jobTitle: "jobTitle",
  industry: "industry",
  agreeMarketing: "agreeMarketing",
  enteredAt: "enteredAt",
  lastPingAt: "lastPingAt",
  stayMinutes: "stayMinutes",
  submittedAt: "submittedAt",
  isActive: "isActive",
} as const;

async function authorize(webinarId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, webinar: null, error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const webinar = await prisma.webinar.findUnique({ where: { id: webinarId } });
  if (!webinar) return { user, webinar: null, error: NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return { user, webinar, error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { user, webinar, error: null };
}

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizePhone(value: unknown) {
  const text = String(value ?? "").replace(/[^0-9]/g, "");
  return text || null;
}

function normalizeEmail(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase();
  return text || null;
}

function normalizeInput(input: RegistrationInput) {
  return {
    name: String(input.name ?? "").trim(),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
    company: clean(input.company),
    department: clean(input.department),
    jobTitle: clean(input.jobTitle),
    industry: clean(input.industry),
    agreeMarketing: Boolean(input.agreeMarketing),
    agreePrivacy: input.agreePrivacy !== false,
    memo: clean(input.memo),
  };
}

async function findDuplicate(webinarId: string, phone: string | null, email: string | null) {
  if (!phone && !email) return null;
  return prisma.webinarRegistration.findFirst({
    where: {
      webinarId,
      OR: [
        ...(phone ? [{ phone }] : []),
        ...(email ? [{ email }] : []),
      ],
    },
    orderBy: { submittedAt: "asc" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(200, Math.max(10, parseInt(searchParams.get("pageSize") ?? "50", 10)));
  const q = searchParams.get("q") ?? "";
  const sortBy = searchParams.get("sortBy") as keyof typeof sortMap | null;
  const sortDir = searchParams.get("sortDir") === "asc" ? "asc" : "desc";
  const sortColumn = sortBy && sortMap[sortBy] ? sortMap[sortBy] : "submittedAt";

  const where = {
    webinarId: id,
    ...(q ? {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q, mode: "insensitive" as const } },
        { email: { contains: q, mode: "insensitive" as const } },
        { company: { contains: q, mode: "insensitive" as const } },
        { department: { contains: q, mode: "insensitive" as const } },
        { jobTitle: { contains: q, mode: "insensitive" as const } },
        { industry: { contains: q, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [registrations, total, registered, entered, active] = await Promise.all([
    prisma.webinarRegistration.findMany({
      where,
      orderBy: [{ [sortColumn]: sortDir }, { submittedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.webinarRegistration.count({ where }),
    prisma.webinarRegistration.count({ where: { webinarId: id } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, enteredAt: { not: null } } }),
    prisma.webinarRegistration.count({ where: { webinarId: id, isActive: true } }),
  ]);

  // stats 는 검색 필터와 무관한 전체 집계(요약 카드용). total 은 검색 반영 페이지네이션용.
  return NextResponse.json({ registrations, total, stats: { registered, entered, active } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;

  const body = await request.json();
  const duplicateMode = (body.duplicateMode === "include" || body.duplicateMode === "update" ? body.duplicateMode : "skip") as DuplicateMode;
  const rows: RegistrationInput[] = Array.isArray(body.registrations)
    ? body.registrations
    : body.registration
      ? [body.registration]
      : [];

  if (!rows.length) {
    return NextResponse.json({ error: "등록할 데이터가 없습니다." }, { status: 400 });
  }
  // 행 상한 — 초대형 임포트가 서버리스 타임아웃으로 부분 커밋되어 재시도 시 중복 생성되는 것을 방지.
  if (rows.length > 5000) {
    return NextResponse.json({ error: "한 번에 최대 5,000행까지 등록할 수 있어요. 파일을 나눠서 올려주세요." }, { status: 400 });
  }

  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as { index: number; message: string }[],
  };
  const seenKeys = new Set<string>();

  for (let index = 0; index < rows.length; index += 1) {
    const data = normalizeInput(rows[index]);
    if (!data.name) {
      result.errors.push({ index, message: "이름이 없습니다." });
      continue;
    }
    if (!data.phone && !data.email) {
      result.errors.push({ index, message: "연락처 또는 이메일이 필요합니다." });
      continue;
    }

    const key = data.phone ? `p:${data.phone}` : `e:${data.email}`;

    try {
      const duplicate = duplicateMode === "include" ? null : await findDuplicate(id, data.phone, data.email);
      const batchDuplicate = duplicateMode !== "include" && seenKeys.has(key);

      if ((duplicate || batchDuplicate) && duplicateMode === "skip") {
        result.skipped += 1;
        continue;
      }

      if (duplicate && duplicateMode === "update") {
        await prisma.webinarRegistration.update({
          where: { id: duplicate.id },
          data,
        });
        result.updated += 1;
        seenKeys.add(key);
        continue;
      }

      await prisma.webinarRegistration.create({
        data: {
          webinarId: id,
          ...data,
        },
      });
      result.created += 1;
      seenKeys.add(key);
    } catch (error) {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      result.errors.push({ index, message: `${data.name || data.email || data.phone || "행"}: ${message}` });
      continue;
    }
  }

  return NextResponse.json(result, { status: result.created || result.updated || result.skipped ? 200 : 400 });
}
