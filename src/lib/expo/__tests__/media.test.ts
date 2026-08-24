import { describe, expect, it } from "vitest";
import {
  collectExpoMediaUrls, copyExpoMedia, expoSitePrefix, expoTemplatePrefix, expoUrlCodec,
  isSafeExpoPrefix, isUnderExpoPrefix, purgeExpoMediaPrefix, rewriteExpoMediaUrls,
  type ExpoStorage, type MediaCarrier,
} from "@/lib/expo/media";

/**
 * 템플릿 미디어의 수명 분리.
 *
 * 여기서 지키는 것은 두 가지다. **다음 전시가 옛 전시 파일에 매달리지 않는 것**,
 * 그리고 **원본 파일을 절대 지우지 않는 것**. 후자가 더 중요하다 — 복사 실패는 다시
 * 시도하면 되지만, 원본 삭제는 되돌릴 수 없다.
 */

const SUPABASE = "https://proj.supabase.co";
const BUCKET = "webinar-assets";
const codec = expoUrlCodec(SUPABASE, BUCKET);
const url = (path: string) => codec.publicUrl(path);

const SITE = expoSitePrefix("ws1", "site1");
const TEMPLATE = expoTemplatePrefix("ws1", "tpl1");

interface FakeOptions {
  objects?: string[];
  failCopyAt?: number;
  failRemove?: boolean;
  failList?: boolean;
  /** list 가 접두사 밖 경로를 섞어 돌려주는 상황 — 버그든 조작이든. */
  listExtra?: string[];
}

function fakeStorage(options: FakeOptions = {}) {
  const objects = new Set(options.objects ?? []);
  const calls = { copy: [] as Array<[string, string]>, remove: [] as string[][], list: [] as string[] };
  let copies = 0;

  const storage: ExpoStorage = {
    ...codec,
    async copy(from, to) {
      copies += 1;
      if (options.failCopyAt === copies) return { error: "copy failed" };
      calls.copy.push([from, to]);
      objects.add(to);
      return { error: null };
    },
    async remove(paths) {
      calls.remove.push(paths);
      if (options.failRemove) return { error: "remove failed" };
      for (const p of paths) objects.delete(p);
      return { error: null };
    },
    async list(prefix) {
      calls.list.push(prefix);
      if (options.failList) return { paths: [], error: "list failed" };
      const inside = [...objects].filter((p) => p.startsWith(prefix));
      return { paths: [...inside, ...(options.listExtra ?? [])], error: null };
    },
  };
  return { storage, objects, calls };
}

/** 이름을 고정한다 — 실제로는 UUID 다. */
function sequentialNames() {
  let n = 0;
  return () => `new${++n}`;
}

describe("우리 Storage 주소를 알아본다", () => {
  it("우리가 만든 공개 주소는 경로로 푼다", () => {
    expect(codec.pathFromUrl(url("ws1/expo/site1/a.jpg"))).toBe("ws1/expo/site1/a.jpg");
  });

  /** 캐시 무효화 쿼리가 붙어도 같은 파일이다. */
  it("쿼리·프래그먼트는 경로가 아니다", () => {
    expect(codec.pathFromUrl(`${url("ws1/expo/site1/a.jpg")}?t=1`)).toBe("ws1/expo/site1/a.jpg");
    expect(codec.pathFromUrl(`${url("ws1/expo/site1/a.jpg")}#x`)).toBe("ws1/expo/site1/a.jpg");
  });

  it("남의 호스트·다른 버킷은 외부다", () => {
    expect(codec.pathFromUrl("https://cdn.example.com/a.jpg")).toBeNull();
    expect(codec.pathFromUrl(`${SUPABASE}/storage/v1/object/public/other-bucket/a.jpg`)).toBeNull();
  });

  /**
   * 커스텀 도메인으로 같은 버킷에 닿는 주소도 **외부로 본다**. 잘못 소유로 보는 쪽이
   * 잘못 외부로 보는 쪽보다 위험하다 — 소유로 보면 지우는 코드가 닿는다.
   */
  it("우리가 만들지 않은 주소 모양은 소유를 주장하지 않는다", () => {
    expect(codec.pathFromUrl(`https://cdn.mach.kr/storage/v1/object/public/${BUCKET}/a.jpg`)).toBeNull();
  });

  it("경로 탈출·깨진 인코딩은 거절한다", () => {
    expect(codec.pathFromUrl(url("ws1/expo/site1/../../secret.jpg"))).toBeNull();
    expect(codec.pathFromUrl(url("ws1/expo/site1/%2e%2e/x.jpg"))).toBeNull();
    expect(codec.pathFromUrl(url("ws1/expo/site1/%E0%A4%A.jpg"))).toBeNull();
    expect(codec.pathFromUrl(url(""))).toBeNull();
  });
});

