/**
 * 릴리스 프리플라이트 — `EXPO_PUBLIC_EMBED_RELEASE=on` **첫 배포 전에** 돌린다.
 *
 * 계획서가 요구한 것: "The launch preflight must prove zero pre-armed `liveAt` pages and
 * zero published `embedEnabled=true` sections before the first `on` deployment, so the
 * flag alone cannot expose prepared content."
 *
 * 왜 두 가지인가:
 *  ① `liveAt` 이 켜진 페이지 — 플래그를 켜는 순간 페이지 통짜가 나간다.
 *  ② 발행본에 `embedEnabled=true` 인 구획 — 구획 단독 임베드는 `liveAt` 을 **보지 않으므로**
 *    ①만 봐서는 놓친다(`model.ts` 의 `standaloneSection`).
 *
 * **읽기 전용이다.** 쓰기도 마이그레이션도 하지 않는다.
 *
 *   node --env-file=.env.local scripts/expo-launch-preflight.mjs
 */
import { PrismaClient } from "../src/generated/prisma/index.js";
import { PrismaPg } from "@prisma/adapter-pg";

// `check-expo-schema.mjs` 와 같은 방식으로 붙는다 — 이 저장소는 드라이버 어댑터를 쓴다.
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});

function armedSections(published) {
  const sections = published?.sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((s) => s && typeof s === "object" && s.embedEnabled === true)
    .map((s) => (typeof s.sid === "string" ? s.sid : "(sid 없음)"));
}

try {
  const pages = await prisma.expoPage.findMany({
    where: { deletedAt: null, site: { deletedAt: null } },
    select: {
      id: true, title: true, liveAt: true, published: true,
      site: { select: { name: true } },
    },
  });

  const problems = [];
  let armedTotal = 0;

  for (const p of pages) {
    const where = `${p.site.name} / ${p.title}`;
    if (p.liveAt !== null) {
      problems.push(`① 공개가 켜져 있습니다: ${where} (page ${p.id}, liveAt=${p.liveAt.toISOString()})`);
    }
    const armed = armedSections(p.published);
    armedTotal += armed.length;
    if (armed.length > 0) {
      problems.push(`② 발행본에 따로 내보내기가 켜진 구획: ${where} (page ${p.id}) — ${armed.join(", ")}`);
    }
  }

  console.log(`살아 있는 페이지 ${pages.length}개를 확인했습니다.`);
  console.log(`  · liveAt 켜진 페이지: ${pages.filter((p) => p.liveAt !== null).length}건 (0이어야 함)`);
  console.log(`  · 발행본의 embedEnabled=true 구획: ${armedTotal}건 (0이어야 함)`);

  if (problems.length > 0) {
    console.error("\n릴리스를 켜면 아래가 즉시 노출됩니다:");
    for (const line of problems) console.error(`  ${line}`);
    console.error("\n켜기 전에 전부 내려 주세요. 끄는 것은 릴리스 잠금과 무관하게 언제나 됩니다.");
    process.exit(1);
  }

  console.log("\n통과 — 플래그만 켠다고 노출될 내용이 없습니다.");
} finally {
  await prisma.$disconnect();
}
