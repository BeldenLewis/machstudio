# STK Imweb 홈페이지 점진 이행 런북

이 문서는 STK 홈페이지 CMS의 배포와 Imweb `/214` 이행을 위한 **검토용 절차**다. 이 문서 자체는 DB 변경, Storage 변경, 배포, 공개 플래그 활성화 또는 Imweb 수정을 승인하지 않는다. 각 변경은 해당 단계의 별도 승인과 실제 환경 재확인이 있어야 한다. 한 검사라도 실패하면 즉시 중단한다.

## 1. 현재 Imweb 소유 구획 증거

아래 ID는 작성 시점에 관찰된 현재 증거다. **각 mutation 직전에 Imweb 편집기에서 다시 읽어야 한다.** 라이브 편집기의 값이 다르면 중단하고 변경 기록을 갱신한다. 이 문서만 보고 widget을 대상으로 삼지 않는다.

| 구획 | Imweb section | Imweb widget |
| --- | --- | --- |
| Hero | `s2026082007f2d0d1f6a91` | `w2026082080fc7e5443c45` |
| Exhibitions | `s202607134cf85414453c0` | `w2026071352d517040e21c` |
| Journey | `s202607138661e711f5fe6` | `w202607132bf43d8b3fc3f` |
| Speakers | `s20260714177f0d9245356` | `w20260824c224e54449312` |
| Sponsors | `s2026071446541061f23b8` | `w20260714051ec07cd954b` |
| Final CTA | `s20260714d998c7ca8a48d` | `w202608311c96f8199245b` |

범위는 위 여섯 구획뿐이다. native newsroom, newsletter, footer, Channel Talk과 다른 페이지는 이행 대상이 아니다.

## 2. 스키마·배포 정지선

### 2.1 필수 stop/go 순서

다음 순서를 바꾸거나 합치지 않는다.

```text
reviewed branch and green DB-free tests
→ explicit no-live-broadcast window approval
→ verify parsed URL host/database/user against separately approved values, then read current_database/current_user/server address over direct PostgreSQL :5432
→ read-only partial unique index check returns 10/10
→ DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=v1
→ apply only supabase/migrations/20260901000000_expo_page_revisions.sql
→ DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=ready
→ verify partial unique indexes remain 10/10
→ verify the configured Supabase project ref against the separately approved ref and canonical DB-host ref
→ idempotently provision private expo-quarantine bucket and verify private/50MiB/MIME settings
→ deploy code with EXPO_SCHEMA_CAPABILITY=20260901-v2 and the approved EXPO_APPROVED_SUPABASE_PROJECT_REF
→ keep EXPO_PUBLIC_EMBED_RELEASE off
→ verify authenticated admin, private expo-quarantine bucket, signed upload/finalize cleanup, preset, draft, preview, publish, revision, rollback, export
→ obtain separate public-embed and Imweb cutover approval
→ read-only audit every published page with enabled embed surfaces against the approved page-id allowlist
→ deploy the same verified release with EXPO_PUBLIC_EMBED_RELEASE=on
→ verify approved loaders return 200 and every non-approved page has zero renderable public sections
```

실패 시 다음 단계로 가지 않는다. 스키마 rollback에서 revision table을 drop하지 않는다. capability와 code를 이전 상태로 되돌리고 fail-closed 상태를 유지한다.

### 2.2 비밀값과 대상 확인

DB 또는 Storage mutation 전에 운영자는 모든 secret/session 값을 로그 밖에서 준비한다. `EXPO_APPROVED_DB_HOST`, `EXPO_APPROVED_DB_NAME`, `EXPO_APPROVED_DB_USER`, `EXPO_APPROVED_SUPABASE_PROJECT_REF`는 URL에서 복사하지 않고 서명된 변경 기록에서 각각 가져온다. `NEXT_PUBLIC_SUPABASE_URL`은 배포에 이미 설정된 프로젝트 URL이어야 한다. URL이나 service-role key를 출력하지 않는다.

승인된 no-live-broadcast window 안에서 다음 **명령 형태와 순서**를 사용한다. 아래 명령은 실행 승인문이 아니다.

```bash
test -n "$EXPO_SESSION_DATABASE_URL"
test -n "$EXPO_APPROVED_DB_HOST" && test -n "$EXPO_APPROVED_DB_NAME" && test -n "$EXPO_APPROVED_DB_USER"
test -n "$EXPO_APPROVED_SUPABASE_PROJECT_REF" && test -n "$NEXT_PUBLIC_SUPABASE_URL"
node scripts/verify-expo-db-target.mjs
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/ensure-partial-unique-indexes.mjs
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=v1
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" npx prisma db execute --file supabase/migrations/20260901000000_expo_page_revisions.sql
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/check-expo-schema.mjs --expect=ready
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/ensure-partial-unique-indexes.mjs
node scripts/ensure-expo-quarantine-bucket.mjs --check-target
node scripts/ensure-expo-quarantine-bucket.mjs --apply
node scripts/ensure-expo-quarantine-bucket.mjs --check
```

두 번의 partial unique index 점검은 모두 정확히 10/10이어야 한다. migration은 지정한 revision migration 하나만 적용한다.

### 2.3 공개 surface exact-set 감사

`EXPO_PUBLIC_EMBED_RELEASE`는 전역 스위치다. 스키마 배포로 자동 활성화하지 않는다. 별도 public-embed 및 Imweb cutover 승인 뒤, `verify-expo-db-target.mjs`를 통과하고 전역 플래그를 켜기 직전에만 읽기 전용 감사를 실행한다.

