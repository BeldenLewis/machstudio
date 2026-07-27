/**
 * 로그인한 사용자의 DB 행 보장.
 *
 * 왜 필요한가: 회원가입은 Supabase Auth 에만 계정을 만든다. 예전에는 DB `User` 행을
 * **워크스페이스 만들기(/api/onboarding)** 가 처음 만들었는데, 로그인 경로에는 온보딩으로
 * 보내는 관문이 없다(proxy 는 로그인한 사용자를 워크스페이스 확인 없이 /dashboard 로 보낸다).
 * 그래서 확인 메일을 안 누르고 로그인 화면에서 바로 들어온 사람은 DB 행 없이 앱을 쓰게 됐다.
 *
 * 그 상태가 만든 실제 고장:
 *   · 관리자 → 사용자 목록에 안 보인다(prisma.user.findMany 기준이라 렌더 루프에 안 들어온다).
 *   · **초대도 못 한다** — /api/workspace/[id]/members 가 DB User 를 못 찾아
 *     "해당 이메일로 가입된 계정이 없어요" 를 낸다. 가입했는데 안 했다고 하는 상태.
 * 실측(2026-07-27): Auth 계정 9 개 중 DB 행이 4 개뿐이었다.
 *
 * 그래서 **워크스페이스와 분리해** 로그인 시점에 행을 만든다. 워크스페이스가 없어도 계정은
 * 존재하는 게 맞다 — 초대 대상이 되려면 먼저 보여야 한다.
 */
import { prisma } from "@/lib/prisma";

/** Supabase auth 사용자에서 필요한 부분만 — 호출부가 전체 객체를 넘겨도 된다. */
interface AuthUserLike {
  id: string;
  email?: string | null;
  user_metadata?: { name?: unknown } | null;
}

export interface AppUserRow {
  isSuperAdmin: boolean;
}

/**
 * 없으면 만들고, 있으면 그대로 읽는다.
 *
 * 평상시 쿼리 수를 늘리지 않으려고 **조회 후 필요할 때만 생성**한다 — upsert 로 두면
 * 매 요청이 쓰기 문장이 된다. 이 함수는 앱 화면을 열 때마다 지나가는 경로에 있다.
 *
 * 실패해도 절대 던지지 않는다. 호출부(/api/workspace)는 앱 첫 화면의 필수 경로라서,
 * 여기서 예외가 나가면 사용자는 워크스페이스 목록 자체를 못 받는다 — 안 보이는 것보다
 * 못 쓰는 게 나쁘다. 그래서 실패는 로그로 남기고 조회 결과만 돌려준다.
 */
export async function ensureAppUser(authUser: AuthUserLike): Promise<AppUserRow | null> {
  try {
    const existing = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { isSuperAdmin: true },
    });
    if (existing) return existing;

    const email = authUser.email?.toLowerCase();
    // 이메일 없는 계정(전화 인증 등)은 만들지 않는다 — User.email 이 필수·유니크다.
    if (!email) return null;

    const rawName = authUser.user_metadata?.name;
    const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : email;

    return await prisma.user.create({
      data: { id: authUser.id, email, name },
      select: { isSuperAdmin: true },
    });
  } catch (err) {
    /* 같은 이메일이 **다른 id** 로 이미 있으면 email 유니크 제약에 걸린다(지운 Auth 계정의
       잔여 행 등). 그건 사람이 정리할 일이고 여기서 조용히 덮어쓰면 남의 계정을 가져간다.
       /api/onboarding 은 같은 상황을 409 로 알려 준다 — 여기서는 앱을 막지 않고 로그만 남긴다. */
    console.error("[app-user] ensureAppUser failed:", authUser.id, err instanceof Error ? err.message : err);
    return null;
  }
}
