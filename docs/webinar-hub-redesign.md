# 웨비나 허브 개편 — 최종 설계 문서

## 1. 개요와 설계 원칙

여러 전시회 아임웹 사이트에서 반복 개최되는 웨비나를 mach studio가 허브로 통합한다. 원칙: ① **사이트당 코드 1회 부착** — 이후 모든 변경은 허브에서(로더가 런타임 fetch). ② 검증된 선례 재사용 — collect 로더(`/s/[id]`)·utmCore·기존 라이브 페이지. ③ 하위호환 — 기존 정적 배너·라이브 페이지·API 무파괴, 추가형 마이그레이션만. ④ CDN 캐시로 Supabase egress 최소화, 쓰기는 비콘으로 분리. ⑤ 어드민은 Calm Hierarchy — "지금 할 일"이 첫 화면.

## 2. 정보구조(IA)

상세 페이지 탭을 **만들기 / 배포 / 운영 / 분석** 4개로 재편. 기본 진입 탭은 상태 연동(배포 전=만들기, 등록 중·라이브=운영, 종료=분석).

| 기존 | 새 위치 |
|---|---|
| DashboardTab | 해체 — 체크리스트→만들기 상단, KPI·접속자·Q&A→운영 라이브 콘솔, 퍼널→분석 |
| RegistrantsTab | 운영 > 등록자 (유지) |
| QATab / AnnouncementsTab | 운영 > 라이브 콘솔 패널로 이관 |
| AnalyticsTab | 분석 (전면 개편, §6) |
| SettingsTab / RegistrationFormTab / SessionsTab / ThemeTab | 만들기 하위 섹션 (PageSetupTab 좌측 내비 패턴) |
| EmbedTab | **배포 탭(DeployTab) 신설로 대체** — 어드민 UI 한정 삭제, 레거시 코드 발급은 접힘 섹션으로 1릴리스 유지 |

**배포 탭 구성**(위→아래): ① **사이트 연결 섹션** — WebinarEmbedSite 생성/선택, "이 웨비나를 노출 대상으로 지정"(activeWebinarId 교체), livePageUrl 입력 필드 ② 연결 상태 배지("아임웹 연결됨 · 3분 전 · lastSeenOrigin", 10초 폴링+visibility 가드) ③ 스니펫 `<script async src=".../w/{siteId}">` + 복사 ④ 마운트 마커 3종 아코디언 ⑤ 부착 순서 안내 — 통일 문구: 공통 스니펫은 **아임웹 환경설정 > 코드 삽입(헤더)** 1회, 마운트 div만 디자인모드 코드 위젯 / 라이브 전용 페이지 생성→`live` 마커 배치→URL 등록 단계 포함 ⑥ 상태별 미리보기. 배너는 마커 없음 — "자동 표시, 페이지 제외는 bannerPagePatterns 설정" 안내로 대체.

**생성 위저드** `src/app/(app)/webinar/new/page.tsx`: ⓪ 이전 웨비나 복제(기본 — **같은 워크스페이스 내 모든 프로젝트의 웨비나에서 선택 가능**, 전시회=프로젝트 구조의 기본 시나리오) 또는 빈 웨비나 → ① 기본정보(필수) → ②테마 ③등록폼 ④배포(스킵 가능, 스니펫은 `/w/{siteId}` 표기 + 사이트 연결 유도).

**운영 탭**: 상태 바(세그먼트 `자동|등록 중|라이브|종료` → PATCH statusOverride, 수동 배지+자동 복귀 버튼) / KPI 4개 / Q&A 모더레이션 / 공지 발행 / 팝업·Tally 설문 푸시 발행(기존 기능 정식 편입) / 접속자 테이블(접힘).

## 3. 데이터 모델

실측: Webinar에 statusOverride·components 없음, WebinarRegistration에 UTM 없음(schema.prisma 확인). **스키마 diff** (`prisma/migrations/20260707000000_webinar_hub/migration.sql`, 멱등 `IF NOT EXISTS`):

