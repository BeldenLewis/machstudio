/**
 * 티켓 페이지 — `/t/{registrationNo}` (설계 §9.2·§19).
 *
 * 완료 화면을 떠난 뒤에도 **저장해 둘 수 있는 주소**다. 이메일 연동 전에는 등록자가 QR 을
 * 다시 여는 두 경로 중 하나이고(다른 하나는 등록 확인), 상당수는 이 화면을 **캡처해서**
 * 온다 — 그래서 QR 은 시간 기반 회전 코드가 아니라 정적 이미지다(§9.2).
 *
 * ── 왜 번호만으로 열리는가 ─────────────────────────────────────────────
 * 등록번호가 곧 티켓이기 때문이다. 13자리 난수 + 체크digit 이라 추측할 수 없고, 여기서
 * 보여 주는 것은 **이름·유형·번호·QR 뿐**이다(§10.2 와 같은 최소 노출 규칙). 연락처나
 * 다른 문항 답변은 넣지 않는다.
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimitAsync } from "@/lib/ratelimit";
import { isValidRegistrationNo } from "@/lib/collect-registration-no";
import { normalizeCollectForm } from "@/lib/collect-form-config";
import { buildLookupView } from "@/lib/collect-lookup";

export const dynamic = "force-dynamic";

/** 티켓 주소가 검색 결과에 뜨면 남의 티켓이 공개되는 것과 같다. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** 티켓 조회 — **필요한 것만 읽는다.** 레코드 전체를 가져오면 나중에 화면으로 흘러든다. */
function loadTicket(regNo: string) {
  return prisma.collectRecord.findUnique({
    where: { registrationNo: regNo },
    select: { registrationNo: true, data: true, source: { select: { name: true, formConfig: true, deletedAt: true } } },
  });
}

export default async function TicketPage({ params }: { params: Promise<{ regNo: string }> }) {
  const { regNo } = await params;

  /**
   * 형식·체크digit 이 안 맞으면 **DB 를 보지 않는다.** 오타 한 글자로 남의 티켓이 열리는 일을
   * 막는 것이 체크digit 을 넣은 이유이고(§9.1), 동시에 무작위 조회가 매번 쿼리가 되는 것도 막는다.
   */
  if (!isValidRegistrationNo(regNo)) notFound();

  const h = await headers();
  const ip = getClientIp(new Request("https://x", { headers: h }));
  const { allowed } = await rateLimitAsync(`collect-ticket:${ip}`, { limit: 30, windowMs: 60_000 });
  if (!allowed) {
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-100 p-6">
        <div className="max-w-xs rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">잠시 후 다시 열어 주세요</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            짧은 시간에 너무 많이 열었어요. 티켓은 그대로 있습니다.
          </p>
        </div>
      </div>
    );
  }

  /**
   * DB 가 흔들려도 **"Application error" 흰 화면을 보여주지 않는다.**
   * 이 페이지는 현장 줄에서 여는 화면이다 — 알 수 없는 오류가 뜨면 그 사람은 줄을 벗어나
   * 스태프에게 가고, 그게 곧 대기시간이다. 다시 열어 보라고 말해 주는 편이 낫다.
   */
  let record: Awaited<ReturnType<typeof loadTicket>> = null;
  try {
    record = await loadTicket(regNo);
  } catch (e) {
    console.error("[ticket] 조회 실패", { regNo, error: e });
    return (
      <div className="grid min-h-dvh place-items-center bg-neutral-100 p-6" style={{ colorScheme: "light" }}>
        <div className="max-w-xs rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-neutral-900">잠시 후 다시 열어 주세요</p>
          <p className="mt-1 text-xs leading-relaxed text-neutral-500">
            티켓을 불러오지 못했어요. 등록은 그대로 있습니다.
          </p>
          <p className="mt-3 font-mono text-xs tracking-widest text-neutral-400">{regNo}</p>
        </div>
      </div>
    );
  }
  if (!record || record.source.deletedAt) notFound();

  const config = normalizeCollectForm(record.source.formConfig);
  const view = buildLookupView(config, record);
  if (!view) notFound();

  const dates = config.eventInfo.enabled ? config.eventInfo.eventDates : [];

  /**
   * **강제 라이트.** 이 화면은 테마를 따르지 않는다 — QR 카드가 다크 배경 위에 놓이면
   * 검은 모듈의 대비가 사라져 현장에서 안 읽힌다(§9.2). AGENTS.md "색 하드코딩 금지" 의
   * 의도적 예외이고, 여기 흰색은 디자인 토큰이 아니라 **스캔 가능성 요건**이다.
   */
  return (
    <div className="min-h-dvh bg-neutral-100 px-4 py-8" style={{ colorScheme: "light" }}>
      <main className="mx-auto max-w-sm">
        <div className="rounded-3xl bg-white p-6 text-center shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">
            {record.source.name}
          </p>
          {dates.length > 0 && (
            <p className="mt-1 text-xs text-neutral-500">{dates.join(" · ")}</p>
          )}

          {view.name && <p className="mt-4 text-lg font-bold text-neutral-900">{view.name}</p>}
          {view.visitorType && <p className="mt-0.5 text-xs text-neutral-500">{view.visitorType}</p>}

          {/* 흰 배경·검은 모듈·200px 이상 — 세 조건 모두 §9.2 의 스캔 요건이다. */}
          <div className="mx-auto mt-5 w-[220px] rounded-2xl bg-white p-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR 은 서버가 그린 PNG 를 그대로 쓴다(최적화 리사이즈가 모듈을 뭉갠다) */}
            <img
              src={`/api/collect/qr/${encodeURIComponent(view.registrationNo)}`}
              alt={`Registration QR ${view.registrationNo}`}
              width={200}
              height={200}
              className="block h-[200px] w-[200px]"
            />
          </div>

          <p className="mt-4 font-mono text-lg font-bold tracking-[0.14em] text-neutral-900">
            {view.registrationNo}
          </p>
          <p className="mt-1 text-[11px] text-neutral-500">현장에서 이 QR 을 보여 주세요</p>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-neutral-500">
          이 주소를 저장해 두시면 언제든 다시 열 수 있어요. 화면을 캡처해 두셔도 됩니다.
        </p>
      </main>
    </div>
  );
}
