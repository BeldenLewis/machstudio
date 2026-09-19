import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { normalizeScopes } from "@/lib/oauth";

type Params = Record<string, string | string[] | undefined>;

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const returnPath = `/oauth/authorize?${query}`;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/?next=${encodeURIComponent(returnPath)}`);

  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const redirectUri = typeof params.redirect_uri === "string" ? params.redirect_uri : "";
  const client = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!client || !client.redirectUris.includes(redirectUri) || params.response_type !== "code" || params.code_challenge_method !== "S256") {
    return <OAuthMessage title="연결 요청을 확인할 수 없습니다" body="AI 커넥터의 등록 정보 또는 보안 요청이 올바르지 않습니다. 커넥터를 삭제한 뒤 다시 추가해주세요." />;
  }
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: user.id, workspace: { deletedAt: null } }, include: { workspace: true }, orderBy: { joinedAt: "asc" } });
  const scopes = normalizeScopes(typeof params.scope === "string" ? params.scope : undefined);
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-950">
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="bg-[#12355b] px-8 py-7 text-white">
          <p className="text-xs font-semibold tracking-[0.18em] text-blue-200">MACHSTUDIO CONNECT</p>
          <h1 className="mt-3 text-2xl font-semibold">{client.clientName}에서 데이터를 조회하도록 허용</h1>
          <p className="mt-2 text-sm leading-6 text-blue-100">연결할 워크스페이스와 공개할 범위를 직접 확인하세요.</p>
        </div>
        <form action="/oauth/authorize/complete" method="post" className="space-y-7 p-8">
          {["client_id", "redirect_uri", "state", "code_challenge", "resource"].map((key) => <input key={key} type="hidden" name={key} value={typeof params[key] === "string" ? params[key] : ""} />)}
          <input type="hidden" name="scope" value={scopes.join(" ")} />
          <div>
            <label htmlFor="workspaceId" className="text-sm font-semibold">연결할 워크스페이스</label>
            <select id="workspaceId" name="workspaceId" required className="mt-2 w-full rounded-xl bg-slate-100 px-4 py-3 text-sm shadow-inner outline-none transition focus:ring-2 focus:ring-blue-500">
              {memberships.map(({ workspace }) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-sm font-semibold">허용되는 작업</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {scopes.includes("dashboards:read") && <li>✓ 사전등록·UTM·앰배서더 대시보드 조회</li>}
              {scopes.includes("ads:read") && <li>✓ 연결된 광고 성과 조회</li>}
              <li className="text-emerald-700">✓ 등록·수정·삭제 권한 없음</li>
            </ul>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-6">
            <button type="submit" name="decision" value="deny" className="rounded-xl px-4 py-2.5 text-sm text-slate-500 transition hover:bg-slate-100">취소</button>
            <button type="submit" name="decision" value="allow" className="rounded-xl bg-[#12355b] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-950/20 transition hover:-translate-y-0.5 hover:bg-[#174775] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">연결 허용</button>
          </div>
        </form>
      </section>
    </main>
  );
}

function OAuthMessage({ title, body }: { title: string; body: string }) {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md rounded-3xl bg-white p-8 shadow-xl"><h1 className="text-xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{body}</p></section></main>;
}
