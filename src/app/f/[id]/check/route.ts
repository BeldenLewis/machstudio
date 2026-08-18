/**
 * 등록 확인(Find My QR) 임베드 로더 (설계 §10·§17).
 *
 *   <script async src="https://machstudio.vercel.app/f/{SOURCE_ID}/check"></script>
 *   <div data-mach-form-check></div>
 *
 * 아임웹의 `Registration Check` 탭에 붙는다. 등록 폼과 **같은 번들**을 서빙하고 boot 의
 * view 만 다르다 — 두 탭을 다 붙인 사이트에서 두 번째 스크립트는 캐시에서 온다.
 */
import { loaderOptions, serveFormRuntime } from "../loader";

export async function OPTIONS() {
  return loaderOptions();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveFormRuntime(req, id, "check");
}