describe("접두사 소유", () => {
  it("경로 규칙", () => {
    expect(SITE).toBe("ws1/expo/site1/");
    expect(TEMPLATE).toBe("ws1/expo-templates/tpl1/");
  });

  it("바로 아래 파일만 소유로 본다", () => {
    expect(isUnderExpoPrefix("ws1/expo/site1/a.jpg", SITE)).toBe(true);
    expect(isUnderExpoPrefix("ws1/expo/site2/a.jpg", SITE)).toBe(false);
    expect(isUnderExpoPrefix("ws2/expo/site1/a.jpg", SITE)).toBe(false);
    expect(isUnderExpoPrefix("ws1/expo/site1/nested/a.jpg", SITE)).toBe(false);
    expect(isUnderExpoPrefix("ws1/expo/site1/", SITE)).toBe(false);
  });

  /** 넓은 접두사가 삭제로 넘어가면 버킷을 훑어 지운다 — 모양을 정확히 요구한다. */
  it("삭제해도 되는 접두사 모양을 좁게 잡는다", () => {
    expect(isSafeExpoPrefix(SITE)).toBe(true);
    expect(isSafeExpoPrefix(TEMPLATE)).toBe(true);
    for (const bad of ["", "/", "ws1/", "ws1/expo/", "ws1/expo/site1", "ws1/other/site1/", "../expo/x/"]) {
      expect(`${bad}: ${isSafeExpoPrefix(bad)}`).toBe(`${bad}: false`);
    }
  });
});

// ── 슬롯을 걷는다 ───────────────────────────────────────────────────────

const sections = (): MediaCarrier[] => [
  {
    type: "kv",
    content: {
      title: { ko: "제목" },
      media: { kind: "image", url: url("ws1/expo/site1/hero.jpg"), alt: "히어로" },
    },
  },
  {
    type: "cardgrid",
    content: {
      items: [
        { title: { ko: "1" }, media: { kind: "image", url: url("ws1/expo/site1/card.png") } },
        // 히어로와 **같은 파일**을 다시 쓴다 — 한 번만 복사되어야 한다.
        { title: { ko: "2" }, media: { kind: "image", url: url("ws1/expo/site1/hero.jpg") } },
        { title: { ko: "3" }, media: { kind: "image", url: "https://cdn.example.com/outside.jpg" } },
      ],
    },
  },
  {
    // 붙여넣은 코드 안의 주소는 우리 것이 아니다 — 걷지도, 바꾸지도 않는다.
    type: "custom-code",
    content: { code: `<img src="${url("ws1/expo/site1/inside-code.jpg")}">` },
  },
];

describe("미디어 주소 수집", () => {
  it("리스트 안쪽까지 재귀로 걷고, 중복은 한 번만 센다", () => {
    expect(collectExpoMediaUrls(sections())).toEqual([
      url("ws1/expo/site1/hero.jpg"),
      url("ws1/expo/site1/card.png"),
      "https://cdn.example.com/outside.jpg",
    ]);
  });

  /**
   * **핵심.** 콘텐츠 JSON 전체를 문자열로 훑으면 `code` 슬롯 안의 주소까지 복사·치환된다.
   * 그건 운영자가 붙여넣은 남의 코드이고 우리가 소유하지 않는다.
   */
  it("code 슬롯 안의 주소는 미디어가 아니다", () => {
    expect(collectExpoMediaUrls(sections())).not.toContain(url("ws1/expo/site1/inside-code.jpg"));
  });

  it("모르는 타입·콘텐츠 없는 섹션은 건너뛴다", () => {
    expect(collectExpoMediaUrls([{ type: "nope", content: { media: { kind: "image", url: url("a/expo/b/x.jpg") } } }]))
      .toEqual([]);
    expect(collectExpoMediaUrls([{ type: "kv" }])).toEqual([]);
  });
});

