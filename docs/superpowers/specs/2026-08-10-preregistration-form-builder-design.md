# 사전등록 · 현장운영 통합 플랫폼 설계

작성일: 2026-08-10 · **v7 (2026-08-11 — 결정사항 반영, LA 9/1 일정 역산)** · 상태: 설계 확정, 개발 착수 대기

## 1. 배경

사전등록은 지금 전시마다, 참관객 유형마다 아임웹 페이지를 따로 만들어 운영한다. Korea Expo Paris는 탭이 5개다 — Visitor Guide / Visitor Registration / Buyer Registration / Press Registration / Registration Check. 등록 폼만 3벌이고, 행사 개요·초상권 안내는 페이지마다 복사돼 있다.

이걸 **machstudio 하나로 통일**하고, 회사가 운영하는 모든 전시에 적용한다. 나아가 **현장 입장·현장 등록까지** 같은 시스템에서 처리한다.

**적용 대상**: Korea Expo 도쿄 / 파리 / **LA(파일럿)**, 서울바앤스피릿쇼, STK, 교육박람회 등.

## 2. 일정 — 먼저 짚어야 할 것

**파일럿은 Korea Expo LA, 사전등록 오픈 목표는 2026-09-01.** 오늘이 8월 11일이므로 **3주**다.

### 3주에 전부는 들어가지 않는다

이 문서의 전체 범위(폼 빌더 + 검증 + 티켓/QR/이메일 + 등록확인 + 다국어 + 현장 체크인 + 현장 등록 + 배지)는 3주 분량이 아니다. 다만 **9/1은 "사전등록 오픈"이지 "전시 개최"가 아니다.** 현장 기능의 마감은 LA 개최일이므로 시간이 더 있다.

그래서 이렇게 나눈다.

| 마감 | 범위 |
|---|---|
| **9/1 (사전등록 오픈)** | 폼 빌더, 행사 개요·안내 블록, 검증·중복 방지, 등록번호·QR, 등록 확인, 완료 페이지, 이벤트 추적 |
| **10/22 (LA 개최)** | 현장 체크인(오프라인), 현장 등록, 배지 출력 |
| 별도 요청 시 | Resend 이메일 발송, 다국어, 기존 데이터 이관, 템플릿 복제 |

### 이번에 만드는 것

- 폼 빌더: 항목 CRUD·드래그 정렬·유형 분기 (**문항 내용은 빌더에서 직접 채운다** — 코드에 넣지 않는다)
- 행사 개요 블록(접수 창 자동 개폐 포함), 안내 블록
- 이메일 형식·**실시간 중복 확인**, 전화 국가번호+E.164
- 등록번호 13자리 + **QR 생성·표시**
- 등록 확인(Find My QR)
- 완료 URL 템플릿, dataLayer 이벤트
- 아임웹 임베드 스니펫 2종

**영어 단일**로 만들되, 라벨 구조는 나중에 다국어를 얹을 수 있게 잡아 둔다(§11).

### 이메일 없이 오픈할 때의 QR 전달 경로

Resend 연동은 별도 요청으로 나중에 붙인다. 그때까지 등록자가 QR을 받는 경로는 둘뿐이다:

1. **완료 페이지에서 즉시 표시** — 등록 직후 화면에 QR을 띄운다
2. **등록 확인(Find My QR)** — 나중에 다시 찾을 때

그래서 **등록 확인은 부가 기능이 아니라 필수 경로**다(§10). 완료 페이지도 리다이렉트만 하는 게 아니라 QR을 보여줄 수 있어야 한다(§8).

### 되돌릴 길

일정이 밀리면 **LA는 기존 아임웹 폼으로 오픈하고**, machstudio 폼은 준비되는 대로 교체한다. 기존 페이지를 지우지 않으므로 언제든 가능하다. 이 폴백을 미리 합의해 두면 막판에 무리하지 않는다.

## 3. 멀티 전시 구조

```
Workspace (회사)
 └ Project (전시)                  예: "KOREA EXPO LA 2026"
    └ CollectSource (사전등록)      ← 폼·개요·안내·검증·브랜딩·이메일
       ├ CollectRecord (등록자)     ← 등록번호·QR·이메일 상태
       └ CollectCheckIn (입장 기록) ← 일자별 (P4)
```

**전시 하나 = CollectSource 하나.** 문항은 **전시마다 처음부터 커스텀**하는 것이 기본이다(복제는 나중에 옵션으로 추가). 전시별로 산업·유형·수집 항목이 달라 복제가 오히려 방해가 된다.

| 전시마다 다른 것 | 저장 위치 |
|---|---|
| 문항·분기·동의·검증·(다국어) 라벨 | `formConfig` |
| 행사 개요·안내 블록 | `formConfig.eventInfo` / `.notices` |
| 브랜드 색·로고 | `formConfig.theme` |
| 완료 URL 형식 | `formConfig.completion.redirectUrlTemplate` |
| 이메일 제목·본문·발신 | `emailConfig` |
| 현장 운영(개최일·게이트·배지) | `venueConfig` (P4) |
| 허용 도메인 / 폼 on-off | `allowedOrigins` / `isActive` (기존) |

## 4. 화면 구성 (온라인)

아임웹 코드블럭은 **두 종류**. 등록 3탭을 1탭으로 합치고, Registration Check 탭은 별도 임베드.

```
[등록 탭]
  ┌───────────────────────────────────────┐
  │ ▣ 행사 개요            (선택, §5.1)    │
  │ ▣ 상단 안내            (선택, §5.3)    │
  │ ──────────────────────────────────────│
  │ 1. First name / 2. Last name          │  ← 드래그로 순서 변경
  │ 3. Phone  [🇺🇸 +1 ▾] [ 2025550147 ]   │
  │ 4. Email                              │ ← 형식 검증 + 실시간 중복 확인
  │ 5. Visitor type [General|Buyer|Press] │
  │ ──────────────────────────────────────│
  │ ▼ 유형별 문항이 즉시 펼쳐짐             │
  │ ──────────────────────────────────────│
  │ ▣ 초상권 안내          (안내만, §5.3)  │
  │ ☐ [필수] 개인정보 동의            자세히│
  │ ☐ [선택] 마케팅 수신 동의         자세히│
  │            [ 사전 등록하기 ]            │
  └───────────────────────────────────────┘
```

- 유형 선택 항목은 **폼의 일반 항목 중 하나**다. 고르면 **그 항목 바로 아래**에 문항이 삽입된다.
- 유형을 바꾸면 이전 유형 문항은 제거하되 **공통 입력값은 유지**(`snapshotForm`/`prefill`, `webinar-loader-script.ts:809-837`).
- **모든 블록은 개별 on/off.**

