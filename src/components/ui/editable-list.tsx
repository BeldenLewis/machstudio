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
 * 면 색조 규칙(중요): 행 셸은 **bg-secondary**(2단)다. 예전엔 bg-background/60 이었는데
 * 라이트에서 --background 와 --card 가 **둘 다 oklch(1 0 0) 로 완전히 같아서**(globals.css)
 * 흰색 60% 를 흰 카드 위에 얹은 셈이 되어 경계가 0 이었다.
 *
 * ⚠ 다만 **"다크의 경계는 색조가 만든다" 는 틀렸다** — 처음에 그렇게 적었는데 실측이 반박했다.
 * oklch → sRGB → WCAG 로 계산한 값(이 팔레트 전체):
 *     라이트 카드 vs 배경          1.00:1   (같은 색)
 *     다크  카드 vs 배경          1.10:1
 *     다크  secondary vs 카드      1.18:1   ← 이 행 셸
 *     라이트 secondary vs 카드      1.09:1
 *     다크  border(white10%) vs 카드 1.32:1  ← 현재 가장 강한 경계 신호
 * **3:1 을 넘는 면 경계가 하나도 없다.** 색조 차이는 경계가 아니라 힌트 수준이고,
 * 다크에서 그림자(검정)는 측정상 1.03~1.09:1 로 사실상 0 이다.
 *
 * 그래서 이 셸의 bg-secondary 는 '경계' 가 아니라 '이전보다 나아진 것' 일 뿐이다
 * (라이트 1.00 → 1.09, 다크 → 1.18). border 를 없애는 방향은 채택하지 않는다 —
 * 마감을 통일하려면 헤어라인을 **그림자 안으로** 넣어야 한다
 * (box-shadow: inset 0 0 0 1px var(--border), <elevation>), border 유틸을 지우는 게 아니다.
 *
 * 삭제 계약(중요): 클릭 즉시 화면에서만 숨기고 배열은 그대로 둔다. 유예(5초)가 끝날 때 비로소
 * onChange(제거된 배열) 를 호출한다. 그래서 실행취소하면 자동저장 왕복이 **0회**다.
 *
 * 터치 타깃: 두 컨트롤 다 **36×36**이다. 44 가 아닌 이유를 적어 둔다 —
 * WCAG 2.2 의 기준은 두 단이다. AA(2.5.8 Target Size Minimum)가 24×24 CSS px,
 * AAA(2.5.5 Enhanced)가 44×44 다. 44 는 Apple HIG 와 같은 값이고 AAA 다.
 * 이 행의 높이는 36px(입력의 py-2 + 13px 텍스트)이라 버튼 박스를 44 로 키우면 행이
 * 그만큼 높아진다 — 만들기의 모든 목록 밀도가 바뀌는 일이다.
 * 히트 영역만 ::after 로 ±11px 넓히는 우회도 쓰지 않았다: 세로로 44 를 만들면 36px 행을
 * 넘어 **위아래 행의 입력을 덮고**, 가로로 넓히면 바로 옆 텍스트 입력의 클릭을 가로챈다
 * (선택지 행은 핸들 바로 오른쪽이 입력이다). 작은 타깃보다 나쁜 결과다.
 * 그래서 겹침 없이 가능한 최대인 **행 높이 전체(36)** 로 맞췄다. 이전 값은 핸들 22×22 로
 * AA 24 미달이었고 그건 실제 기준 위반이었다 — 그 부분이 해결된다.
 * 44 로 가려면 행 높이 자체를 올려야 하고, 그건 조립된 화면을 보고 결정할 일이다.
 *
 * 포커스 표시를 이 파일에서 다루지 않는 이유: globals.css 의 전역 규칙 한 곳이 소유한다.
 * 여기 있던 `focus-visible:outline-2 focus-visible:outline-violet-400` 두 벌은 지웠다 —
 * (1) 전역 규칙이 언레이어드라 @layer utilities 인 이 클래스들을 **항상 이긴다**(죽은 코드였다),
 * (2) outline-violet-400 은 고정색이라 다크에서 --ring(oklch 0.66 0.07 252)과 어긋난다.
 * 삭제 버튼의 hover 도 red-500 고정색이었다 — 호출부 9곳을 --destructive 로 바꿨는데
 * 정작 공용 컴포넌트가 다크에서 묻히는 빨강을 쓰고 있었다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