describe("미디어 주소 치환", () => {
  it("표에 있는 것만 바꾸고, 같은 주소는 전부 바꾼다", () => {
    const map = new Map([[url("ws1/expo/site1/hero.jpg"), url("ws1/expo-templates/tpl1/new1.jpg")]]);
    const out = rewriteExpoMediaUrls(sections(), map);

    expect((out[0].content!.media as { url: string }).url).toBe(url("ws1/expo-templates/tpl1/new1.jpg"));
    const items = out[1].content!.items as Array<{ media: { url: string } }>;
    expect(items[1].media.url).toBe(url("ws1/expo-templates/tpl1/new1.jpg"));
    // 표에 없는 것은 그대로 — 외부 주소가 그렇다.
    expect(items[0].media.url).toBe(url("ws1/expo/site1/card.png"));
    expect(items[2].media.url).toBe("https://cdn.example.com/outside.jpg");
  });

  /** 이 함수의 일은 주소를 다시 가리키는 것뿐이다. 콘텐츠를 지우면 안 된다. */
  it("다른 슬롯과 alt·카탈로그 밖 키는 그대로 둔다", () => {
    const map = new Map([[url("ws1/expo/site1/hero.jpg"), url("ws1/expo-templates/tpl1/new1.jpg")]]);
    const src: MediaCarrier[] = [{
      type: "kv",
      content: {
        title: { ko: "제목" },
        legacyKey: "보존",
        media: { kind: "image", url: url("ws1/expo/site1/hero.jpg"), alt: "히어로" },
      },
    }];
    const media = rewriteExpoMediaUrls(src, map)[0].content!.media as { alt: string };
    expect(media.alt).toBe("히어로");
    expect(rewriteExpoMediaUrls(src, map)[0].content!.title).toEqual({ ko: "제목" });
    expect(rewriteExpoMediaUrls(src, map)[0].content!.legacyKey).toBe("보존");
    expect(rewriteExpoMediaUrls(src, map)[0].content!.code).toBeUndefined();
  });

  it("code 슬롯 안의 주소는 치환하지 않는다", () => {
    const map = new Map([[url("ws1/expo/site1/inside-code.jpg"), url("ws1/expo-templates/tpl1/new9.jpg")]]);
    expect(rewriteExpoMediaUrls(sections(), map)[2].content!.code)
      .toContain(url("ws1/expo/site1/inside-code.jpg"));
  });

  it("빈 표면 원본을 그대로 돌려준다", () => {
    expect(rewriteExpoMediaUrls(sections(), new Map())[0].content!.media)
      .toEqual({ kind: "image", url: url("ws1/expo/site1/hero.jpg"), alt: "히어로" });
  });
});

// ── 복사 ────────────────────────────────────────────────────────────────

