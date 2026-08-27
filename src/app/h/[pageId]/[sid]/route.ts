/**
 * 홈페이지 **구획 하나만** 임베드 로더 — 부분 이행의 수단이다.
 *
 *   <script async src="https://machstudio.vercel.app/h/{PAGE_ID}/{SID}"></script>
 *   <div data-mach-expo-section></div>
 *
 * 페이지의 공개 스위치와 **무관하게** 동작한다: "페이지는 아직인데 히어로만 아임웹에
 * 먼저" 가 그 정의다. 대신 그 구획이 발행본에 있고 `embedEnabled` 가 켜져 있어야 한다.
 */
import { expoLoaderOptions, serveExpoRuntime } from "../loader";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return expoLoaderOptions();
}

export async function GET(req: Request, { params }: { params: Promise<{ pageId: string; sid: string }> }) {
  const { pageId, sid } = await params;
  return serveExpoRuntime(req, { pageId, sid });
}
