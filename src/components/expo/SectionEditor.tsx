"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Chip, FINISH, R, Segmented } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import { EditableList, ROW_KEY } from "@/components/ui/editable-list";
import { SlotField, type LinkTarget } from "@/components/expo/SlotField";
import { objectParticle, topicParticle } from "@/lib/korean";
import { newSection } from "@/lib/expo/config";
import { hasContent, slotHasContent } from "@/lib/expo/model";
import { EXPO_LIMITS, EXPO_SECTIONS, sectionDef } from "@/lib/expo/registry";
import type { ExpoSection, SlotDef } from "@/lib/expo/types";

/**
 * 구획 편집 — **한 카드 = 한 구획, 값은 그 자리에서 바로 고쳐진다.**
 *
 * ── 편집기가 서버 규칙을 미리 지킨다 ──────────────────────────────────
 * `normalizeExpoPage` 는 저장할 때 조용히 손을 본다: 키비주얼을 맨 위로 올리고, `multi:false`
 * 타입의 두 번째 것을 버리고, 필수 슬롯이 빈 목록 행을 버린다. 편집기가 그 규칙을 모르면
 * 화면과 저장된 것이 갈라지고, 사용자는 **새로고침해야 사라진 걸 안다.**
 *
 * 그래서 여기서 같은 규칙을 미리 적용하거나(고정 순서·중복 차단), 적용할 수 없는 것은
 * 그 자리에서 말해 준다(필수 값이 빈 행). 조용히 다르게 두지 않는다.
 */

/**
 * 디자인 노브의 한국어 라벨. **카탈로그(registry.ts)에 두지 않는다** — 그 파일은
 * `view-sections.ts` 를 거쳐 임베드 번들에 들어가므로, 편집기에서만 쓰는 말이 방문자
 * 브라우저로 내려가는 바이트가 된다. 값 자체(light·dark…)는 카탈로그가 계속 소유한다.
 */
const DESIGN_LABELS: Record<string, { label: string; values: Record<string, string> }> = {
  bg: { label: "배경", values: { light: "밝게", dark: "어둡게" } },
  align: { label: "정렬", values: { left: "왼쪽", center: "가운데" } },
};

const designLabel = (key: string) => DESIGN_LABELS[key]?.label ?? key;
const designValueLabel = (key: string, value: string) => DESIGN_LABELS[key]?.values[value] ?? value;

/** 키비주얼은 저장될 때 맨 위로 간다 — 화면에서도 그렇게 둔다. */
function applyPinned(sections: ExpoSection[]): ExpoSection[] {
  const pinned = sections.filter((s) => sectionDef(s.type)?.pinnedFirst);
  if (pinned.length === 0) return sections;
  return [...pinned, ...sections.filter((s) => !sectionDef(s.type)?.pinnedFirst)];
}

type Row = Record<string, unknown>;

/**
 * 목록 슬롯의 값을 행 배열로. **키 있는 객체만** 남긴다.
 *
 * 버리는 게 아니라 서버와 먼저 합의하는 것이다: 정규화의 `obj(row)` 가 객체 아닌 원소를
 * 빈 객체로 만들고 곧바로 버린다(`config.ts` case "list"). 화면에 남겨 봐야 저장되지 않는다.
 * 키는 불러올 때 `attachExpoRowKeys` 가, 새 행은 `makeRow` 가 붙이므로 정상 경로에서는
 * 하나도 걸러지지 않는다.
 */
function listRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Row =>
      row !== null && typeof row === "object" && !Array.isArray(row)
      && typeof (row as Row)[ROW_KEY] === "string",
  );
}

/** 새 행 — 키만 있다. `keepEmptyRows` 인 목록이라 비어 있어도 편집기가 남긴다. */
const makeRow = (): Row => ({ [ROW_KEY]: crypto.randomUUID() });

export interface SectionsEditorProps {
  sections: ExpoSection[];
  onChange: (next: ExpoSection[]) => void;
  canEdit: boolean;
  siteId: string;
  sources?: readonly { id: string; name: string; isActive: boolean }[];
  /** 내부 링크 후보 — 지금 편집 중인 페이지를 포함한 이 사이트의 모든 페이지. */
  pages?: readonly LinkTarget[];
  /** 사이트의 defaultLocale — 글이 어느 로케일에 들어가는가. */
  locale: string;
}

