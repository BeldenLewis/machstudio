/**
 * 홈페이지 미디어의 **수명 분리** — 템플릿이 원본 전시의 파일에 매달리지 않게 한다.
 *
 * ── 왜 복사하나 ───────────────────────────────────────────────────────
 * 템플릿은 워크스페이스에 남아 **다음 전시가 쓴다**. 스냅샷이 옛 사이트의 Storage 주소를
 * 그대로 들고 가면, 그 사이트를 지우거나 이미지를 갈아끼우는 순간 다음 전시 홈페이지의
 * 사진이 사라지거나 **지난 전시 사진으로 바뀐다.** 파트너 사이트에 이미 박힌 코드에서
 * 그 일이 벌어지므로, 우리가 소유한 파일은 템플릿 자기 경로로 복사해 끊어 둔다.
 *
 * ── 왜 문자열 치환이 아니라 슬롯을 걷나 ───────────────────────────────
 * 콘텐츠 JSON 전체에서 URL 을 찾아 바꾸면 `code` 슬롯(운영자가 붙여넣은 남의 스크립트)
 * 안의 주소까지 건드린다. 그건 우리가 소유하지 않은 것이고, 복사해서도 안 된다.
 * 그래서 **카탈로그의 `media` 슬롯만** 재귀로 걷는다.
 *
 * ── 왜 원본 접두사 밖은 복사하지 않나 ─────────────────────────────────
 * service-role 클라이언트는 버킷 전체를 읽는다. 운영자가 다른 사이트(혹은 다른 워크스페이스)
 * 이미지 주소를 붙여넣었다면, 복사는 **경계를 넘는 읽기**가 된다. 그래서 우리 Storage 라도
 * 원본 접두사 밖이면 그대로 두고 체크리스트에 올린다 — 사람이 판단할 일이다.
 *
 * ── 보상 삭제 ─────────────────────────────────────────────────────────
 * 복사는 DB 트랜잭션보다 먼저 일어난다(Task 8). 트랜잭션이 실패하면 **이번 작업이 만든
 * 객체만** 지운다. 지우기까지 실패하면 성공이라고 말하지 않고 고아 경로를 돌려준다 —
 * 조용한 고아 파일보다 이름이 남은 고아 파일이 낫다.
 */
import { sectionDef } from "@/lib/expo/registry";
import { collectPluginMediaUrls, rewritePluginMediaUrls } from "@/lib/expo/plugin-content";
import type { SlotDef } from "@/lib/expo/types";

/** 복사해 갈 수 있는 확장자. 업로드 라우트가 만드는 것과 같은 집합이다. */
export const EXPO_MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "svg", "mp4"] as const;

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

// ── 경로 ────────────────────────────────────────────────────────────────

/** 사이트가 소유한 객체의 접두사. `image-guard.expoObjectPrefix` 와 같은 규칙이다. */
export function expoSitePrefix(workspaceId: string, siteId: string): string {
  return `${workspaceId}/expo/${siteId}/`;
}

/** 템플릿이 소유한 객체의 접두사 — 사이트 경로와 **다른 가지**여야 사이트를 지워도 남는다. */
export function expoTemplatePrefix(workspaceId: string, templateId: string): string {
  return `${workspaceId}/expo-templates/${templateId}/`;
}

/**
 * 지우거나 복사해도 되는 접두사인가.
 *
 * 빈 문자열이나 `{ws}/` 같은 넓은 접두사가 삭제로 넘어가면 **버킷을 훑어 지운다.**
 * 그래서 모양을 정확히 요구한다 — 여기 통과 못 하면 어떤 삭제도 시작하지 않는다.
 */
const SAFE_PREFIX = /^[A-Za-z0-9_-]{1,64}\/expo(-templates)?\/[A-Za-z0-9_-]{1,64}\/$/;
export function isSafeExpoPrefix(prefix: string): boolean {
  return SAFE_PREFIX.test(prefix);
}

/** 그 접두사 **바로 아래** 파일인가 — 하위 폴더도, `..` 도 소유로 보지 않는다. */
export function isUnderExpoPrefix(path: string, prefix: string): boolean {
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return rest.length > 0 && !rest.includes("/") && !rest.includes("..");
}

