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

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { motion } from "framer-motion";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useUndoableDelete } from "@/components/ui/use-undoable-delete";
import { objectParticle } from "@/lib/korean";

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

/**
 * 배열 연산 3종을 순수 함수로 빼 둔 이유: 이 컴포넌트의 버그는 전부 **어느 배열 스냅샷을 읽는가**
 * 에서 나왔고(다중 삭제 부활), 브라우저 하니스로는 dnd-kit 의 비동기 경로(rAF 기반 측정)를
 * 안정적으로 재현할 수 없다 — 이 pane 은 visibilityState=hidden 이라 rAF 가 조절된다.
 * 순수 함수로 두면 vitest 가 매 커밋마다 지켜 준다.
 */
export function removeByKey<T>(items: readonly T[], rowKey: (item: T) => string, key: string): T[] {
  return items.filter((it) => rowKey(it) !== key);
}

export function patchByKey<T>(
  items: readonly T[], rowKey: (item: T) => string, key: string, next: Partial<T>,
): T[] {
  return items.map((it) => (rowKey(it) === key ? { ...it, ...next } : it));
}

/** activeId 를 overId 자리로. 둘 중 하나라도 없으면 원본을 그대로 돌려준다. */
export function moveByKey<T>(
  items: readonly T[], rowKey: (item: T) => string, activeId: string, overId: string,
): T[] {
  const from = items.findIndex((it) => rowKey(it) === activeId);
  const to = items.findIndex((it) => rowKey(it) === overId);
  if (from < 0 || to < 0) return items as T[];
  return arrayMove(items as T[], from, to);
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
    /**
     * 요소가 두 겹인 이유: transform 을 두 라이브러리가 동시에 쓸 수 없다.
     *
     * 한 겹으로 두고 motion.div 에 style={{transform}} 을 넘기면 **framer-motion 이 이긴다.**
     * y 를 애니메이션하거나 layout 을 켜는 순간 framer 가 transform 문자열을 직접 만들어 쓰고,
     * 넘긴 style.transform 은 버려진다(하니스 실측: 인라인이 `transform: none` — 이 코드가
     * 낼 수 있는 값은 translate3d 문자열 아니면 undefined 뿐이라, 저 none 은 framer 가 쓴 것).
     * 결과는 **드래그해도 행이 따라 움직이지 않는 상태**였다(놓으면 순서는 맞게 바뀌므로 눈에 안 띈다).
     *
     * 그래서 바깥은 순수 div — dnd-kit 의 ref·transform·transition 전용,
     * 안쪽 motion.div 는 등장 페이드 전용. 서로 다른 요소라 충돌하지 않는다.
     * layout 은 뺐다 — 그게 framer 를 transform 저자로 만든 원인이고, 순서 이동은 dnd-kit 의
     * transition 이 이미 부드럽게 처리한다. 삭제 후 아래 행이 올라오는 건 즉시 이동인데,
     * 되돌리기 토스트가 실수를 받쳐 주므로 그 편이 더 반응 좋게 읽힌다.
     */
    <div
      ref={setNodeRef}
      // 세로 축만 반영한다 — @dnd-kit/modifiers 가 설치돼 있지 않아 x 는 버린다.
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={isDragging ? "relative z-10" : undefined}
    >
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className={`flex items-start gap-1.5 rounded-xl bg-background/60 p-2.5 transition-shadow ${
          isDragging ? "shadow-lg" : "shadow-sm"
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
    </div>
  );
}

export function EditableList<T>({
  listId, itemNoun, items, onChange, rowKey, makeItem, addLabel, renderRow,
  reorderable = false, removable, emptyState, maxRows,
}: EditableListProps<T>) {
  // 삭제 유예 중인 행 — 화면에서만 숨긴다(배열은 유예가 끝날 때 바뀐다).
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { remove } = useUndoableDelete();

  /**
   * 배열을 바꾸는 코드는 **클로저가 아니라 이 ref 를 읽는다.**
   *
   * 이유: 삭제 클릭은 setHidden 만 부르므로 items prop 이 바뀌지 않는다. 그래서 5초 안에 두 행을
   * 지우면 두 번째 커밋의 클로저도 **삭제 전 원본 배열**을 들고 있고, 나중에 도는 커밋이 먼저 도는
   * 커밋의 결과를 덮어써서 **먼저 지운 행이 되살아난다.**
   *
   * 하니스 실측(A·B 를 150ms 간격으로 삭제 → 6.5초 후):
   *   삭제1 후 화면 [B,C] / 배열 [A,B,C]   삭제2 후 화면 [C] / 배열 [A,B,C]
   *   +6.5s   화면 [A,C] / 배열 [A,C]  ← A 가 되살아나고 그대로 자동저장된다
   *
   * onChange 를 함수형 업데이터로 넓히는 건 불가 — 호출하는 쪽 래퍼들이 전부 '배열만' 받는다
   * (setRows("programs", next) / patch({ join: { ...state.join, steps } }) / setResources).
   * ref 는 외부 시그니처를 한 글자도 바꾸지 않고 같은 문제를 없앤다.
   */
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /**
   * 배열 변경의 유일한 출구. 다음 배열을 ref 에 **동기적으로 먼저 심고** 나서 onChange 를 부른다 —
   * 두 커밋이 같은 틱에 겹쳐도(타이머가 거의 동시에 만료) 두 번째가 첫 번째의 결과 위에서 계산된다.
   * 부모 리렌더를 기다리면 그 틈이 정확히 위 버그의 재발 경로다.
   */
  const commitItems = (next: T[]) => {
    itemsRef.current = next;
    onChangeRef.current(next);
  };

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
      // 조사는 계산한다 — 하드코딩하면 "단계을"·"자료을" 처럼 틀린 말이 나온다.
      message: `${objectParticle(itemNoun)} 삭제했어요`,
      onOptimistic: () => setHidden((prev) => new Set(prev).add(key)),
      onUndo: () => setHidden((prev) => { const n = new Set(prev); n.delete(key); return n; }),
      commit: () => {
        // 유예가 끝났다 — 이제야 배열에서 뺀다(자동저장은 여기서 한 번만 돈다).
        // index 가 아니라 key 로 지운다 — 그 사이 순서가 바뀌었어도 정확한 행이 지워진다.
        commitItems(removeByKey(itemsRef.current, rowKey, key));
        setHidden((prev) => { const n = new Set(prev); n.delete(key); return n; });
      },
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commitItems(moveByKey(itemsRef.current, rowKey, String(active.id), String(over.id)));
  };

  // 유예 중 숨은 행은 정원을 차지하지 않는다 — 상한을 채운 뒤 하나 지우고 곧바로 새 행을 넣으려 할 때
  // 5초를 기다리게 되는 걸 막는다. hidden 이 비면 items.length 와 같으므로 기존 동작의 일반화다.
  const atMax = maxRows !== undefined && items.length - hidden.size >= maxRows;

  // AnimatePresence 를 쓰지 않는다. 직접 자식이 커스텀 컴포넌트(Row)면 exit 완료 신호를 받지 못해
  // **삭제된 행이 DOM 에 영구히 남는다**(하니스에서 확인: 배열 2개 / 화면 3개, 잔재는 opacity 1).
  // 순서 변경의 부드러움은 motion.div 의 layout 이 담당하고, 삭제는 즉시 사라지는 게 맞다
  // (되돌리기 토스트가 실수를 이미 받쳐 준다).
  const rows = (
    <div className="space-y-2">
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
              // 여기도 클로저가 아니라 ref — 같은 틱에 두 행을 patch 해도 하나가 사라지지 않는다.
              patch: (next) => commitItems(patchByKey(itemsRef.current, rowKey, key, next)),
              requestRemove: () => requestRemove(key),
            })}
        </Row>
      ))}
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
          onClick={() => commitItems([...itemsRef.current, makeItem()])}
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-violet-400 hover:text-violet-500"
        >
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </motion.button>
      )}
    </div>
  );
}
