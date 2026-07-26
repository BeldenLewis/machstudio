"use client";

/**
 * EditableList — 만들기 탭의 모든 "반복 항목 목록"이 공유하는 골격.
 *
 * 왜 만들었나: 같은 성격의 목록이 14곳 있는데 구현이 제각각이었다.
 *   · React key: 7곳이 index — **중간 행을 지우면 아래 행들의 입력값·IME 조합이 엉킨다**(실제 버그)
 *   · 삭제 UI: Trash2 상시 / "삭제" 텍스트 / hover 에서만 나타남(터치 기기에서 발견 불가) 3종
 *   · 추가 버튼 문구 9종, 드래그 3종(dnd-kit / framer Reorder / 없음), 키보드 재정렬은 0곳
 *   · 되돌리기: 세션에만 있고 나머지는 즉시 소실
 *
 * 책임 분담:
 *   골격 — 추가, 삭제(+5초 실행취소), 순서(드래그+방향키), 빈 상태, 레이아웃·마감
 *   호출자 — 행 내부 UI(renderRow)와 **안정 키(rowKey)**. 목록마다 생김새가 너무 달라
 *            행 내부까지 통일하면 탈출구만 늘어난다.
 *
 * rowKey 를 필수로 받는 이유: 위치 기반으로 키를 발급하는 방식은 배열이 외부에서 통째로
 * 갈릴 때(리마운트·정규화·자동저장 응답 반영) 값과 어긋난다. 스키마에 id 가 없는 목록은
 * **편집 state 를 만들 때 클라이언트 키를 붙이고 저장 시 떼는** 방식으로 해결한다
 * (withRowKeys / stripRowKeys 참고).
 *
 * 삭제 계약(중요): 클릭 즉시 화면에서만 숨기고 배열은 그대로 둔다. 유예(5초)가 끝날 때 비로소
 * onChange(제거된 배열) 를 호출한다. 그래서 실행취소하면 자동저장 왕복이 **0회**다.
 */

import { useMemo, useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

/** 클라이언트 전용 행 키 — 저장 payload 에는 들어가지 않는다. */
export const ROW_KEY = "__rowKey" as const;
export type WithRowKey<T> = T & { [ROW_KEY]: string };

/** 스키마에 id 가 없는 배열에 클라이언트 키를 붙인다(편집 state 를 만들 때 1회). */
export function withRowKeys<T>(items: readonly T[]): WithRowKey<T>[] {
  return items.map((item) => ({ ...item, [ROW_KEY]: crypto.randomUUID() }));
}

/** 저장 직전 클라이언트 키를 떼어낸다. */
export function stripRowKeys<T>(items: readonly WithRowKey<T>[]): T[] {
  return items.map((item) => {
    const copy = { ...item } as Record<string, unknown>;
    delete copy[ROW_KEY];
    return copy as T;
  });
}

export interface EditableRowCtx<T> {
  item: T;
  index: number;
  /** 이 행만 갱신 */
  patch: (next: Partial<T>) => void;
  /** 행 안쪽에 삭제 트리거를 두고 싶을 때(예: 카드 헤더의 "카드 삭제" 텍스트 버튼) */
  requestRemove: () => void;
}

export interface EditableListProps<T> {
  /** 실행취소 키 구분자. 중첩 시 부모와 달라야 한다(예: `faq`, `opt:${fieldId}`). */
  listId: string;
  /** 항목 이름 — 삭제 토스트·aria-label 문구를 자동 생성한다(예: "질문", "자료"). */
  itemNoun: string;
  items: T[];
  onChange: (next: T[]) => void;
  /** 안정 키. id 가 있으면 그것을, 없으면 withRowKeys 로 붙인 클라이언트 키를 준다. */
  rowKey: (item: T) => string;
  /** 새 행 생성 */
  makeItem: () => T;
  /** 추가 버튼 문구 — 목록마다 다른 유일한 문구다. */
  addLabel: string;
  renderRow: (ctx: EditableRowCtx<T>) => ReactNode;
  /** 순서가 의미 있으면 true — 드래그 핸들 + 방향키 재정렬이 함께 붙는다. */
  reorderable?: boolean;
  /** 이 항목은 지울 수 없다(자리는 유지해 레이아웃이 흔들리지 않게). */
  removable?: (item: T) => boolean;
  /** 0개일 때 보여줄 것. 목록마다 있고 없고가 갈렸어서 필수로 받는다. */
  emptyState: ReactNode;
  maxRows?: number;
}

function Row({
  id, reorderable, handleLabel, children, trailing,
}: { id: string; reorderable: boolean; handleLabel: string; children: ReactNode; trailing: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderable,
  });

  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={spring}
      // 세로 축만 반영한다 — @dnd-kit/modifiers 가 설치돼 있지 않아 x 는 버린다.
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={`flex items-start gap-1.5 rounded-xl bg-background/60 p-2.5 shadow-sm transition-shadow ${
        isDragging ? "relative z-10 shadow-lg" : ""
      }`}
    >
      {reorderable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={handleLabel}
          title={handleLabel}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded-lg p-1 text-muted-foreground/50 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-violet-400"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      {trailing}
    </motion.div>
  );
}

