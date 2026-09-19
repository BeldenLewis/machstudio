import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { dashboardCache } from "@/lib/cache";
import {
  getPublicDashboardProject,
  getPublicDashboardReport,
  isInvalidDashboardShareToken,
} from "@/lib/public-realtime-dashboard";
import { rateLimit } from "@/lib/ratelimit";
import { verifySharePassword } from "@/lib/share-password";

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
}

async function respond(request: Request, token: unknown, password?: unknown) {
  if (typeof token !== "string" || isInvalidDashboardShareToken(token)) {
    return NextResponse.json({ error: "잘못된 공유 링크입니다." }, { status: 401 });
  }

  const rl = rateLimit(`realtime-dashboard-data:${clientIp(request)}`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const project = await getPublicDashboardProject(token);
  if (!project) {
    return NextResponse.json({ error: "공유가 종료되었거나 존재하지 않는 링크입니다." }, { status: 404 });
  }

  if (project.dashboardSharePasswordHash) {
    const cookieStore = await cookies();
    const verifiedCookie = cookieStore.get(`share_password_dashboard_${token}`)?.value;
    const passwordOk = verifiedCookie === "verified"
      || (typeof password === "string" && verifySharePassword(password, project.dashboardSharePasswordHash));
    if (!passwordOk) {
      return NextResponse.json({ error: "비밀번호가 필요합니다.", requiresPassword: true }, { status: 401 });
    }
  }

  const cacheKey = "pub-realtime-dashboard:" + createHash("sha1").update(token).digest("hex");
  const cached = dashboardCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  const result = await getPublicDashboardReport(project);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }

  dashboardCache.set(cacheKey, result.data);
  return NextResponse.json(result.data, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      "X-Robots-Tag": "noindex",
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return respond(request, body?.token, body?.password);
}

/** 집계 데이터만 제공한다. 이메일·전화번호·등록자 원문은 포함하지 않는다. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  return respond(request, url.searchParams.get("token"));
}
