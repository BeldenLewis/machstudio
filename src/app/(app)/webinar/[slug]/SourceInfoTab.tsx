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
import BasicInfoTab, { WebinarDangerZone } from "./BasicInfoTab";
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

/**
 * 영역 사이 구분 — 한 화면에 넷이 쌓이므로 어디서 무엇이 끝나는지 보이게 한다.
 *
 * 크기 경쟁을 그만두고 **종류**를 다르게 했다. 이 화면의 제목 크기는 세 단이었는데
 * 화면 16px / 영역 15px / 그룹 14px 로 1px 씩이었다 — 1px 차이는 스케일이 아니라 잡음이라
 * 어느 게 상위인지 눈으로 구분되지 않았다(그래서 예전에 13px 로 줬다가 역전이 나서 15px 로
 * 올린 이력이 있다. 크기만으로는 이 문제가 안 풀린다).
 *
 * 영역 라벨은 제목이 아니라 **구조 표지**다. 그래서 작게·대문자·자간·흐리게 — 내비 레일이
 * '사실 / 산출물' 을 이미 같은 방식으로 표시하고 있어서 이 화면 안에서 일관된다.
 * 결과: 화면 16px 반굵게 / 영역 12px 대문자 표지 / 그룹 14px 반굵게 — 서로 다투지 않는다.
 */
function AreaDivider({ label, hint, tone = "neutral" }: { label: string; hint: string; tone?: "neutral" | "danger" }) {
  return (
    <div className="border-t border-border pt-6">
      <h2
        className={`text-[11.5px] font-semibold uppercase tracking-[0.12em] ${
          // 위험 구역만 표지 자체가 경고여야 한다 — 흐린 회색이면 지나친다
          tone === "danger" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {label}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{hint}</p>
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
  /**
   * 패딩은 **이 컨테이너 한 곳**이 소유한다.
   *
   * 예전엔 자식마다 달랐다: BasicInfoTab 은 자기 p-4/sm:p-6/lg:p-8 + max-w-2xl,
   * SessionsTab 은 패딩이 **아예 없어서**(루트가 grid grid-cols-12) 진행 순서가 화면 끝에 붙었고,
   * 브랜드만 부모가 감쌌다. 그 결과 구분선 두 개가 서로 다른 폭에서 끝나 정렬되지 않았다.
   * 이제 구분선은 전부 컨테이너 폭이고, 좁아야 하는 내용만 자기 안에서 max-w-2xl 을 쓴다.
   */
  return (
    <div className="space-y-8 px-4 pb-10 sm:px-6 lg:px-8">
      {/* 정체성·일정 — embedded 로 자기 패딩·위험 구역을 끈다(둘 다 이 화면이 소유) */}
      <BasicInfoTab webinar={webinar} onSilentUpdate={onSilentUpdate} embedded />

      <AreaDivider
        label="진행 순서"
        hint="랜딩 카드·타임테이블·대기 화면 아젠다·시청 화면이 모두 이 표를 읽어가요."
      />
      <SessionsTab webinarId={webinar.id} sessions={webinar.sessions} onUpdate={onUpdate} />

      <AreaDivider label="브랜드" hint="한 번 정하면 공개 화면 전체가 같은 색과 폰트를 씁니다." />
      <div className="max-w-2xl">
        <BrandSection webinarId={webinar.id} theme={webinar.theme} onSilentUpdate={onSilentUpdate} />
      </div>

      {/* 위험 구역은 화면 **맨 끝**에만 — 예전엔 BasicInfoTab 안에 있어서 '웨비나 삭제' 가
          진행 순서 구분선 바로 위, 세션을 편집하러 스크롤하는 경로에 끼어 있었다. */}
      <AreaDivider label="위험 구역" hint="되돌릴 수 없는 작업이에요." tone="danger" />
      <WebinarDangerZone webinar={{ id: webinar.id, name: webinar.name }} />
    </div>
  );
}
