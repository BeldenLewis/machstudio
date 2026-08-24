/**
 * `ExpoStorage` 의 Supabase 구현 — media.ts 를 Supabase 에서 떼어 놓기 위한 얇은 층.
 *
 * media.ts 가 어댑터를 받는 이유는 테스트가 아니라 **안전**이다. 복사·삭제 규칙(접두사 밖은
 * 건드리지 않는다)을 Storage SDK 없이 그대로 실행해 볼 수 있어야, 그 규칙이 실제로 도는지
 * 확인할 수 있다.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ASSET_BUCKET } from "@/lib/webinar-asset-bucket";
import { expoUrlCodec, type ExpoStorage } from "@/lib/expo/media";

/** 한 번에 받아 오는 개수 — Supabase 기본 상한과 같다. */
const PAGE = 100;

export function createExpoStorage(): ExpoStorage {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL 환경변수가 설정되지 않았습니다.");

  const codec = expoUrlCodec(supabaseUrl, ASSET_BUCKET);
  const bucket = () => createAdminClient().storage.from(ASSET_BUCKET);

  return {
    ...codec,

    async copy(from, to) {
      const { error } = await bucket().copy(from, to);
      return { error: error ? error.message : null };
    },

    async remove(paths) {
      if (paths.length === 0) return { error: null };
      const { error } = await bucket().remove(paths);
      return { error: error ? error.message : null };
    },

    async list(prefix) {
      // Supabase 는 폴더 경로를 슬래시 없이 받고, `name` 은 그 안의 파일명만 준다.
      const folder = prefix.replace(/\/+$/, "");
      const paths: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await bucket().list(folder, { limit: PAGE, offset });
        if (error) return { paths, error: error.message };
        for (const entry of data ?? []) {
          // 하위 폴더 항목은 id 가 없다 — 파일만 담는다.
          if (entry.id) paths.push(`${folder}/${entry.name}`);
        }
        if (!data || data.length < PAGE) break;
      }
      return { paths, error: null };
    },
  };
}