## 5. 행사 개요와 안내 블록

### 5.1 행사 개요 — 표시용이 아니라 동작하는 데이터

개요표를 한 곳에 정의하고 **폼·완료 페이지·티켓·이메일이 같은 소스를 렌더**한다. 지금처럼 페이지마다 복사돼 있으면 날짜가 바뀔 때 또 여러 곳을 고친다.

일부 값은 **표시가 아니라 동작**을 결정한다.

| 항목 | 동작 |
|---|---|
| 개최 기간(`eventDates`) | 현장 체크인의 일자 판정(§12) |
| 운영시간·최종입장 | 최종입장 이후 체크인 경고(P4) |
| 장소 | 티켓·이메일에 함께 |
| **사전등록 기간** | **폼을 자동으로 열고 닫는다** |

```ts
eventInfo: {
  enabled: boolean;
  eventDates: string[];                  // ["2026-09-18","2026-09-19"]
  openingHours: Array<{ date: string; open: string; close: string; lastEntrance: string }>;
  venue: Localized;
  registrationWindow: { opensAt: string | null; closesAt: string | null };   // ISO
  extraRows: Array<{ label: Localized; value: Localized }>;
}
```

**접수 창이 폼을 개폐한다.** 창 밖에서는 폼 대신 상태 문구를 보여준다.

| 상태 | 화면 |
|---|---|
| `before` | "사전등록은 9월 1일에 시작됩니다" + 개요 |
| `open` | 폼 |
| `closed` | "사전등록이 마감되었습니다. 현장 등록은 가능합니다" (문구 커스텀) |

**웨비나에 같은 패턴이 있다** — `resolveWebinarStatus()`(`src/lib/webinar-status.ts:76-106`)가 시각 비교로 상태를 내고 `statusOverride`로 수동 전환을 허용한다. 같은 구조 + **수동 override 제공**(마감을 앞당기거나 연장할 일이 실제로 생긴다).

> 서버에서도 창을 검증한다. 클라이언트만 막으면 마감 후 API로 등록이 들어온다.

### 5.2 개요 블록을 쓰는 곳

**등록 폼 상단 / 완료 페이지 / 티켓 페이지 / 이메일 본문** — 위치마다 켜고 끄고, 표시할 행을 고른다(티켓에는 장소·날짜만 등).

### 5.3 안내 블록 (초상권 등)

반복 가능한 블록 배열. 위치와 형태를 각각 고른다.

```ts
notices: Array<{
  id: string; enabled: boolean;
  placement: "top" | "above-consent" | "bottom" | "completion" | "email";
  title: Localized; body: Localized;      // 줄바꿈 보존 (AGENTS.md)
  mode: "notice" | "checkbox-optional" | "checkbox-required";
  collapsible: boolean;                    // 길면 접고 "자세히"
}>
```

**초상권은 `notice`(안내만)로 확정.** 촬영·홍보 사용을 고지하고, 삭제 요청이 오면 처리하는 운영이다.

- LA(미국)에서는 고지 + 사후 삭제 대응이 통상적인 운영 방식이다.
- **파리 전시 때 다시 판단해야 한다.** 프랑스는 **droit à l'image**(초상권) 보호가 강해, 식별 가능한 개인의 사진을 홍보 목적으로 쓸 때 사전 동의가 필요하다는 것이 통설이다. 블록 `mode`만 바꾸면 되도록 설계돼 있으니, 파리 설정 시 법무 확인 후 `checkbox-optional`로 전환하는 선택지를 열어 둔다.

## 6. 입력 검증과 중복 방지

### 6.1 현황 — 실시간 제출에는 중복 방지가 없다

**정정.** `CollectSource.dedupKeyFields` 컬럼과 UI가 있지만 실제 사용처는 **CSV 가져오기 중복 판정뿐**(`records/import/route.ts:256`). `/api/collect`에는 중복 검사가 **전혀 없다.** 신규 개발이다.

형식 검증 상수는 있다(`webinar-config.ts:144-163`):

```ts
export const PHONE_MIN_DIGITS = 10;   // ← 한국 기준
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

### 6.2 이메일 — 중복은 차단, 안내는 즉시

**결정**: 중복이면 **등록을 막고 "이미 등록된 이메일입니다"를 보여준다**(`onDuplicate: "block"`).

기존 `EMAIL_REGEX`가 `@`와 도메인 `.`을 이미 강제한다. **더 조이지 않는다** — 좁히면 `john.doe+expo@company.co.uk` 같은 실제 고객 주소를 거부한다.

| 처리 | 내용 |
|---|---|
| 정규화 | `trim()` + **소문자** — 중복 판정의 전제 |
| 기본 검증 | `EMAIL_REGEX` + 길이 ≤ 320 (`isValidEmail`) |
| 추가 차단 | 연속 점(`..`), 로컬파트 시작/끝 점 |
| (9/1 이후) | ASCII 전용 / 도메인 차단·허용 목록 |

**즉시 안내**: 이메일 입력이 유효해지면 **600ms 디바운스 후 조회**해 필드 바로 아래에 인라인으로 알린다. 제출 버튼도 막는다. 웨비나에 같은 구현이 있다(`webinar-loader-script.ts:606-644`) — 이식한다.

**DB 제약이 최종 방어선.** 조회 후 INSERT만으로는 동시 제출을 막지 못한다(둘 다 "없음"을 읽는다).

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_sourceId_emailNormalized_key"
  ON "CollectRecord"("sourceId","emailNormalized") WHERE "emailNormalized" IS NOT NULL;
```

> Prisma는 부분·함수 인덱스를 표현하지 못한다. 같은 상황을 raw SQL로 처리한 선례가 있다 — `WebinarRegistration` 인덱스(`prisma/schema.prisma:646-649` 주석).

P2002 → **409** → 이메일 필드 아래 인라인 안내. 판정 범위는 **CollectSource 단위**(전시 하나).

### 6.3 연락처

```
[🇺🇸 United States +1 ▾] [ 2025550147 ]
```

- **LA는 기본 US.** 기본 국가를 박아두고 아닌 사람만 바꾼다.
- 입력칸은 **숫자만**. 하이픈·괄호·공백은 타이핑 즉시 제거(기존 로더가 이미 그렇게 한다: `webinar-loader-script.ts:593-599`). 안내가 아니라 입력 시점 강제 — AGENTS.md "입력은 소스에서 정규화".
- 저장은 **E.164**(`+12025550147`) 한 형태. 등록 확인(§10)이 전화번호로도 조회하므로 정규화가 특히 중요하다 — 표기가 제각각이면 조회가 안 맞는다.

