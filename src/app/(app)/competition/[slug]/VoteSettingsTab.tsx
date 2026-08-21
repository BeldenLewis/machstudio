"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { PreviewFrame } from "@/components/ui/PreviewFrame";
import { Switch } from "@/components/ui/switch";
import { ColorField } from "@/components/ui/ColorField";
import { kstDateTimeLocalInput, kstDateTimeLocalToIso } from "@/lib/datetime";
import type { CompetitionDetail } from "./page";
import type { CompetitionConfig } from "@/lib/competition-config";

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
  judgeCriteria: unknown;
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
  patch,
}: {
  competition: CompetitionDetail;
  rounds: RoundDto[];
  onRoundsChange: (rounds: RoundDto[]) => void;
  patch: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      {/* min-w-0 — 그리드 항목은 기본이 min-width:auto 라 안쪽이 칸보다 넓으면 삐져나간다. */}
      <div className="min-w-0 space-y-4">
        <VoteIntroEditor competition={competition} patch={patch} />
        {rounds.map((round) => (
          <RoundCard
            key={round.id}
            round={round}
            saving={saving === round.id}
            onPatch={(body, message) => patchRound(round, body, message)}
          />
        ))}
      </div>

      <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <VotePreviewPane competition={competition} rounds={rounds} />
      </div>
    </div>
  );
}

type VoteIntro = CompetitionConfig["voteIntro"];

/**
 * 투표 화면 상단 소개 — 참가작 카드보다 먼저 보이는, 대회 전체가 공유하는 한 블록(예선·본선
 * 화면 둘 다 같은 값을 쓴다). 레퍼런스 사이트(fr.france.k-expo.org/vote)에 있던 행사 소개·설명
 * 자리를 하드코딩이 아니라 운영자가 직접 쓰는 구조로 들인다 — 톤은 대회마다 다르니까.
 */
function VoteIntroEditor({
  competition,
  patch,
}: {
  competition: CompetitionDetail;
  patch: (body: Record<string, unknown>, message?: string) => Promise<boolean>;
}) {
  const intro = competition.config.voteIntro;
  const [title, setTitle] = useState(intro.title);
  const [body, setBody] = useState(intro.body);
  const [titleFontSize, setTitleFontSize] = useState(intro.titleFontSize);
  const [bodyFontSize, setBodyFontSize] = useState(intro.bodyFontSize);

  const save = (next: Partial<VoteIntro>, message?: string) => {
    const merged: VoteIntro = { ...intro, title, body, titleFontSize, bodyFontSize, ...next };
    return patch({ config: { ...competition.config, voteIntro: merged } }, message);
  };

  return (
    <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">투표 화면 소개</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            참가작 목록 위에 뜨는 소개 문구예요 — 예선·본선 화면에 같이 나가요.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          노출
          <Switch checked={intro.enabled} onChange={(v) => void save({ enabled: v }, v ? "소개를 켰어요" : "소개를 껐어요")} label="투표 소개 노출" />
        </label>
      </div>

      <div className="mt-4 space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">제목</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void save({}, "제목을 저장했어요")}
            placeholder="예: K-POP 무대에 투표해주세요!"
            className={FIELD_CLS}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">설명</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => void save({}, "설명을 저장했어요")}
            placeholder="줄바꿈이 그대로 보여요 — 대회 소개, 투표 방법 등을 자유롭게 적으세요"
            rows={4}
            className={`${FIELD_CLS} h-auto resize-y py-2`}
          />
        </label>

        <ColorField
          label="글자색"
          note="비우면 대회 테마 글자색을 그대로 써요"
          value={intro.textColor}
          onChange={(next) => void save({ textColor: next })}
          allowInherit
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">제목 크기 (px)</span>
            <input
              type="number"
              min={14}
              max={48}
              value={titleFontSize}
              onChange={(e) => setTitleFontSize(Math.min(48, Math.max(14, Number(e.target.value) || 14)))}
              onBlur={() => void save({}, "제목 크기를 저장했어요")}
              className={FIELD_CLS}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">설명 크기 (px)</span>
            <input
              type="number"
              min={11}
              max={28}
              value={bodyFontSize}
              onChange={(e) => setBodyFontSize(Math.min(28, Math.max(11, Number(e.target.value) || 11)))}
              onBlur={() => void save({}, "설명 크기를 저장했어요")}
              className={FIELD_CLS}
            />
          </label>
        </div>
      </div>
    </section>
  );
}

