"use client";

/**
 * 신청 폼 미리보기 검증용 하니스 — **개발 환경 전용**(프로덕션 404).
 *
 * FormPreview 는 로그인 뒤 대회 상세 > 신청 폼 탭에 있고, 그 탭은 DB 에 대회가 있어야
 * 열린다. 그래서 컴포넌트만 격리해 태운다 — choice-harness 와 같은 방식.
 *
 * 확인해야 하는 것:
 *   · 항목 8종(텍스트·이메일·전화·드롭다운·복수·체크박스·이미지·YouTube)이 제 모양으로 나오는가
 *   · 꺼 둔 항목이 빠지고, 필수 표시(*)가 붙는가
 *   · 동의 문구와 기본 체크 상태가 반영되는가
 *   · **입력·제출이 실제로 막혀 있는가** (여기서 참가작이 생기면 안 된다)
 */

import { notFound } from "next/navigation";
import { normalizeCompetitionConfig } from "@/lib/competition-config";
import FormPreview from "@/app/(app)/competition/[slug]/FormPreview";

const CONFIG = normalizeCompetitionConfig(
  {
    form: {
      title: "참가 신청",
      description: "제출 후에는 수정할 수 없어요. 내용을 확인하고 보내주세요.",
      submitLabel: "신청서 제출",
      successMessage: "접수했어요!",
      privacyText: "[필수] 개인정보 수집 및 이용에 동의합니다",
      marketingText: "[선택] 마케팅 정보 수신에 동의합니다",
      privacyBody: "수집 항목: 이름, 이메일, 연락처 / 보유 기간: 대회 종료 후 1년",
      marketingBody: "",
      privacyDefaultChecked: false,
      marketingDefaultChecked: false,
      fields: [
        { id: "1", key: "title", label: "작품명", type: "text", placeholder: "작품 이름", required: true, enabled: true, options: [], system: true },
        { id: "2", key: "email", label: "이메일", type: "email", placeholder: "you@example.com", required: true, enabled: true, options: [], system: true },
        { id: "3", key: "phone", label: "연락처", type: "tel", placeholder: "01012345678", required: true, enabled: true, options: [], system: true },
        { id: "4", key: "category", label: "참가 부문", type: "select", placeholder: "", required: true, enabled: true, options: ["제조", "서비스", "소셜벤처"], system: false },
        { id: "5", key: "interests", label: "관심 분야 (복수)", type: "multiple", placeholder: "", required: false, enabled: true, options: ["AI", "환경", "헬스케어"], system: false },
        { id: "6", key: "agree_rule", label: "대회 규정을 확인했습니다", type: "checkbox", placeholder: "", required: true, enabled: true, options: [], system: false },
        { id: "7", key: "images", label: "작품 이미지", type: "image", placeholder: "", required: false, enabled: true, options: [], system: false, maxFiles: 5 },
        { id: "8", key: "video", label: "영상 링크", type: "youtube", placeholder: "", required: false, enabled: true, options: [], system: false },
        { id: "9", key: "hidden_one", label: "꺼 둔 항목 (안 보여야 함)", type: "text", placeholder: "", required: true, enabled: false, options: [], system: false },
      ],
    },
  },
  { includeDisabled: true },
);

export default function FormPreviewHarness() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-lg font-semibold">신청 폼 미리보기 하니스</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          항목 9개 중 1개는 꺼 둔 상태예요. 미리보기에는 8개만 나와야 합니다.
        </p>
      </div>

      <div className="max-w-[420px]">
        <FormPreview config={CONFIG} theme={{ accentColor: "#7c3aed" }} />
      </div>
    </div>
  );
}
