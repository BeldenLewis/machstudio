# mach studio — IA (Information Architecture)

> 버전 1.0 · 2026-07-20 · [PRD.md](PRD.md)와 짝 문서
> §1–4 = 현재 구현된 IA(코드 기준), §5 = 제안 중인 타깃 IA(Calm Workbench 시안)

---

## 1. 사이트맵 (라우트 트리)

### 1.1 팀 내부 (로그인 필요, `(app)` 그룹)

```
/dashboard                  대시보드 — 워크스페이스 KPI·위젯
/analytics                  광고 성과 — 반입·캠페인 테이블·ROAS
/utm-builder                UTM 빌더 — 링크 생성·프리셋·숏링크
/collect                    사전등록 — 수집 소스 목록
/collect/[id]               └ 소스 상세 — 레코드·정규화·중복·GDPR
/webinar                    웨비나 목록
/webinar/[slug]             └ 웨비나 허브 (4탭: 만들기·배포·운영·분석)
/settings                   개인 설정
/settings/workspace         워크스페이스 — 멤버·초대·토큰
/admin                      관리(내부)
```

### 1.2 공개 (비로그인)

```
/webinar/[slug]             등록 페이지 (STK 테마)
/webinar/[slug]/live        시청 페이지 — 상태 머신이 화면 결정
                            (대기 → 입장확인 → 라이브 → 종료)
/webinar/[slug]/survey/[id] 설문 응답 페이지
/share/[token]              공유 리포트 (읽기 전용)
/share/dashboard/[token]    공유 대시보드
/share/analytics/[token]    공유 분석
/signup, /reset-password    인증
/onboarding                 첫 로그인 온보딩
```

---

## 2. 내비게이션 구조 (현재)

### 2.1 글로벌 (사이드바)

```
mach studio (워크스페이스)
├─ 대시보드
├─ 광고성과
├─ 사전등록
├─ 웨비나
├─ UTM 빌더
└─ 설정
```

- 모바일(≤768px): 사이드바 → 드로어. 플로팅 메뉴 버튼.
- 내비 상태는 URL 단일 소스 (BB1). 프로젝트 브레드크럼.

### 2.2 웨비나 허브 — 4탭 (작업 흐름 순)

```
/webinar/[slug]?tab=
├─ 만들기 (create)    셋업 존 — 고치는 영역
│   ├─ 기본 정보 (일정·발표자·복제 생성)
│   ├─ 세션 (연사 사진·세션유형)
│   ├─ 등록 폼 (커스텀 필드·consent)
│   ├─ 라이브 페이지 (테마·CTA·채팅 온오프·알림 박스)
│   ├─ 설문 (자체 설문 빌더 · showOnEnded)
│   └─ 준비 체크리스트
├─ 배포 (deploy)      내보내는 존
│   ├─ 공개 링크 · 미리보기(4상태 전환)
│   ├─ 임베드 (히어로 버튼·배너·폼 위젯) + 부착 가이드
│   └─ 허용 사이트
├─ 운영 (operate)     다루는 존 — 라이브 콘솔
│   ├─ 상태 전환 (자동/수동 오버라이드 · 라이브 전환은 확인)
│   ├─ 인터랙션 카드 (투표·공지·팝업·Tally·알림 통합
│   │    · 설정은 사이드 드로어 · 단일 활성 원칙)
│   ├─ Q&A (추천순·답변완료·화면 노출 1개)
│   ├─ 채팅 (천천히·링크숨김·금지어·고정 1개 · 헤더 온오프)
│   ├─ 러닝오더 (KST 절대시각)
│   └─ 등록자 (검색·일괄삭제·CSV·import)
└─ 분석 (analytics)   읽는 존
    ├─ 퍼널 · 등록 추이 · UTM 분해
    ├─ 시청 곡선 (attendance-curve)
    └─ 설문 응답
```

**진입 규칙**: 상태 연동 기본 진입 — 종료→분석, 라이브→운영, 그 외→만들기. 등록자 수는 진입 탭을 바꾸지 않는다.

### 2.3 시청자 상태 머신 (공개 라이브 페이지)

```
                    (일정 기반 자동 / statusOverride 수동)
등록 전 ──등록──▶ 대기(PreLiveWaiting) ──입장 오픈──▶ 입장확인(EntryVerify)
                     │ 알림 옵트인·공유                    │ 등록정보 검증
                     ▼                                    ▼
                  [미등록이면 등록 폼]              라이브(LiveContentStk)
                                                   영상 + Q&A/채팅/세션 탭
                                                          │ 종료 전환
                                                          ▼
                                                   종료(EndedScreen)
                                                   다시보기 신청 · 설문(showOnEnded)
```

- 라이브 데이터는 **`/api/webinar/[slug]/live-state` 단일 폴링(12s)** — 푸시·투표·Q&A·채팅·시청자수 모두 이 응답의 필드. **새 폴러 추가 금지.**
- 소유자 `?preview`: 상태 전환 바로 4화면 열람, 부작용 전부 `isPreviewUrl` 가드, 비소유자는 클린 URL로 폴백.

---

## 3. 영역(Zone) 매핑 — AGENTS.md 원칙 적용