export function SectionsEditor({
  sections, onChange, canEdit, siteId, sources, pages, locale,
}: SectionsEditorProps) {
  /**
   * 삭제 유예(5초) 중인 구획. 이걸 알아야 **하나만 놓을 수 있는 타입을 지운 직후에 다시
   * 추가할 수 있다** — 모르면 화면에서 사라진 구획 때문에 5초 동안 "이미 있어요" 가 뜬다.
   */
  const [pendingRemove, setPendingRemove] = useState<ReadonlySet<string>>(new Set());

  const commit = useCallback(
    (next: ExpoSection[]) => onChange(applyPinned(next)),
    [onChange],
  );

  /** 지금 페이지에 살아 있는(유예 중이 아닌) 타입들. */
  const usedTypes = useMemo(() => {
    const set = new Set<string>();
    for (const section of sections) {
      if (!pendingRemove.has(section.sid)) set.add(section.type);
    }
    return set;
  }, [sections, pendingRemove]);

  return (
    <section aria-labelledby="expo-sections-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="expo-sections-heading" className="text-sm font-semibold">구획</h2>
        <span className="text-[11px] text-muted-foreground">
          {sections.length}/{EXPO_LIMITS.sectionsPerPage}
        </span>
      </div>

      <div className="mt-2">
        <EditableList<ExpoSection>
          listId="expo-section"
          itemNoun="구획"
          items={sections}
          onChange={commit}
          rowKey={(section) => section.sid}
          reorderable
          rowChrome="bare"
          maxRows={EXPO_LIMITS.sectionsPerPage}
          autoFocusNewRow
          onPendingRemoveChange={setPendingRemove}
          emptyState={
            <p className={`${R.surface} bg-secondary/40 p-4 text-center text-[12px] text-muted-foreground`}>
              아직 구획이 없어요. 아래에서 하나 골라 시작하세요.
            </p>
          }
          renderRow={(ctx) => (
            <SectionCard
              section={ctx.item}
              controls={ctx}
              canEdit={canEdit}
              siteId={siteId}
              sources={sources}
              pages={pages}
              locale={locale}
            />
          )}
          renderAdd={({ add, atMax }) =>
            !canEdit ? null : atMax ? (
              <p className="text-[11px] text-muted-foreground">
                한 페이지에 구획은 {EXPO_LIMITS.sectionsPerPage}개까지예요.
              </p>
            ) : (
              <SectionCatalog usedTypes={usedTypes} onAdd={(type) => add(newSection(type))} />
            )
          }
        />
      </div>
    </section>
  );
}

/**
 * 구획 카탈로그 — **팝오버가 아니라 그 자리에 펼친 버튼들.**
 * 6종뿐이라 접을 이유가 없고, 접으면 "무엇을 만들 수 있는가" 가 한 번 더 클릭 뒤로 간다.
 */