describe("소유한 미디어만 새 접두사로 복사한다", () => {
  it("사이트 → 템플릿: 소유한 것만, 중복은 한 번만", async () => {
    const { storage, calls } = fakeStorage({ objects: ["ws1/expo/site1/hero.jpg", "ws1/expo/site1/card.png"] });
    const result = await copyExpoMedia(storage, {
      urls: collectExpoMediaUrls(sections()),
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });

    expect(result.ok).toBe(true);
    expect(calls.copy).toEqual([
      ["ws1/expo/site1/hero.jpg", "ws1/expo-templates/tpl1/new1.jpg"],
      ["ws1/expo/site1/card.png", "ws1/expo-templates/tpl1/new2.png"],
    ]);
    expect(result.copied).toEqual(["ws1/expo-templates/tpl1/new1.jpg", "ws1/expo-templates/tpl1/new2.png"]);
  });

  /** 템플릿 → 새 사이트도 같은 함수다. 방향만 다르다. */
  it("템플릿 → 사이트도 같은 규칙으로 돈다", async () => {
    const { storage, calls } = fakeStorage();
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo-templates/tpl1/a.webp")],
      sourcePrefix: TEMPLATE, destPrefix: expoSitePrefix("ws2", "site9"), newObjectName: sequentialNames(),
    });
    expect(result.ok).toBe(true);
    expect(calls.copy).toEqual([["ws1/expo-templates/tpl1/a.webp", "ws2/expo/site9/new1.webp"]]);
  });

  it("외부 주소는 그대로 두고 체크리스트에 올린다", async () => {
    const { storage, calls } = fakeStorage();
    const result = await copyExpoMedia(storage, {
      urls: ["https://cdn.example.com/outside.jpg"],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(calls.copy).toEqual([]);
    expect(result.map.size).toBe(0);
    expect(result.notCopied).toEqual([{ url: "https://cdn.example.com/outside.jpg", reason: "external" }]);
  });

  /**
   * service-role 은 버킷 전체를 읽는다. 운영자가 다른 사이트 이미지 주소를 붙여넣었다면
   * 복사는 **경계를 넘는 읽기**가 된다 — 그대로 두고 사람에게 알린다.
   */
  it("우리 Storage 라도 원본 접두사 밖이면 복사하지 않는다", async () => {
    const { storage, calls } = fakeStorage();
    const foreign = url("ws2/expo/site7/other.jpg");
    const result = await copyExpoMedia(storage, {
      urls: [foreign, url("ws1/expo/site2/sibling.jpg")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(calls.copy).toEqual([]);
    expect(result.notCopied.map((n) => n.reason)).toEqual(["foreign-owner", "foreign-owner"]);
  });

  it("모르는 확장자는 손대지 않는다", async () => {
    const { storage, calls } = fakeStorage();
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/a.svg"), url("ws1/expo/site1/noext")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(calls.copy).toEqual([]);
    expect(result.notCopied.map((n) => n.reason)).toEqual(["unsupported-format", "unsupported-format"]);
  });

  it("접두사 모양이 이상하면 아무것도 복사하지 않는다", async () => {
    const { storage, calls } = fakeStorage();
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/hero.jpg")],
      sourcePrefix: SITE, destPrefix: "ws1/", newObjectName: sequentialNames(),
    });
    expect(result.ok).toBe(false);
    expect(calls.copy).toEqual([]);
  });
});

// ── 보상 ────────────────────────────────────────────────────────────────

describe("실패하면 이번 작업이 만든 것만 지운다", () => {
  it("복사 도중 실패하면 멈추고, 앞서 만든 것만 지운다", async () => {
    const { storage, calls, objects } = fakeStorage({
      objects: ["ws1/expo/site1/hero.jpg", "ws1/expo/site1/card.png"],
      failCopyAt: 2,
    });
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/hero.jpg"), url("ws1/expo/site1/card.png")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });

    expect(result.ok).toBe(false);
    expect(result.copied).toEqual(["ws1/expo-templates/tpl1/new1.jpg"]);

    const cleaned = await result.cleanup();
    expect(cleaned).toEqual({ ok: true, orphans: [] });
    expect(calls.remove).toEqual([["ws1/expo-templates/tpl1/new1.jpg"]]);
    // 원본은 그대로다.
    expect(objects.has("ws1/expo/site1/hero.jpg")).toBe(true);
    expect(objects.has("ws1/expo/site1/card.png")).toBe(true);
  });

  /** DB 트랜잭션이 뒤에서 실패하는 경우 — 복사는 성공했지만 되돌려야 한다. */
  it("성공한 뒤에도 보상할 수 있다", async () => {
    const { storage, objects } = fakeStorage({ objects: ["ws1/expo/site1/hero.jpg"] });
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/hero.jpg")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(objects.has("ws1/expo-templates/tpl1/new1.jpg")).toBe(true);

    expect(await result.cleanup()).toEqual({ ok: true, orphans: [] });
    expect(objects.has("ws1/expo-templates/tpl1/new1.jpg")).toBe(false);
    expect(objects.has("ws1/expo/site1/hero.jpg")).toBe(true);
  });

  /** 지우기까지 실패하면 성공이라고 말하지 않는다 — 고아 경로에 이름을 남긴다. */
  it("보상 삭제가 실패하면 고아 경로를 돌려준다", async () => {
    const { storage } = fakeStorage({ objects: ["ws1/expo/site1/hero.jpg"], failRemove: true });
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/hero.jpg")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(await result.cleanup()).toEqual({ ok: false, orphans: ["ws1/expo-templates/tpl1/new1.jpg"] });
  });

  /**
   * `copied` 는 결과 객체에 그대로 노출된다 — 호출부가 두 작업의 경로를 합치다가
   * 남의 경로를 밀어 넣을 수 있다. 그래도 목적지 접두사 밖은 지우지 않는다.
   */
  it("목록에 접두사 밖 경로가 섞여도 지우지 않는다", async () => {
    const { storage, calls, objects } = fakeStorage({ objects: ["ws1/expo/site1/hero.jpg"] });
    const result = await copyExpoMedia(storage, {
      urls: [url("ws1/expo/site1/hero.jpg")],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    result.copied.push("ws1/expo/site1/hero.jpg", "ws1/expo-templates/tpl2/x.jpg");

    expect(await result.cleanup()).toEqual({ ok: true, orphans: [] });
    expect(calls.remove).toEqual([["ws1/expo-templates/tpl1/new1.jpg"]]);
    expect(objects.has("ws1/expo/site1/hero.jpg")).toBe(true);
  });

  it("만든 것이 없으면 삭제를 호출하지 않는다", async () => {
    const { storage, calls } = fakeStorage();
    const result = await copyExpoMedia(storage, {
      urls: ["https://cdn.example.com/a.jpg"],
      sourcePrefix: SITE, destPrefix: TEMPLATE, newObjectName: sequentialNames(),
    });
    expect(await result.cleanup()).toEqual({ ok: true, orphans: [] });
    expect(calls.remove).toEqual([]);
  });
});

// ── 영구 삭제 ───────────────────────────────────────────────────────────

describe("템플릿 영구 삭제", () => {
  it("자기 접두사 안만 지운다", async () => {
    const { storage, objects, calls } = fakeStorage({
      objects: ["ws1/expo-templates/tpl1/a.jpg", "ws1/expo-templates/tpl1/b.png", "ws1/expo/site1/hero.jpg"],
    });
    expect(await purgeExpoMediaPrefix(storage, TEMPLATE)).toEqual({ ok: true, orphans: [] });
    expect(calls.remove).toEqual([[ "ws1/expo-templates/tpl1/a.jpg", "ws1/expo-templates/tpl1/b.png" ]]);
    // 원본 사이트 파일은 살아 있다 — 이게 이 절의 존재 이유다.
    expect(objects.has("ws1/expo/site1/hero.jpg")).toBe(true);
  });

  /** 목록에 접두사 밖 경로가 섞여 와도 지우지 않는다. 되돌릴 수 없는 실수다. */
  it("목록이 접두사 밖 경로를 줘도 지우지 않는다", async () => {
    const { storage, calls } = fakeStorage({
      objects: ["ws1/expo-templates/tpl1/a.jpg"],
      listExtra: ["ws1/expo/site1/hero.jpg", "ws1/expo-templates/tpl1/nested/x.jpg"],
    });
    await purgeExpoMediaPrefix(storage, TEMPLATE);
    expect(calls.remove).toEqual([["ws1/expo-templates/tpl1/a.jpg"]]);
  });

  it("이상한 접두사면 목록도 보지 않는다", async () => {
    const { storage, calls } = fakeStorage();
    expect(await purgeExpoMediaPrefix(storage, "ws1/")).toEqual({ ok: false, orphans: ["ws1/"] });
    expect(calls.list).toEqual([]);
    expect(calls.remove).toEqual([]);
  });

  it("목록·삭제가 실패하면 실패로 돌려준다", async () => {
    const failList = fakeStorage({ failList: true });
    expect(await purgeExpoMediaPrefix(failList.storage, TEMPLATE)).toEqual({ ok: false, orphans: [TEMPLATE] });

    const failRemove = fakeStorage({ objects: ["ws1/expo-templates/tpl1/a.jpg"], failRemove: true });
    expect(await purgeExpoMediaPrefix(failRemove.storage, TEMPLATE))
      .toEqual({ ok: false, orphans: ["ws1/expo-templates/tpl1/a.jpg"] });
  });

  it("빈 접두사는 성공이다 — 지울 것이 없다", async () => {
    const { storage, calls } = fakeStorage();
    expect(await purgeExpoMediaPrefix(storage, TEMPLATE)).toEqual({ ok: true, orphans: [] });
    expect(calls.remove).toEqual([]);
  });
});
