import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redeemInvitationToken } from "@/lib/invitation-redeem";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { token } = body as { token?: string };
  if (!token) return NextResponse.json({ error: "token 필요" }, { status: 400 });

  const result = await redeemInvitationToken(user.id, user.email ?? "", token);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, workspaceId: result.workspaceId });
}
