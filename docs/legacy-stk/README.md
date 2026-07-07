# 레거시 STK 웨비나 코드 참조 (2026-07-07 사용자 제공)

스마트테크코리아(smarttechkorea.com) 아임웹에서 실제 운영된 웨비나 코드. 웨비나 허브 개편(docs/webinar-hub-redesign.md)의 레퍼런스.
mach studio의 기존 webinar 모듈은 이 코드를 포팅한 계보라 개념이 대부분 일치한다(인증 게이트, ping, 공지/팝업/Tally 폴링, presence 이원 추적).

- 상세페이지: https://smarttechkorea.com/webinar / 라이브: https://smarttechkorea.com/webinarlive
- 원본 아카이브: `hero-cta.html`(히어로 CTA), `bottom-banner.html`(하단 배너+인증 모달+폼 캡처)
- 라이브 페이지·어드민 페이지는 전문이 길어 아래 인벤토리로 정리 (원문은 사용자 재제공 또는 라이브 사이트에서 확인 가능)
- Supabase publishable key는 아카이브에서 `[REDACTED]` 처리 (새 아키텍처는 DB 직접 노출 없이 우리 API 경유)

## 새 설계에 반영된 인사이트

1. **입장 오픈 윈도**: 레거시는 4단 상태 apply → watch(시작 60분 전 입장 오픈) → live → end.
   `LIVE_MODE_START = 시작−1h`, `SIGNUP_DEADLINE = 시작−61m`. → 새 설계에 `entryOpenBeforeMinutes`(기본 60) 추가.