**`libphonenumber-js` 추가.** 직접 구현하면 반드시 틀린다: `PHONE_MIN_DIGITS=10`은 한국 기준이라 프랑스 9자리 번호를 거부하고, 한국 `01012345678`→`+821012345678`(앞 0 제거) 같은 규칙이 나라마다 다르다.

## 7. 동의

**기본 체크 여부 설정과 전문 팝업은 이미 구현돼 있다** — `privacyDefaultChecked`, `marketingDefaultChecked`, `privacyBody`/`marketingBody`(`webinar-config.ts:91-95`), 팝업은 `openTerms`/`consentSpan`(`webinar-loader-script.ts:651-695`).

**LA(미국) 기준**
- 이메일 마케팅: 연방 CAN-SPAM은 **옵트아웃** 방식이라 사전 동의가 필수는 아니다. 수신거부 수단 제공·10영업일 내 처리 의무.
- 문자(SMS) 마케팅: TCPA가 **사전 명시적 서면 동의**를 요구하며 적극적 행위여야 한다. 사전 체크로는 충족되지 않는다. 건당 법정손해배상($500~1,500) 집단소송이 잦다.
- 캘리포니아 CCPA/CPRA: **수집 시점 고지** 의무.

**권장 기본값: 둘 다 미체크.** 필수 동의는 어차피 체크해야 제출되므로 사전 체크의 실익이 없다. 빌더에서 켜면 경고를 띄운다.

**다른 전시 확대 시**: 파리(GDPR)는 사전 체크가 **불가**하다 — EU 사법재판소 Planet49(C-673/17, 2019)가 사전 체크는 유효한 동의가 아니라고 명시했다. 국내도 광고성 정보 전송은 옵트인 원칙이라 부적절하다. 설정이 소스 단위라 전시별로 다르게 간다.

> ⚠️ 해외 전시는 개인정보를 **한국 서버로 국외이전**하는 구조라 별도 고지·동의가 필요할 수 있다. 법무 검토 권장.

## 8. 완료 페이지 — URL 템플릿

플레이스홀더 `{type}` `{regNo}` `{rid}` `{lang}`.

```
https://…/registration-complete?{type}     → …?buyer
https://…/registration-complete?type={type}&rid={rid}
```

**완료 화면에서 QR을 바로 보여준다.** 이메일 연동 전에는 이게 등록자가 QR을 받는 첫 경로다(§2). 두 방식 중 고른다:

| 방식 | 동작 | 적합 |
|---|---|---|
| **인라인 완료 카드** (`redirectUrlTemplate` 비움) | 이동 없이 폼 자리에 QR·등록번호 표시 | 전환 태그를 폼 페이지에서 잡는 경우 |
| **완료 페이지 이동** + QR 임베드 | `registration-complete`로 이동, 그 페이지에 등록확인 임베드를 붙여 방금 등록한 QR을 표시 | **URL 조건으로 전환을 잡는 경우(권장)** |

이동 방식에서는 완료 페이지가 방금 등록한 사람을 알아야 하므로, 그 경우에만 URL에 `{regNo}`를 싣고 임베드가 그 값으로 QR을 그린다. (§8.2의 카디널리티 주의는 GTM에서 `page_location` 정리로 해결한다.)

`?buyer` 형식은 **"URL 포함" 매칭으로 문제없이 동작한다.** 알아둘 점: ① 값 없는 키는 GTM 쿼리 변수로 읽기 번거롭다 ② "buyer 포함"은 나중에 `buyer-vip`가 생기면 함께 잡히므로 유형 키가 서로의 부분문자열이 되지 않게 정한다.

**전환 중복 집계**: 완료 페이지 새로고침 시 태그가 다시 발화한다. URL 유니크성으로는 못 막는다. 제출 직전 생성한 `rid`를 **Meta `eventID` / GA4 `transaction_id`**로 넘기면 자동 병합된다.

**`{regNo}`는 URL에 넣지 않기를 권한다** — QR 입장에 쓰이는 값이 브라우저 기록·리퍼러에 남고, GA4 페이지 경로 카디널리티가 폭발한다.

완료 페이지에도 **행사 개요 블록**을 켤 수 있다.

## 9. 등록번호 · QR · 이메일

### 9.1 등록번호

- **13자리 무작위.** 순차 번호는 등록 규모가 노출되고 남의 번호를 추측할 수 있다.
- 안전난수 → `registrationNo` UNIQUE → 충돌(P2002) 시 재시도(최대 5회).
- **체크digit 권장**: 마지막 1자리를 Luhn 등으로. 현장에서 QR이 안 읽혀 **번호를 손으로 입력하는 상황이 반드시 생긴다**(§12).

### 9.2 QR — 어떤 환경에서도 스캔되게

현장 입장에 쓰이므로 스캔 실패가 곧 줄이다.

| 절대 규칙 | 이유 |
|---|---|
| **배경은 불투명 흰색.** 투명 PNG 금지 | 투명 QR을 다크 UI에 올리면 검은 모듈이 검은 배경에 놓여 대비가 사라진다. **다크모드 사고의 대부분이 이것** |
| **반전 QR 금지** | 표준 리더는 어두운 모듈/밝은 배경 전제. 반전 인식은 보장되지 않는다 |
| **여백(quiet zone) 4모듈 이상** | 규격 요구사항. 0으로 만드는 생성기가 흔한데 여백이 없으면 인식률이 급락 |
| **오류정정 레벨 Q** | 반사·지문·구김·인쇄 번짐을 견딘다. 13자리는 짧아 Q로 올려도 조밀해지지 않는다 |
| **로고 오버레이 금지**(기본) | 인식률을 깎는다. 넣으면 EC를 H로, 중앙 7% 이내 |
| **순수 흑백** | 컬러 QR은 대비가 낮고 **흑백 열전사 프린터에서 뭉갠다** — 배지를 직접 출력하므로 특히 중요 |

**표시 크기**: 화면 최소 200×200px, **인쇄 최소 2cm**(권장 2.5cm).

**다크모드 대응 — 3곳 모두**

1. **티켓·등록확인 페이지**: QR 영역만 **강제 라이트**로 고정. 페이지 나머지는 테마를 따라도 QR 카드는 흰 배경·검은 모듈로 못 박는다.
   > AGENTS.md "색 하드코딩 금지"의 **의도적 예외**다. 이 흰색은 디자인 토큰이 아니라 **스캔 가능성 요건**이라 테마를 따라가면 안 된다. 코드 주석에 이유를 남긴다.
