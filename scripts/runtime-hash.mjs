/**
 * 임베드 번들의 **소스 트리 해시** — 빌드 스크립트와 stale 검사 테스트가 같이 쓴다.
 *
 * 별도 모듈인 이유: 빌드 스크립트는 최상위 await 로 esbuild 를 돌린다. 테스트가 그걸
 * import 하면 테스트를 돌릴 때마다 번들이 다시 구워진다(그리고 그 순간 stale 검사가
 * 무의미해진다 — 검사 대상을 검사가 새로 만들어 버린다).
 *
 * 파일 목록은 **명시적으로 적는다.** import 그래프를 따라가지 않는 이유는 그러려면 번들러를
 * 돌려야 하고, 그건 위와 같은 문제로 되돌아오기 때문이다. 대신 번들에 들어가는 파일을
 * 새로 추가할 때 여기 적는 것을 잊으면 검사가 조용히 통과한다 — 그래서 목록에
 * "왜 이 파일이 여기 있는지" 를 남긴다.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function hashFiles(files) {
  const hash = createHash("sha256");
  // 줄바꿈을 통일해서 넣는다. Windows 체크아웃은 CRLF 라 바이트로 해시하면 리눅스(CI)와
  // 값이 갈린다 — 개발자 기계에서는 stale 검사가 늘 빨갛고, predev 가 번들을 다시 구우면
  // 해시 한 줄만 바뀐 diff 가 매번 생긴다(실측: landing-runtime 이 dev 때마다 수정됨).
  for (const f of files) hash.update(readFileSync(f, "utf8").split("\r\n").join("\n"));
  return "sha256:" + hash.digest("hex").slice(0, 32);
}

/**
 * 타입만 있는 파일은 번들 입력이 아니다 — esbuild 가 통째로 지운다.
 * 목록에 남겨 두면 metafile 대조가 영영 안 맞고, 그 검사를 느슨하게 만들게 된다.
 * (타입 변경은 런타임 출력을 바꾸지 못하므로 빠져도 stale 검사에 구멍이 생기지 않는다.)
 */
const TYPE_ONLY = new Set(["src/lib/landing/types.ts"]);

function dirTs(root, rel) {
  return readdirSync(join(root, rel))
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !TYPE_ONLY.has(`${rel}/${f}`))
    .sort()
    .map((f) => join(root, rel, f));
}

/**
 * 랜딩 런타임의 입력 파일 — 목록과 해시를 나눠 둔다.
 *
 * 목록을 따로 내보내는 이유: 이 목록이 **실제 번들 입력보다 짧으면** stale 검사는 초록인데
 * 커밋된 번들은 낡을 수 있다. 그게 이 검사가 막으려던 바로 그 상황이라, 목록 자체를
 * esbuild metafile 과 대조하는 테스트가 따로 있다(embed-runtime-manifest.test.ts).
 */
export function landingSourceFiles(root) {
  return ([
    join(root, "src/embed/landing-entry.ts"),
    ...dirTs(root, "src/lib/landing"),
    // 랜딩 밖에 있지만 번들에 들어간다 (esbuild metafile 로 실측한 목록)
    join(root, "src/lib/dom/h.ts"),
    join(root, "src/lib/webinar-config.ts"),
    join(root, "src/lib/datetime.ts"),
    // 랜딩 CSS 가 로고 규격을 여기서 가져온다
    join(root, "src/lib/webinar-logo.ts"),
    join(root, "src/lib/webinar-image.ts"),
    join(root, "src/lib/attribution-client.ts"),
    join(root, "src/lib/attribution-normalize.ts"),
    join(root, "src/lib/webinar-share.ts"),
    // 세션·연사 링크 — 랜딩 모델이 쓴다. **목록에 없었다**(metafile 대조로 발견, 2026-08-24).
    join(root, "src/lib/webinar-sessions.ts"),
    join(root, "src/lib/webinar-speaker-links.ts"),
    // 스크롤 잠금 — 랜딩과 홈페이지가 body 하나를 공유하므로 구현이 한 벌이어야 한다.
    join(root, "src/lib/dom/scroll-lock.ts"),
  ]).sort();
}

export function landingSourceHash(root) {
  return hashFiles(landingSourceFiles(root));
}

/** 등록 폼 런타임(src/embed/form-entry.ts + src/lib/collect-form/*) */
export function formSourceFiles(root) {
  return ([
    join(root, "src/embed/form-entry.ts"),
    ...dirTs(root, "src/lib/collect-form"),
    // 폼 밖에 있지만 번들에 들어간다 — 검증 규칙·DOM 빌더·UTM 봉투
    // (esbuild metafile 로 실측했다. 목록이 실제 입력보다 짧으면 검사는 초록인데
    //  커밋된 번들은 낡을 수 있다 — 그게 이 검사가 막으려던 바로 그 상황이다.)
    join(root, "src/lib/collect-form-config.ts"),
    join(root, "src/lib/collect-email.ts"),
    join(root, "src/lib/collect-country.ts"),
    join(root, "src/lib/collect-redirect.ts"),
    join(root, "src/lib/dom/h.ts"),
    join(root, "src/lib/webinar-config.ts"),
    join(root, "src/lib/attribution-client.ts"),
    join(root, "src/lib/attribution-normalize.ts"),
    join(root, "src/lib/webinar-share.ts"),
    // 동의 전문·대회 문구를 거쳐 들어온다. **목록에 없었다**(metafile 대조로 발견, 2026-08-24).
    join(root, "src/lib/competition-render.ts"),
    join(root, "src/lib/competition-strings.ts"),
    join(root, "src/lib/legal-templates/tokens.ts"),
    join(root, "src/lib/legal-templates/types.ts"),
  ]).sort();
}

export function formSourceHash(root) {
  return hashFiles(formSourceFiles(root));
}