function SectionCatalog({
  usedTypes, onAdd,
}: { usedTypes: ReadonlySet<string>; onAdd: (type: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] text-muted-foreground">구획 추가</p>
      <div className="flex flex-wrap gap-1.5">
        {EXPO_SECTIONS.map((def) => {
          const taken = !def.multi && usedTypes.has(def.type);
          return (
            <button
              key={def.type}
              type="button"
              disabled={taken}
              onClick={() => onAdd(def.type)}
              /* 왜 못 누르는지 말한다 — 회색 버튼만 두면 고장으로 읽힌다. */
              title={taken ? `${topicParticle(def.label)} 한 페이지에 하나만 놓을 수 있어요` : undefined}
              className={`inline-flex min-h-9 items-center gap-1.5 border border-dashed px-3 py-2 text-xs font-medium transition-colors ${R.control} ${
                taken
                  ? "cursor-not-allowed border-border text-muted-foreground/50"
                  : "border-border text-muted-foreground hover:border-violet-400 hover:text-violet-500"
              }`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {def.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface SectionCardProps {
  section: ExpoSection;
  controls: {
    handle: ReactNode;
    removeButton: (opts?: { label?: string; onClick?: () => void }) => ReactNode;
    patch: (next: Partial<ExpoSection>) => void;
  };
  canEdit: boolean;
  siteId: string;
  sources?: readonly { id: string; name: string; isActive: boolean }[];
  pages?: readonly LinkTarget[];
  locale: string;
}

function SectionCard({
  section, controls, canEdit, siteId, sources, pages, locale,
}: SectionCardProps) {
  const def = sectionDef(section.type);

  /**
   * 카탈로그에 없는 타입 — 옛 초안에 남아 있을 수 있다. 편집 위젯을 지어낼 수 없으니
   * 있다는 사실과 지우는 길만 준다(저장 시 정규화가 어차피 버린다는 것도 말한다).
   */
  if (!def) {
    return (
      <div className={`${R.surface} ${FINISH.s2Danger} flex items-center gap-2 bg-secondary p-2.5 text-xs`}>
        <span className="min-w-0 flex-1">
          <span className="font-medium">더 이상 쓰지 않는 구획</span>
          <span className="mt-0.5 block text-muted-foreground">
            «{section.type}» — 저장할 때 사라져요.
          </span>
        </span>
        {controls.removeButton({ label: "쓰지 않는 구획 삭제" })}
      </div>
    );
  }

  const { patch } = controls;
  const filled = hasContent(section);
  const design = def.design ?? {};
  const designKeys = Object.keys(design);

  const setSlot = (key: string, value: unknown) =>
    patch({ content: { ...section.content, [key]: value } });

  return (
    <div className={`${R.surface} ${FINISH.s2} space-y-2.5 bg-secondary p-2.5`}>
      {/* ── 머리 ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5">
        {controls.handle}
        <span className="text-xs font-semibold">{def.label}</span>
        {def.pinnedFirst ? <Chip>맨 위 고정</Chip> : null}
        {/* 상태는 색만으로 말하지 않는다 — 글자를 함께 준다. */}
        {!section.enabled ? <Chip tone="warn">숨김</Chip> : null}
        {section.enabled && !filled ? <Chip tone="warn">내용 없음</Chip> : null}
        {section.embedEnabled ? <Chip tone="ok">코드 내보냄</Chip> : null}
        <span className="flex-1" />
        {controls.removeButton({ label: `${def.label} 구획 삭제` })}
      </div>

      {/* ── 모양 ─────────────────────────────────────────────────── */}
      {def.variants.length > 1 || designKeys.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {def.variants.length > 1 ? (
            <Segmented
              label={`${def.label} 형태`}
              value={section.variant}
              onChange={(variant) => patch({ variant })}
              options={def.variants.map((v) => ({ value: v.id, label: v.label }))}
            />
          ) : null}
          {designKeys.map((key) => (
            <Segmented
              key={key}
              label={`${def.label} ${designLabel(key)}`}
              value={section.design[key] ?? design[key][0]}
              onChange={(value) => patch({ design: { ...section.design, [key]: value } })}
              options={design[key].map((value) => ({
                value,
                label: designValueLabel(key, value),
              }))}
            />
          ))}
        </div>
      ) : null}

      {/* ── 값 ───────────────────────────────────────────────────── */}
      <div className={`space-y-2.5 ${section.enabled ? "" : "opacity-60"}`}>
        {def.slots.map((slot) =>
          slot.kind === "list" ? (
            <ListSlot
              key={slot.key}
              slot={slot}
              value={section.content[slot.key]}
              onChange={(rows) => setSlot(slot.key, rows)}
              canEdit={canEdit}
              siteId={siteId}
              sources={sources}
              pages={pages}
              locale={locale}
              sid={section.sid}
            />
          ) : (
            <SlotField
              key={slot.key}
              def={slot}
              value={section.content[slot.key]}
              onChange={(value) => setSlot(slot.key, value)}
              disabled={!canEdit}
              siteId={siteId}
              sources={sources}
              pages={pages}
              locale={locale}
            />
          ),
        )}
      </div>

      {section.enabled && !filled ? (
        <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
          {def.slots.some((s) => s.required)
            ? "필수 값이 비어 있어요. 채우기 전까지 이 구획은 공개 화면에 나가지 않아요."
            : "아직 아무 값도 없어요. 채우기 전까지 이 구획은 공개 화면에 나가지 않아요."}
        </p>
      ) : null}

      {/* ── 스위치 ───────────────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 ${FINISH.s2} ${R.control} bg-background/40 px-2.5 py-2`}>
        <label className="flex items-center gap-1.5 text-[11px]">
          <Switch
            checked={section.enabled}
            onChange={(enabled) => patch({ enabled })}
            disabled={!canEdit}
            label={`${def.label} 페이지에 표시`}
          />
          페이지에 표시
        </label>
        <label className="flex items-center gap-1.5 text-[11px]">
          <Switch
            checked={section.embedEnabled}
            onChange={(embedEnabled) => patch({ embedEnabled })}
            disabled={!canEdit}
            label={`${def.label} 이 구획만 따로 내보내기`}
          />
          <span>
            이 구획만 따로 내보내기
            <span className="ml-1 text-muted-foreground">
              — 아임웹에 이 구획 하나만 붙일 때
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

/**
 * 목록 슬롯 — 한 행 = 한 항목, 열 = 속성(AGENTS.md §2 의 기본형).
 *
 * `listId` 에 구획의 sid 를 넣는 이유: 실행취소 토스트의 키가 목록마다 달라야 한다.
 * 같은 페이지에 카드 구획이 둘이면 두 목록의 1번 행이 같은 키를 갖게 되고, 한쪽을 지운 뒤
 * 다른 쪽을 지우면 토스트가 겹친다.
 *
 * ── 이 코드베이스에서 처음으로 EditableList 가 겹친다 ─────────────────
 * 구획 목록(재정렬 가능) 안에 행 목록(재정렬 가능)이 들어간다. dnd-kit 은 중첩 DndContext 를
 * 지원하고 드래그 핸들이 각자 자기 컨텍스트에만 등록되므로 구조상 겹칠 일이 없지만,
 * **드래그 자체는 jsdom 에서 확인할 수 없다** — 측정이 rAF·레이아웃에 달려 있어서다
 * (editable-list.tsx 가 순수 함수를 따로 빼 둔 이유도 같다). 실제 끌기는 브라우저에서 본다.
 */
function ListSlot({
  slot, value, onChange, canEdit, siteId, sources, pages, locale, sid,
}: {
  slot: SlotDef;
  value: unknown;
  onChange: (rows: Row[]) => void;
  canEdit: boolean;
  siteId: string;
  sources?: readonly { id: string; name: string; isActive: boolean }[];
  pages?: readonly LinkTarget[];
  locale: string;
  sid: string;
}) {
  const rows = listRows(value);
  const itemSlots = slot.itemSlots ?? [];

  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">
        {slot.label}
        {slot.required ? <span className="ml-1 text-[var(--destructive)]">필수</span> : null}
      </p>
      <div className="mt-1">
        <EditableList<Row>
          listId={`expo-${sid}-${slot.key}`}
          itemNoun={slot.label}
          items={rows}
          onChange={onChange}
          rowKey={(row) => row[ROW_KEY] as string}
          makeItem={makeRow}
          reorderable
          autoFocusNewRow
          maxRows={EXPO_LIMITS.rowsPerList}
          emptyState={
            canEdit ? null : (
              <p className="text-[11px] text-muted-foreground">아직 없어요.</p>
            )
          }
          /* addLabel 대신 renderAdd — 뷰어에게는 눌러도 실패할 버튼을 보여주지 않는다. */
          renderAdd={({ add, atMax }) =>
            !canEdit ? null : atMax ? (
              <p className="text-[11px] text-muted-foreground">
                {topicParticle(slot.label)} {EXPO_LIMITS.rowsPerList}개까지예요.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => add()}
                className={`inline-flex min-h-9 items-center gap-1.5 border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors ${R.control} hover:border-violet-400 hover:text-violet-500`}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {slot.label} 추가
              </button>
            )
          }
          renderRow={({ item, patch, visibleIndex }) => {
            /**
             * 필수 값이 빈 행은 **저장할 때 서버가 버린다**(`config.ts` 의 missingRequired).
             * 편집기는 타이핑 중인 행을 지우지 않으므로(keepEmptyRows) 화면에는 남는다 —
             * 그 차이를 그 자리에서 말해 주지 않으면 새로고침해야 사라진 걸 안다.
             */
            const missing = itemSlots.filter(
              (def_) => def_.required && !slotHasContent(def_, item[def_.key]),
            );
            return (
              <>
                <p className="text-[11px] font-medium text-muted-foreground">
                  {slot.label} {visibleIndex + 1}
                </p>
                {itemSlots.map((itemSlot) => (
                  <SlotField
                    key={itemSlot.key}
                    def={itemSlot}
                    value={item[itemSlot.key]}
                    onChange={(next) => patch({ [itemSlot.key]: next })}
                    disabled={!canEdit}
                    siteId={siteId}
                    sources={sources}
                    pages={pages}
                    locale={locale}
                    compact
                  />
                ))}
                {missing.length > 0 ? (
                  <p className="text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
                    {/* 조사는 계산한다 — 하드코딩하면 "링크을" 같은 말이 나온다. */}
                    {missing.slice(0, -1).map((m) => `${m.label} · `).join("")}
                    {objectParticle(missing[missing.length - 1].label)} 채워야 저장돼요.
                  </p>
                ) : null}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}
