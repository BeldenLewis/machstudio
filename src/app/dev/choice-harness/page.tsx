"use client";

/**
 * 선택형 등록 필드 동작 검증용 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * 등록 폼은 로그인 뒤 만들기 탭에서 만들어야 하고, 공개 폼은 그렇게 만든 DB 데이터가
 * 있어야 뜬다. 그래서 컴포넌트만 격리해 태운다 — row-harness 와 같은 방식.
 *
 * 확인해야 하는 것이 전부 "눌러 봐야 아는" 종류다:
 *   · 최대 2개에서 세 번째 칸이 잠기는가 / 고른 칸은 계속 해제되는가
 *   · 기타를 골랐다가 끄면 다른 선택은 남는가
 *   · 기타 자유입력의 쉼표가 입력 시점에 막히는가(값의 항목 경계와 충돌)
 *   · 밖으로 나가는 값이 ", " 로 합친 문자열이고 마커가 섞이지 않는가
 * 그래서 각 케이스의 **저장 값과 파싱 결과**를 화면에 그대로 노출한다.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { MultiChoiceField, SingleChoiceField } from "@/components/webinar/choice-fields";
import { splitMultiValue } from "@/lib/webinar-config";

const INPUT_STYLE: React.CSSProperties = {
  border: "1px solid rgba(120,120,128,0.35)",
  borderRadius: 9,
  background: "transparent",
};
const ACCENT = "#6d28d9";

function Case({
  title, note, value, children,
}: {
  title: string;
  note: string;
  value: string;
  children: React.ReactNode;
}) {
  const parts = splitMultiValue(value);
  return (
    <section className="space-y-2 rounded-xl bg-secondary/40 p-3">
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground">{title}</p>
        <p className="text-[11px] text-muted-foreground/70">{note}</p>
      </div>
      {children}
      {/* 자동화가 읽는 자리 — 눈으로도 같은 값을 본다 */}
      <dl className="space-y-0.5 border-t border-border pt-2 font-mono text-[11px]">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">저장 값</dt>
          <dd data-h="value">{value === "" ? "(빈 값)" : JSON.stringify(value)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">항목 수</dt>
          <dd data-h="count">{parts.length}</dd>
        </div>
      </dl>
    </section>
  );
}

export default function ChoiceHarnessPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [multi, setMulti] = useState("");
  const [multiNoCap, setMultiNoCap] = useState("퍼포먼스 마케팅, 브랜딩");
  const [single, setSingle] = useState("");
  const [restored, setRestored] = useState("우리 회사만의 답");

  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <header>
        <h1 className="text-sm font-semibold">선택형 등록 필드 하니스</h1>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          개발 전용. 공개 등록 폼·임베드 로더가 쓰는 것과 같은 컴포넌트입니다.
        </p>
      </header>

      <Case
        title="복수 선택 · 최대 2개 · 기타 허용"
        note="세 번째 칸이 잠기고, 고른 칸은 계속 해제된다"
        value={multi}
      >
        <MultiChoiceField
          field={{
            key: "topic", label: "관심 주제", type: "multiple",
            options: ["퍼포먼스 마케팅", "브랜딩", "데이터 분석", "CRM"],
            maxSelect: 2, allowOther: true,
          }}
          value={multi}
          onChange={setMulti}
          accent={ACCENT}
          inputStyle={INPUT_STYLE}
        />
      </Case>

      <Case
        title="복수 선택 · 제한 없음 · 저장된 값 복원"
        note="이미 두 개 고른 상태로 시작한다 — 체크가 복원되어야 한다"
        value={multiNoCap}
      >
        <MultiChoiceField
          field={{
            key: "topic2", label: "관심 주제", type: "multiple",
            options: ["퍼포먼스 마케팅", "브랜딩", "데이터 분석"],
          }}
          value={multiNoCap}
          onChange={setMultiNoCap}
          accent={ACCENT}
          inputStyle={INPUT_STYLE}
        />
      </Case>

      <Case title="드롭다운 · 기타 허용" note="기타를 고르면 자유 입력칸이 뜬다" value={single}>
        <SingleChoiceField
          field={{ key: "job", label: "직무", options: ["기획", "개발", "디자인"], allowOther: true }}
          value={single}
          onChange={setSingle}
          inputStyle={INPUT_STYLE}
        />
      </Case>

      <Case
        title="드롭다운 · 선택지에 없는 값으로 시작"
        note="새로고침 후 상태 복원 — 기타로 쓴 답이면 자유 입력칸이 열려 있어야 한다"
        value={restored}
      >
        <SingleChoiceField
          field={{ key: "job2", label: "직무", options: ["기획", "개발"], allowOther: true }}
          value={restored}
          onChange={setRestored}
          inputStyle={INPUT_STYLE}
        />
      </Case>
    </main>
  );
}