2. **이메일**: 일부 클라이언트(Outlook 계열)가 다크모드에서 색을 반전시킨다. **흰 배경을 구운 불투명 PNG** + 감싸는 `<td>`에 `background-color:#ffffff` 명시.
3. **인쇄 배지**: 실제 프린터로 실물 검증. 화면에서 멀쩡한 QR이 배지에서 안 읽히는 경우가 흔하다.

**스크린샷 대비**: 상당수가 티켓 화면을 캡처해서 온다. QR은 **정적 이미지**로 둔다(시간 기반 회전 코드 금지 — 캡처 티켓이 무효화되면 현장이 더 혼란해진다).

**담을 값**: 번호만 또는 URL. **전용 스캐너를 쓰므로(§12) 기본은 번호만**으로 한다 — HID 스캐너가 URL을 읽으면 긴 문자열이 그대로 입력돼 처리가 번거롭다. 우리 앱은 둘 다 인식하게 만든다(URL이면 번호만 추출).

**서버 QR 생성이 필요하다.** `qrcode.react`는 클라이언트 React 전용(`utm-builder/page.tsx:11`)이라 이메일에 못 넣는다. `qrcode` 패키지 추가.

### 9.3 이메일

**Resend는 이미 붙어 있다.** `src/lib/email.ts`의 `sendEmail`, `sendEmailBatch`(100건 배치), `emailConfigured()`가 의존성 없이 fetch로 구현돼 있고 키가 없으면 조용히 skip한다.

추가 필요: ① **첨부 지원**(`attachments` 확장) ② **전시별 발신 주소** — **도메인 인증 필수, §2 참고** ③ (이후) 언어별 템플릿.

**도달률 이중화**: ① QR PNG **첨부**(이미지 차단돼도 내려받기) ② 본문에 **티켓 페이지 링크**를 크게 — 이게 실질 티켓이다.

**발송 실패 처리**: 제출 응답은 발송을 기다리지 않는다(저장 후 즉시 응답, 발송은 응답 이후 — Next.js 16 `after()` 등, 실제 API는 `node_modules/next/dist/docs` 확인). `emailStatus`/`emailSentAt`/`emailError` 기록 + **재시도 스윕** + **수동 재발송**(선례: `/api/webinars/[id]/reminders/send`). 등록자 목록에 상태 컬럼 노출.

## 10. 등록 확인 (Find My QR)

"내가 등록했나?"와 "QR을 잃어버렸다"를 홈페이지에서 바로 해결한다. 아임웹 `Registration Check` 탭에 별도 코드블럭으로 붙인다. **중복 등록을 사전에 줄이는 장치이기도 하다.**

### 10.1 조회 방식 — 설정형

**결정**: 화면에서 바로 QR을 보여준다. 본인 확인 항목과 결합 방식을 **설정으로 고른다.**

```ts
lookup: {
  enabled: boolean;
  fields: Array<"email" | "phone">;   // 조회에 쓸 항목
  logic: "or" | "and";                // 하나만 맞으면 / 둘 다 맞아야
  showQr: boolean;                    // false 면 "메일로 재발송"만
}
```

- **지금(무료 전시)**: `fields: ["email","phone"], logic: "or"` — 이메일 **또는** 전화번호 하나만 맞아도 QR 표시. 방문자가 둘 중 기억나는 걸로 찾는다.
- **유료 전시 전환 시**: `logic: "and"`로 바꾸면 둘 다 일치해야 열린다. 설정만 바꾸면 되고 코드 수정이 없다.

**무료라서 `or`가 합리적인 이유**: 티켓에 금전 가치가 없으므로 남의 티켓을 얻을 동기가 약하다. 대신 조회 편의가 문의 응대 부담을 크게 줄인다. 유료로 가면 티켓에 가치가 생기므로 `and`로 올리는 판단이 맞다 — 그 시점을 미리 잡아두신 게 정확하다.

**전화번호 조회의 전제**: E.164 정규화(§6.3)가 되어 있어야 한다. `010-1234-5678`로 입력해도 `+82…`로 저장된 값과 맞아야 하므로, 조회 입력도 같은 함수로 정규화한 뒤 비교한다.

### 10.2 남용 방지

`or`로 열어 두는 만큼 기계적 조회는 막는다.

- **rate limit 필수** (기존 `src/lib/ratelimit.ts`) — IP 기준 + 입력값 기준 양쪽.
- 미등록일 때는 **"등록 내역을 찾을 수 없습니다"** 로 끝낸다(다른 정보 노출 금지).
- 표시 정보는 최소화: 이름·유형·등록번호·QR. 연락처 전체나 다른 문항 답변은 노출하지 않는다.
- QR 표시 화면에도 §9.2의 강제 라이트 규칙을 그대로 적용한다.

## 11. 다국어 (9/1 이후)

**아임웹이 언어별 페이지 구조**이므로, 각 언어 페이지에 `?lang=` 파라미터를 붙인 스니펫을 넣는 방식이 가장 확실하다.

```html
<script async src="https://machstudio.vercel.app/f/SOURCE_ID?lang=en"></script>
```

라벨을 **로케일 맵**(`Record<locale, string>`)으로 두고, **폴백 사슬**(요청 → `defaultLocale` → 첫 사용 가능 값)로 번역이 비어도 화면이 비지 않게 한다. 빌더에 **번역 누락 표시**. 기존 단일 문자열은 읽을 때 `{ [defaultLocale]: value }`로 승격해 하위호환(웨비나 정규화 패턴과 동일).

등록자 로케일을 `CollectRecord.locale`에 저장해 그 언어로 이메일·티켓을 렌더한다.

## 12. 현장 운영 (LA 개최일 마감)

> 하드웨어 전제가 확정됐다. 세부는 프린터 기종이 정해진 뒤 별도 스펙으로 확장한다.

### 12.1 확정된 전제 — 완전 오프라인

| 항목 | 확정 |
|---|---|
| 스캐너 | **전용 바코드 스캐너** (휴대폰 아님) |
| 네트워크 | **현장 와이파이 없음** |
| 배지 | **현장에서 출력해 배부** |
| 재입장 | 하루 안에서 자유 — **팔찌·목걸이로 관리, 시스템 불필요** |
| 현장 등록 규모 | 사전등록의 **약 25%** (행사마다 다름) |

재입장을 시스템이 관리하지 않는다는 결정이 설계를 크게 단순화한다. 체크인은 **일자별 최초 입장만** 기록하면 되고, 기기 간 실시간 동기화가 필요 없다.