| 화면 | 존 | 적용 규칙 |
|---|---|---|
| 대시보드·분석·웨비나 분석 탭 | **읽는 영역** | 헤드라인→요약→디테일, 참고 데이터는 접기 |
| 만들기 탭·설문 빌더·collect 매핑 | **고치는 영역** | 인라인 편집(0클릭), 자동저장+미리보기, 드래그 정렬 |
| 라이브 콘솔·상태 전환 | **다루는 영역** | 자주 쓰는 조작 1클릭, 파괴적·노출성만 확인 단계 |
| 공개 등록·대기·시청·종료 | **공개 페이지** | STK 토큰, 화면당 주 행동 1개, 토글+데이터 이중 게이트 |

한 페이지 안에 존이 섞일 수 있다(예: 등록 폼 탭 = 인라인 편집기[고치는] + 미리보기[읽는]) — 존 단위로 규칙 적용.

---

## 4. 데이터 모델 ↔ IA 대응 (요약)

| IA 영역 | 핵심 모델 |
|---|---|
| 워크스페이스/인증 | User, Workspace, WorkspaceMember, WorkspaceInvitation, ApiToken |
| 대시보드 | Dashboard, DashboardWidget, ScheduledReport |
| 광고 성과 | AdPerformanceImportBatch, AdPerformanceRecord(resultBucket) |
| UTM | UTMPreset, UTMTemplate, UTMLink, ShortLink |
| 사전등록 | CollectSource, FieldMapping, CollectRecord, CollectRetentionPolicy |
| 웨비나 코어 | Webinar(statusOverride·chat* 모더레이션 컬럼), WebinarSession, WebinarRegistration |
| 라이브 인터랙션 | WebinarPoll/Option/Vote, WebinarChatMessage, WebinarQA/QAVote, WebinarAnnouncement, WebinarPopup(+Click), WebinarTallyPush, WebinarReminder |
| 설문 | WebinarSurvey, WebinarSurveyResponse |
| 분석 | WebinarAttendanceSegment, WebinarVisitStat |
| 배포 | WebinarEmbedSite |

**불변 원칙**
- 단일 활성(팝업/투표/Tally/Q&A 노출/채팅 고정): DB partial unique index가 보장, 코드는 P2002→409.
- 공개 응답은 select 최소화 + PII 마스킹.

---

## 5. 타깃 IA 제안 — "Calm Workbench" (시안 단계, 미적용)

> 시안: claude.ai/code/artifact/09428cf6-875c-46fe-b8c5-83ab8d6c4c86
> 취지: 도구 이름(광고성과·UTM·collect)이 아니라 **팀의 일** 기준으로 그룹핑.

### 5.1 제안 내비

```
mach studio (마케팅팀 워크스페이스)
├─ 지표 보드                 ← 홈. KPI 8종 + 기간 비교 + 다가오는 웨비나 + 팀 활동
├─ 유입 만들기
│   ├─ 광고 성과             (현 /analytics)
│   └─ UTM 링크              (현 /utm-builder)
├─ 리드 모으기
│   └─ 사전등록              (현 /collect · 오늘 수집 수 배지)
└─ 전환 만들기
    ├─ 웨비나                (현 /webinar · 라이브 중이면 상태 점)
    └─ 리포트                (퍼널·시청곡선·UTM 기여 — 웨비나 횡단 분석)
```

### 5.2 현 IA 대비 변경점

| 항목 | 현재 | 제안 | 근거 |
|---|---|---|---|
| 홈 | /dashboard (위젯) | **지표 보드** — KPI 우선, 7일/30일 전환 | 팀 결정: 지표 중심 홈 |
| 메뉴 라벨 | 도구명 나열 | 유입/리드/전환 3그룹 | 신규 팀원도 위치 추론 가능 |
| 분석 | 웨비나 탭 내부 + /analytics 혼재 | 광고=유입 아래, 웨비나 횡단=리포트로 분리 | "광고 성과"와 "퍼널 리포트"는 다른 질문 |
| 테마 | 라이트 고정 | 라이트/다크 토큰 동시 설계 + 토글 | 시안에서 검증 완료 |
| 웨비나 허브 4탭 | 유지 | 유지 (변경 없음) | 이미 작업 흐름 순 |

### 5.3 이식 시 단계 (승인 후)

1. 사이드바 그룹핑 + 라벨 변경 (라우트 불변 — 리다이렉트 불필요)
2. /dashboard → 지표 보드 개편 (KPI 8종 + 기간 세그먼트)
3. 웨비나 횡단 리포트 신설 (기존 analytics 엔드포인트 재사용)
4. 다크 테마 토큰 도입 (CSS 변수 레이어부터)

---

## 6. URL·상태 규칙 (요약)

- 탭·필터 상태는 URL 쿼리가 단일 소스 (`?tab=`) — 새로고침·공유 안전.
- 공개 페이지 부작용(추적·발송)은 `isPreviewUrl` 가드 필수.
- 웨비나 상태는 `일정 기반 자동 ∪ statusOverride` — `entryOpen`은 오버라이드 시 시간 조건 무시.
- 공유 링크는 토큰 자체가 인가 — 만료·회수는 토큰 삭제로.
