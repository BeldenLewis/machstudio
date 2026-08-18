"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ImagePlus, Loader2, Moon, Sun, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { FIELD_CLS, FINISH, R, btnCls } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import {
  NOTICE_SECTIONS,
  normalizeNoticePageConfig,
  type NoticePageConfig,
  type NoticeSectionBg,
  type NoticeSectionKey,
} from "@/lib/notice/config";
import { resolveCompetitionStatus } from "@/lib/competition-status";
import type { NoticeCompetition } from "@/lib/notice/types";
import NoticePreviewPane from "./NoticePreviewPane";
import { AddRow, HeadFields, Row, SectionCard, moveItem } from "./NoticeSectionEditors";
import type { CompetitionDetail } from "./page";
import type { RoundDto } from "./VoteSettingsTab";

interface Props {
  competition: CompetitionDetail;
  rounds: RoundDto[];
  patch: (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
}

/** 심사 항목 JSON → 공고가 쓰는 모양. auto 소스가 이 값을 그린다. */
function criteriaOf(round: RoundDto | undefined) {
  const raw = (round as unknown as { judgeCriteria?: unknown })?.judgeCriteria;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const c = (item ?? {}) as Record<string, unknown>;
      return {
        name: typeof c.label === "string" ? c.label : "",
        description: typeof c.description === "string" ? c.description : "",
        points: typeof c.maxScore === "number" ? c.maxScore : 0,
      };
    })
    .filter((c) => c.name.trim());
}

