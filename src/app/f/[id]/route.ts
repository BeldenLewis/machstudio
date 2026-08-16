/**
 * 등록 폼 임베드 로더 — 외부 사이트(아임웹 등)에 1줄로 부착한다 (설계 §17).
 *
 *   <script async src="https://machstudio.vercel.app/f/{SOURCE_ID}"></script>
 *   <div data-mach-form></div>
 *
 * 몸통은 ./loader.ts 에 있다 — 등록 확인(/f/{id}/check)과 같은 번들·같은 캐시 정책을 쓴다.
 *
 * 배포 경로가 짧은 이유(/f/): 아임웹 편집기에 손으로 붙여 넣는 값이라 짧을수록 오타가 준다.
 * proxy.ts 공개 경로에 등록돼 있어야 비로그인 방문자에게 리다이렉트되지 않는다.
 */
import { loaderOptions, serveFormRuntime } from "./loader";

export async function OPTIONS() {
  return loaderOptions();
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return serveFormRuntime(req, id, "form");
}