**구성**: 전용 스캐너는 보통 USB HID(키보드 에뮬레이션)라 **노트북 + 스캐너**가 한 세트다. 체크인 앱은 그 노트북에서 도는 웹 앱(PWA)이고, 스캔은 입력 필드로 들어온다.

### 12.2 오프라인 동작

와이파이가 없는 것이 예외가 아니라 **기본 전제**다.

1. **사전 준비(인터넷 되는 곳에서)**: 체크인 앱을 열어 PWA로 설치하고 **명단을 기기에 내려받는다**(IndexedDB). 필요한 필드만: 등록번호, 이름, 유형, 회사.
2. **현장(오프라인)**: 스캔 → **로컬 조회·판정** → 즉시 결과. 네트워크를 전혀 타지 않는다.
3. **입장 기록은 로컬 큐**에 쌓는다.
4. **동기화**: 인터넷이 되는 시점(휴대폰 테더링, 숙소, 사무실)에 일괄 업로드.

**데이터 유실 방지가 핵심.** 서버로 못 보낸 하루치 입장 기록이 브라우저 저장소와 함께 날아가면 복구가 불가능하다.
- 주기적으로 **로컬 파일로 내보내기**(CSV/JSON)를 자동 수행하고, 종료 시 반드시 내보내게 강제한다.
- 앱에 "미동기화 N건" 배지를 항상 표시한다.

**명단 신선도**: 행사 당일 아침에 등록한 사람은 전날 받은 명단에 없다. 대응 둘 — ① 개장 직전 테더링으로 명단 갱신 ② 명단에 없으면 현장 등록으로 넘긴다(§12.4). 두 번째가 확실한 폴백이다.

### 12.3 체크인 화면

판정은 **3색으로 즉시 구분**(AGENTS.md "상태는 색+형태로"):

- 🟢 **입장 가능** — 이름·유형 크게 → 배지 출력
- 🟡 **이미 입장함** — 최초 입장 시각 표시. **막지 않는다**(재입장 자유). 배지 재출력 여부만 스태프가 판단
- 🔴 **명단에 없음** → **현장 등록으로 바로 이어지는 버튼**

**수기 입력 폴백**: QR이 안 읽히는 경우는 반드시 생긴다. 번호 직접 입력을 항상 한 탭 거리에 두고, 체크digit(§9.1)이 오타를 잡는다. 이름·회사로도 검색되게 한다(번호를 아예 모르고 오는 사람이 많다).

```prisma
model CollectCheckIn {
  id        String   @id @default(cuid())
  recordId  String
  sourceId  String
  eventDate String   // "2026-09-18" — 일자별 최초 입장
  gate      String?
  staffId   String?
  scannedAt DateTime @default(now())
  offline   Boolean  @default(false)
  record    CollectRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  @@index([sourceId, eventDate])
  @@index([recordId, eventDate])
}
```

### 12.4 현장 등록

사전등록의 **25%** 규모다. 1만 명 사전등록이면 2,500명이 현장에서 들어온다.

**폼은 사전등록과 완전히 동일하다.** 문항을 줄이지 않는다 — 등록 경로에 따라 수집 항목이 갈리면 데이터가 달라져 분석과 후속 마케팅이 어긋난다. 같은 `formConfig`를 그대로 렌더한다.

**대신 처리량을 좌석 수로 푼다.** 문항이 같으니 1건당 소요시간도 사전등록과 같고, 남는 변수는 "동시에 몇 명이 입력할 수 있느냐"다.

```
필요 대수 = (현장등록 인원 × 1건 소요시간) ÷ (운영시간 × 목표 가동률)
```

예시: 2,500명 × 3분 = 7,500분. 2일 × 7시간 = 840분. 가동률 70% 가정 → **약 13대**.

이건 평균 기준이고 실제로는 **개장 직후에 몰린다.** 피크를 감당하려면 그 시간대에 좌석을 더 두거나 아래 대안 경로가 필요하다. 정확한 산정을 위해 **1건 소요시간·운영시간·현장등록 예상 인원**이 필요하다(§23).

**대안 경로 — 방문자 본인 휴대폰 (권장)**

- 입구에 등록용 QR을 붙여 두면 방문자가 **자기 휴대폰으로 같은 폼**을 연다. 우리 좌석을 쓰지 않으므로 대기열이 근본적으로 줄어든다.
- 현장 와이파이는 없지만 **방문자 휴대폰의 셀룰러는 살아 있다.** 오프라인인 것은 우리 체크인 노트북이지 방문자 단말이 아니다.
- 등록이 끝나면 QR이 화면에 뜬다(이메일 연동 후에는 메일도) → 그대로 체크인 줄로 이동.
- 온라인 경로라 오프라인 번호 블록·동기화가 필요 없다. 데이터가 서버로 바로 들어간다.
- 다만 셀룰러가 안 되는 방문자(로밍 미사용 등)가 있으므로 **키오스크는 여전히 필요하다.** 둘을 함께 운영한다.

**나머지 원칙**

- **다음 사람으로 즉시 초기화.** 이전 방문자 입력이 남으면 개인정보 사고다. 자동완성·브라우저 저장 비활성.
- **등록번호 오프라인 발급**: 키오스크가 오프라인이면 서버에서 번호를 못 받는다. 기기별 **번호 블록 사전 할당**, 온라인 복귀 시 동기화하며 충돌은 UNIQUE가 잡는다. (본인 휴대폰 경로는 온라인이라 해당 없음.)
- **중복 방지**: 사전등록해놓고 잊고 다시 등록하는 사람이 많다. 이메일 입력 시 **로컬 명단 즉시 조회** → "이미 등록되어 있습니다 — 바로 입장 처리할까요?"
- **동의**: 현장에서도 받는다(§7).

### 12.5 배지 출력

현장에서 출력해 배부한다. 스캔(또는 현장 등록) 직후 바로 인쇄되는 흐름이다.

- **오프라인에서 인쇄돼야 한다.** 시스템은 **브라우저 인쇄**로 로컬 프린터에 출력하는 방식까지 지원한다 — 네트워크 없이 동작하고 프린터 기종을 가리지 않는다. 프린터·용지 선택은 운영팀 소관.
- 배지 레이아웃은 전시별 설정(`venueConfig.badge`): 로고, 이름 크기, 유형 색상 띠, QR 포함 여부.
- **인쇄 QR은 최소 2cm**, 순수 흑백(§9.2). 실물 인쇄 후 스캔 확인은 리허설 항목.
- **프린터 기종·용지 규격 확정 필요**(§23).

## 13. 기존 데이터 이관 (9/1 이후)

