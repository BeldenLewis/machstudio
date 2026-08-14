"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import type { CompetitionDetail } from "./page";

export interface RoundDto {
  id: string;
  kind: "prelim" | "final";
  name: string;
  voteEnabled: boolean;
  voteOpenAt: string | null;
  voteCloseAt: string | null;
  maxVotesPerVoter: number;
  allowVoteUndo: boolean;
  voterIdentity: string;
  ipVoteLimit: number | null;
  showLiveTally: boolean;
  entryOrder: string;
  advanceCount: number | null;
  publicWeight: number;
  judgeWeight: number;
}

const IDENTITY_META: Record<string, { label: string; hint: string; warn?: string }> = {
  device: {
    label: "기기 기준",
    hint: "브라우저에 저장한 식별자로 구분해요. 같은 와이파이를 써도 사람마다 따로 셉니다.",
  },
  ip: {
    label: "IP 기준",
    hint: "접속 IP로 구분해요.",
    warn: "전시장·회사 와이파이는 수백 명이 같은 IP예요. 현장에서 쓰면 첫 한 명만 투표되고 나머지가 전부 막힙니다.",
  },
  both: {
    label: "기기 + IP",
    hint: "기기로 구분하되 IP 상한도 함께 걸어요.",
    warn: "공유 와이파이에서 정상 투표가 막힐 수 있어요. IP 상한을 넉넉히 잡으세요.",
  },
  registration: {
    label: "사전등록 (준비 중)",
    hint: "사전등록 번호로 1인 1표를 정확히 셉니다.",
    warn: "사전등록 시스템 연동 후 사용할 수 있어요.",
  },
};

const ORDER_META: Record<string, string> = {
  random: "무작위 (사람마다 다르게, 새로고침해도 그 사람에겐 고정)",
  submitted: "신청 순서",
  manual: "직접 지정한 순서",
};