```prisma
model WebinarEmbedSite {                     // 신규 — 사이트 단위 부착
  id String @id @default(cuid())             // /w/{id}
  workspaceId String; projectId String       // FK Cascade, Webinar 관례
  name String; siteUrl String?
  livePageUrl String?                        // 아임웹 라이브 페이지 URL (배너 목적지)
  allowedOrigins String[] @default([])       // register CORS용, 빈 배열=전체 허용
  bannerPagePatterns String[] @default([])
  activeWebinarId String?                    // 현재 노출 웨비나 (전시 전환은 이 값만 교체)
  lastSeenAt DateTime?; lastSeenOrigin String?  // 연결 감지 (seen 비콘이 갱신)
  isActive Boolean @default(true); deletedAt DateTime?
  activeWebinar Webinar? @relation(fields:[activeWebinarId], references:[id], onDelete: SetNull)
  @@index([projectId]) @@index([activeWebinarId])
}
// Webinar 추가: statusOverride String?  ("registration"|"live"|"ended"|null)
//              components Json?  { heroButton:{enabled,labelByStatus,endedLinks:[{label,url,style:"primary"|"secondary"}]},
//                banner:{enabled,position,textByStatus,dismissible,showCountdown,showCalendarButton},
//                formWidget:{enabled,successMessage}, allowLiveRegistration,
//                entryOpenBeforeMinutes(기본 60 — 레거시 STK watch 모드 계승),
//                endedMode:"survey"|"hidden" }  // 기본 "survey" — 종료 후 설문 링크만 (다시보기 신청은 범위 제외, 사용자 확정)
//              ※ endedLinks: 레거시 히어로 종료 상태의 다중 CTA(만족도 조사·전시 개요·전시 사전등록) 설정화
//              embedSites WebinarEmbedSite[] (역관계)
// ※ B의 embedKey/allowedOrigins 컬럼은 폐기 — WebinarEmbedSite로 이관 (결정 1 '1회 부착' 준수)
// WebinarRegistration 추가: CollectRecord와 동명 개별 컬럼 —
//   utmSource/Medium/Campaign/Term/Content/Id, firstUtm* 6종, firstReferrer, firstSeenAt,
//   journey Json?, referrer, userAgent, registeredStatus String?   // 등록 시점 상태(다시보기 구분)
//   @@index([webinarId,utmSource]) @@index([webinarId,utmMedium])
model WebinarAttendanceSegment {             // 신규 — 시청 곡선 (C의 PresenceSample 폐기)
  id String @id @default(cuid())
  webinarId String; registrationId String
  startedAt DateTime; endedAt DateTime       // heartbeat마다 연장, 90초 무갱신 시 확정
  webinar Webinar @relation(..., onDelete: Cascade)
  registration WebinarRegistration @relation(..., onDelete: Cascade)  // 등록 삭제 API 실존 → 정합성 우선
  @@index([webinarId, startedAt]) @@index([registrationId, endedAt(sort: Desc)])
}
model WebinarVisitStat {                     // 신규 — 퍼널 '방문' (seen 비콘이 upsert)
  webinarId String; date DateTime; utmSource String?; utmMedium String?; visits Int
  @@unique([webinarId, date, utmSource, utmMedium])
}
// WebinarAnnouncement 추가: buttonLabel String?, buttonUrl String?  (공지 CTA 버튼 — Popup은 별도 유지)
```

**마이그레이션 순서**: ① `node scripts/apply-migration.mjs`로 **프로덕션 DB 선적용** → ② 스키마 반영 코드 배포(역순 금지 — Prisma 7은 전체 스칼라 SELECT라 신 클라이언트+구 DB는 P2022). 마이그레이션에 세그먼트 백필 포함(B §4 SQL — `enteredAt IS NOT NULL`인 기존 등록을 1세그먼트로 근사, NOT EXISTS 멱등). 전 컬럼 nullable/기본값 → 기존 동작 무변경.

## 4. 임베드/로더 아키텍처

**부착 스니펫**(사이트당 1회 + 마운트 div):

```html
<script async src="https://machstudio.app/w/SITE_ID"></script>   <!-- 환경설정>코드 삽입, 1회 -->
<div data-mach-webinar-mount="hero-button"></div>
<div data-mach-webinar-mount="register-form"></div>
<div data-mach-webinar-mount="live"></div>    <!-- 라이브 전용 페이지 -->
```

