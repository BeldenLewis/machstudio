import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";

// 핵심 수집 경로 헬스체크 — 실패 시 Sentry로 즉시 알림.
// 점검 대상:
//  1) /api/collect 가 살아있고 인증 거부(401)를 정상 반환하는지 (라우트 자체 동작 확인)
//  2) 활성 소스들의 /s/{id} loader 가 200 + JS 반환하는지 (proxy 차단 등 감지)
//  3) DB 도달 가능 여부
//
// 이번 장애(/s/ 가 proxy 리다이렉트로 307 반환)를 자동 감지하기 위한 안전망.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? request.headers.get("Authorization");
  // 나머지 cron 4개와 **같은** 조건이어야 한다. 예전 조건은 `secret && auth && ...` 여서
  // 헤더가 없으면 검사를 통째로 건너뛰었다 → 누구나 호출 가능. 그러면 (a) 요청 1건이 서버측
  // 외부 fetch 여러 건 + Sentry 발사로 증폭되고, (b) 응답의 loaders 에 워크스페이스 구분 없이
  // 최근 활성 소스의 id·이름이 실려 남의 소스 이름이 노출됐다.
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const problems: string[] = [];
  const result: Record<string, unknown> = {};

  // 1) DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    result.db = "ok";
  } catch (e) {
    result.db = "fail";
    problems.push(`DB unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2) /api/collect 라우트 살아있는지 (API 키 없이 호출 → 401 정상)
  try {
    const res = await fetch(`${origin}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
    });
    result.collectStatus = res.status;
    // 401(키없음) 또는 400(data없음)은 정상 — 라우트가 살아있다는 뜻.
    // 3xx 리다이렉트나 5xx는 비정상.
    if (res.status >= 300 && res.status !== 400 && res.status !== 401) {
      problems.push(`/api/collect returned unexpected ${res.status}`);
    }
  } catch (e) {
    result.collectStatus = "fail";
    problems.push(`/api/collect fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3) 활성 소스들의 loader (/s/{id}) 점검 — 최근 활동 있는 소스 위주, 최대 5개
  try {
    const sources = await prisma.collectSource.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });
    const loaderResults: Array<{ id: string; name: string; status: number | string; ok: boolean }> = [];
    for (const s of sources) {
      try {
        const res = await fetch(`${origin}/s/${s.id}`, { redirect: "manual" });
        const ct = res.headers.get("content-type") ?? "";
        const isJs = ct.includes("javascript");
        const ok = res.status === 200 && isJs;
        loaderResults.push({ id: s.id, name: s.name, status: res.status, ok });
        if (!ok) {
          problems.push(`Loader /s/${s.id} (${s.name}): status=${res.status}, content-type="${ct}" (expected 200 + javascript)`);
        }
      } catch (e) {
        loaderResults.push({ id: s.id, name: s.name, status: "fetch-fail", ok: false });
        problems.push(`Loader /s/${s.id} (${s.name}) fetch failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    result.loaders = loaderResults;
  } catch (e) {
    problems.push(`Source query failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  result.problems = problems;
  result.healthy = problems.length === 0;
  result.checkedAt = new Date().toISOString();

  // 문제 있으면 Sentry로 알림
  if (problems.length > 0) {
    Sentry.captureMessage(
      `[uptime-check] 수집 경로 이상 감지: ${problems.length}건`,
      {
        level: "error",
        extra: { problems, result },
      },
    );
    return NextResponse.json(result, { status: 503 });
  }

  return NextResponse.json(result);
}
