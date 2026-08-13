"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { GripVertical, ListPlus, Plus, Trash2 } from "lucide-react";
import { FIELD_CLS, FINISH, R } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import type { CompetitionNoticeBlock } from "@/lib/competition-config";
import type { CompetitionDetail } from "./page";
import NoticePreview from "./NoticePreview";

interface Props {
  competition: CompetitionDetail;
  patch: (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
}

const BLOCK_KINDS: Array<{ kind: CompetitionNoticeBlock["kind"]; label: string; hint: string }> = [
  { kind: "richText", label: "본문", hint: "대회 소개 등 자유 문단" },
  { kind: "list", label: "목록", hint: "참가 자격·유의사항" },
  { kind: "steps", label: "절차", hint: "신청 방법 단계" },
  { kind: "infoTable", label: "개요표", hint: "일정·장소·시상" },
  { kind: "faq", label: "FAQ", hint: "자주 묻는 질문" },
  { kind: "image", label: "이미지", hint: "포스터 등" },
];

function emptyBlock(kind: CompetitionNoticeBlock["kind"]): CompetitionNoticeBlock {
  const id = `b-${Date.now().toString(36)}`;
  switch (kind) {
    case "richText": return { id, kind, enabled: true, title: "", body: "" };
    case "list": return { id, kind, enabled: true, title: "", items: [""] };
    case "steps": return { id, kind, enabled: true, title: "", steps: [{ title: "", description: "" }] };
    case "infoTable": return { id, kind, enabled: true, title: "", rows: [{ label: "", value: "" }] };
    case "faq": return { id, kind, enabled: true, title: "", items: [{ question: "", answer: "" }] };
    case "image": return { id, kind, enabled: true, title: "", url: "", caption: "" };
  }
}

export default function NoticePageTab({ competition, patch }: Props) {
  const [notice, setNotice] = useState(competition.config.notice);
  const [saving, setSaving] = useState(false);

  const update = (next: Partial<typeof notice>) => setNotice((prev) => ({ ...prev, ...next }));
  const updateBlock = (id: string, next: Partial<CompetitionNoticeBlock>) =>
    setNotice((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => (b.id === id ? ({ ...b, ...next } as CompetitionNoticeBlock) : b)),
    }));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= notice.blocks.length) return;
    const blocks = [...notice.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    update({ blocks });
  };

  const save = async () => {
    setSaving(true);
    try {
      await patch({ config: { ...competition.config, notice } }, "공고 페이지를 저장했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
          <h2 className="text-sm font-semibold">상단 영역</h2>
          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">제목</span>
              <input value={notice.heroTitle} onChange={(e) => update({ heroTitle: e.target.value })} className={FIELD_CLS} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">부제</span>
              <input value={notice.heroSubtitle} onChange={(e) => update({ heroSubtitle: e.target.value })} className={FIELD_CLS} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">대표 이미지 URL (선택)</span>
                <input
                  value={notice.heroImageUrl ?? ""}
                  onChange={(e) => update({ heroImageUrl: e.target.value || null })}
                  placeholder="https://..."
                  className={FIELD_CLS}
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">신청 버튼 문구</span>
                <input value={notice.applyLabel} onChange={(e) => update({ applyLabel: e.target.value })} className={FIELD_CLS} />
              </label>
            </div>
          </div>
        </section>

        <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">내용 블록</h2>
            <span className="text-[11px] text-muted-foreground">{notice.blocks.length}개</span>
          </div>

          <div className="mt-4 space-y-2">
            {notice.blocks.map((block, index) => (
              <div key={block.id} className={`bg-secondary/20 p-3 ${R.surface} ${FINISH.s2}`}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button onClick={() => move(index, -1)} disabled={index === 0} className="text-muted-foreground disabled:opacity-30" aria-label="위로">▴</button>
                    <button onClick={() => move(index, 1)} disabled={index === notice.blocks.length - 1} className="text-muted-foreground disabled:opacity-30" aria-label="아래로">▾</button>
                  </div>
                  <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                  <span className="rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-400">
                    {BLOCK_KINDS.find((k) => k.kind === block.kind)?.label ?? block.kind}
                  </span>
                  <input
                    value={block.title}
                    onChange={(e) => updateBlock(block.id, { title: e.target.value })}
                    placeholder="블록 제목"
                    className={`${FIELD_CLS} h-8 flex-1`}
                  />
                  <Switch checked={block.enabled} onChange={(v) => updateBlock(block.id, { enabled: v })} label="블록 표시" />
                  <button
                    onClick={() => update({ blocks: notice.blocks.filter((b) => b.id !== block.id) })}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500"
                    aria-label="블록 삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2 pl-8">
                  <BlockBody block={block} onChange={(next) => updateBlock(block.id, next)} />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {BLOCK_KINDS.map(({ kind, label, hint }) => (
              <button
                key={kind}
                onClick={() => update({ blocks: [...notice.blocks, emptyBlock(kind)] })}
                title={hint}
                className={`flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`}
              >
                <Plus className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </section>

        <div className="flex justify-end">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={save}
            disabled={saving}
            className={`bg-violet-500 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50 ${R.control}`}
          >
            {saving ? "저장 중..." : "저장"}
          </motion.button>
        </div>
      </div>

      <div className="xl:sticky xl:top-6 xl:self-start">
        <p className="mb-2 text-xs font-medium text-muted-foreground">미리보기</p>
        <NoticePreview
          notice={notice}
          theme={competition.theme}
          competitionName={competition.name}
        />
      </div>
    </div>
  );
}

function BlockBody({ block, onChange }: { block: CompetitionNoticeBlock; onChange: (next: Partial<CompetitionNoticeBlock>) => void }) {
  const rowBtn = `flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground ${R.control}`;

  if (block.kind === "richText") {
    return (
      <textarea
        value={block.body}
        onChange={(e) => onChange({ body: e.target.value } as Partial<CompetitionNoticeBlock>)}
        rows={4}
        placeholder="내용을 입력하세요. 줄바꿈은 그대로 표시돼요."
        className={`${FIELD_CLS} h-auto py-2`}
      />
    );
  }

  if (block.kind === "image") {
    return (
      <div className="grid gap-2 md:grid-cols-2">
        <input
          value={block.url}
          onChange={(e) => onChange({ url: e.target.value } as Partial<CompetitionNoticeBlock>)}
          placeholder="이미지 URL"
          className={`${FIELD_CLS} h-8`}
        />
        <input
          value={block.caption}
          onChange={(e) => onChange({ caption: e.target.value } as Partial<CompetitionNoticeBlock>)}
          placeholder="설명 (선택)"
          className={`${FIELD_CLS} h-8`}
        />
      </div>
    );
  }

  if (block.kind === "list") {
    return (
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={item}
              onChange={(e) => {
                const items = [...block.items];
                items[i] = e.target.value;
                onChange({ items } as Partial<CompetitionNoticeBlock>);
              }}
              className={`${FIELD_CLS} h-8`}
            />
            <button
              onClick={() => onChange({ items: block.items.filter((_, idx) => idx !== i) } as Partial<CompetitionNoticeBlock>)}
              className="rounded p-1 text-muted-foreground hover:text-red-500"
              aria-label="삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button onClick={() => onChange({ items: [...block.items, ""] } as Partial<CompetitionNoticeBlock>)} className={rowBtn}>
          <ListPlus className="h-3 w-3" /> 항목 추가
        </button>
      </div>
    );
  }

  if (block.kind === "steps") {
    return (
      <div className="space-y-1.5">
        {block.steps.map((step, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-center text-[11px] text-muted-foreground">{i + 1}</span>
            <input
              value={step.title}
              onChange={(e) => {
                const steps = [...block.steps];
                steps[i] = { ...steps[i], title: e.target.value };
                onChange({ steps } as Partial<CompetitionNoticeBlock>);
              }}
              placeholder="단계 제목"
              className={`${FIELD_CLS} h-8 w-40`}
            />
            <input
              value={step.description}
              onChange={(e) => {
                const steps = [...block.steps];
                steps[i] = { ...steps[i], description: e.target.value };
                onChange({ steps } as Partial<CompetitionNoticeBlock>);
              }}
              placeholder="설명"
              className={`${FIELD_CLS} h-8 flex-1`}
            />
            <button
              onClick={() => onChange({ steps: block.steps.filter((_, idx) => idx !== i) } as Partial<CompetitionNoticeBlock>)}
              className="rounded p-1 text-muted-foreground hover:text-red-500"
              aria-label="삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ steps: [...block.steps, { title: "", description: "" }] } as Partial<CompetitionNoticeBlock>)}
          className={rowBtn}
        >
          <ListPlus className="h-3 w-3" /> 단계 추가
        </button>
      </div>
    );
  }

  if (block.kind === "infoTable") {
    return (
      <div className="space-y-1.5">
        {block.rows.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={row.label}
              onChange={(e) => {
                const rows = [...block.rows];
                rows[i] = { ...rows[i], label: e.target.value };
                onChange({ rows } as Partial<CompetitionNoticeBlock>);
              }}
              placeholder="항목"
              className={`${FIELD_CLS} h-8 w-32`}
            />
            <input
              value={row.value}
              onChange={(e) => {
                const rows = [...block.rows];
                rows[i] = { ...rows[i], value: e.target.value };
                onChange({ rows } as Partial<CompetitionNoticeBlock>);
              }}
              placeholder="내용"
              className={`${FIELD_CLS} h-8 flex-1`}
            />
            <button
              onClick={() => onChange({ rows: block.rows.filter((_, idx) => idx !== i) } as Partial<CompetitionNoticeBlock>)}
              className="rounded p-1 text-muted-foreground hover:text-red-500"
              aria-label="삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange({ rows: [...block.rows, { label: "", value: "" }] } as Partial<CompetitionNoticeBlock>)}
          className={rowBtn}
        >
          <ListPlus className="h-3 w-3" /> 행 추가
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {block.items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={item.question}
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], question: e.target.value };
              onChange({ items } as Partial<CompetitionNoticeBlock>);
            }}
            placeholder="질문"
            className={`${FIELD_CLS} h-8 w-48`}
          />
          <input
            value={item.answer}
            onChange={(e) => {
              const items = [...block.items];
              items[i] = { ...items[i], answer: e.target.value };
              onChange({ items } as Partial<CompetitionNoticeBlock>);
            }}
            placeholder="답변"
            className={`${FIELD_CLS} h-8 flex-1`}
          />
          <button
            onClick={() => onChange({ items: block.items.filter((_, idx) => idx !== i) } as Partial<CompetitionNoticeBlock>)}
            className="rounded p-1 text-muted-foreground hover:text-red-500"
            aria-label="삭제"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange({ items: [...block.items, { question: "", answer: "" }] } as Partial<CompetitionNoticeBlock>)}
        className={rowBtn}
      >
        <ListPlus className="h-3 w-3" /> 문답 추가
      </button>
    </div>
  );
}