배너는 마커 없이 body append — 단, 로더가 같은 페이지에서 `live` 마운트를 감지하면 배너를 렌더하지 않음(레거시 EXCLUDE_PATHS 계승). 마커 속성은 `data-mach-webinar-mount` 3종으로 확정(C의 `data-mach-webinar` 4종·B의 selector 방식 폐기, 커스텀 셀렉터는 "고급" 옵션으로만). 서빙: `src/app/w/[id]/route.ts` — `/s/[id]`와 동일 구조, `buildWebinarLoaderScript` (`src/lib/webinar-loader-script.ts`, EmbedTab의 xf-* CSS·ICS·상태 로직 이식, `mw-` 프리픽스 재스코핑). 캐시 `max-age=300, s-maxage=600, swr=60`.

**설정 계약** — `GET /api/webinar-embed/[siteId]/config` (무인증, 서버가 activeWebinarId로 웨비나 해석). 응답 단일 스키마:

```
{ status, serverNow, theme, components, registrationForm:{fields}, sessions,
  liveStartAt, liveEndAt, signupDeadline,
  links:{livePageUrl, surveyUrl, calendarUrl}, ics, bannerPagePatterns }
```

youtubeId·등록자 수 은닉. 캐시 **`s-maxage=60, swr=300`**(수동 오버라이드 전파 ≤60초) + sessionStorage 60초 SWR 즉시 렌더. CORS는 `*` 유지(Origin echo 시 캐시 파편화 회피).

**상태 머신**: `src/lib/webinar-status.ts` 단일 유틸 — 값 **upcoming / registration / live / ended** 4단(liveStartAt 경계 포함 정확한 수식 명시), `statusOverride` 우선. 추가로 **입장 오픈 시각** `entryOpenAt = liveStartAt − entryOpenBeforeMinutes`(기본 60분): `registration` 상태여도 entryOpenAt 이후엔 CTA가 "입장하기"로 전환(레거시 STK의 watch 모드 — 13:00 입장 오픈/14:00 시작 패턴 계승). 소비처: config·register·ping 응답·어드민 상태 바·로더 labelByStatus 키 전부 동일 문자열. 로더는 `serverNow - Date.now()` 오프셋 보정 로컬 카운트다운 + 경계 통과 시 재fetch + **visibilitychange/focus 시 재fetch 1회** + **라이브 윈도(liveStartAt−30분~liveEndAt+30분) 한정 120초 config 폴링**(CDN 흡수) — 오버라이드가 열린 페이지에도 2분 내 반영. iframe 내 live 페이지는 상태 전환 감지 시 `mach-status` postMessage로 부모 중계(기존 `mach-resize` 계약에 추가).

**register 연동(막다른 골목 해소)**: register 라우트의 signupDeadline 직접 비교(L80-82)를 webinar-status 결과로 교체 — `registration`이면 허용, `live`+`components.allowLiveRegistration`이면 허용. 종료 후 등록은 받지 않음(설문 링크만 노출). registeredStatus 컬럼은 등록 시점 상태 기록용으로 유지. 라이브 게이트 인증 실패 문구에 등록 폼 딥링크 추가.

**UTM**: `collect-script.ts`의 utmCore를 `src/lib/attribution-core.ts`로 추출(collect·웨비나 로더 공용, localStorage 키 공유로 크로스모듈 일관). 제출 페이로드는 **`_utm:{last,first,journey}`** 봉투(내부 키는 collect-script 실측 키). register 라우트가 개별 컬럼으로 분해 저장. register CORS는 사이트 allowedOrigins Origin 검증(빈 배열=`*` 폴백, collect의 corsHeaders 재사용).

**seen 비콘(연결 감지+방문 집계 겸용)**: 로더 초기화 시 세션당 1회 `POST /api/webinar-embed/[siteId]/seen` sendBeacon(바디 `{utmSource,utmMedium}`, sessionStorage 가드) → `lastSeenAt/lastSeenOrigin` update + WebinarVisitStat 일 단위 upsert. config GET에 쓰기 부작용 없음(캐시와 무충돌).

