/**
 * 등록 확인 **미리보기** — /p/{previewToken}/check (설계 §16.1 "등록 확인 화면도 같은 방식으로 미리 본다").
 *
 * 아임웹에 붙이기 전에 이 화면이 어떻게 보이는지 링크로 공유한다. 등록 폼 미리보기와
 * 같은 규칙: 로그인 없이 열리고, **조회를 실제로 보내지 않는다**(표본으로 화면만 그린다).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { CollectLookupRuntime } from "@/components/form-builder/CollectLookupRuntime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function LookupPreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // 등록 폼 미리보기와 같은 한도 — 인증 없이 DB 를 여는 경로다.
  const h = await headers();
  const ip = getClientIp(new Request("https://x", { headers: h }));
  const { allowed } = await rateLimitAsync(`collect-preview:${ip}`, { limit: 60, windowMs: 60_000 });
  if (!allowed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-secondary/30 p-6">
        <div className="max-w-xs rounded-2xl bg-background p-6 text-center shadow-sm">
          <p className="text-sm font-semibold">잠시 후 다시 열어 주세요</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            짧은 시간에 너무 많이 열었어요. 링크는 그대로 살아 있습니다.
          </p>
        </div>
      </div>
    );
  }

  const source = token
    ? await prisma.collectSource.findUnique({
        where: { previewToken: token },
        select: { id: true, name: true, mode: true, formConfig: true, deletedAt: true },
      })
    : null;
  if (!source || source.mode !== "builder" || source.deletedAt) notFound();

  const config = normalizeCollectForm(source.formConfig);

  return (
    <div className="min-h-dvh bg-secondary/30">
      <header className="border-b border-black/5 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-lg flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5">
          <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[10px] font-semibold text-violet-600">미리보기</span>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{source.name} · 등록 확인</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        <div className="rounded-2xl bg-background p-5 shadow-sm">
          <CollectLookupRuntime config={config} sourceId={source.id} />
        </div>
        <p className="mt-3 px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
          {config.lookup.enabled
            ? "실제 등록 확인 화면과 같습니다. 여기서 찾기를 눌러도 조회하지 않아요."
            : "등록 확인이 꺼져 있어요 — 폼 편집의 '등록 확인' 에서 켜면 여기에 나타납니다."}
        </p>
      </main>
    </div>
  );
}