승인 allowlist는 쉼표로 구분한 완전한 page-id 집합이다. 앞뒤 공백은 정규화하지만 빈 ID, ID 내부 공백, 중복, `none`과 ID의 혼합은 실패한다. 승인된 빈 집합은 반드시 literal `none`을 쓴다. 감사 대상은 살아 있는 `ExpoSite`가 소유한, 삭제되지 않고 발행본이 있는 모든 `ExpoPage`다. `liveAt`이 있거나 발행본에서 `enabled=true`와 `embedEnabled=true`가 동시에 켜진 구획이 하나라도 있으면 public surface로 센다.

```bash
test -n "$EXPO_APPROVED_PUBLIC_PAGE_IDS" # use literal none when the approved set is empty
DATABASE_URL="$EXPO_SESSION_DATABASE_URL" node scripts/audit-expo-public-embeds.mjs --expect-page-ids="$EXPO_APPROVED_PUBLIC_PAGE_IDS"
```

감사 결과에 미승인 페이지가 하나라도 있으면 플래그를 계속 끈다. 인증된 편집기에서 해당 surface를 disable하고 다시 publish한 다음 감사를 재실행하고 최종 exact set을 다시 승인받는다.

감사 통과 뒤에도 스키마 배포와 같은 검증된 release를 `EXPO_PUBLIC_EMBED_RELEASE=on`으로 **두 번째 배포/설정 작업**해야 한다. 켠 뒤 승인 page/section loader 하나의 200 응답과 예상 `data-msx-sid`를 확인하고, 모든 비승인 published page를 조회해 resolved section list가 비어 있음을 증명한 뒤에만 Imweb `/214`를 만진다.

## 3. 여섯 구획 점진 이행

순서는 **Hero → Exhibitions → Journey → Speakers → Sponsors → Final CTA**다. 각 구획을 아래 1–10까지 완료하고 승인한 뒤 다음 구획으로 간다. Mach의 실제 발행 pageId와 sid를 다시 읽고, 추정값을 쓰지 않는다.

1. 해당 sid snippet을 private Imweb test page에 설치한다.
2. 정확한 `/h/{pageId}/{sid}` 요청이 200인지, 기대한 `data-msx-sid`가 있는지 확인한다.
3. PC/mobile, actions, keyboard, motion, crop, 위·아래 native section을 검증한다.
4. 해당 구획의 individual backup HTML을 export하고 독립 실행으로 시험한다.
5. `/214`에서 기존 widget은 보이게 유지하고 새 snippet은 connection-only 상태로 설치한다.
6. `lastSeenOrigin` host가 정확히 `smarttechkorea.com`이고 connection status가 최근인지 확인한다.
7. 이 Mach 구획만 enable/publish하고 실제 페이지가 **60 seconds** 안에 갱신되는지 확인한다.
8. CTA URL/anchor/modal/analytics를 Network와 destination system 양쪽에서 검증한다.
9. 새 render가 통과한 뒤에만 기존 widget을 숨긴다. 삭제하지 않는다.
10. desktop/mobile 증거와 revision sequence/digest를 기록한다.

구획별 기록에는 Imweb section/widget 재확인값, Mach pageId/sid, loader URL/status, `data-msx-sid`, lastSeen 시각/origin, publish revision/digest, backup 파일, PC/mobile 캡처, CTA 네트워크 요청과 목적지 결과를 포함한다.

### 구획별 rollback

위험을 먼저 줄이는 순서로 수행한다.

1. **show the existing Imweb widget first**.
2. Mach section을 disable하고 publish한다.
3. public recovery와 native 위·아래 구획을 검증한다.

여섯 구획과 recovery drill이 모두 승인되기 전에는 기존 widget을 하나도 삭제하지 않는다. 한 구획 rollback은 다른 완료 구획의 설정을 바꾸지 않는다.

## 4. 미확정 값 차단

아래 값이 실제 값으로 공급되고 publish readiness error가 0이 될 때까지 launch를 차단한다.

- 정확한 campaign dates와 timezones
- 모든 destination URLs
- modal IDs와 fallback URLs
- analytics event/content ids
- Hero video 사용 권리
- 모든 필수 이미지
- 실제 sponsor logos

placeholder, 추정값 또는 과거 캠페인 값을 승인값으로 간주하지 않는다.

## 5. 완료 증거

코드 완료, 스키마 배포, public release, 실제 `/214` 이행은 서로 다른 상태로 기록한다. 최종 완료에는 다음 실증이 모두 있어야 한다.

- 실제 `/214` render
- 1280/390 screenshots
- Chromium과 mobile Safari/WebKit
- 여섯 loader responses와 각 `data-msx-sid`
- 최근 connection status와 정확한 `smarttechkorea.com` origin
- two simultaneous campaign CTA state
- 모든 destination actions(URL/anchor/modal/analytics)
- speaker filter
- sponsor motion과 reduced motion
- standalone recovery
- native newsroom/newsletter/footer/Channel Talk regression
- 기존 widget 복구 → Mach disable → public recovery 순서의 recovery drill

하나라도 빠지면 이행 완료가 아니다. 실제 공개 페이지 확인 없이 배포 성공만으로 `/214` 이행 완료를 선언하지 않는다.

## 6. 이 런북의 코드 검토 명령

아래는 DB-free 정적/테스트 검토만 수행한다. DB, deployment, Storage, Imweb 또는 공개 페이지를 변경하지 않는다.

```bash
node scripts/audit-expo-public-embeds.mjs --describe
npx vitest run src/lib/expo/__tests__/public-embed-audit-cli.test.ts
rg -n "Hero|Exhibitions|Journey|Speakers|Sponsors|Final CTA|verify-expo-db-target|expo-quarantine|EXPO_PUBLIC_EMBED_RELEASE=on|audit-expo-public-embeds|--expect=v1|--expect=ready|10/10|connection-only|60 seconds|show the existing" docs/runbooks/stk-imweb-homepage-cutover.md
git diff --check
```
