import { ExpoCreateChoices } from "@/components/expo/ExpoCreateChoices";

/**
 * 홈페이지 만들기.
 *
 * 여기서 만드는 것은 **전부 비공개**다 — 발행도, 공개 스위치도, 아임웹 연결도 하지 않는다.
 * 그래서 이 화면에 "위험한" 버튼이 없고, 확인 단계도 두지 않는다.
 */
export const dynamic = "force-dynamic";

export default function NewHomepagePage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8 lg:px-8">
      <h1 className="text-xl font-semibold tracking-tight">홈페이지 만들기</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        빈 사이트로 시작하거나, 저장해 둔 템플릿을 골라 쓸 수 있어요.
      </p>
      <ExpoCreateChoices />
    </div>
  );
}
