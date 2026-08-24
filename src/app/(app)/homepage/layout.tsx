import { notFound } from "next/navigation";
import { getExpoCapabilities } from "@/lib/expo/capability";
import { probeExpoSchema } from "@/lib/expo/schema-probe";

/**
 * 홈페이지 화면의 **자기 게이트**.
 *
 * 사이드바에서 메뉴를 숨기는 것과 별개로 여기서 다시 확인한다 — 메뉴를 숨기는 것은
 * 인가가 아니고, 주소를 직접 치면 그대로 들어온다. 스키마가 없는 배포에서 이 아래
 * 화면이 렌더되면 Expo 델리게이트를 부르는 순간 500 이 되고, 그건 "아직 없는 화면" 을
 * 보여주는 것보다 나쁘다.
 *
 * 준비 안 됐을 때 **404** 다. 503 은 "그 기능이 존재한다" 를 알려 주는데, 아직 아무에게도
 * 공개하지 않은 기능이라 그 사실조차 밖으로 나갈 이유가 없다.
 */
export const dynamic = "force-dynamic";

export default async function HomepageLayout({ children }: { children: React.ReactNode }) {
  const caps = await getExpoCapabilities({ probe: probeExpoSchema });
  if (!caps.admin) notFound();
  return <>{children}</>;
}