과거 아임웹 등록자도 같은 시스템에서 조회·입장되어야 한다. **가져오기 경로가 이미 있다** — `/api/collect-sources/[id]/records/import`(CSV, 중복 판정). 확장한다.

1. **필드 매핑** — 아임웹 컬럼 → 새 폼 키(`FieldMapping` 모델 존재).
2. **정규화 백필** — `emailNormalized`, `phoneE164`. 안 채우면 중복 방지·등록 확인이 과거 데이터에 안 걸린다.
3. **등록번호 백필 + 티켓 일괄 발송**(`sendEmailBatch` 재사용).
4. **중복 정리 선행** — 유니크 인덱스 전에 정리. 못 하면 과거 레코드는 `emailNormalized`를 NULL로 두고 신규부터 적용(부분 인덱스라 가능).

**대량 발송 주의**: 과거 등록자 수만 명에게 갑자기 보내면 스팸 신고가 몰려 **발신 도메인 평판이 망가진다.** 단계적 발송 + 왜 지금 받는지 본문에 명확히.

## 14. 재사용 자산

| 필요 기능 | 재사용할 자산 | 위치 |
|---|---|---|
| 필드 타입 스키마·정규화 | `WebinarRegistrationField`, `normalizeRegistrationForm` | `webinar-config.ts:16-140, 585-661` |
| **접수 창 상태 판정 + 수동 override** | `resolveWebinarStatus` | `src/lib/webinar-status.ts:76-106` |
| 이메일 형식 검증 | `EMAIL_REGEX`, `isValidEmail` | `webinar-config.ts:146, 163` |
| 전화 숫자만 강제 | `tel` 핸들러 | `webinar-loader-script.ts:593-599` |
| **실시간 중복 확인 UX(디바운스+인라인)** | `/register/check` 호출부 | `webinar-loader-script.ts:606-644` |
| 폼 빌더 UI(드래그·타입 팝오버·옵션·자동저장) | `RegistrationFormTab.tsx` + `OptionRows`, `EditableList`, `useAutosave` | `webinar/[slug]/RegistrationFormTab.tsx` |
| 외부 폼 렌더링 | `buildFormInto` | `webinar-loader-script.ts:419-825` |
| 동의 기본체크 + 전문 팝업 | `openTerms`, `consentSpan` | `webinar-loader-script.ts:651-714` |
| 완료 처리(스크롤 잠금·포커스 트랩) | `openDonePopup`, `lockPageScroll` | `webinar-loader-script.ts:851+` |
| UTM 캡처 | `ATTRIBUTION_CORE_JS` | `src/lib/attribution-core.ts` |
| 공개 폼 CSS | `PUBLIC_REGISTRATION_FORM_CSS` | `src/lib/webinar-public-form-css.ts` |
| 1줄 설치 로더 | `/s/{id}` | `src/app/s/[id]/route.ts` |
| 스냅샷을 스크립트에 실어 보내기 | `/w/l/{slug}` | `src/app/w/l/[slug]/route.ts` |
| 제출 수집(API키·Origin·rate limit·webhook·UTM) | `/api/collect` | `src/app/api/collect/route.ts` |
| rate limit | `rateLimit` | `src/lib/ratelimit.ts` |
| **이메일 발송·배치** | `sendEmail`, `sendEmailBatch` | `src/lib/email.ts` |
| CSV 가져오기·필드 매핑 | import 라우트, `FieldMapping` | `collect-sources/[id]/records/import/route.ts` |
| 부분 유니크 인덱스 선례 | `WebinarRegistration` 주석 | `prisma/schema.prisma:646-649` |

**신규 개발**: 행사 개요·안내 블록, 접수 창 게이팅, 조건부 문항 펼침, 국가번호+E.164, **실시간 중복 방지**(§6.1), 완료 URL 템플릿, 이벤트 레이어, 등록번호, 서버 QR, 티켓 페이지, 등록 확인, (이후) 다국어·**체크인 PWA(오프라인)**·현장 등록·배지 출력·이관 백필.

**추가 의존성**: `libphonenumber-js`, `qrcode`.

## 15. 데이터 모델

```prisma
model CollectSource {
  formConfig  Json?   // 문항·개요·안내·검증·동의·완료·등록확인
  emailConfig Json?   // 발신·제목·본문·QR
  venueConfig Json?   // 개최일·게이트·배지 (현장)
}

model CollectRecord {
  registrationNo  String?   @unique
  emailNormalized String?             // 소문자·trim — 중복 판정·등록 확인
  phoneE164       String?             // 등록 확인 조회 키
  locale          String?
  source          String?             // "online" | "onsite"
  emailStatus     String?             // pending|sent|failed
  emailSentAt     DateTime?
  emailError      String?
  checkIns        CollectCheckIn[]
}

model CollectCheckIn { /* §12.3 */ }
```

```sql
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "formConfig"  JSONB;
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "emailConfig" JSONB;
ALTER TABLE "CollectSource" ADD COLUMN IF NOT EXISTS "venueConfig" JSONB;

ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "registrationNo"  TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailNormalized" TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "phoneE164"       TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "locale"          TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "source"          TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailStatus"     TEXT;
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailSentAt"     TIMESTAMP(3);
ALTER TABLE "CollectRecord" ADD COLUMN IF NOT EXISTS "emailError"      TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_registrationNo_key"
  ON "CollectRecord"("registrationNo");
CREATE UNIQUE INDEX IF NOT EXISTS "CollectRecord_sourceId_emailNormalized_key"
  ON "CollectRecord"("sourceId","emailNormalized") WHERE "emailNormalized" IS NOT NULL;
-- 등록 확인(전화 조회) 성능
CREATE INDEX IF NOT EXISTS "CollectRecord_sourceId_phoneE164_idx"
  ON "CollectRecord"("sourceId","phoneE164");
```

> **주의**: 기존에 같은 이메일이 중복 저장된 소스가 있으면 인덱스 생성이 실패한다(§13-4). LA는 신규 소스라 해당 없음 — **이관 시점에 다시 확인**한다.

`formConfig` 전체 스키마는 `src/lib/collect-form-config.ts`에 정의하고, 웨비나 `normalizeRegistrationForm`과 **같은 정규화 패턴**으로 낡은 저장값을 안전하게 메운다.

## 16. 어드민 (폼 빌더)