/**
 * 우측 고정 미리보기 — 라운드와 투표 창 상태를 여기서 고른다.
 *
 * 라운드 카드마다 미리보기를 하나씩 두면 화면이 길어져 정작 **설정과 결과를 나란히 볼 수
 * 없다**(스크롤해야 만난다). 공고 탭과 같은 배치로, 왼쪽에서 고치고 오른쪽에서 바로 본다.
 */
function VotePreviewPane({ competition, rounds }: { competition: CompetitionDetail; rounds: RoundDto[] }) {
  const [kind, setKind] = useState<"prelim" | "final">("prelim");
  const [state, setState] = useState<"open" | "closed">("open");
  const round = rounds.find((r) => r.kind === kind);

  if (!competition.previewToken) {
    return (
      <p className="text-xs text-muted-foreground">
        미리보기 링크가 아직 없어요. <b>배포</b> 탭에서 발급하면 여기서 투표 화면을 볼 수 있습니다.
      </p>
    );
  }

  const chip = (active: boolean) =>
    `px-2 py-0.5 text-[11px] transition-colors ${R.control} ${
      active ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
    }`;

  return (
    <PreviewFrame
      title="투표 화면"
      src={`/cp/${competition.previewToken}?view=vote&round=${kind}&state=${state}`}
      note={
        state === "open"
          ? "실제로 안 열렸어도 열린 화면으로 보여요 · 눌러도 표는 안 들어가요"
          : "지금 설정대로면 방문자에게 보이는 화면"
      }
      reloadKey={
        (round ? `${round.voteEnabled}-${round.maxVotesPerVoter}-${round.entryOrder}-${round.showLiveTally}-${round.allowVoteUndo}-${round.name}` : kind) +
        `-${JSON.stringify(competition.config.voteIntro)}`
      }
      controls={
        <div className="flex flex-wrap items-center gap-1">
          {rounds.map((r) => (
            <button key={r.id} onClick={() => setKind(r.kind)} className={chip(kind === r.kind)}>
              {r.name}
            </button>
          ))}
          <span className="mx-0.5 text-muted-foreground">·</span>
          {([["open", "열린 화면"], ["closed", "지금 상태"]] as const).map(([value, label]) => (
            <button key={value} onClick={() => setState(value)} className={chip(state === value)}>
              {label}
            </button>
          ))}
        </div>
      }
    />
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
  const [name, setName] = useState(round.name);
  const [maxVotes, setMaxVotes] = useState(round.maxVotesPerVoter);
  const [ipLimit, setIpLimit] = useState(round.ipVoteLimit ?? 0);

  const identity = IDENTITY_META[round.voterIdentity] ?? IDENTITY_META.device;

  return (
    <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/*
            라운드 이름은 **공고에 그대로 나간다**(선발 방식 섹션). 대회를 만들 때 "예선"/"본선"
            로 만들어 두는데 여기서 고칠 칸이 없어서, 영문 대회에서도 그 두 글자만 한글로
            남았다. 아래 회색 알약은 이름이 아니라 **종류**(예선/본선 규칙)라 그대로 둔다 —
            이름을 Preliminary 로 바꿔도 동점 규칙은 예선 규칙을 쓴다는 걸 보여야 한다.
          */}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const next = name.trim();
              if (!next || next === round.name) { setName(round.name); return; }
              onPatch({ name: next }, "라운드 이름을 바꿨어요");
            }}
            aria-label="라운드 이름"
            placeholder="라운드 이름"
            title="공고의 선발 방식 섹션에 이 이름이 그대로 나가요"
            /* 인라인 편집이지만 **고칠 수 있다는 게 보여야** 한다 — 제목처럼 생긴 칸은
               아무도 클릭하지 않는다. 평소엔 조용하고 hover·focus 에서 칸이 드러난다. */
            className="w-44 rounded bg-transparent px-1.5 py-0.5 text-sm font-semibold outline-none transition-colors hover:bg-secondary focus:bg-secondary"
          />
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
            {round.kind === "prelim" ? "예선" : "본선"} 규칙
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
