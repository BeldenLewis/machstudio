// proxy.ts에서 이미 미인증 사용자는 /로 리다이렉트하므로
// 여기서 추가 auth 체크는 불필요. RSC + 쿠키 동기화 race condition 회피.
import SummaryDashboardClient from "./SummaryDashboardClient";

export default function SummaryDashboardPage() {
  return <SummaryDashboardClient />;
}
