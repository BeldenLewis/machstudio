import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { normalizeQaMode } from "@/lib/webinar-config";
import { maskName } from "@/lib/mask";

const CORS = { "Access-Control-Allow-Origin": "*" };

// 통합 라이브 상태 — 시청자가 폴링하던 여러 엔드포인트(공지·Q&A·채팅·투표·팝업·Tally·상태)를
// 한 번의 요청으로 합쳐 egress/요청 수를 대폭 줄인다.
// 쿼리: registrationId(있으면 Q&A 보드+채팅 게이팅), chat=1(채팅 탭 활성 시), chatAfter=<ISO>(증분)
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const registrationId = url.searchParams.get("registrationId");
  const wantChat = url.searchParams.get("chat") === "1";
  const wantQa = url.searchParams.get("qa") === "1"; // Q&A 탭 활성 시에만 100행 보드 전송(egress 절감)
  const chatAfterRaw = url.searchParams.get("chatAfter");

  const webinar = await prisma.webinar.findUnique({
    where: { slug },
    select: {
      id: true, statusOverride: true, liveStartAt: true, liveEndAt: true, signupDeadline: true, components: true, config: true,
    },
  });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404, headers: CORS });

  const statusInfo = resolveWebinarStatus(webinar);
  const components = (webinar.components ?? {}) as Record<string, unknown>;
  const chatEnabled = components.chatEnabled === true;
  // 폐쇄형(주최자만 열람)이면 보드를 **조회조차 하지 않는다** — 뷰어에서 숨기는 건 게이팅이 아니다.
  // (응답에 실리면 개발자도구에서 그대로 읽힌다). 겸사겸사 100행 전송도 사라져 egress 도 줄어든다.
  const qaMode = normalizeQaMode(components);
  const wid = webinar.id;

  // 동시 병렬 조회 — 필요할 때만 (Q&A/채팅은 게이팅)
  const [announcements, qaRows, pollRow, popupRow, tallyRow, surveyRow, chatRows, pushedRow, pinnedRow] = await Promise.all([
    prisma.webinarAnnouncement.findMany({
      where: { webinarId: wid, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, message: true, createdAt: true },
    }),
    registrationId && wantQa && qaMode === "open"
      ? prisma.webinarQA.findMany({
          where: { webinarId: wid, status: { not: "dismissed" } },
          orderBy: [{ voteCount: "desc" }, { createdAt: "asc" }],
          take: 100,
          select: { id: true, question: true, sessionNumber: true, status: true, createdAt: true, name: true, voteCount: true },
        })
      : Promise.resolve(null),
    prisma.webinarPoll.findFirst({
      where: { webinarId: wid, isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true, question: true, updatedAt: true, options: { orderBy: { order: "asc" }, select: { id: true, label: true, voteCount: true } } },
    }),
    prisma.webinarPopup.findFirst({
      where: { webinarId: wid, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, type: true, title: true, message: true, buttonLabel: true, buttonUrl: true,
        secondaryLabel: true, secondaryUrl: true, integrationType: true, embedCode: true,
        tallyFormId: true, tallyEmojiText: true, tallyEmojiAnimation: true, tallyLayout: true,
        tallyWidth: true, tallyAutoClose: true, dismissible: true, updatedAt: true,
      },
    }),
    prisma.webinarTallyPush.findFirst({
      where: { webinarId: wid, isActive: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, formId: true, emojiText: true, emojiAnimation: true,
        layout: true, width: true, autoClose: true, showOnce: true, doNotShowAfterSubmit: true, updatedAt: true,
      },
    }),
    // 자체 설문 푸시 — 발행 중(isActive)이고 응답 수집 중(isOpen)인 것만.
    // questions 는 폴 페이로드에 싣지 않는다(매 폴 중복 전송 방지) — 모달이 공개 GET 으로 1회 로드.
    prisma.webinarSurvey.findFirst({
      where: { webinarId: wid, isActive: true, isOpen: true, OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }] },
      select: { id: true, title: true, pushedAt: true },
    }),
    wantChat && chatEnabled && registrationId
      ? (() => {
          const afterMs = chatAfterRaw ? Date.parse(chatAfterRaw) : NaN;
          const after = Number.isNaN(afterMs) ? null : new Date(afterMs);
          return after
            ? prisma.webinarChatMessage.findMany({
                where: { webinarId: wid, createdAt: { gte: after } },
                orderBy: { createdAt: "asc" }, take: 50,
                select: { id: true, name: true, message: true, isHost: true, createdAt: true },
              })
            : prisma.webinarChatMessage.findMany({
                where: { webinarId: wid },
                orderBy: { createdAt: "desc" }, take: 50,
                select: { id: true, name: true, message: true, isHost: true, createdAt: true },
              }).then((r) => r.reverse());
        })()
      : Promise.resolve(null),
    // Q&A '화면에 띄우기' — 현재 송출 중인 질문(웨비나당 1개). Q&A 보드처럼 registrationId 게이팅 + dismissed 제외.
    registrationId
      ? prisma.webinarQA.findFirst({
          where: { webinarId: wid, onScreen: true, status: { not: "dismissed" } },
          select: { id: true, question: true, name: true },
        })
      : Promise.resolve(null),
    // 고정 채팅 메시지 — chatEnabled + registrationId 일 때만(채팅 콘텐츠).
    chatEnabled && registrationId
      ? prisma.webinarChatMessage.findFirst({
          where: { webinarId: wid, isPinned: true },
          select: { id: true, name: true, message: true, isHost: true, createdAt: true },
        })
      : Promise.resolve(null),
  ]);

  const answeredQA = qaRows
    ? qaRows.map((q) => ({ ...q, name: q.name ? maskName(q.name) : null }))
    : undefined;
  const chat = chatRows
    ? { messages: chatRows.map((m) => ({ id: m.id, name: m.isHost ? m.name : maskName(m.name), message: m.message, isHost: m.isHost, createdAt: m.createdAt })) }
    : undefined;
  const pushedQuestion = pushedRow
    ? { id: pushedRow.id, question: pushedRow.question, name: pushedRow.name ? maskName(pushedRow.name) : null }
    : null;
  const pinnedMessage = pinnedRow
    ? { id: pinnedRow.id, name: pinnedRow.isHost ? pinnedRow.name : maskName(pinnedRow.name), message: pinnedRow.message, isHost: pinnedRow.isHost, createdAt: pinnedRow.createdAt }
    : null;

  // 실시간 동시 시청자 수 — 라이브 중에만(사회적 증거 배지).
  // 주석은 "어드민과 동일 기준" 이었지만 실제로는 최근성 필터가 없어 isActive 가 한 번 서면
  // leave 가 올 때까지 영원히 카운트됐다. 퇴장 신호는 pagehide/beforeunload 뿐이라 모바일에서
  // 거의 오지 않아 수치가 한 방향(과대)으로 편향됐다 → 어드민 대시보드와 같은 최근성 창을 쓴다.
  const PRESENCE_WINDOW_MS = 5 * 60_000; // 어드민 대시보드의 presenceSince 와 같은 창(5분)
  const presenceSince = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const viewerCount = statusInfo.status === "live"
    ? await prisma.webinarRegistration.count({
        where: {
          webinarId: wid,
          isActive: true,
          OR: [{ presencePingAt: { gte: presenceSince } }, { lastPingAt: { gte: presenceSince } }],
        },
      })
    : null;

  // 영상 동기화 — 유효 등록자에게만 현재 설정을 전달한다.
  // 최초 입장 뒤 운영자가 주소를 교체하거나 비워도 다음 상태 폴에서 시청 화면이 같은 값으로 갱신된다.
  let youtubeId: string | null = null;
  if (registrationId) {
    const reg = await prisma.webinarRegistration.findFirst({ where: { id: registrationId, webinarId: wid }, select: { id: true } });
    if (reg) {
      const yt = (webinar.config as Record<string, unknown> | null)?.youtubeId;
      youtubeId = typeof yt === "string" ? yt : null;
    }
  }

  return NextResponse.json(
    {
      status: statusInfo.status,
      entryOpen: statusInfo.entryOpen,
      serverNow: new Date().toISOString(),
      chatEnabled,
      // 라이브 중 콘솔에서 모드를 바꿔도 이미 보고 있는 시청자가 다음 폴에서 따라오게(chatEnabled 와 동일 패턴)
      qaMode,
      youtubeId,
      viewerCount,
      announcements,
      answeredQA,
      chat,
      poll: pollRow ?? null,
      popup: popupRow ?? null,
      tally: tallyRow ?? null,
      survey: surveyRow ?? null,
      pushedQuestion,
      pinnedMessage,
    },
    // 동적 데이터 — 캐시 안 함 (registrationId/chatAfter 별로 응답이 다름)
    { headers: { ...CORS, "Cache-Control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: { ...CORS, "Access-Control-Allow-Methods": "GET" } });
}
