import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { normalizeRegistrationForm } from "@/lib/webinar-config";
import { parseUtmEnvelope } from "@/lib/webinar-attribution";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

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

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`webinar-register:${slug}:${ip}`, { limit: 30, windowMs: 60_000 });
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
    // 재제출은 프로필 필드만 보강할 수 있고, 매칭된 기존 레코드의 식별자(phone/email)는
    // 절대 변경/탈취할 수 없다 — 소유권 증명이 없으므로 연락처는 항상 기존 값을 유지한다.
    // (예: 이메일만 알아도 피해자 전화번호를 덮어써 verify-by-phone 로 사칭하는 것을 차단)
    const cleanCompany = clean(company);
    const cleanDepartment = clean(department);
    const cleanJobTitle = clean(jobTitle);
    const cleanIndustry = clean(industry);
    const registration = await prisma.webinarRegistration.update({
      where: { id: duplicate.id },
      data: {
        // 식별자(phone/email)는 갱신하지 않음 — 기존 레코드 값 보존.
        // 비식별 프로필 필드만, 그리고 값이 제공된 경우에만 갱신한다.
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(cleanCompany !== null ? { company: cleanCompany } : {}),
        ...(cleanDepartment !== null ? { department: cleanDepartment } : {}),
        ...(cleanJobTitle !== null ? { jobTitle: cleanJobTitle } : {}),
        ...(cleanIndustry !== null ? { industry: cleanIndustry } : {}),
        agreeMarketing: Boolean(agreeMarketing),
        // 재등록 시 기존 동의를 다운그레이드하지 않음 — 명시적으로 동의한 경우에만 갱신
        ...(agreePrivacy === true ? { agreePrivacy: true } : {}),
        memo: Object.keys(memoPayload).length ? JSON.stringify(memoPayload, null, 2) : duplicate.memo,
        // 재등록 시 기존 어트리뷰션은 보존 — 비어 있을 때만 채운다
        ...(utm && !duplicate.utmSource && !duplicate.firstUtmSource ? utmData : {}),
      },
    });

    return NextResponse.json({
      alreadyRegistered: true,
      // 식별자(email/phone)는 응답에 싣지 않는다 — 이메일만 알아도 재제출로 타인 전화번호를 알아내는 유출 차단.
      registration: { id: registration.id, name: registration.name },
      ...(videoId ? { youtubeId: videoId } : {}),
    }, {
      headers: CORS_HEADERS,
    });
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
