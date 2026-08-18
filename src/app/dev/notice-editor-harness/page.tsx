"use client";

/**
 * 공고 **편집 탭** 하니스 — 개발 환경 전용(프로덕션 404).
 *
 * 편집 탭은 로그인 뒤 대회 상세 안에 있어서, 레이아웃(특히 모바일 폭)을 확인하려면 매번
 * 로그인·대회 생성이 필요하다. 컴포넌트만 격리해 태운다 — notice-harness 와 같은 방식.
 *
 * patch 는 저장하지 않는다. 여기서 실제 대회 설정이 바뀌면 안 된다.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import NoticePageTab from "@/app/(app)/competition/[slug]/NoticePageTab";
import type { CompetitionDetail } from "@/app/(app)/competition/[slug]/page";
import type { RoundDto } from "@/app/(app)/competition/[slug]/VoteSettingsTab";
import { normalizeCompetitionConfig } from "@/lib/competition-config";

const COMPETITION: CompetitionDetail = {
  id: "harness",
  name: "K-POP Dance Blast: Stage",
  slug: "harness",
  description: "Korea Expo LA 2026 시그니처 커버댄스 경연",
  phaseOverride: null,
  recruitOpenAt: "2026-09-01T00:00:00+09:00",
  recruitCloseAt: "2026-09-21T23:59:59+09:00",
  theme: { accentColor: "#ffc94d" },
  config: normalizeCompetitionConfig(
    {
      noticePage: {
        enabled: true,
        colors: { lightBg: "#f5f3f0", darkBg: "#0a0a0f" },
        hero: {
          brand: "K-EXPO LA 2026",
          titleLines: ["Own", "the Stage."],
          subtitle: "K-pop 커버댄스 크루를 찾습니다.",
          ctaLabel: "참가 신청하기",
          secondaryLabel: "전체 일정 보기",
          facts: [
            { label: "결선", value: "2026. 10. 24" },
            { label: "대상 상금", value: "$1,000" },
          ],
        },
        concept: { enabled: true, kicker: "The Concept", headline: "보는 K-POP이 아니라,", highlight: "하는 K-POP.", body: "관객석에서 무대 위로." },
        snapshot: { enabled: true, title: "한눈에 보기", items: [{ label: "형식", value: "커버댄스 경연", note: "" }] },
        timeline: { enabled: true, title: "모집 일정", items: [{ date: "9월 1일", title: "접수 시작", description: "", emphasis: true }] },
        apply: { enabled: true, title: "신청 방법", items: [{ title: "팀 정보", items: ["팀명", "로고"] }] },
        eligibility: { enabled: true, title: "참가 자격", items: ["만 14세 이상"] },
        selection: { enabled: true, title: "선발 방식", source: "auto", rounds: [], footnote: "" },
        criteria: { enabled: true, title: "심사 기준", source: "auto", items: [] },
        prizes: { enabled: true, title: "상금", items: [{ rank: "1st", title: "대상", description: "", amount: "$1,000" }] },
        countdown: { enabled: true, title: "접수 마감까지", ctaLabel: "" },
        faq: { enabled: false, title: "자주 묻는 질문", items: [] },
        sponsors: { enabled: false, title: "주최 · 후원", items: [] },
      },
    },
    { includeDisabled: true },
  ),
  maxEntriesPerApplicant: 1,
  previewToken: null,
  showToken: null,
  showConfig: null,
  resultPublishedAt: null,
};

const ROUNDS: RoundDto[] = [
  {
    id: "r1", kind: "prelim", name: "예선", voteEnabled: true, voteOpenAt: null, voteCloseAt: null,
    maxVotesPerVoter: 3, allowVoteUndo: false, voterIdentity: "device", ipVoteLimit: null,
    showLiveTally: false, entryOrder: "random", advanceCount: 8, publicWeight: 40, judgeWeight: 60,
    judgeCriteria: [],
  },
  {
    id: "r2", kind: "final", name: "본선", voteEnabled: false, voteOpenAt: null, voteCloseAt: null,
    maxVotesPerVoter: 1, allowVoteUndo: false, voterIdentity: "device", ipVoteLimit: null,
    showLiveTally: false, entryOrder: "manual", advanceCount: null, publicWeight: 50, judgeWeight: 50,
    judgeCriteria: [
      { key: "creativity", label: "창의성 · 독창성", maxScore: 20 },
      { key: "skill", label: "퍼포먼스 완성도", maxScore: 20 },
      { key: "energy", label: "무대 장악력", maxScore: 20 },
    ],
  },
];

export default function NoticeEditorHarness() {
  const [saved, setSaved] = useState<string>("아직 저장 안 함");
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="p-4">
      <div className="mb-3 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
        편집 탭 하니스 — 저장은 실제로 하지 않습니다. 마지막 저장 시도: {saved}
      </div>
      <NoticePageTab
        competition={COMPETITION}
        rounds={ROUNDS}
        patch={async (body) => {
          const np = (body.config as { noticePage?: { enabled?: boolean } } | undefined)?.noticePage;
          setSaved(`${new Date().toLocaleTimeString("ko-KR")} · 공개=${np?.enabled}`);
          return true;
        }}
      />
    </div>
  );
}