**방문자 시퀀스**: 광고 클릭→아임웹 → 로더 로드 → captureUtm → seen 비콘 → config fetch → status별 렌더(registration: 등록 버튼+D-day 배너+ICS / live: "지금 입장하기"→livePageUrl, 미입력 시 `/webinar/{slug}/live` 폴백 / ended: endedMode 따라 설문·다시보기·숨김) → 등록 제출(_utm 동봉, 허니팟 _hp) → 라이브 당일 livePageUrl의 live 마커에 iframe 삽입 → **인증은 iframe 내부 기존 게이트**(토큰 전달 없음, registrationId는 iframe 오리진 localStorage 24h — 단 Safari 파티션 스토리지 정책상 재방문 시 재인증 가능함을 QA 기준에 명시). 로더 전체 try/catch IIFE, config 실패 시 무렌더 조용히 종료.

## 5. API 표 (단일 계약)

| 경로 | 메서드 | 인증 | 캐싱 | 구분 |
|---|---|---|---|---|
| `/w/[id]` 로더 JS | GET | 공개 | `s-maxage=600, swr=60` | 신규 |
| `/api/webinar-embed/[siteId]/config` | GET | 공개 | `s-maxage=60, swr=300`, CORS * | 신규 |
| `/api/webinar-embed/[siteId]/seen` | POST | 공개(sendBeacon) | 없음, 204 | 신규 |
| `/api/webinar/[slug]/register` | POST | rateLimit 30/분 | 없음, Origin 검증(allowedOrigins) | 변경: `_utm` 분해 저장, status 유틸 연동 |
| `/api/webinar/[slug]/ping` | POST | 공개 | 없음 | 변경: 세그먼트 INSERT/연장(enter 유실 시 신규 세그먼트 폴백), 사전 조회 2회→updateMany 1회, 응답에 `status`(소비자=live 페이지), 클라 jitter ±10초 |
| `/api/webinar/[slug]/verify` | POST | 인메모리 rateLimit 강화(30/분, found=false 별도 낮은 한도) — Upstash 미보유 확정, 도입 시 교체 여지만 남김 | 없음, 429 시 Retry-After 자동 재시도 UX | 변경 |
| `/api/webinar/[slug]/announcements` | GET | 공개 | **`s-maxage=15, swr=30`** 신설 | 변경 |
| `/api/webinar/[slug]/{info,qa}` | — | — | — | 유지 (info 축소는 Phase 5) |
| `/api/webinar/[slug]/{popups,tally-pushes}` | GET | 공개 | `s-maxage=60` | 유지 — 실사용 기능 확정(사용자 확인), 운영 콘솔에 발행 UI 편입 |
| `/api/webinar-embed-sites` (+`/[id]`) | GET/POST/PATCH/DELETE | 세션+workspaceMember | 없음 | 신규 (사이트 CRUD) |
| `/api/webinars` | POST | 동일 | — | 변경: `cloneFromId` — **같은 워크스페이스 내 모든 프로젝트의 웨비나에서 복제 가능**(원본의 workspaceId=요청자 워크스페이스 검증, 생성은 현재 프로젝트에). 복사 범위: config.registrationForm·theme·components·세션 구조 (일정·slug·등록자 제외) |
| `/api/webinars/[id]` | PATCH | 동일 | — | 변경: `statusOverride` 수용(유틸 값 검증) |
| `/api/webinars/[id]/embed-status` | GET | 동일 | 없음 (10초 폴링+visibility 가드) | 신규: 연결 사이트 lastSeenAt |
| `/api/webinars/[id]/analytics` | GET | 동일 | 수동 새로고침만 | 신규: 퍼널·UTM 분해·등록 추이 |
| `/api/webinars/[id]/analytics/attendance-curve` | GET | 동일 | `private, max-age=60` | 신규: `$queryRawUnsafe`+generate_series (~2.4KB) |
| `/api/webinars/[id]/dashboard` | GET | 동일 | 적응형 폴링 | 변경: `status` 동봉 |
| `/api/webinars/[id]/registrations/export` | GET | 동일 | — | 변경: **커스텀 필드(config.registrationForm 정의 순서로 memo.customFields 동적 컬럼) + UTM 컬럼** |

공통 선행 리팩터링: `normalizeRegistrationForm` 3곳 중복 → `src/lib/webinar-config.ts`(zod, config 전체 스키마) 단일화.

## 6. 분석 설계

