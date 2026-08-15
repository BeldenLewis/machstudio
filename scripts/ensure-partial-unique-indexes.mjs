/**
 * 부분 유니크 인덱스 복원·점검 — `prisma db push` 를 실행한 뒤에는 반드시 이걸 돌린다.
 *
 *   node scripts/ensure-partial-unique-indexes.mjs          # 점검만 (아무것도 바꾸지 않음)
 *   node scripts/ensure-partial-unique-indexes.mjs --apply   # 없는 것만 다시 만든다
 *
 * 왜 필요한가:
 *   "조건이 붙은 유니크 제약"들이다. 예를 들어 팝업은 웨비나당 여러 개 있어도 되지만
 *   isActive = true 인 것은 1개만이어야 한다. Prisma 스키마 문법으로는 이 조건을 붙일 수 없어
 *   (@@unique 에 WHERE 를 못 쓴다) SQL 로 직접 만들었고, schema.prisma 에는 주석만 있다.
 *   그래서 `prisma db push` 는 이 인덱스들을 "스키마에 없는 잔재"로 보고 **지운다.**
 *
 * 지워지면 무슨 일이 생기나:
 *   당장은 아무 일도 없다 — 활성화 코드가 "기존 활성 끄기 → 새로 켜기" 순서로 동작하니까.
 *   문제는 라이브 중 두 명이 거의 동시에 조작할 때다. 둘 다 첫 단계를 통과한 뒤 켜서
 *   활성 항목이 2개가 된다(시청자에게 팝업 2개, Q&A 2개 송출 등). 등록 중복 방지도 풀린다.
 *   또 코드가 기대하는 P2002(유니크 위반 → 409 "방금 발행됐어요")가 발생하지 않아
 *   경합 처리 로직 자체가 무력화된다.
 *
 * 왜 `prisma db execute` 를 쓰지 않나:
 *   그 명령은 파일 전체를 한 번에 보내는데, Supabase 풀링 URL(:6543, pgbouncer)에서는
 *   여러 문장을 한 번에 보내면 응답이 오지 않고 멈춘다. 여기서는 문장을 하나씩 보낸다.
 */
import "dotenv/config";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });

/** 기대하는 인덱스 — 이름 → { 용도, 생성 SQL } */
const EXPECTED = {
  WebinarAnnouncement_webinarId_active_key: {
    purpose: "공지 — 웨비나당 활성 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarAnnouncement_webinarId_active_key" ON public."WebinarAnnouncement" USING btree ("webinarId") WHERE "isActive"`,
  },
  WebinarChatMessage_webinarId_pinned_key: {
    purpose: "채팅 고정 — 웨비나당 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarChatMessage_webinarId_pinned_key" ON public."WebinarChatMessage" USING btree ("webinarId") WHERE "isPinned"`,
  },
  WebinarPoll_webinarId_active_key: {
    purpose: "투표 — 웨비나당 활성 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarPoll_webinarId_active_key" ON public."WebinarPoll" USING btree ("webinarId") WHERE "isActive"`,
  },
  WebinarPopup_webinarId_active_key: {
    purpose: "팝업 — 웨비나당 활성 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarPopup_webinarId_active_key" ON public."WebinarPopup" USING btree ("webinarId") WHERE "isActive"`,
  },
  WebinarQA_webinarId_onScreen_key: {
    purpose: "Q&A 화면 송출 — 웨비나당 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarQA_webinarId_onScreen_key" ON public."WebinarQA" USING btree ("webinarId") WHERE "onScreen"`,
  },
  WebinarRegistration_webinarId_email_lower_key: {
    purpose: "중복 등록 방지 — 이메일(대소문자 무시)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarRegistration_webinarId_email_lower_key" ON public."WebinarRegistration" USING btree ("webinarId", lower(email)) WHERE (email IS NOT NULL)`,
  },
  WebinarRegistration_webinarId_phone_key: {
    purpose: "중복 등록 방지 — 전화번호",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarRegistration_webinarId_phone_key" ON public."WebinarRegistration" USING btree ("webinarId", phone) WHERE (phone IS NOT NULL)`,
  },
  WebinarSurvey_webinarId_active_key: {
    purpose: "설문 라이브 푸시 — 웨비나당 활성 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarSurvey_webinarId_active_key" ON public."WebinarSurvey" USING btree ("webinarId") WHERE "isActive"`,
  },
  WebinarTallyPush_webinarId_active_key: {
    purpose: "Tally 푸시 — 웨비나당 활성 1개",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "WebinarTallyPush_webinarId_active_key" ON public."WebinarTallyPush" USING btree ("webinarId") WHERE "isActive"`,
  },
  CollectRecord_sourceId_emailNormalized_key: {
    purpose: "사전등록 중복 방지 — 수집 소스당 이메일(정규화)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_sourceId_emailNormalized_key" ON public."CollectRecord" USING btree ("sourceId", "emailNormalized") WHERE ("emailNormalized" IS NOT NULL)`,
  },
};

const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 환경변수가 없어요 (.env.local 확인)");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows } = await client.query(
  `SELECT indexname FROM pg_indexes
   WHERE schemaname = 'public' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%WHERE%'`,
);
const present = new Set(rows.map((r) => r.indexname));
const missing = Object.keys(EXPECTED).filter((name) => !present.has(name));

console.log(`기대 ${Object.keys(EXPECTED).length}개 / 현재 ${present.size}개\n`);
for (const [name, { purpose }] of Object.entries(EXPECTED)) {
  console.log(`  ${present.has(name) ? "✅" : "❌ 없음"}  ${purpose}`);
}

if (missing.length === 0) {
  console.log("\n전부 정상 — 조치할 것 없음.");
  await client.end();
  process.exit(0);
}

console.log(`\n누락 ${missing.length}개.`);
if (!apply) {
  console.log("복원하려면: node scripts/ensure-partial-unique-indexes.mjs --apply");
  await client.end();
  process.exit(1); // CI 에서 감지할 수 있게 실패로 끝낸다
}

// 중복 데이터가 이미 생겼다면 CREATE 가 실패한다 — 그건 사람이 판단해야 하므로 그대로 알린다.
let failed = 0;
for (const name of missing) {
  try {
    await client.query(EXPECTED[name].sql);
    console.log(`  복원됨: ${name}`);
  } catch (e) {
    failed++;
    console.error(`  실패: ${name}\n    ${e.message}`);
    console.error("    → 이미 중복 행이 생긴 상태일 수 있어요. 중복을 먼저 정리한 뒤 다시 실행하세요.");
  }
}
await client.end();
console.log(failed === 0 ? "\n복원 완료." : `\n${failed}개 실패 — 위 메시지 확인.`);
process.exit(failed === 0 ? 0 : 1);