2. **종료 상태 다중 CTA**: 히어로 end 모드는 버튼 3개(만족도 조사 / 전시 개요 / STK 사전등록). → `heroButton.endedLinks[]`로 설정화.
3. **배너-라이브 상호 배제**: `EXCLUDE_PATHS`로 라이브/어드민 페이지에서 배너 숨김. → 로더가 live 마운트 감지 시 배너 미렌더.
4. **배너 인증 모달은 불필요해짐**: 레거시는 배너에서 인증 후 라이브 링크 제공. 새 구조는 클릭 → livePageUrl 이동 → iframe 내부 게이트에서 인증(확정 결정 2).
5. **STK 테마 프리셋**: accent `#FF4713`(hover `#ff6a3d`), Pretendard, 다크(#080809/#141417/#1a1a1f), 숫자는 JetBrains Mono. 웨비나 테마 기본 프리셋 후보.
6. **캘린더**: PC = Google Calendar URL, 모바일 = ICS Blob 다운로드(1시간 전 VALARM 포함). 배너의 캘린더 버튼은 모바일에서만 노출(CSS로 PC 숨김).
7. **카운트다운**: "사전등록 마감까지 D-N"(일 단위, 60초 갱신), live 모드 시 LIVE 배지+녹색 dot으로 전환.
8. **아임웹 특이사항**(로더 개발 시 주의):
   - 등록 모달: `SITE.openModalMenu(group, menu)` — 새 구조에선 미사용(우리 폼 위젯로 대체)
   - 아임웹 폼 제출 감지: XHR/fetch 후킹 `/ajax/form_add.cm` + `input[name="input_xxx"]` 셀렉터 매핑 — **전시마다 셀렉터가 바뀌는 것이 베리에이션 고통의 핵심 증거**. 폼 위젯 직행 방식으로 폐기.
   - z-index: 배너 999900, 인증 모달 1000002, 아임웹 `#cocoaModal` 보정 1000000~1000001
   - Channel.io 위젯 숨김: `#ch-plugin { display:none!important }` (배너/라이브 페이지에서)
   - 아임웹 기본 스타일 오염 대비: `-webkit-text-fill-color` 강제, 폰트 `!important` 스코핑 (`.pcl` 프리픽스)
   - EN 버전은 별도 도메인 키워드 + `TODO_EN_*` 셀렉터 placeholder — 다국어 베리에이션도 수작업이었음
9. **중복 제출 방지**: name|phone|email|company 지문 + sessionStorage 60초 윈도. 서버 unique 제약(`ux_webinar`) 409 허용 처리.

## 라이브 페이지 기능 인벤토리 (mach live 페이지와 대조용)

- 인증 게이트: 연락처/이메일 탭, RPC `verify_webinar_registration`, localStorage `stk_webinar_auth`(+session), 미등록 시 등록 페이지 유도 링크
- 시청 추적(정밀): **active ping 15초**(탭 보임) / **presence ping 60초**(백그라운드), visibilitychange로 pause/resume, 숨김 시간은 체류에서 제외, `stay_minutes` 누적(재입장 이어짐), MAX 480분 캡, pagehide는 left_at 저장 안 함(bfcache 오탐 방지) — mach의 lastPingAt/presencePingAt 이원 구조와 동형
- 공지 배너: 타입 6종(info/session/break/qa/end/urgent) 색상 테마, 15초 폴링, 상단 고정 슬라이드
- 팝업 푸시: 타입 4종, 메인/보조 버튼, Tally 버튼형(integration_type=tally), dismissible, `id+updated_at` 키로 닫음 기억(수정/재ON 시 재노출), 15초 폴링
- Tally 단독 푸시: form_id/layout/width/autoClose/emoji, show_once, doNotShowAfterSubmit, **hiddenFields 프리필**(name/email/phone/company/department/job_title/source/originPage) — 응답자 식별의 핵심, 새 구조에서도 유지 필수
- 알림함(notification center): 우하단 플로팅 버튼+배지, 닫은 공지/팝업/Tally를 다시 여는 패널 — mach live 페이지에 없으면 이식 후보
- 세션 아젠다 카드(6세션, 시간·연사), 사이드바: Q&A 카드 / 만족도 조사(Tally) / 전시 사전등록 CTA 카드
- Q&A: 세션 선택(선택), 500자, 인증 정보 자동 첨부(registration_id/name/company/...)

## 어드민 페이지 기능 인벤토리 (mach 어드민으로 대체 — 기능 대조용)

- 8탭: 대시보드 / 접속자 / Q&A / 전체 신청자 / 공지 푸시 / 팝업 푸시 / Tally 푸시 / 분석. 5초 폴링
- KPI: 현재 시청자(60초) vs **페이지 접속 유지(5분, presence)** 분리, 평균/피크 동시접속, 누적 시청, 출석률, 평균/최대 체류, 대기 질문, 마케팅 동의
- 접속자 테이블: 전 컬럼 정렬, LIVE(90초)/TIMEOUT(180초)/이탈중 배지 + 유지중(2분)/백그라운드(5분)/끊김 배지
- Q&A: 상태 4종(대기/선정/답변완료/제외) + 세션 지정 + 삭제
- 공지: 타입별 템플릿 문구 자동 입력, ON 1개만 유지 규칙(새 ON 시 기존 전부 OFF)
- 팝업/Tally 푸시: 등록→이력에서 ON, ON 1개 유지, 편집 모드, Tally embed 코드에서 form_id/emoji 자동 추출
- **아임웹 CSV 가져오기**: 헤더 자동 매핑(응답시간/성함/연락처/이메일/소속 회사/부서/직함/종사 산업/사전질문/마케팅), 중복 제외 vs 원본 그대로 모드, 200건 청크 insert → **신규 기능 후보** (과거 데이터 이관·백업용)
- 분석: 퍼널(등록→입장→30분→60분), 10분 슬롯 동시접속 라인차트(14:00~16:20, entered_at→presence_ping_at 스팬), 시간대별 입장 바차트, 산업 도넛, 직책 바, 체류 분포, CSV 내보내기
- **분석 공유 링크**: SHA-256 비번 해시를 config 테이블에 저장, `?share=1` 읽기 전용 뷰(RPC로 개인정보 제외 데이터만) → **신규 기능 후보** (mach 기존 share 인프라 재사용)