export default function NoticePageTab({ competition, rounds, patch }: Props) {
  // 편집 중에는 빈 행도 남긴다 — 아직 안 쓴 행이 리마운트로 사라지면 안 된다.
  const [np, setNp] = useState<NoticePageConfig>(() =>
    normalizeNoticePageConfig(competition.config, { keepEmptyRows: true }),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patchNp: Partial<NoticePageConfig>) => {
    setNp((prev) => ({ ...prev, ...patchNp }));
    setDirty(true);
  };
  const section = <K extends NoticeSectionKey>(key: K, patchSection: Partial<NoticePageConfig[K]>) =>
    update({ [key]: { ...np[key], ...patchSection } } as Partial<NoticePageConfig>);
  const setBg = (key: keyof NoticePageConfig["sectionBg"], value: NoticeSectionBg) =>
    update({ sectionBg: { ...np.sectionBg, [key]: value } });

  /** 전체 라이트/다크 — 섹션 12개를 하나씩 누르게 하면 실제로 아무도 안 쓴다. */
  const setAllBg = (value: NoticeSectionBg) => {
    const next = { ...np.sectionBg };
    for (const key of Object.keys(next) as Array<keyof typeof next>) next[key] = value;
    update({ sectionBg: next });
  };

  const status = resolveCompetitionStatus(competition);

  /** 미리보기에 넘길 대회 정보. auto 소스(선발·심사)가 여기 라운드를 읽는다. */
  const previewCompetition: NoticeCompetition = useMemo(
    () => ({
      id: competition.id,
      name: competition.name,
      description: competition.description,
      theme: competition.theme,
      recruitOpenAt: competition.recruitOpenAt,
      recruitCloseAt: competition.recruitCloseAt,
      phase: status.phase,
      canApply: status.canApply,
      statusMessages: {
        upcoming: competition.config.statusMessages?.upcoming ?? "접수 시작 전이에요.",
        closed: competition.config.statusMessages?.closed ?? "접수가 마감되었어요.",
      },
      rounds: rounds.map((round) => ({
        kind: round.kind,
        name: round.name,
        publicWeight: round.publicWeight,
        judgeWeight: round.judgeWeight,
        criteria: criteriaOf(round),
      })),
    }),
    [competition, rounds, status.phase, status.canApply],
  );

  const previewConfig = useMemo(() => ({ ...competition.config, noticePage: np }), [competition.config, np]);

  const save = async () => {
    setSaving(true);
    try {
      const ok = await patch({ config: { ...competition.config, noticePage: np } }, "공고 페이지를 저장했어요");
      if (ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const uploadHero = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/competitions/${competition.id}/notice-media`, { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error ?? "업로드에 실패했어요"); return; }
      update({ hero: { ...np.hero, media: { type: data.type, url: data.url } } });
      toast.success("배경을 올렸어요");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      {/* min-w-0 — 그리드 항목은 기본이 min-width:auto 라 안쪽 내용이 칸보다 넓으면
          줄어들지 않고 그대로 삐져나간다(모바일에서 가로 스크롤이 생긴 원인). */}
      <div className="min-w-0 space-y-3">
        {/* ── 공개 · 색 ────────────────────────────────────────── */}
        <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">공고 페이지</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                끄면 외부 사이트에 붙여 둬도 &quot;아직 공개되지 않았어요&quot;만 보여요.
              </p>
            </div>
            <Switch checked={np.enabled} onChange={(v) => update({ enabled: v })} label="공고 공개" />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">라이트 모드 배경</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={np.colors.lightBg}
                  onChange={(e) => update({ colors: { ...np.colors, lightBg: e.target.value } })}
                  className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
                />
                <input
                  value={np.colors.lightBg}
                  onChange={(e) => update({ colors: { ...np.colors, lightBg: e.target.value } })}
                  className={`${FIELD_CLS} h-8 font-mono text-xs`}
                />
              </div>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">다크 모드 배경</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={np.colors.darkBg}
                  onChange={(e) => update({ colors: { ...np.colors, darkBg: e.target.value } })}
                  className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
                />
                <input
                  value={np.colors.darkBg}
                  onChange={(e) => update({ colors: { ...np.colors, darkBg: e.target.value } })}
                  className={`${FIELD_CLS} h-8 font-mono text-xs`}
                />
              </div>
            </label>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            글자·선·카드 색은 배경 밝기에서 자동으로 따라와요. 키컬러는 기본정보 탭에서 정합니다.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <span className="text-xs font-medium">전체 모드</span>
            <button onClick={() => setAllBg("light")} className={`flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-[11px] transition-colors hover:text-foreground ${R.control}`}>
              <Sun className="h-3 w-3" /> 전부 라이트
            </button>
            <button onClick={() => setAllBg("dark")} className={`flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-[11px] transition-colors hover:text-foreground ${R.control}`}>
              <Moon className="h-3 w-3" /> 전부 다크
            </button>
            <span className="text-[11px] text-muted-foreground">섹션마다 따로 고를 수도 있어요</span>
          </div>
        </section>

        {/* ── 히어로 ──────────────────────────────────────────── */}
        <section className={`bg-background p-5 ${R.panel} ${FINISH.s1}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">히어로</h2>
            <div className="flex gap-0.5">
              {(["light", "dark"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setBg("hero", value)}
                  className={`px-2 py-1 text-[10px] font-medium transition-colors ${R.control} ${
                    np.sectionBg.hero === value ? "bg-foreground text-background" : "bg-secondary text-muted-foreground"
                  }`}
                >
                  {value === "light" ? "라이트" : "다크"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/mp4,video/webm"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadHero(f); }}
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className={`flex items-center gap-1 bg-secondary px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 ${R.control}`}
              >
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                {np.hero.media ? "배경 바꾸기" : "배경 올리기"}
              </button>
              {np.hero.media && (
                <>
                  <span className="text-[11px] text-muted-foreground">
                    {np.hero.media.type === "video" ? "영상" : "이미지"} 적용됨
                  </span>
                  <button
                    onClick={() => update({ hero: { ...np.hero, media: null } })}
                    className="rounded p-1 text-muted-foreground transition-colors hover:text-red-500"
                    aria-label="배경 제거"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              배경을 넣으면 글자는 항상 밝게 나가요 — 사진 위 어두운 막 때문에 검은 글자는 안 읽혀요.
            </p>

            <input value={np.hero.brand} onChange={(e) => update({ hero: { ...np.hero, brand: e.target.value } })}
              placeholder="상단 작은 라벨 (비우면 대회 이름)" className={`${FIELD_CLS} h-8`} />

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">대형 제목 — 둘째 줄부터 키컬러</span>
              {np.hero.titleLines.map((line, index) => (
                <div key={index} className="flex items-center gap-1.5">
                  <input
                    value={line}
                    onChange={(e) => {
                      const titleLines = [...np.hero.titleLines];
                      titleLines[index] = e.target.value;
                      update({ hero: { ...np.hero, titleLines } });
                    }}
                    placeholder={index === 0 ? "첫 줄" : "둘째 줄"}
                    className={`${FIELD_CLS} h-8`}
                  />
                  <button
                    onClick={() => update({ hero: { ...np.hero, titleLines: np.hero.titleLines.filter((_, i) => i !== index) } })}
                    className="rounded p-1 text-muted-foreground hover:text-red-500"
                    aria-label="줄 삭제"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <AddRow label="줄 추가" onClick={() => update({ hero: { ...np.hero, titleLines: [...np.hero.titleLines, ""] } })} />
            </div>

            <textarea value={np.hero.subtitle} onChange={(e) => update({ hero: { ...np.hero, subtitle: e.target.value } })}
              rows={2} placeholder="부제 (비우면 대회 설명 첫 줄)" className={`${FIELD_CLS} h-auto py-2`} />

            <div className="grid gap-1.5 sm:grid-cols-2">
              <input value={np.hero.ctaLabel} onChange={(e) => update({ hero: { ...np.hero, ctaLabel: e.target.value } })}
                placeholder="신청 버튼 문구" className={`${FIELD_CLS} h-8`} />
              <input value={np.hero.secondaryLabel} onChange={(e) => update({ hero: { ...np.hero, secondaryLabel: e.target.value } })}
                placeholder="보조 버튼 문구 (비우면 안 보임)" className={`${FIELD_CLS} h-8`} />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">하단 팩트 — 결선일·장소·정원 같은 것</span>
              {np.hero.facts.map((fact, index) => (
                <Row key={index} index={index} count={np.hero.facts.length}
                  onMove={(from, to) => update({ hero: { ...np.hero, facts: moveItem(np.hero.facts, from, to) } })}
                  onRemove={(i) => update({ hero: { ...np.hero, facts: np.hero.facts.filter((_, x) => x !== i) } })}>
                  <div className="grid gap-1.5 sm:grid-cols-[120px_1fr]">
                    <input value={fact.label} placeholder="라벨" className={`${FIELD_CLS} h-8`}
                      onChange={(e) => { const facts = [...np.hero.facts]; facts[index] = { ...fact, label: e.target.value }; update({ hero: { ...np.hero, facts } }); }} />
                    <input value={fact.value} placeholder="값" className={`${FIELD_CLS} h-8`}
                      onChange={(e) => { const facts = [...np.hero.facts]; facts[index] = { ...fact, value: e.target.value }; update({ hero: { ...np.hero, facts } }); }} />
                  </div>
                </Row>
              ))}
              <AddRow label="팩트 추가" onClick={() => update({ hero: { ...np.hero, facts: [...np.hero.facts, { label: "", value: "" }] } })} />
            </div>
          </div>
        </section>

        {/* ── 섹션들 ──────────────────────────────────────────── */}
        {NOTICE_SECTIONS.map(({ key, label, note }) => (
          <SectionCard
            key={key}
            label={label}
            note={note}
            enabled={np[key].enabled}
            bg={np.sectionBg[key]}
            onToggle={(v) => section(key, { enabled: v } as never)}
            onBg={(v) => setBg(key, v)}
          >
            <SectionBody sectionKey={key} np={np} section={section} rounds={rounds} />
          </SectionCard>
        ))}

        <div className="flex items-center justify-end gap-3">
          {dirty && <span className="text-[11px] text-muted-foreground">저장하지 않은 변경이 있어요</span>}
          <motion.button whileTap={{ scale: 0.96 }} onClick={save} disabled={saving || !dirty}
            className={btnCls("key", "text-xs disabled:opacity-40")}>
            {saving ? "저장 중..." : dirty ? "저장" : "저장됨"}
          </motion.button>
        </div>
      </div>

      <div className="min-w-0 xl:sticky xl:top-6 xl:self-start">
        <NoticePreviewPane competition={previewCompetition} config={previewConfig} />
      </div>
    </div>
  );
}

/** 섹션별 본문 편집. 스위치 하나에 몰아 두면 카드 쪽이 읽기 어려워져 분리했다. */
function SectionBody({
  sectionKey,
  np,
  section,
  rounds,
}: {
  sectionKey: NoticeSectionKey;
  np: NoticePageConfig;
  section: <K extends NoticeSectionKey>(key: K, patch: Partial<NoticePageConfig[K]>) => void;
  rounds: RoundDto[];
}) {
  const head = (key: NoticeSectionKey, showDescription = true) => {
    const cfg = np[key] as { kicker: string; title: string; description?: string };
    return (
      <HeadFields
        kicker={cfg.kicker}
        title={cfg.title}
        description={cfg.description}
        showDescription={showDescription}
        onChange={(patch) => section(key, patch as never)}
      />
    );
  };

  if (sectionKey === "concept") {
    const c = np.concept;
    return (
      <>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <input value={c.kicker} onChange={(e) => section("concept", { kicker: e.target.value })}
            placeholder="작은 라벨" className={`${FIELD_CLS} h-8`} />
          <input value={c.highlight} onChange={(e) => section("concept", { highlight: e.target.value })}
            placeholder="강조구 (키컬러로 이어 붙음)" className={`${FIELD_CLS} h-8`} />
        </div>
        <input value={c.headline} onChange={(e) => section("concept", { headline: e.target.value })}
          placeholder="큰 카피" className={`${FIELD_CLS} h-8`} />
        <textarea value={c.body} onChange={(e) => section("concept", { body: e.target.value })}
          rows={4} placeholder="본문 — 빈 줄로 문단을 나눠요" className={`${FIELD_CLS} h-auto py-2`} />
      </>
    );
  }

  if (sectionKey === "snapshot") {
    const items = np.snapshot.items;
    return (
      <>
        {head("snapshot", false)}
        {items.map((item, index) => (
          <Row key={index} index={index} count={items.length}
            onMove={(from, to) => section("snapshot", { items: moveItem(items, from, to) })}
            onRemove={(i) => section("snapshot", { items: items.filter((_, x) => x !== i) })}>
            <div className="grid gap-1.5 sm:grid-cols-[130px_1fr]">
              <input value={item.label} placeholder="라벨" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, label: e.target.value }; section("snapshot", { items: next }); }} />
              <input value={item.value} placeholder="값" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, value: e.target.value }; section("snapshot", { items: next }); }} />
            </div>
            <input value={item.note} placeholder="부연 (선택)" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, note: e.target.value }; section("snapshot", { items: next }); }} />
          </Row>
        ))}
        <AddRow label="항목 추가" onClick={() => section("snapshot", { items: [...items, { label: "", value: "", note: "" }] })} />
      </>
    );
  }

  if (sectionKey === "timeline") {
    const items = np.timeline.items;
    return (
      <>
        {head("timeline")}
        {items.map((item, index) => (
          <Row key={index} index={index} count={items.length}
            onMove={(from, to) => section("timeline", { items: moveItem(items, from, to) })}
            onRemove={(i) => section("timeline", { items: items.filter((_, x) => x !== i) })}>
            <div className="grid gap-1.5 sm:grid-cols-[140px_1fr]">
              <input value={item.date} placeholder="날짜" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, date: e.target.value }; section("timeline", { items: next }); }} />
              <input value={item.title} placeholder="제목" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, title: e.target.value }; section("timeline", { items: next }); }} />
            </div>
            <input value={item.description} placeholder="설명 (선택)" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, description: e.target.value }; section("timeline", { items: next }); }} />
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={item.emphasis}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, emphasis: e.target.checked }; section("timeline", { items: next }); }} />
              강조 — 마감·결선처럼 먼저 보여야 하는 날
            </label>
          </Row>
        ))}
        <AddRow label="일정 추가" onClick={() => section("timeline", { items: [...items, { date: "", title: "", description: "", emphasis: false }] })} />
      </>
    );
  }

  if (sectionKey === "apply") {
    const items = np.apply.items;
    return (
      <>
        {head("apply")}
        {items.map((item, index) => (
          <Row key={index} index={index} count={items.length}
            onMove={(from, to) => section("apply", { items: moveItem(items, from, to) })}
            onRemove={(i) => section("apply", { items: items.filter((_, x) => x !== i) })}>
            <input value={item.title} placeholder="카드 제목" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, title: e.target.value }; section("apply", { items: next }); }} />
            <textarea value={item.items.join("\n")} rows={3} placeholder="준비물 — 한 줄에 하나"
              className={`${FIELD_CLS} h-auto py-2 text-xs`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, items: e.target.value.split("\n") }; section("apply", { items: next }); }} />
          </Row>
        ))}
        <AddRow label="카드 추가" onClick={() => section("apply", { items: [...items, { title: "", items: [""] }] })} />
      </>
    );
  }

  if (sectionKey === "eligibility") {
    return (
      <>
        {head("eligibility", false)}
        <textarea value={np.eligibility.items.join("\n")} rows={6} placeholder="자격 요건 — 한 줄에 하나"
          className={`${FIELD_CLS} h-auto py-2`}
          onChange={(e) => section("eligibility", { items: e.target.value.split("\n") })} />
      </>
    );
  }

  if (sectionKey === "selection") {
    const s = np.selection;
    return (
      <>
        {head("selection", false)}
        <SourceToggle
          source={s.source}
          onChange={(source) => section("selection", { source })}
          autoNote={`투표 설정의 대중:심사 비율을 그대로 그려요 (${rounds.map((r) => `${r.name} ${r.publicWeight}:${r.judgeWeight}`).join(" · ") || "라운드 없음"})`}
        />
        {s.source === "manual" && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            직접 입력은 투표 설정과 따로 놀아요 — 비율을 바꾸면 여기도 같이 고쳐야 합니다.
          </p>
        )}
        <input value={s.footnote} onChange={(e) => section("selection", { footnote: e.target.value })}
          placeholder="각주 (선택)" className={`${FIELD_CLS} h-8`} />
      </>
    );
  }

  if (sectionKey === "criteria") {
    const c = np.criteria;
    const finalRound = rounds.find((r) => r.kind === "final");
    return (
      <>
        {head("criteria")}
        <SourceToggle
          source={c.source}
          onChange={(source) => section("criteria", { source })}
          autoNote={`심사단 탭의 항목·배점을 그대로 그려요 (본선 우선${finalRound ? "" : " · 본선 항목 없으면 예선"})`}
        />
        {c.source === "manual" && (
          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            직접 입력은 심사단 탭과 따로 놀아요 — 배점을 바꾸면 여기도 같이 고쳐야 합니다.
          </p>
        )}
      </>
    );
  }

  if (sectionKey === "prizes") {
    const items = np.prizes.items;
    return (
      <>
        {head("prizes", false)}
        {items.map((item, index) => (
          <Row key={index} index={index} count={items.length}
            onMove={(from, to) => section("prizes", { items: moveItem(items, from, to) })}
            onRemove={(i) => section("prizes", { items: items.filter((_, x) => x !== i) })}>
            <div className="grid gap-1.5 sm:grid-cols-[110px_1fr_100px]">
              <input value={item.rank} placeholder="등수" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, rank: e.target.value }; section("prizes", { items: next }); }} />
              <input value={item.title} placeholder="상 이름" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, title: e.target.value }; section("prizes", { items: next }); }} />
              <input value={item.amount} placeholder="금액" className={`${FIELD_CLS} h-8`}
                onChange={(e) => { const next = [...items]; next[index] = { ...item, amount: e.target.value }; section("prizes", { items: next }); }} />
            </div>
            <input value={item.description} placeholder="설명 (선택)" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, description: e.target.value }; section("prizes", { items: next }); }} />
          </Row>
        ))}
        <AddRow label="상 추가" onClick={() => section("prizes", { items: [...items, { rank: "", title: "", description: "", amount: "" }] })} />
        <p className="text-[11px] text-muted-foreground">맨 위 카드가 자동으로 강조돼요.</p>
      </>
    );
  }

  if (sectionKey === "countdown") {
    const c = np.countdown;
    return (
      <>
        {head("countdown")}
        <input value={c.ctaLabel} onChange={(e) => section("countdown", { ctaLabel: e.target.value })}
          placeholder="버튼 문구 (비우면 히어로와 같게)" className={`${FIELD_CLS} h-8`} />
        <p className="text-[11px] text-muted-foreground">
          남은 시간은 <b>기본정보 탭의 접수 마감</b>에서 자동으로 계산돼요. 마감이 없거나 지났으면 섹션이 안 나옵니다.
        </p>
      </>
    );
  }

  if (sectionKey === "faq") {
    const items = np.faq.items;
    return (
      <>
        {head("faq", false)}
        {items.map((item, index) => (
          <Row key={index} index={index} count={items.length}
            onMove={(from, to) => section("faq", { items: moveItem(items, from, to) })}
            onRemove={(i) => section("faq", { items: items.filter((_, x) => x !== i) })}>
            <input value={item.question} placeholder="질문" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, question: e.target.value }; section("faq", { items: next }); }} />
            <textarea value={item.answer} rows={2} placeholder="답변" className={`${FIELD_CLS} h-auto py-2 text-xs`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, answer: e.target.value }; section("faq", { items: next }); }} />
          </Row>
        ))}
        <AddRow label="질문 추가" onClick={() => section("faq", { items: [...items, { question: "", answer: "" }] })} />
      </>
    );
  }

  const items = np.sponsors.items;
  return (
    <>
      {head("sponsors", false)}
      {items.map((item, index) => (
        <Row key={index} index={index} count={items.length}
          onMove={(from, to) => section("sponsors", { items: moveItem(items, from, to) })}
          onRemove={(i) => section("sponsors", { items: items.filter((_, x) => x !== i) })}>
          <div className="grid gap-1.5 sm:grid-cols-[100px_1fr]">
            <input value={item.tier} placeholder="구분" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, tier: e.target.value }; section("sponsors", { items: next }); }} />
            <input value={item.name} placeholder="이름" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, name: e.target.value }; section("sponsors", { items: next }); }} />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <input value={item.logoUrl} placeholder="로고 URL (선택)" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, logoUrl: e.target.value }; section("sponsors", { items: next }); }} />
            <input value={item.url} placeholder="홈페이지 (선택)" className={`${FIELD_CLS} h-8`}
              onChange={(e) => { const next = [...items]; next[index] = { ...item, url: e.target.value }; section("sponsors", { items: next }); }} />
          </div>
        </Row>
      ))}
      <AddRow label="후원사 추가" onClick={() => section("sponsors", { items: [...items, { tier: "", name: "", logoUrl: "", url: "" }] })} />
    </>
  );
}

/** auto / 직접 입력 전환 — 어디서 값이 오는지 화면에 적어 둔다. */
function SourceToggle({
  source,
  onChange,
  autoNote,
}: {
  source: "auto" | "manual";
  onChange: (value: "auto" | "manual") => void;
  autoNote: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {(["auto", "manual"] as const).map((value) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={`px-2.5 py-1 text-[11px] transition-colors ${R.control} ${
              source === value ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {value === "auto" ? "설정에서 가져오기" : "직접 입력"}
          </button>
        ))}
      </div>
      {source === "auto" && <p className="text-[11px] text-muted-foreground">{autoNote}</p>}
    </div>
  );
}
