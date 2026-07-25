import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

/**
 * 세션 순서 일괄 변경 — 드래그로 재배치할 때 쓴다.
 *
 * number 는 단순한 표시값이 아니라 **WebinarQA.sessionNumber 의 참조 키**다.
 * 그래서 순서만 바꾸고 끝내면, "세션 2에 대한 질문"이 다른 세션의 질문으로 바뀐다.
 * 재번호와 질문 참조 이전을 **한 트랜잭션**에서 같이 처리한다.
 *
 * 본문: { ids: string[] }  — 새 순서대로 나열한 세션 id 전체.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id }, select: { id: true, workspaceId: true } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.map((v: unknown) => String(v)) : null;
  if (!ids || ids.length === 0) return NextResponse.json({ error: "순서를 확인해주세요" }, { status: 400 });
  if (new Set(ids).size !== ids.length) return NextResponse.json({ error: "중복된 세션이 있어요" }, { status: 400 });

  const current = await prisma.webinarSession.findMany({
    where: { webinarId: webinar.id },
    select: { id: true, number: true },
  });
  // 부분 목록으로 호출되면 빠진 세션의 번호가 붕 뜨므로 전체를 요구한다.
  if (current.length !== ids.length) {
    return NextResponse.json({ error: "세션 목록이 최신이 아니에요. 새로고침 후 다시 시도해주세요." }, { status: 409 });
  }
  const byId = new Map(current.map((s) => [s.id, s]));
  if (ids.some((sid: string) => !byId.has(sid))) {
    return NextResponse.json({ error: "이 웨비나의 세션이 아닌 항목이 있어요" }, { status: 400 });
  }

  // 옛 번호 → 새 번호. 질문 참조를 옮기는 데 쓴다.
  const remap = new Map<number, number>();
  ids.forEach((sid: string, i: number) => remap.set(byId.get(sid)!.number, i + 1));

  await prisma.$transaction(async (tx) => {
    // 1) 번호를 임시로 음수로 밀어 둔다. (webinarId, number) 에 유니크 제약은 없지만,
    //    중간 상태에서 두 세션이 같은 번호를 갖는 구간을 만들지 않는 게 안전하다.
    for (const s of current) {
      await tx.webinarSession.update({ where: { id: s.id }, data: { number: -s.number } });
    }
    // 2) 새 번호 부여
    for (const [i, sid] of ids.entries()) {
      await tx.webinarSession.update({ where: { id: sid }, data: { number: i + 1 } });
    }
    // 3) 질문의 세션 참조도 같이 이동 — 안 하면 "세션 2에 대한 질문"이 다른 세션 질문이 된다.
    //    행마다 새 값을 직접 넣는다(sessionNumber 엔 유니크 제약이 없어 중간 충돌이 없다).
    const qas = await tx.webinarQA.findMany({
      where: { webinarId: webinar.id, sessionNumber: { not: null } },
      select: { id: true, sessionNumber: true },
    });
    for (const q of qas) {
      const next = remap.get(q.sessionNumber!);
      // 참조 대상이 사라진 경우(있을 수 없지만)엔 건드리지 않고 남겨 둔다.
      if (next !== undefined && next !== q.sessionNumber) {
        await tx.webinarQA.update({ where: { id: q.id }, data: { sessionNumber: next } });
      }
    }
  });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.sessions_reordered",
    meta: { webinarId: id, order: ids },
  });

  const sessions = await prisma.webinarSession.findMany({
    where: { webinarId: webinar.id },
    orderBy: { number: "asc" },
  });
  return NextResponse.json({ sessions });
}