export function EditableList<T>({
  listId, itemNoun, items, onChange, rowKey, makeItem, addLabel, renderRow,
  reorderable = false, removable, emptyState, maxRows,
}: EditableListProps<T>) {
  // 삭제 유예 중인 행 — 화면에서만 숨긴다(배열은 유예가 끝날 때 바뀐다).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { remove } = useUndoableDelete();

  const sensors = useSensors(
    // distance:5 — 삭제·확장 버튼 클릭이 드래그로 먹히지 않게
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(
    () => items.map((item, index) => ({ item, index, key: rowKey(item) })).filter((r) => !hidden.has(r.key)),
    [items, hidden, rowKey],
  );

  const requestRemove = (key: string) => {
    remove({
      key: `${listId}:${key}`,
      message: `${itemNoun}을 삭제했어요`,
      onOptimistic: () => setHidden((prev) => new Set(prev).add(key)),
      onUndo: () => setHidden((prev) => { const n = new Set(prev); n.delete(key); return n; }),
      commit: () => {
        // 유예가 끝났다 — 이제야 배열에서 뺀다(자동저장은 여기서 한 번만 돈다).
        // index 가 아니라 key 로 지운다 — 그 사이 순서가 바뀌었어도 정확한 행이 지워진다.
        onChange(items.filter((it) => rowKey(it) !== key));
        setHidden((prev) => { const n = new Set(prev); n.delete(key); return n; });
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((it) => rowKey(it) === active.id);
    const to = items.findIndex((it) => rowKey(it) === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(items, from, to));
  };

  const atMax = maxRows !== undefined && items.length >= maxRows;

  const rows = (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {visible.map(({ item, index, key }) => (
          <Row
            key={key}
            id={key}
            reorderable={reorderable}
            handleLabel={`${itemNoun} 순서 변경 — 끌거나 포커스 후 방향키`}
            trailing={
              // 삭제는 항상 보인다 — hover 로만 나타나면 터치 기기에서 발견되지 않는다.
              // 지울 수 없는 항목은 같은 폭의 빈 자리로 레이아웃을 유지한다.
              removable && !removable(item) ? (
                <span className="mt-0.5 block h-[26px] w-[26px] shrink-0" aria-hidden />
              ) : (
                <button
                  type="button"
                  onClick={() => requestRemove(key)}
                  aria-label={`${itemNoun} 삭제`}
                  title={`${itemNoun} 삭제`}
                  className="mt-0.5 shrink-0 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500 focus-visible:outline-2 focus-visible:outline-violet-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )
            }
          >
            {renderRow({
              item,
              index,
              patch: (next) => onChange(items.map((it) => (rowKey(it) === key ? { ...it, ...next } : it))),
              requestRemove: () => requestRemove(key),
            })}
          </Row>
        ))}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        emptyState
      ) : reorderable ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        rows
      )}

      {!atMax && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          transition={spring}
          onClick={() => onChange([...items, makeItem()])}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-violet-400 hover:text-violet-500"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </motion.button>
      )}
    </div>
  );
}
