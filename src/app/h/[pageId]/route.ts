/**
 * 홈페이지 **페이지 통짜** 임베드 로더.
 *
 *   <script async src="https://machstudio.vercel.app/h/{PAGE_ID}"></script>
 *   <div data-mach-expo></div>
 *
 * 경로가 짧은 이유(`/h/`): 아임웹 편집기에 손으로 붙여 넣는 값이라 짧을수록 오타가 준다.
 * `proxy.ts` 공개 경로에 등록돼 있어야 비로그인 방문자에게 리다이렉트되지 않는다.
 */
import { expoLoaderOptions, serveExpoRuntime } from "./loader";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return expoLoaderOptions();
}

export async function GET(req: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  return serveExpoRuntime(req, { pageId });
}