**수집**: 방문(WebinarVisitStat, seen 비콘) / 등록+UTM(개별 컬럼) / 입장·체류(기존) / 시청 곡선(WebinarAttendanceSegment, 시청자당 1~3행 ≈ 1,000행/웨비나 — ping 원본 로그 대비 60배 절감, 백필로 과거 웨비나도 제공).

**실시간 전략**: 운영 콘솔은 dashboard 15초 폴링(라이브) / 90초(비라이브) + visibility 가드 — 라이브 2시간 ≈ 1.9MB. 방문자측: config는 CDN 흡수(오리진 revalidate 분당 ≤1회), 공지 s-maxage=15로 500명 기준 오리진 QPS ~0.07, ping 피크 8.3req/s(updateMany 단일 쿼리화). 분석 탭은 폴링 없음(수동 새로고침).

**화면**: 퍼널(방문→등록→입장→30분 체류) → UTM 소스별 분해 테이블(소스·매체|방문|등록|등록률|입장률) → 시청 곡선(attendance-curve) → 등록 추이(DateRangePicker) → 등록자 읽기 전용 테이블+CSV. 기존 지표(체류율·동의율 등) 유지, 해석 가이드는 disclosure로 강등.

**부하 검증**: 라이브 전 리허설 웨비나 1회 실부하 테스트를 Phase 3 검증 항목에 포함.

## 7. 기능 정리

| 대상 | 처리 |
|---|---|
| EmbedTab 정적 코드 생성 | 어드민 UI에서 배포 탭으로 대체. 기발급 코드는 자체 완결이라 계속 동작. 레거시 발급 접힘 섹션 1릴리스 유지 후 제거 |
| WebinarPopup | **유지 확정(사용자 확인 완료: 실사용 기능)** — 운영 콘솔에 팝업 발행 패널로 정식 편입, 공개 GET 유지 |
| WebinarTallyPush | **유지 확정(사용자 확인 완료: 실사용 기능)** — 운영 콘솔에 Tally 설문 푸시 패널로 정식 편입 |
| `/api/webinar/[slug]/info` | 로더·live 페이지의 kit(config) 전환 완료 후 필드 축소(youtubeId·_count 은닉) — 레거시 지원 종료와 동일 시점 |
| DashboardTab | 라이브 콘솔로 대체 후 삭제 |
| B의 Webinar.embedKey / C의 WebinarPresenceSample·`/wl/{slug}` | 채택 안 함 |

## 8. 구현 순서 (각 Phase 독립 배포 가능)

**Phase 1 — 스키마+공통 유틸** ✅ 완료(2026-07-07 배포): 마이그레이션(DB 선적용→코드 배포), `webinar-status.ts`, `webinar-config.ts`(zod 미보유 → 순수 TS 정규화, UI 3곳 마이그레이션은 Phase 3에서), `webinar-attribution.ts`(_utm 봉투는 last/first 중첩 대신 CollectRecord와 동일한 flat 키로 확정), register의 status 유틸 연동+`_utm` 분해 저장(재등록 시 기존 어트리뷰션 보존), ping 세그먼트 기록+단일 쿼리화+응답 status, verify 미스 전용 인메모리 한도(rateLimitPeek), live 페이지 heartbeat jitter ±10초. 검증: dev 실측 E2E(등록+UTM 18컬럼, 세그먼트 연장, 미스 5회 후 429, override 게이트), DB↔스키마 정합 대조, tsc. 구현 시 알게 된 것: 같은 registration의 탭 2개 동시 heartbeat 는 세그먼트가 중복 생성될 수 있음 → **Phase 4 시청 곡선은 COUNT(DISTINCT registrationId) 로 집계할 것**.

**Phase 2 — 로더+배포 탭**: WebinarEmbedSite CRUD, `/w/[id]`, config·seen 엔드포인트, 로더(히어로·배너·폼·live iframe·utmCore), DeployTab(사이트 연결·livePageUrl·스니펫·미리보기). 검증: 테스트 아임웹 사이트 실부착 — 부착→연결 배지→등록→UTM 컬럼 저장→상태 전환 문구 변경 E2E. 하위호환: 기존 정적 배너 병행 동작.

