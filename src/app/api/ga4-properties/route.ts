import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listGa4Properties } from "@/lib/ga4-admin";

/**
 * 로그인한 사용자면 누구나 조회 가능 — 서비스 계정 접근 권한은 GA4 계정 단위로 부여돼
 * 워크스페이스/프로젝트에 묶이지 않는다(속성 ID 자체는 값을 저장할 때만 프로젝트에 연결됨).
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const properties = await listGa4Properties();
  if (properties === null) {
    return NextResponse.json({ error: "GA4 속성 목록을 불러오지 못했어요" }, { status: 502 });
  }
  return NextResponse.json({ properties });
}