export function withRowKeys<T extends object>(items: readonly T[]): WithRowKey<T>[] {
  return items.map((item) => ({ ...item, [ROW_KEY]: crypto.randomUUID() }));
}

/** 저장 직전 클라이언트 키를 떼어낸다. */
export function stripRowKeys<T extends object>(items: readonly WithRowKey<T>[]): T[] {
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

/**
 * 행 표면을 누가 그리는가.
 *   "card" — 골격이 그린다(기본). 셸·등장 페이드·그립/삭제 자동 배치까지 지금과 동일.
 *   "bare" — 호출자가 그린다. renderRow 반환값이 sortable 노드의 직접 자식이 되고,
 *            그립·삭제는 ctx.handle / ctx.removeButton 으로 받아 자기 카드 헤더에 배치한다.
 *
 * className 을 받지 않는 이유: 열어 주면 다음 이관자가 셸을 안 맞추고 통과시키고, 반년 뒤 다시
 * "삭제 UI 3종, 행 마감 9종"(이 파일 상단 주석이 기록한 원래 상태)으로 돌아간다. 호출자가 얻는
 * 자유는 **골격 컨트롤을 어디에 놓는가**와 **행 표면을 내가 그리는가** 둘뿐이고, 컨트롤의
 * 아이콘·크기·aria·드래그 배선·유예 배선은 계속 골격이 독점한다.
 */
export type RowChrome = "card" | "bare";

/** renderRow 가 받는 골격 컨트롤. */
export interface EditableRowControls {
  /** 드래그 핸들 노드. reorderable 이 아니면 null. */
  handle: ReactNode | null;
  /**
   * 삭제 컨트롤 노드. removable(item) === false 면 null(호출자가 빈 자리를 직접 그린다).
   * label 로 행별 문구를 주면 스크린리더가 어느 행인지 읽는다 — 기본값은 전 행 동일해서
   * 항목이 여러 개일 때 구분되지 않는다.
   * onClick 을 주면 **5초 유예를 우회**한다(예: 마지막 한 행은 삭제 대신 값만 비우기).
   */
  removeButton: (opts?: { label?: string; onClick?: () => void }) => ReactNode | null;
  /** 드래그 중인 행인가 — "bare" 에서 호출자가 자기 표면에 드래그 상태를 표현할 때 쓴다. */
  isDragging: boolean;
}

export interface EditableRowCtx<T> extends EditableRowControls {
  item: T;
  /**
   * items 배열의 인덱스. 삭제 유예 중에는 숨은 행도 세므로 표시 번호에 구멍이 날 수 있다 —
   * 화면에 보이는 순번이 필요하면 visibleIndex 를 쓴다(의미를 바꾸면 이 값에 문구를 걸어 둔
   * 기존 호출부 세 곳이 동시에 흔들리므로 그대로 둔다).
   */
  index: number;
  /** 유예로 숨은 행을 제외한 순번 — "질문 3", "카드 2" 처럼 사람에게 보이는 번호용. */
  visibleIndex: number;
  /** 이 행만 갱신 */
  patch: (next: Partial<T>) => void;
  /** 삭제를 의도한 클릭(버튼·메뉴) — 5초 유예 + 되돌리기 토스트. */
  requestRemove: () => void;
  /**
   * 텍스트 편집에서 파생된 제거 — **토스트 없이 즉시** 배열에서 뺀다.
   * 빈 값에서 Backspace 처럼 "문자를 지우다 행이 사라진" 경우가 여기다. 유예를 붙이면
   * 지울 때마다 토스트가 쌓이고(선택지 세 개 정리 = 토스트 세 개), 5초간 번호 라벨과
   * 개수 경고가 옛 배열에서 파생돼 거짓이 된다. 되돌리는 가장 빠른 길이 다시 타이핑인
   * 경우에만 쓴다.
   * focus 로 지운 뒤 포커스를 넘길 이웃을 고른다(행 키 기준이라 유예·재정렬과 무관하게 정확).
   */
  removeNow: (opts?: { focus?: "prev" | "next" }) => void;
  /**
   * 이 행 **다음 자리**에 삽입. Enter 로 목록을 이어 만드는 흐름(0클릭)과 복제가 이걸 쓴다.
   * 상한(maxRows)에 걸리면 삽입하지 않고 false — 왜 안 되는지는 호출자가 말한다.
   * item 을 주지 않으면 makeItem() 을 쓴다(생성 로직이 두 곳으로 갈라지지 않게).
   */
  insertAfter: (item?: T) => boolean;
}

export interface EditableListProps<T> {
  /** 실행취소 토스트 키 접두사. 목록마다 다르게 준다(예: `faq`, `opt:${fieldId}`). */
  listId: string;
  /** 항목 이름 — 삭제 토스트·aria-label 문구를 자동 생성한다(예: "질문", "자료"). */
  itemNoun: string;
  items: T[];
  onChange: (next: T[]) => void;
  /** 안정 키. id 가 있으면 그것을, 없으면 withRowKeys 로 붙인 클라이언트 키를 준다. */
  rowKey: (item: T) => string;
  /** 새 행 생성. renderAdd 로 항목을 직접 만들어 넘긴다면 없어도 된다. */
  makeItem?: () => T;
  /** 기본 추가 버튼 문구. renderAdd 를 주면 쓰이지 않는다. */
  addLabel?: string;
  renderRow: (ctx: EditableRowCtx<T>) => ReactNode;
  /** 순서가 의미 있으면 true — 드래그 핸들 + 방향키 재정렬이 함께 붙는다. */
  reorderable?: boolean;
  /** 이 항목은 지울 수 없다. "card" 에서는 같은 폭의 빈 자리로 레이아웃을 유지한다. */
  removable?: (item: T) => boolean;
  /** 0개일 때 보여줄 것. 0개에 도달할 수 없는 목록(항상 병합되는 시스템 항목 등)은 생략. */
  emptyState?: ReactNode;
  maxRows?: number;
  /** 행 표면의 소유자. 기본 "card" — 지금 동작. */
  rowChrome?: RowChrome;
  /**
   * 추가 버튼의 소유권을 가져간다. 버튼이 목록 밖(섹션 헤더)에 있거나, 추가가 팝오버로
   * 유형을 먼저 고르거나, 문구가 두 단이거나, 상한에서 버튼을 남겨 이유를 말해야 할 때.
   * null 을 반환하면 아무것도 그리지 않는다.
   */
  renderAdd?: (ctx: { add: (item?: T) => boolean; atMax: boolean; count: number }) => ReactNode;
  /** 추가·삽입한 행의 첫 입력으로 포커스를 넘긴다. 기본 false. */
  autoFocusNewRow?: boolean;
  /**
   * 삭제 유예 중인 행 키를 알려준다. 옆 실시간 미리보기·번호·개수 경고가 5초간 거짓말하는 걸
   * 막을 때 쓴다(hidden 은 골격 내부 state 라 renderRow 로는 전달되지 않는다).
   * 저장 payload 에도 반영할지는 호출자 판단 — 반영하면 화면과 일치하지만
   * "실행취소 시 자동저장 왕복 0회" 계약이 깨지고 삭제가 공개 페이지에 5초 먼저 나간다.
   */
  onPendingRemoveChange?: (pendingKeys: ReadonlySet<string>) => void;
}

/** 골격이 그린 컨트롤 — autoFocusNewRow 가 여기로 포커스를 보내지 않게 표시한다. */
const SKELETON_CONTROL = { "data-el-skeleton": "1" } as const;

const FOCUSABLE = [
  'input:not([data-el-skeleton]):not([type="hidden"])',
  "textarea:not([data-el-skeleton])",
  "select:not([data-el-skeleton])",
  '[contenteditable="true"]',
].join(",");

function Row<T>({
  id, reorderable, chrome, handleLabel, itemNoun, canRemove, onRequestRemove, renderContent, claimFocus,
}: {
  id: string;
  reorderable: boolean;
  chrome: RowChrome;
  handleLabel: string;
  itemNoun: string;
  canRemove: boolean;
  onRequestRemove: () => void;
  renderContent: (controls: EditableRowControls) => ReactNode;
  claimFocus: (id: string) => boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !reorderable,
  });
  const boxRef = useRef<HTMLDivElement | null>(null);

  /**
   * 새로 생긴 행이면 첫 입력으로 포커스를 옮긴다. 의존성 배열이 없는 건 의도 —
   * claimFocus 가 자기 키일 때만 true 를 돌려주고 그때 예약을 지우므로 매 렌더 확인이 싸다.
   * index 가 아니라 행 키로 판정하기 때문에 유예로 숨은 행·재정렬과 무관하게 정확하다.
   */
  useEffect(() => {
    if (!claimFocus(id)) return;
    const target = boxRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    if (!target) return;
    target.focus();
    // 캐럿을 끝으로 — 이어서 타이핑하는 흐름이라 전체 선택은 방해가 된다.
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const end = target.value.length;
      try { target.setSelectionRange(end, end); } catch { /* number·email 등은 지원 안 함 */ }
    }
  });

  const handle = reorderable ? (
    <button
      type="button"
      {...attributes}
      {...listeners}
      {...SKELETON_CONTROL}
      aria-label={handleLabel}
      title={handleLabel}
      className="grid h-9 w-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground/50 transition-colors hover:text-foreground active:cursor-grabbing"
    >
      <GripVertical className="h-3.5 w-3.5" />
    </button>
  ) : null;

  const removeButton = (opts?: { label?: string; onClick?: () => void }) => {
    if (!canRemove) return null;
    const label = opts?.label ?? `${itemNoun} 삭제`;
    return (
      <button
        type="button"
        {...SKELETON_CONTROL}
        onClick={opts?.onClick ?? onRequestRemove}
        aria-label={label}
        title={label}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    );
  };

  const controls: EditableRowControls = { handle, removeButton, isDragging };

  /**
   * 요소가 두 겹인 이유: transform 을 두 라이브러리가 동시에 쓸 수 없다.
   *
   * 한 겹으로 두고 motion.div 에 style={{transform}} 을 넘기면 **framer-motion 이 이긴다.**
   * y 를 애니메이션하거나 layout 을 켜는 순간 framer 가 transform 문자열을 직접 만들어 쓰고,
   * 넘긴 style.transform 은 버려진다(하니스 실측: 인라인이 `transform: none` — 이 코드가
   * 낼 수 있는 값은 translate3d 문자열 아니면 undefined 뿐이라, 저 none 은 framer 가 쓴 것).
   * 결과는 **드래그해도 행이 따라 움직이지 않는 상태**였다(놓으면 순서는 맞게 바뀌므로 눈에 안 띈다).
   *
   * 그래서 바깥은 순수 div — dnd-kit 의 ref·transform·transition 전용.
   * "bare" 에서 호출자가 자기 카드 루트에 motion.div 를 걸어도 그건 이 div 의 **자식**이므로
   * 같은 충돌이 구조적으로 재발하지 않는다.
   */
  return (
    <div
      ref={setNodeRef}
      // 세로 축만 반영한다 — @dnd-kit/modifiers 가 설치돼 있지 않아 x 는 버린다.
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      className={isDragging ? "relative z-10" : undefined}
    >
      <div ref={boxRef}>
        {chrome === "bare" ? (
          renderContent(controls)
        ) : (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className={`flex items-start gap-1.5 rounded-xl bg-secondary p-2.5 transition-shadow ${
              isDragging ? "shadow-lg" : "shadow-sm"
            }`}
          >
            {handle && <span className="mt-0.5 flex">{handle}</span>}
            <div className="min-w-0 flex-1 space-y-2">{renderContent(controls)}</div>
            {/* 삭제는 항상 보인다 — hover 로만 나타나면 터치 기기에서 발견되지 않는다.
                지울 수 없는 항목은 같은 폭의 빈 자리로 레이아웃을 유지한다. */}
            {canRemove ? (
              <span className="mt-0.5 flex">{removeButton()}</span>
            ) : (
              <span className="mt-0.5 block h-[26px] w-[26px] shrink-0" aria-hidden />
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export function EditableList<T>({
  listId, itemNoun, items, onChange, rowKey, makeItem, addLabel, renderRow,
  reorderable = false, removable, emptyState, maxRows,
  rowChrome = "card", renderAdd, autoFocusNewRow = false, onPendingRemoveChange,
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

  // 포커스 예약 — 행 키를 담는다. 새 행의 Row 가 마운트되면 자기 것인지 확인하고 가져간다.
  const pendingFocusRef = useRef<string | null>(null);
  const claimFocus = useCallback((id: string) => {
    if (pendingFocusRef.current !== id) return false;
    pendingFocusRef.current = null;
    return true;
  }, []);

  // 유예 목록 통보 — 미리보기·번호·개수 경고가 5초간 거짓말하지 않게.
  const pendingCbRef = useRef(onPendingRemoveChange);
  pendingCbRef.current = onPendingRemoveChange;
  useEffect(() => { pendingCbRef.current?.(hidden); }, [hidden]);

  const sensors = useSensors(
    // distance:5 — 삭제·확장 버튼 클릭이 드래그로 먹히지 않게
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const visible = useMemo(
    () => items.map((item, index) => ({ item, index, key: rowKey(item) })).filter((r) => !hidden.has(r.key)),
    [items, hidden, rowKey],
  );

  // 유예 중 숨은 행은 정원을 차지하지 않는다 — 상한을 채운 뒤 하나 지우고 곧바로 새 행을 넣으려 할 때
  // 5초를 기다리게 되는 걸 막는다. hidden 이 비면 items.length 와 같으므로 기존 동작의 일반화다.
  const count = items.length - hidden.size;
  /** 렌더 시점의 상한 도달 여부 — **표시용**(추가 버튼 보조문구 등). 게이트로는 쓰지 않는다. */
  const atMax = maxRows !== undefined && count >= maxRows;

  /**
   * 상한 게이트는 **ref 에서** 판정한다. 렌더 시점의 atMax 를 쓰면 한 프레임 안에 여러 번
   * 추가될 때 전부 통과한다 — 변경은 itemsRef(최신)로 쓰는데 판정은 아직 리렌더되지 않은
   * state 로 하기 때문이다. commitItems 주석에 적힌 것과 같은 종류의 어긋남이다.
   *
   * 하니스에서 실측: maxOptions=5 인 목록에서 한 프레임에 추가 6회를 보내면 7행이 되고
   * onMaxReached 는 한 번도 불리지 않았다(보조문구는 "최대 5개까지예요" 를 표시하는 중).
   * 클릭을 프레임마다 나누면 정확히 5에서 멈춘다 — 즉 버스트에서만 새는 구멍이었다.
   *
   * 사람이 6번 클릭을 한 프레임에 하지는 못하지만, **Enter 키를 누르고 있으면** insertAfter 가
   * 키 반복 속도(~30/s)로 불려 커밋보다 빨라진다. 도달 가능한 경로다.
   */
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const isAtMax = () =>
    maxRows !== undefined && itemsRef.current.length - hiddenRef.current.size >= maxRows;

  const makeOne = (item?: T): T | undefined => {
    if (item !== undefined) return item;
    if (makeItem) return makeItem();
    if (process.env.NODE_ENV !== "production") {
      throw new Error("EditableList: 항목 없이 추가하려면 makeItem 이 필요해요.");
    }
    return undefined;
  };

  /** 끝에 추가. 상한이면 false — 호출자가 이유를 말할 수 있게. */
  const append = (item?: T): boolean => {
    if (isAtMax()) return false;
    const made = makeOne(item);
    if (made === undefined) return false;
    commitItems([...itemsRef.current, made]);
    if (autoFocusNewRow) pendingFocusRef.current = rowKey(made);
    return true;
  };

  const insertAfter = (afterKey: string, item?: T): boolean => {
    if (isAtMax()) return false;
    const made = makeOne(item);
    if (made === undefined) return false;
    const current = itemsRef.current;
    const at = current.findIndex((it) => rowKey(it) === afterKey);
    const next = [...current];
    next.splice(at < 0 ? current.length : at + 1, 0, made);
    commitItems(next);
    if (autoFocusNewRow) pendingFocusRef.current = rowKey(made);
    return true;
  };

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

  /** 토스트 없이 즉시 제거. 포커스는 지금 화면에 보이는 이웃 기준으로 고른다. */
  const removeNow = (key: string, opts?: { focus?: "prev" | "next" }) => {
    if (opts?.focus) {
      const i = visible.findIndex((r) => r.key === key);
      const neighbour = i < 0 ? undefined : visible[opts.focus === "prev" ? i - 1 : i + 1];
      if (neighbour) pendingFocusRef.current = neighbour.key;
    }
    commitItems(removeByKey(itemsRef.current, rowKey, key));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    commitItems(moveByKey(itemsRef.current, rowKey, String(active.id), String(over.id)));
  };

  // AnimatePresence 를 쓰지 않는다. 직접 자식이 커스텀 컴포넌트(Row)면 exit 완료 신호를 받지 못해
  // **삭제된 행이 DOM 에 영구히 남는다**(하니스에서 확인: 배열 2개 / 화면 3개, 잔재는 opacity 1).
  const rows = (
    <div className={rowChrome === "bare" ? "space-y-1.5" : "space-y-2"}>
      {visible.map(({ item, index, key }, vi) => (
        <Row
          key={key}
          id={key}
          reorderable={reorderable}
          chrome={rowChrome}
          itemNoun={itemNoun}
          handleLabel={`${itemNoun} 순서 변경 — 끌거나 포커스 후 방향키`}
          canRemove={!removable || removable(item)}
          onRequestRemove={() => requestRemove(key)}
          claimFocus={claimFocus}
          renderContent={(controls) =>
            renderRow({
              ...controls,
              item,
              index,
              visibleIndex: vi,
              // 여기도 클로저가 아니라 ref — 같은 틱에 두 행을 patch 해도 하나가 사라지지 않는다.
              patch: (next) => commitItems(patchByKey(itemsRef.current, rowKey, key, next)),
              requestRemove: () => requestRemove(key),
              removeNow: (opts) => removeNow(key, opts),
              insertAfter: (newItem) => insertAfter(key, newItem),
            })
          }
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-2">
      {visible.length === 0 ? (
        emptyState ?? null
      ) : reorderable ? (
        /**
         * `id` 를 준다. 안 주면 dnd-kit 이 **모듈 전역 카운터**로 만들고
         * (`useUniqueId("DndDescribedBy")`), 그 순서가 서버와 브라우저에서 다르다 —
         * 목록이 겹쳐 있으면 특히 어긋난다. 결과는 드래그 핸들의 `aria-describedby` 가
         * 없는 요소를 가리키는 하이드레이션 불일치이고, React 는 이걸 **고쳐 주지 않는다**
         * ("This won't be patched up"). 즉 스크린리더가 순서 변경 안내를 못 읽는다.
         * /dev/expo-sections-harness 에서 실측했다.
         *
         * listId 는 이미 목록마다 다르게 주기로 한 값이라 그대로 쓴다.
         */
        <DndContext id={listId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((r) => r.key)} strategy={verticalListSortingStrategy}>
            {rows}
          </SortableContext>
        </DndContext>
      ) : (
        rows
      )}

      {renderAdd
        ? renderAdd({ add: append, atMax, count })
        : addLabel && !atMax && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.98 }}
              transition={spring}
              onClick={() => append()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-violet-400 hover:text-violet-500"
            >
              <Plus className="h-3.5 w-3.5" /> {addLabel}
            </motion.button>
          )}
    </div>
  );
}
