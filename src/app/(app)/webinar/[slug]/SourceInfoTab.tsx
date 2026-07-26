"use client";

/**
 * 만들기 › 원본 정보 — **사실 한 벌**.
 *
 * 승인된 IA 재설계의 1단계. 값의 집을 정하는 질문을 바꾼 결과다:
 * "이 값이 어느 화면에 보이나"는 여러 화면에 나가는 값에 답이 없어서, 테마·세션이 갈 곳을
 * 잃고 마지막에 손댄 섹션에 얹혀 있었다. 새 질문은 **"사실인가, 표현인가"** —
 * 답이 항상 하나다. 여기 있는 셋은 전부 사실이고, 네 산출물(랜딩·등록·시청·설문)이 읽어간다.
 *
 * 합친 것:
 *   · 정체성·일정  ← 옛 '기본 정보' 섹션
 *   · 진행 순서    ← 옛 '세션' 섹션 (랜딩 카드·타임테이블·대기 아젠다·시청 화면이 읽어간다)
 *   · 브랜드       ← 옛 '라이브 페이지' 안의 '디자인' (공개 화면 전체에 적용되는데 거기 갇혀 있었다)
 *
 * 자동저장이 세 벌인 이유(의도): 세 영역이 **서로 다른 저장 경로**를 쓴다 —
 * 정체성·일정은 PATCH {name,description,dates,components}, 브랜드는 PATCH {theme}
 * (theme 은 독립 컬럼이고 서버가 필드별로 병합한다), 진행 순서는 세션 전용 엔드포인트들이다.
 * 한 훅으로 묶으면 한 영역을 고칠 때 나머지 두 영역의 스냅샷까지 함께 전송돼
 * 다른 창이 방금 저장한 값을 되돌린다. 화면상 표시를 하나로 합치는 것은 별건이다(0단계 항목).
 */

import { type ComponentProps } from "react";
import BasicInfoTab from "./BasicInfoTab";
import SessionsTab from "./SessionsTab";
import BrandSection from "./BrandSection";

/**
 * 타입을 다시 선언하지 않고 자식 컴포넌트에서 끌어온다 — 이 프로젝트는 탭마다 Webinar·
 * WebinarSession 을 각자 선언해서 이미 여러 벌이 돌아다닌다. 여기서 한 벌 더 만들면
 * "이름은 같은데 서로 다른 타입" 이 되고(실제로 그 에러를 봤다) 필드가 추가될 때 조용히 어긋난다.
 */
type BasicWebinar = ComponentProps<typeof BasicInfoTab>["webinar"];
type Sessions = ComponentProps<typeof SessionsTab>["sessions"];

type Webinar = BasicWebinar & {
  id: string;
  theme: Record<string, string>;
  sessions: Sessions;
};

/** 영역 사이 구분 — 한 화면에 셋이 쌓이므로 어디서 무엇이 끝나는지 보이게 한다. */
function AreaDivider({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="border-t border-border pt-6">
      <h2 className="text-[13px] font-semibold tracking-tight">{label}</h2>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>
    </div>
  );
}

export default function SourceInfoTab({
  webinar,
  onUpdate,
  onSilentUpdate,
}: {
  webinar: Webinar;
  onUpdate: () => void;
  onSilentUpdate: () => void;
}) {
  return (
    <div className="space-y-8 pb-10">
      {/* 정체성·일정 — BasicInfoTab 이 자기 패딩·자기 자동저장 표시를 갖고 있어 그대로 얹는다 */}
      <BasicInfoTab webinar={webinar} onSilentUpdate={onSilentUpdate} />

      <div className="px-4 sm:px-6 lg:px-8">
        <AreaDivider
          label="진행 순서"
          hint="랜딩 카드·타임테이블·대기 화면 아젠다·시청 화면이 모두 이 표를 읽어가요."
        />
      </div>
      <SessionsTab webinarId={webinar.id} sessions={webinar.sessions} onUpdate={onUpdate} />

      <div className="max-w-2xl space-y-6 px-4 sm:px-6 lg:px-8">
        <AreaDivider label="브랜드" hint="한 번 정하면 공개 화면 전체가 같은 색과 폰트를 씁니다." />
        <BrandSection webinarId={webinar.id} theme={webinar.theme} onSilentUpdate={onSilentUpdate} />
      </div>
    </div>
  );
}