function extensionOf(path: string): string | null {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return (EXPO_MEDIA_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

// ── URL ↔ 경로 ──────────────────────────────────────────────────────────

export interface ExpoUrlCodec {
  publicUrl(path: string): string;
  /** 우리 버킷의 공개 주소면 객체 경로, 아니면 null. */
  pathFromUrl(url: string): string | null;
}

/**
 * Supabase Storage 공개 주소의 왕복.
 *
 * 커스텀 도메인으로 같은 버킷에 닿는 주소는 **외부로 본다** — 우리가 만든 주소가 아니면
 * 소유를 주장하지 않는다. 잘못 소유로 보는 쪽이 잘못 외부로 보는 쪽보다 위험하다.
 */
export function expoUrlCodec(supabaseUrl: string, bucket: string): ExpoUrlCodec {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/`;
  return {
    publicUrl: (path) => base + path,
    pathFromUrl(url) {
      if (typeof url !== "string" || !url.startsWith(base)) return null;
      // 쿼리·프래그먼트는 캐시 무효화용으로 붙는다 — 경로가 아니다.
      const raw = url.slice(base.length).split(/[?#]/)[0];
      let path: string;
      try {
        path = decodeURIComponent(raw);
      } catch {
        return null;                                  // 깨진 인코딩은 소유로 보지 않는다
      }
      if (!path) return null;
      // 정규화된 우리 경로는 이 문자만 쓴다. 그 밖(`..`·역슬래시·제어문자)은 전부 거절.
      if (!/^[A-Za-z0-9._/-]+$/.test(path)) return null;
      if (path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
      return path;
    },
  };
}

// ── 슬롯 걷기 ───────────────────────────────────────────────────────────

/** 섹션의 최소 모양 — 템플릿 스냅샷과 초안 양쪽이 이걸 만족한다. */
export interface MediaCarrier {
  type: string;
  content?: Record<string, unknown>;
}

/** `undefined` 를 돌려주면 그 칸은 **손대지 않는다**. */
type MediaVisitor = (url: string) => string | undefined;

/**
 * `media` 슬롯만 재귀로 걷는다.
 *
 * 카탈로그에 없는 키는 **그대로 둔다** — 이 함수는 정규화 뒤에 도는 것이고, 하는 일은
 * 주소를 다시 가리키는 것뿐이다. 여기서 키를 버리면 복사가 콘텐츠를 지우는 셈이 된다.
 */
function walkMedia(
  slots: readonly SlotDef[],
  content: Record<string, unknown>,
  visit: MediaVisitor,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...content };
  for (const slot of slots) {
    const value = content[slot.key];
    if (value === undefined) continue;
    if (slot.kind === "media") {
      const m = obj(value);
      let changed = false;
      const nextMedia = { ...m };
      for (const key of ["url", "originalUrl"] as const) {
        const url = str(m[key]);
        if (!url) continue;
        const next = visit(url);
        if (next !== undefined) {
          nextMedia[key] = next;
          changed = true;
        }
      }
      if (changed) out[slot.key] = nextMedia;
    } else if (slot.kind === "list" && Array.isArray(value) && slot.itemSlots) {
      out[slot.key] = value.map((row) => walkMedia(slot.itemSlots!, obj(row), visit));
    }
  }
  return out;
}

/** 섹션들이 가리키는 미디어 주소 — 중복 없이, 처음 나온 순서로. */
export function collectExpoMediaUrls(sections: readonly MediaCarrier[]): string[] {
  const seen = new Set<string>();
  for (const section of sections) {
    const def = sectionDef(section.type);
    if (!def || !section.content) continue;
    if (def.normalize) {
      for (const url of collectPluginMediaUrls(section.content)) seen.add(url);
      continue;
    }
    walkMedia(def.slots, section.content, (url) => {
      seen.add(url);
      return undefined;                               // 수집만 한다
    });
  }
  return [...seen];
}

/** 주소표에 있는 것만 바꾼다. 없는 주소는 그대로 둔다(외부 링크가 그렇다). */
export function rewriteExpoMediaUrls<S extends MediaCarrier>(
  sections: readonly S[],
  map: ReadonlyMap<string, string>,
): S[] {
  if (map.size === 0) return [...sections];
  return sections.map((section) => {
    const def = sectionDef(section.type);
    if (!def || !section.content) return section;
    if (def.normalize) {
      return { ...section, content: rewritePluginMediaUrls(section.content, map) };
    }
    return { ...section, content: walkMedia(def.slots, section.content, (url) => map.get(url)) };
  });
}

// ── Storage 작업 ────────────────────────────────────────────────────────

export interface ExpoStorage extends ExpoUrlCodec {
  copy(from: string, to: string): Promise<{ error: string | null }>;
  remove(paths: string[]): Promise<{ error: string | null }>;
  list(prefix: string): Promise<{ paths: string[]; error: string | null }>;
}

/** 복사하지 않은 이유 — 각각 사람이 할 일이 다르다. */
export type NotCopiedReason =
  /** 우리 Storage 가 아니다. 그 호스트가 지우면 같이 사라진다. */
  | "external"
  /** 우리 Storage 지만 원본 사이트 것이 아니다. 경계를 넘지 않는다. */
  | "foreign-owner"
  /** 우리 것이지만 확장자를 알 수 없다. 손대지 않는다. */
  | "unsupported-format";

export interface NotCopiedMedia {
  url: string;
  reason: NotCopiedReason;
}

export interface CleanupOutcome {
  ok: boolean;
  /** 지우지 못한 경로 — 호출부가 로그로 남긴다. */
  orphans: string[];
}

export interface MediaCopyOutcome {
  ok: boolean;
  error?: string;
  /** 원본 URL → 새 URL. **복사에 성공한 것만** 들어간다. */
  map: Map<string, string>;
  /** 이번 작업이 만든 객체 경로. 보상 삭제의 **유일한** 대상이다. */
  copied: string[];
  notCopied: NotCopiedMedia[];
  cleanup: () => Promise<CleanupOutcome>;
}

/**
 * 소유한 미디어를 새 접두사로 복사한다.
 *
 * 하나라도 실패하면 **거기서 멈추고** `ok:false` 로 돌려준다. 던지지 않는 이유는
 * 그때까지 만든 객체 목록과 `cleanup` 을 호출부에 줘야 하기 때문이다 —
 * 예외로 빠져나가면 보상할 대상을 잃는다.
 */
export async function copyExpoMedia(
  storage: ExpoStorage,
  input: {
    urls: readonly string[];
    sourcePrefix: string;
    destPrefix: string;
    /** 테스트에서 고정한다. 기본은 새 UUID — 새 파일은 새 이름이어야 한다. */
    newObjectName?: () => string;
  },
): Promise<MediaCopyOutcome> {
  const { sourcePrefix, destPrefix } = input;
  const newName = input.newObjectName ?? (() => crypto.randomUUID());

  const map = new Map<string, string>();
  const copied: string[] = [];
  const notCopied: NotCopiedMedia[] = [];

  const cleanup = async (): Promise<CleanupOutcome> => {
    // 이번 작업이 만든 것 중, **목적지 접두사 안**인 것만. 방어를 두 번 한다.
    const safe = copied.filter((p) => isUnderExpoPrefix(p, destPrefix));
    if (safe.length === 0) return { ok: true, orphans: [] };
    const { error } = await storage.remove(safe);
    return error ? { ok: false, orphans: safe } : { ok: true, orphans: [] };
  };

  if (!isSafeExpoPrefix(destPrefix) || !isSafeExpoPrefix(sourcePrefix)) {
    return { ok: false, error: "저장 경로가 올바르지 않습니다", map, copied, notCopied, cleanup };
  }

  for (const url of new Set(input.urls)) {
    const path = storage.pathFromUrl(url);
    if (!path) { notCopied.push({ url, reason: "external" }); continue; }
    if (!isUnderExpoPrefix(path, sourcePrefix)) { notCopied.push({ url, reason: "foreign-owner" }); continue; }
    const ext = extensionOf(path);
    if (!ext) { notCopied.push({ url, reason: "unsupported-format" }); continue; }

    const dest = `${destPrefix}${newName()}.${ext}`;
    const { error } = await storage.copy(path, dest);
    if (error) return { ok: false, error, map, copied, notCopied, cleanup };
    copied.push(dest);
    map.set(url, storage.publicUrl(dest));
  }

  return { ok: true, map, copied, notCopied, cleanup };
}

/**
 * 접두사 하나를 통째로 비운다 — 템플릿 영구 삭제가 쓴다.
 *
 * 목록에 접두사 밖 경로가 섞여 오면(버그든 조작이든) **그건 지우지 않는다.**
 * 원본 사이트 파일을 지우는 실수는 되돌릴 수 없다.
 */
export async function purgeExpoMediaPrefix(
  storage: ExpoStorage,
  prefix: string,
): Promise<CleanupOutcome> {
  if (!isSafeExpoPrefix(prefix)) return { ok: false, orphans: [prefix] };

  const listed = await storage.list(prefix);
  if (listed.error) return { ok: false, orphans: [prefix] };

  const safe = listed.paths.filter((p) => isUnderExpoPrefix(p, prefix));
  if (safe.length === 0) return { ok: true, orphans: [] };

  const { error } = await storage.remove(safe);
  return error ? { ok: false, orphans: safe } : { ok: true, orphans: [] };
}
