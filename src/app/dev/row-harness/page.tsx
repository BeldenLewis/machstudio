"use client";

/**
 * EditableList 동작 검증용 하니스 — **개발 환경 전용**.
 *
 * 만들기 탭은 로그인 뒤에 있어 자동화로 열 수 없다. 그래서 컴포넌트만 격리해 띄우고
 * 실제 상호작용(중간 행 삭제·실행취소·드래그·키보드)을 검증한다.
 * 특히 "중간 행을 지우면 아래 행 값이 밀려 올라오는가"가 이번 수정의 핵심이라
 * 각 행의 값을 화면에 그대로 노출해 눈으로도, 자동화로도 읽을 수 있게 했다.
 *
 * 프로덕션에서는 404 — 빌드에 포함되더라도 접근할 수 없다.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { EditableList, ROW_KEY, withRowKeys, stripRowKeys, type WithRowKey } from "@/components/ui/editable-list";

type Step = { title: string; description: string };

const SEED: Step[] = [
  { title: "사전 등록", description: "첫째 설명" },
  { title: "입장 확인", description: "둘째 설명" },
  { title: "라이브 시청", description: "셋째 설명" },
];

export default function RowHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [rows, setRows] = useState<WithRowKey<Step>[]>(() => withRowKeys(SEED));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <h1 className="text-lg font-semibold">EditableList 하니스</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          개발 전용. 중간 행 삭제 후 남은 행의 값이 유지되는지 확인한다.
        </p>
      </header>

      <EditableList
        listId="harness"
        itemNoun="단계"
        items={rows}
        onChange={setRows}
        rowKey={(r) => r[ROW_KEY]}
        makeItem={() => ({ title: "", description: "", [ROW_KEY]: crypto.randomUUID() })}
        addLabel="단계 추가"
        reorderable
        emptyState={
          <p data-testid="empty" className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            아직 단계가 없어요.
          </p>
        }
        renderRow={({ item, index, patch }) => (
          <>
            <input
              data-testid={`title-${index}`}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
              value={item.title}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder={`Step ${index + 1} 제목`}
            />
            <input
              data-testid={`desc-${index}`}
              className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm"
              value={item.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="설명"
            />
          </>
        )}
      />

      {/* 자동화가 읽는 상태 거울 — 화면의 입력값과 배열이 어긋나지 않는지 대조한다 */}
      <section className="space-y-1 rounded-xl bg-secondary/30 p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">현재 배열 (저장 형태)</p>
        <pre data-testid="state" className="overflow-x-auto text-[11px] leading-relaxed">
          {JSON.stringify(stripRowKeys(rows))}
        </pre>
        <p className="text-[11px] font-semibold text-muted-foreground">행 키</p>
        <pre data-testid="keys" className="overflow-x-auto text-[11px] leading-relaxed">
          {rows.map((r) => r[ROW_KEY].slice(0, 8)).join(" · ")}
        </pre>
      </section>
    </div>
  );
}