**Phase 3 — 어드민 IA 재편**: 탭 4개, 생성 위저드(cloneFromId), 라이브 콘솔(statusOverride 바), 적응형 폴링. 검증: 리허설 웨비나 실부하(동시 접속) 테스트, 오버라이드→부착물 반영 ≤2분 확인. 탭 상태는 useState 기반이라 딥링크 파손 없음.

**Phase 4 — 분석**: analytics·attendance-curve 엔드포인트, 퍼널·UTM 분해·시청 곡선 화면, CSV 커스텀 필드+UTM 확장. 검증: 백필된 과거 웨비나 곡선 표시, CSV 컬럼 대조.

**Phase 5 — 정리**: info 축소(youtubeId·_count 은닉), EmbedTab 레거시 섹션·DashboardTab 삭제. Popup·TallyPush는 유지 확정으로 정리 대상에서 제외(운영 콘솔 편입은 Phase 3).

구현 시 참고(minor): 로더 클래스 `mw-` 스코핑·`z-index:999900`, 폼 위젯은 명시적 스타일 전량 지정, ICS는 EmbedTab 코드 이식, cuid 백필은 `scripts/migrate-*.mjs` 관례, Next.js 16 문서(`node_modules/next/dist/docs/`) 선확인.

## 9. 확정된 결정 (2026-07-07 사용자 답변)

1. **Popup·Tally 설문 푸시**: 실사용 기능 — 유지하고 운영 콘솔에 정식 편입 (제거 취소)
2. **종료 후 동작**: 설문 링크만 노출 (endedMode 기본 `"survey"`, 다시보기 신청은 범위 제외)
3. **사이트당 동시 웨비나 1개** 확정 — activeWebinarId 단일 구조 유지, 마운트 오버라이드 불필요
4. **Upstash 미보유** — verify는 인메모리 rateLimit 강화로 시작
5. **아임웹 "환경설정 > 코드 삽입" 사용 경험 있음** — Phase 2 실부착 E2E에서 최종 확인
6. **(추가) 프로젝트 간 복제**: 같은 워크스페이스 내 모든 프로젝트의 웨비나에서 복제 가능 — 전시회=프로젝트 구조의 기본 시나리오. 복사본은 현재 프로젝트에 생성, 설정만 복사(등록자·일정·slug 제외)

## 10. 레거시 STK 코드 참조 (2026-07-07 사용자 제공)

실제 아임웹 운영 코드 아카이브: `docs/legacy-stk/` — 히어로 CTA·하단 배너 원본 + 라이브/어드민 기능 인벤토리(README.md). mach webinar 모듈은 이 코드의 포팅 계보라 개념 대부분 일치.

**설계에 반영됨**: 입장 오픈 윈도(`entryOpenBeforeMinutes` 기본 60분), 히어로 종료 상태 다중 CTA(`endedLinks`), live 마운트 페이지에서 배너 자동 숨김, 배너 카운트다운("마감까지 D-N")·캘린더 버튼(PC=Google Calendar/모바일=ICS, 모바일만 노출) 설정화(`showCountdown`/`showCalendarButton`).

**Phase 2 구현 시 참고**:
- 히어로 클릭(등록 상태): 같은 페이지에 `register-form` 마운트 있으면 스크롤, 없으면 폼을 모달로 오픈 (레거시의 아임웹 모달 열기 대체)
- 배너 인증 모달은 만들지 않음 — 클릭 → livePageUrl 이동 → iframe 게이트가 인증 담당
- STK 테마 프리셋: accent #FF4713(hover #ff6a3d)/Pretendard/다크 — 테마 기본값 후보
- 아임웹 대응: z-index 999900+, `-webkit-text-fill-color` 강제, 폰트 !important 스코핑, Channel.io 숨김 옵션
- Tally hiddenFields 프리필(name/email/phone/company/department/job_title) 유지 필수

**신규 기능 후보 (Phase 4+ 사용자 확인 후)**:
- 등록자 CSV 가져오기 — 레거시 어드민의 아임웹 CSV 임포트(헤더 자동 매핑, 중복 제외/포함 모드) 계승. 과거 데이터 이관용
- 웨비나 분석 공유 링크 — 레거시의 비번 보호 읽기 전용 리포트. mach 기존 share 인프라(AnalyticsShareModal 패턴) 재사용