export default function VoteSettingsTab({
  competition,
  rounds,
  onRoundsChange,
}: {
  competition: CompetitionDetail;
  rounds: RoundDto[];
  onRoundsChange: (rounds: RoundDto[]) => void;
}) {
  const [saving, setSaving] = useState<string | null>(null);

  const patchRound = async (round: RoundDto, body: Record<string, unknown>, message?: string) => {
    setSaving(round.id);
    try {
      const res = await fetch(`/api/competitions/${competition.id}/rounds/${round.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "저장 실패"); return false; }
      onRoundsChange(rounds.map((r) => (r.id === round.id ? { ...r, ...data.round } : r)));
      if (message) toast.success(message);
      return true;
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      {rounds.map((round) => (
        <RoundCard
          key={round.id}
          round={round}
          saving={saving === round.id}
          onPatch={(body, message) => patchRound(round, body, message)}
        />
      ))}
    </div>
  );
}

function RoundCard({
  round,
  saving,
  onPatch,
}: {
  round: RoundDto;
  saving: boolean;
  onPatch: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
}) {
  const [openAt, setOpenAt] = useState(round.voteOpenAt ? kstDateTimeLocalInput(round.voteOpenAt) : "");
  const [closeAt, setCloseAt] = useState(round.voteCloseAt ? kstDateTimeLocalInput(round.voteCloseAt) : "");
  const [maxVotes, setMaxVotes] = useState(round.maxVotesPerVoter);
  const [ipLimit, setIpLimit] = useState(round.ipVoteLimit ?? 0);

  const identity = IDENTITY_META[round.voterIdentity] ?? IDENTITY_META.device;

  return (
    <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{round.name}</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            {round.kind === "prelim" ? "예선" : "본선"}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className={round.voteEnabled ? "font-medium text-violet-600 dark:text-violet-400" : "text-muted-foreground"}>
            {round.voteEnabled ? "투표 열림" : "투표 닫힘"}
          </span>
          <Switch
            checked={round.voteEnabled}
            onChange={(v) => onPatch({ voteEnabled: v }, v ? "투표를 열었어요" : "투표를 닫았어요")}
            label="투표 열기"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">투표 시작</span>
          <input
            type="datetime-local"
            value={openAt}
            onChange={(e) => setOpenAt(e.target.value)}
            onBlur={() => onPatch({ voteOpenAt: openAt ? kstDateTimeLocalToIso(openAt) : null })}
            className={FIELD_CLS}
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">투표 마감</span>
          <input
            type="datetime-local"
            value={closeAt}
            onChange={(e) => setCloseAt(e.target.value)}
            onBlur={() => onPatch({ voteCloseAt: closeAt ? kstDateTimeLocalToIso(closeAt) : null })}
            className={FIELD_CLS}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">1인당 투표 수</span>
          <input
            type="number"
            min={1}
            value={maxVotes}
            onChange={(e) => setMaxVotes(Math.max(1, Number(e.target.value) || 1))}
            onBlur={() => onPatch({ maxVotesPerVoter: maxVotes })}
            className={FIELD_CLS}
          />
        </label>

        <label className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">참가작 표시 순서</span>
          <select
            value={round.entryOrder}
            onChange={(e) => onPatch({ entryOrder: e.target.value }, "표시 순서를 바꿨어요")}
            className={FIELD_CLS}
          >
            {Object.entries(ORDER_META).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">투표자 식별</span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(IDENTITY_META).map(([value, meta]) => (
            <button
              key={value}
              onClick={() => onPatch({ voterIdentity: value }, "식별 방식을 바꿨어요")}
              disabled={value === "registration"}
              className={`px-3 py-1.5 text-xs transition-colors ${R.control} ${
                round.voterIdentity === value
                  ? "bg-violet-500 text-white"
                  : "bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
              }`}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">{identity.hint}</p>
        {identity.warn && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {identity.warn}
          </p>
        )}
      </div>

      {(round.voterIdentity === "device" || round.voterIdentity === "both") && (
        <label className="mt-4 block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">같은 IP 총 투표 상한 (0 = 제한 없음)</span>
          <input
            type="number"
            min={0}
            value={ipLimit}
            onChange={(e) => setIpLimit(Math.max(0, Number(e.target.value) || 0))}
            onBlur={() => onPatch({ ipVoteLimit: ipLimit > 0 ? ipLimit : null })}
            className={FIELD_CLS}
          />
          <span className="block text-[11px] text-muted-foreground">
            시크릿창 반복 같은 대량 조작을 막는 보조 장치예요. 공유 와이파이의 정상 투표를 막지 않을 만큼 넉넉히 잡으세요.
          </span>
        </label>
      )}

      <div className="mt-4 space-y-2.5">
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs">
            투표 취소 허용
            <span className="ml-1.5 text-[11px] text-muted-foreground">실수로 누른 표를 무를 수 있어요</span>
          </span>
          <Switch checked={round.allowVoteUndo} onChange={(v) => onPatch({ allowVoteUndo: v })} label="투표 취소 허용" />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs">
            진행 중 득표 공개
            <span className="ml-1.5 text-[11px] text-muted-foreground">순위가 보이면 표가 1위로 쏠려요(권장: 꺼짐)</span>
          </span>
          <Switch checked={round.showLiveTally} onChange={(v) => onPatch({ showLiveTally: v })} label="득표 공개" />
        </label>
      </div>

      {saving && <p className="mt-3 text-[11px] text-muted-foreground">저장 중...</p>}

      <motion.div layout className="mt-4 rounded-xl bg-secondary/40 p-3">
        <p className="text-[11px] text-muted-foreground">
          설치 코드는 <b>배포</b> 탭에서 복사하세요. 투표 화면은 노출을 켠 참가작만 보여줍니다
          {round.kind === "final" && " (본선은 진출 확정된 참가작만)"}.
        </p>
      </motion.div>
    </section>
  );
}
