import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimitAsync } from "@/lib/ratelimit";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { normalizeRegistrationForm, normalizePhone, normalizeEmail, isValidPhone, isValidEmail } from "@/lib/webinar-config";
import { parseUtmEnvelope } from "@/lib/webinar-attribution";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = await rateLimitAsync(`webinar-register:${slug}:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "요청이 너무 잦아요. 잠시 후 다시 시도해주세요." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": Math.ceil(rl.retryAfterMs / 1000).toString() } },
    );
  }

  const webinar = await prisma.webinar.findUnique({ where: { slug } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS_HEADERS });

  // 상태 머신 단일 판정 — signupDeadline 직접 비교 제거.
  // registration 이면 허용, live 중에는 components.allowLiveRegistration(미설정 시 기존 마감 규칙) 을 따른다.
  const statusInfo = resolveWebinarStatus(webinar);
  if (!statusInfo.canRegister) {
    return NextResponse.json({ error: "사전등록이 마감됐어요" }, { status: 400, headers: CORS_HEADERS });
  }

  const body = await request.json();

  // 허니팟 — 봇이 자동완성하는 hidden 필드. 값이 들어오면 봇으로 간주.
  // 200 응답으로 봇이 재시도하지 못하게.
  const honeypot = (body?._hp ?? body?.honeypot ?? body?.website) as string | undefined;
  if (honeypot && String(honeypot).trim() !== "") {
    return NextResponse.json(
      { registration: { id: "skipped", name: "", email: null, phone: null } },
      { status: 201, headers: CORS_HEADERS },
    );
  }
  const { name, phone, email, company, department, jobTitle, industry, agreeMarketing, agreePrivacy, memo, customFields } = body;
  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = normalizeEmail(email);
  const fields = normalizeRegistrationForm(webinar.config).fields;
  const customAnswers = typeof customFields === "object" && customFields !== null ? customFields as Record<string, unknown> : {};

  for (const field of fields) {
    if (!field.required) continue;
    const value = field.system ? body[field.key] : customAnswers[field.key];
    if (field.type === "checkbox") {
      if (!value) return NextResponse.json({ error: `${field.label} 항목에 동의해주세요` }, { status: 400, headers: CORS_HEADERS });
    } else if (String(value ?? "").trim() === "") {
      return NextResponse.json({ error: `${field.label} 항목을 입력해주세요` }, { status: 400, headers: CORS_HEADERS });
    }
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400, headers: CORS_HEADERS });
  }
  if (!normalizedPhone && !normalizedEmail) {
    return NextResponse.json({ error: "입장 확인을 위해 연락처 또는 이메일 중 하나를 입력해주세요" }, { status: 400, headers: CORS_HEADERS });
  }
  // 형식 검증 — 클라이언트 중복확인(check)과 같은 규칙. 서버에 규칙이 없으면 중복확인이 영영 잡지 못하는
  // 등록(예: 16자리 번호)이 생긴다.
  if (normalizedPhone && !isValidPhone(normalizedPhone)) {
    return NextResponse.json({ error: "올바른 연락처를 입력해주세요" }, { status: 400, headers: CORS_HEADERS });
  }
  if (normalizedEmail && !isValidEmail(normalizedEmail)) {
    return NextResponse.json({ error: "올바른 이메일을 입력해주세요" }, { status: 400, headers: CORS_HEADERS });
  }

  const memoPayload = {
    ...(memo?.trim() ? { memo: memo.trim() } : {}),
    ...(Object.keys(customAnswers).length ? { customFields: customAnswers } : {}),
  };

  // UTM 어트리뷰션 봉투 (_utm) — 로더/폼 위젯이 동봉. 없으면 전부 null 로 두고 기존 동작 유지.
  const utm = parseUtmEnvelope(body?._utm);
  const utmData = utm
    ? {
        utmSource: utm.utmSource,
        utmMedium: utm.utmMedium,
        utmCampaign: utm.utmCampaign,
        utmTerm: utm.utmTerm,
        utmContent: utm.utmContent,
        utmId: utm.utmId,
        firstUtmSource: utm.firstUtmSource,
        firstUtmMedium: utm.firstUtmMedium,
        firstUtmCampaign: utm.firstUtmCampaign,
        firstUtmTerm: utm.firstUtmTerm,
        firstUtmContent: utm.firstUtmContent,
        firstUtmId: utm.firstUtmId,
        firstReferrer: utm.firstReferrer,
        firstSeenAt: utm.firstSeenAt,
        journey: (utm.journey ?? null) as never,
        referrer: utm.referrer,
      }
    : {};
  const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;
  // 등록 완료자에게 영상 ID 전달 (공개 /info 에서는 제거됨 — 라이브 페이지 signup→live 경로용)
  const videoId = typeof (webinar.config as Record<string, unknown>)?.youtubeId === "string"
    ? (webinar.config as Record<string, unknown>).youtubeId
    : undefined;

  const duplicate = await prisma.webinarRegistration.findFirst({
    where: {
      webinarId: webinar.id,
      OR: [
        ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ...(normalizedEmail ? [{ email: normalizedEmail }] : []),
      ],
    },
    orderBy: { submittedAt: "asc" },
  });

  if (duplicate) {
    // 중복 제출은 차단한다(새 등록 생성 금지) — 단, 재제출이 담은 "업그레이드-안전" 신호는 보존:
    // - 동의: 명시적으로 체크한 경우에만 true 로 승격(다운그레이드 없음)
    // - 어트리뷰션: 기존 레코드가 비어 있을 때만 백필 (재방문 캠페인 성과 유실 방지)
    // 프로필 필드(회사·직함 등)는 소유권 증명이 없으므로 덮어쓰지 않는다.
    const upgrades: Record<string, unknown> = {};
    if (agreeMarketing === true && !duplicate.agreeMarketing) upgrades.agreeMarketing = true;
    if (agreePrivacy === true && !duplicate.agreePrivacy) upgrades.agreePrivacy = true;
    if (utm && !duplicate.utmSource && !duplicate.firstUtmSource) Object.assign(upgrades, utmData);
    if (Object.keys(upgrades).length > 0) {
      await prisma.webinarRegistration.update({ where: { id: duplicate.id }, data: upgrades }).catch(() => {
        /* 보존 실패는 차단 응답을 막지 않는다 */
      });
    }

    const dupField = normalizedPhone && duplicate.phone === normalizedPhone ? "연락처" : "이메일";
    return NextResponse.json(
      {
        error: `이미 사전등록된 ${dupField}예요. 웨비나 당일 이 ${dupField}로 바로 입장할 수 있어요.`,
        duplicateField: dupField === "연락처" ? "phone" : "email",
        alreadyRegistered: true,
      },
      { status: 409, headers: CORS_HEADERS },
    );
  }

  const registration = await prisma.webinarRegistration.create({
    data: {
      webinarId: webinar.id,
      name: name.trim(),
      phone: normalizedPhone,
      email: normalizedEmail,
      company: clean(company),
      department: clean(department),
      jobTitle: clean(jobTitle),
      industry: clean(industry),
      agreeMarketing: Boolean(agreeMarketing),
      agreePrivacy: Boolean(agreePrivacy ?? true),
      memo: Object.keys(memoPayload).length ? JSON.stringify(memoPayload, null, 2) : null,
      ...utmData,
      userAgent,
      registeredStatus: statusInfo.status,
    },
  });

  return NextResponse.json({ registration: { id: registration.id, name: registration.name }, ...(videoId ? { youtubeId: videoId } : {}) }, {
    status: 201,
    headers: CORS_HEADERS,
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