```
┌─ 폼 빌더 ─────────────────────────────┬─ 미리보기 ────────┐
│ ▸ 행사 개요        [on]                │  실제 임베드와     │
│   사전등록 기간 → 폼 자동 개폐          │  같은 렌더러       │
│   상태: ● 접수중  (수동 전환 ▾)        │                   │
│ ▸ 안내 블록        [+ 추가]            │  [유형] 토글       │
│   ⣿ 상단 안내      [안내만 ▾]     [on] │  [상태] 토글       │
│   ⣿ 초상권 안내    [안내만 ▾]     [on] │                   │
│ ▸ 항목             [+ 추가]            │                   │
│   ⣿ Phone   [tel] 🇺🇸기본        ⌄    │                   │
│   ⣿ Email   [email] 중복확인     ⌄    │                   │
│   ⣿ Visitor type [select] ★분기  ⌄    │                   │
│ ▸ 유형별 문항  General/Buyer/Press     │                   │
│ ▸ 검증  기본국가[US] 중복[이메일·차단] │                   │
│ ▸ 동의  문구·전문 · 기본체크[off]⚠︎     │                   │
│ ▸ 등록 확인 [on] 조회[이메일·전화][OR] │                   │
│ ▸ 완료 URL 템플릿                      │                   │
└────────────────────────────────────────┴───────────────────┘
[이메일] 발신·제목·본문·QR·테스트 발송
[현장]   개최일·게이트·배지·명단 다운로드   (이후)
```

- 항목·안내 블록 모두 **드래그로 순서 변경**. 분기는 폼당 하나.
- 필드 카드·옵션 편집·드래그는 `RegistrationFormTab.tsx`에서 **컴포넌트를 추출해 공용화**한다(복사하면 두 벌이 갈라진다): `FieldCard`, `RegTypeMenu`, `REG_TYPE_META/ORDER`, `useRegPopover` → `src/components/form-builder/`, 웨비나 탭도 거기서 import.
- 미리보기는 임베드 런타임과 **같은 렌더 함수**. 접수 창 상태(before/open/closed)를 토글해 미리 볼 수 있어야 한다 — 마감 화면을 마감 당일에 처음 보면 늦다.
- **테스트 발송** 버튼(실제 등록 없이 QR 메일 수신).

## 17. 임베드 런타임

```html
<!-- 등록 폼 -->
<script async src="https://machstudio.vercel.app/f/SOURCE_ID"></script>
<div data-mach-form></div>

<!-- 등록 확인 -->
<script async src="https://machstudio.vercel.app/f/SOURCE_ID/check"></script>
<div data-mach-form-check></div>
```

- 라우트 `src/app/f/[id]/route.ts`(+ `/check`). 응답 = 런타임 번들 + `__msForm.boot({ config, apiKey, origin, mode })`.
- **config를 스크립트 본문에 실어 보낸다** → 요청 1회로 최종 화면이 그려진다(`/w/l/[slug]:1-13` 주석: fetch 방식은 실측 10초 넘게 빈 화면이었다).
- ETag(본문 해시) + `CDN-Cache-Control: s-maxage=60, stale-while-revalidate=86400`. **접수 상태가 캐시에 굳지 않게** 주의 — 오픈/마감 경계에서 낡은 화면이 남으면 안 된다. 클라이언트가 서버 시각으로 재판정한다(웨비나 로더의 `serverNow` 오프셋 보정, `webinar-loader-script.ts:159-171`).
- 소스 삭제 → 404, 비활성 → 경고 주석만. 마운트 `<div>`가 없으면 스크립트 태그 위치에 자동 마운트.

**번들 빌드**: `src/embed/form-entry.ts` → esbuild IIFE → `src/generated/form-runtime.ts`. 랜딩 런타임과 같은 파이프라인(`scripts/build-landing-runtime.mjs`, `predev`/`prebuild`, 생성물 커밋, 소스 해시 stale 검증)을 일반화한다.

> 웨비나 로더는 TS 템플릿 리터럴에 JS를 문자열로 넣는 방식이라 백틱·`${}` 금지 제약이 있다. 신규 코드는 **esbuild 번들 방식**으로 간다.

## 18. 이벤트 추적

**dataLayer 단일 창구.** Meta 픽셀·Google Ads를 런타임에서 직접 호출하지 않는다 — 픽셀 ID가 코드에 박히면 전시·계정마다 배포가 필요하다.

| 시점 | `event` | 파라미터 |
|---|---|---|
| 폼 노출 | `ms_form_view` | `form_status`(before/open/closed) |
| 첫 입력 | `ms_form_start` | — |
| **유형 선택** | `ms_visitor_type_selected` | `visitor_type` |
| 제출 시도 | `ms_form_submit` | `visitor_type` |
| 중복 차단 | `ms_form_duplicate` | — |
| 제출 성공(완료 페이지) | `generate_lead` | `visitor_type`, `transaction_id(rid)` |
| 실패 | `ms_form_error` | `error_code` |
| 등록 확인 사용 | `ms_lookup_request` | — |

**동의 연동**: 마케팅 미동의자의 `ms_consent` 상태를 dataLayer에 실어 Consent Mode v2로 제어. 전시별 GTM 설정.

## 19. API

```
POST /api/collect
  1. API키·Origin·rate limit (기존)
  2. 접수 창 검증 (§5.1) — 마감 후면 403
  3. 형식 검증 (이메일·전화 E.164·분기 값·required·maxSelect·미정의 키 차단)
  4. emailNormalized / phoneE164 / locale 생성
  5. registrationNo 발급(13자리 난수)
  6. INSERT → P2002면 409 { duplicateField: "email" }   ← 중복은 차단(§6.2)
  7. 응답 이후: QR 생성 → 이메일 발송 → emailStatus 기록

POST /api/collect/check     실시간 중복 확인 → { exists } (rate limit, boolean만)
POST /api/collect/lookup    등록 확인 (§10) — fields/logic 설정에 따라 판정, rate limit
GET  /t/{regNo}             티켓 페이지
```

검증 로직은 `collect-form-config.ts`에 두고 런타임·서버가 **같은 함수**를 쓴다.

**현장 API**(이후): `GET /api/checkin/roster`(명단 사전 다운로드), `POST /api/checkin/sync`(오프라인 큐 동기화). **스태프 인증 필요** — 명단 전체를 내려주므로 API 키만으로 열면 안 된다.

## 20. 대시보드

- `visitorType`이 `data`에 들어오므로 구성 분석에 유형 분포가 자동으로 잡힌다(`VISITOR_DIMENSIONS`, `dashboard-report/route.ts:41-62`).
- 등록자 목록에 **등록번호·이메일 상태·입장 여부** 컬럼.
- **현장 대시보드**(이후): 시간대별 입장, 유형별 입장률, no-show율, 현장 등록 비중.
- 요약 대시보드 퍼널: 페이지 방문 → 등록 → **입장**까지 확장.

