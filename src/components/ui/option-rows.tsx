"use client";

/**
 * OptionRows — 선택지 목록(등록 폼 드롭다운 / 설문 객관식) 공용.
 *
 * 왜 공용인가: 등록 탭과 설문 탭의 선택지 코드가 오늘 사실상 같다 — 렌더 게이트,
 * Enter/Backspace 핸들러, 마지막 행 비우기, 추가 버튼 문구·클래스, 행 컨테이너 클래스,
 * `input[data-opt-idx]` 쿼리 문자열까지 동일하고, 실차이는 마커 모양·삭제 아이콘·
 * aria 폴백 명사·개수 상한 다섯 개뿐이다. 따로 옮기면 드리프트가 즉시 재발한다.
 *
 * EditableList 위의 **얇은 조립**이다(내부 API 접근 0, 공개 prop 만 사용). 이 조립이
 * 성립한다는 사실 자체가 골격 API 가 충분하다는 증거이고, 성립하지 않으면 그때가
 * 골격에 무언가 빠졌다는 신호다.
 *
 * 외부 계약은 `string[]` 그대로다 — 저장 스키마(options: string[])와 부모 코드가
 * 바뀌지 않는다. 키를 붙인 형태는 이 컴포넌트 안에만 존재한다.
 *
 * 이관으로 생기는 순수 이득: **드래그·키보드 재정렬**. 선택지 순서는 공개 폼 <select> 의
 * option 순서이자 미리보기 대표값(첫 비어있지 않은 옵션)인데, 오늘 순서를 바꾸는 방법은
 * 문구를 다시 타이핑하는 것뿐이었다.
 */

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { EditableList, ROW_KEY, type WithRowKey } from "@/components/ui/editable-list";

/** 원시 문자열은 키를 담을 자리가 없어서 편집 중에만 객체로 감싼다. */
type OptionRow = WithRowKey<{ value: string }>;

const wrap = (values: readonly string[]): OptionRow[] =>
  values.map((value) => ({ value, [ROW_KEY]: crypto.randomUUID() }));

const unwrap = (rows: readonly OptionRow[]): string[] => rows.map((r) => r.value);

const sameValues = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export interface OptionRowsProps {
  /** 저장 형태 그대로. */
  value: string[];
  onChange: (next: string[]) => void;
  /** 라디오(단일 선택)면 circle, 체크박스(복수 선택)면 square. */
  markerShape?: "circle" | "square";
  /** aria-label 에 쓰는 소유자 이름 — 비어 있을 때의 폴백(예: "필드", "문항"). */
  ownerLabel: string;
  /** 이 목록이 속한 항목의 제목. aria-label 을 "제목 선택지 2" 로 만든다. */
  ownerTitle?: string;
  maxOptions?: number;
  /** 상한에 걸렸을 때 알린다 — 골격 기본은 버튼을 없애 이유를 못 말한다. */
  onMaxReached?: (max: number) => void;
  /** 개수가 바뀔 때마다 호출(설문의 '최대 선택' 값 clamp 처럼 파생값을 맞출 때). */
  onCountChange?: (count: number) => void;
  /** 실행취소 토스트 키 접두사 — 같은 화면에 여러 목록이 있으니 항목별로 다르게 준다. */
  listId: string;
}

