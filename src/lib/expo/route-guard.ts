/**
 * 홈페이지 어드민 라우트의 **공통 관문**.
 *
 * 순서가 곧 안전이다:
 *  ① 기능이 열려 있나(스키마 준비) — 아니면 Expo 델리게이트를 **부르지도 않는다**
 *  ② 쓰기면 출처·형식 — 본문을 읽기 전에
 *  ③ 로그인
 *  ④ 소유권 — URL 이 지목한 자원 기준
 *
 * 라우트마다 이 순서를 다시 쓰면 한 곳만 어긋나도 구멍이 된다. 그래서 한 함수로 둔다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { EXPO_LIMITS } from "@/lib/expo/registry";
import { getExpoCapabilities, type ExpoCapabilities } from "@/lib/expo/capability";
import { probeExpoSchema } from "@/lib/expo/schema-probe";
import { guardWriteOrigin, originGuardMessage, originGuardStatus } from "@/lib/expo/origin";
import { messageFor, statusFor, type ExpoAuthFailure } from "@/lib/expo/auth";
import { getPublicAppOrigin } from "@/lib/app-url";

export interface ExpoRouteContext {
  caps: ExpoCapabilities;
  userId: string;
  /** 이 사람이 속한 워크스페이스들 — 소유권 판정에 쓴다. */
  memberWorkspaceIds: string[];
}

/**
 * 기능이 닫혀 있을 때의 응답.
 *
 * **404 로 답한다.** 503 은 "그 기능이 존재하긴 한다" 를 알려 주는데, 아직 아무에게도
 * 공개하지 않은 기능이라 그 사실조차 밖으로 나갈 이유가 없다.
 */
const closed = () => NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

export function authFailure(failure: ExpoAuthFailure) {
  // 기능 자체가 닫힌 경우는 위와 같은 이유로 404 로 덮는다.
  if (failure.kind === "unavailable") return closed();
  return NextResponse.json({ error: messageFor(failure) }, { status: statusFor(failure) });
}

/**
 * 모든 홈페이지 라우트의 첫 줄.
 * `write: true` 면 출처·형식 가드까지 본다(본문을 읽기 전에).
 */
export async function guardExpoRoute(
  request: Request,
  { write = false }: { write?: boolean } = {},
): Promise<{ ok: true; ctx: ExpoRouteContext } | { ok: false; response: NextResponse }> {
  const caps = await getExpoCapabilities({ probe: probeExpoSchema });
  if (!caps.admin) return { ok: false, response: closed() };

  if (write) {
    const origin = getPublicAppOrigin();
    const guard = guardWriteOrigin(request, origin ? [origin] : []);
    if (!guard.ok && guard.failure) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: originGuardMessage(guard.failure) },
          { status: originGuardStatus(guard.failure) },
        ),
      };
    }
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: authFailure({ kind: "unauthenticated" }) };

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true },
  });

  return {
    ok: true,
    ctx: { caps, userId: user.id, memberWorkspaceIds: memberships.map((m) => m.workspaceId) },
  };
}

/**
 * JSON 본문을 **한 번만** 읽고 크기를 먼저 본다.
 *
 * 파싱 전에 바이트를 재는 이유: 거대한 JSON 을 파싱하고 나서 거절하면 그 사이에 메모리를
 * 이미 다 쓴다. 페이지 draft 상한을 여기서 공유한다.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = EXPO_LIMITS.pageDraftBytes,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: NextResponse.json({ error: "본문을 읽을 수 없어요" }, { status: 400 }) };
  }

  if (new TextEncoder().encode(text).length > maxBytes) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `보낸 내용이 너무 커요 (${Math.round(maxBytes / 1024)}KB 상한)` },
        { status: 413 },
      ),
    };
  }

  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, response: NextResponse.json({ error: "본문 모양이 올바르지 않아요" }, { status: 400 }) };
    }
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "본문을 읽을 수 없어요" }, { status: 400 }) };
  }
}

/** 검증 실패를 편집기가 인라인으로 쓸 수 있는 모양으로. */
export function fieldErrors(errors: Array<{ path: string; code: string; message: string }>) {
  return NextResponse.json({ error: "저장할 수 없어요", fields: errors }, { status: 422 });
}