## 21. 롤아웃 — LA 9/1 역산

| 주차 | 내용 | 병행 |
|---|---|---|
| **W1 (8/11~)** | 스키마 + `collect-form-config.ts` + 폼 빌더 UI·미리보기 | — |
| **W2 (8/18~)** | `/f/[id]` 런타임, 검증·중복(유니크 인덱스), 개요·안내 블록, dataLayer | 완료 페이지(`registration-complete`) 생성, GTM 태그 |
| **W3 (8/25~)** | 등록번호·QR·완료 화면 QR·등록 확인, 스테이징 아임웹 검증 | 빌더에서 **LA 문항 입력**, 스캔 환경 테스트(§22) |
| **8/29~31** | 예비일 — 버그·문구·실데이터 리허설 | 오픈 판단 |
| **9/1** | LA 사전등록 오픈 | 폴백: 기존 아임웹 폼 |
| 9월 중 | Resend 이메일 연동(별도 요청), 필요 시 다국어·이관 | 발신 도메인 준비 |
| **10월 초~중** | 현장 체크인·현장 등록·배지 — **리허설 필수** | 기기·프린터 준비 |
| **10/22~24** | LA 개최 | 종이 명단 폴백 상시 |

**문항 입력은 개발과 병행할 수 있다.** 빌더가 W2 말에 서면 운영팀이 W3에 LA 문항을 직접 채워 넣는다 — 개발이 다 끝나기를 기다릴 필요가 없다.

**W3 말에 오픈 여부를 판단한다.** 무리해서 밀어 넣지 않는다 — 기존 아임웹 폼이라는 폴백이 있다.

현장 기능 리허설은 **실제 기기로, 인터넷을 끊고** 수백 건을 연습한다. **종이 명단 폴백을 항상 준비**한다 — 시스템이 죽어도 입장은 진행돼야 한다.

## 22. 검증 계획

**폼·블록**: 분기 펼침, 유형 변경 시 공통 입력 유지, 개요·안내 블록 on/off.

**접수 창**: before/open/closed 3상태, 경계 시각 자동 전환, 수동 override, **마감 후 API 직접 호출이 403**인지.

**검증·중복**
- `a@b`(TLD 없음) 거부 / `john.doe+expo@company.co.uk` **통과해야 함**(과잉 차단 회귀 방지)
- `John@X.com` 등록 후 `john@x.com` 재등록 → 차단 + "이미 등록된 이메일" 인라인 표시
- **입력 중 실시간 안내**가 600ms 내에 뜨는지, 입력을 바꾸면 사라지는지
- **동시 제출 경합**: 같은 이메일 병렬 2건 → 정확히 1건 성공
- 전화: US `2025550147`→`+12025550147`, KR `01012345678`→`+821012345678`(0 제거), 특수문자 즉시 제거

**등록 확인**: `or` 설정에서 이메일만/전화만으로 각각 조회되는지, `and`로 바꾸면 둘 다 필요해지는지, 표기가 다른 전화(`010-1234-5678` vs `+82…`)로도 조회되는지, 미등록 시 정보 노출 없는지, rate limit.

**QR — 스캔 환경 매트릭스** (핵심)
| 축 | 조건 |
|---|---|
| 화면 모드 | 라이트 / **다크** — 티켓·등록확인 페이지, 이메일 본문 |
| 메일 클라이언트 | Gmail(웹·앱) / Outlook(다크 포함) / 네이버 / Apple Mail |
| 매체 | 휴대폰 화면 / 스크린샷 / **흑백 인쇄 배지** |
| 조건 | 저조도, 밝기 최저, 지문·반사, 구겨진 종이 |
| 스캐너 | **전용 바코드 스캐너** / 기본 카메라 앱 |

투명 배경 PNG를 다크 배경에 올렸을 때 **실제로 인식이 실패하는지**도 확인한다(규칙의 근거를 눈으로).

**등록번호·이메일**: UNIQUE 충돌 재시도(자릿수를 임시로 낮춰 유발), 발송 실패 시 `emailStatus=failed` + 재발송.

**현장(이후)**: **인터넷을 완전히 끊고** 전체 흐름, 명단 5,000건 로컬 조회 속도, 브라우저를 닫았다 열어도 큐가 남는지, 로컬 파일 내보내기, 배지 실물 인쇄 후 스캔, 현장 등록 1건 소요 시간 측정(25% 규모 대기열 산정).

**기타**: 완료 URL 템플릿, GTM 미리보기, 모바일 375px, 서버 검증 curl.

## 23. 확정 사항 요약

착수를 막는 미결 항목은 없다. 결정된 내용을 한 곳에 모은다.

| 항목 | 결정 |
|---|---|
| 파일럿 | **Korea Expo LA** — 사전등록 오픈 9/1, 개최 10/22~24 |
| 폼 문항 | 전시마다 **빌더에서 직접 커스텀**. 코드에 문항을 넣지 않는다 |
| 언어 | **영어 단일**. 다국어 구조만 잡아두고 나중에 요청 시 활성화 |
| 동의 사전 체크 | **둘 다 미체크** |
| 초상권 | **안내(notice)만**. 추가 동의 절차 없음 |
| 중복 등록 | **차단** + "이미 등록된 이메일입니다" 인라인 표시 |
| 중복 확인 시점 | **입력 중 실시간**(600ms 디바운스) |
| 등록 확인 | 화면에 QR 표시. 이메일·전화 **OR**(무료 전시), 유료 전환 시 설정만 AND로 변경 |
| 완료 페이지 | `registration-complete` 계열 단일 페이지 + `?{type}`. GTM 태그는 운영팀이 직접 |
| 전화 기본 국가 | **US** |
| Resend 이메일 | **별도 요청 시 연동**. 그전까지 QR은 완료 화면 + 등록 확인으로 전달 |
| 현장 등록 폼 | **사전등록과 동일**. 문항을 줄이지 않는다 |
| 재입장 | 시스템 관리 안 함 (팔찌·목걸이) — 일자별 최초 입장만 기록 |
| 현장 네트워크 | **없음** 전제. 오프라인 우선 설계 |
| 스캐너·프린터·기기 | **운영팀 소관**. 시스템은 HID 스캐너 입력과 브라우저 인쇄를 지원하는 선까지 |

**개발 착수 시 참고**: 문항·문구·URL·이메일 본문은 전부 빌더 입력값이다. 코드에 LA 전용 값을 하드코딩하지 않는다 — 그러면 다음 전시에서 다시 코드를 고쳐야 한다.