export function OptionRows({
  value, onChange, markerShape = "circle", ownerLabel, ownerTitle,
  maxOptions, onMaxReached, onCountChange, listId,
}: OptionRowsProps) {
  const [rows, setRows] = useState<OptionRow[]>(() => wrap(value));

  /**
   * 우리가 올려보낸 값과 부모가 내려준 값을 구분한다.
   *
   * 필요한 이유: setRows 직후 한 프레임 동안 부모의 value 는 아직 옛 값이다. 그걸 외부
   * 변경으로 오해하면 방금 입력한 글자를 되돌리며 무한히 싸운다. 반대로 정말 외부에서
   * 갈린 경우(리마운트·서버 정규화로 빈 옵션이 걷힌 경우)에는 키를 다시 매기는 게 맞다.
   */
  const lastSentRef = useRef<string[]>(value);
  useEffect(() => {
    if (sameValues(value, lastSentRef.current)) return;
    lastSentRef.current = value;
    setRows(wrap(value));
  }, [value]);

  const push = (next: OptionRow[]) => {
    setRows(next);
    const values = unwrap(next);
    lastSentRef.current = values;
    onChange(values);
    onCountChange?.(next.length);
  };

  const marker =
    markerShape === "square"
      ? "h-3.5 w-3.5 shrink-0 rounded-[5px] border-[1.5px] border-muted-foreground/40"
      : "h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-muted-foreground/40";

  const atMax = maxOptions !== undefined && rows.length >= maxOptions;

  return (
    <EditableList<OptionRow>
      listId={listId}
      itemNoun="선택지"
      items={rows}
      onChange={push}
      rowKey={(r) => r[ROW_KEY]}
      makeItem={() => ({ value: "", [ROW_KEY]: crypto.randomUUID() })}
      reorderable
      rowChrome="bare"
      autoFocusNewRow
      maxRows={maxOptions}
      renderRow={({ item, visibleIndex, patch, handle, removeButton, removeNow, insertAfter, isDragging }) => {
        const label = `${ownerTitle?.trim() || ownerLabel} 선택지 ${visibleIndex + 1}`;
        // 마지막 한 행은 지우지 않고 값만 비운다 — 목록이 0행이 되면 "선택지를 추가하세요"
        // 부터 다시 시작해야 하고, 드롭다운은 선택지가 최소 하나 있어야 뜻이 있다.
        const isLast = rows.length <= 1;
        return (
          <div
            className={`flex items-center gap-2 rounded-lg bg-card px-2.5 transition-shadow focus-within:ring-2 focus-within:ring-violet-400/50 ${
              isDragging ? "shadow-lg" : "shadow-sm"
            }`}
          >
            {handle}
            <span className={marker} aria-hidden />
            <input
              value={item.value}
              onChange={(e) => patch({ value: e.target.value })}
              onKeyDown={(e) => {
                // 한글 조합 중 Enter 는 '조합 확정' 이라 행을 추가하면 안 된다.
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") {
                  e.preventDefault();
                  // 끝이 아니라 **이 행 다음**에 — 중간에서 이어 쓰는 흐름이 끊기지 않게.
                  if (!insertAfter() && maxOptions !== undefined) onMaxReached?.(maxOptions);
                } else if (e.key === "Backspace" && e.currentTarget.value === "" && !isLast) {
                  // 문자를 지우다 행이 사라진 경우 — 토스트 없이 즉시, 포커스는 이전 행으로.
                  e.preventDefault();
                  removeNow({ focus: "prev" });
                }
              }}
              placeholder={`선택지 ${visibleIndex + 1}`}
              aria-label={label}
              className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-muted-foreground/40"
            />
            {removeButton({
              label: isLast ? `${label} 비우기` : `${label} 삭제`,
              // 삭제도 즉시다(유예 없음) — 되돌리는 가장 빠른 길이 다시 타이핑이고,
              // 5초 유예를 켜면 번호 라벨·개수 경고가 그 동안 옛 배열에서 파생돼 거짓이 된다.
              onClick: isLast ? () => patch({ value: "" }) : () => removeNow(),
            })}
          </div>
        );
      }}
      renderAdd={({ add }) => (
        <button
          type="button"
          onClick={() => {
            if (!add() && maxOptions !== undefined) onMaxReached?.(maxOptions);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-violet-500 transition-colors hover:bg-violet-500/10 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          선택지 추가
          {/* 이 보조문구가 키보드 경로를 알리는 유일한 안내다 — 상한에서는 이유로 바뀐다. */}
          <span className="font-normal text-muted-foreground/60">
            {atMax ? `— 최대 ${maxOptions}개까지예요` : "— 입력 중 Enter 로도 추가돼요"}
          </span>
        </button>
      )}
    />
  );
}
