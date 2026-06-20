# 저탄마을 스프린트 4 개발 보고서

기간: 2026년 5월 27일 ~ 6월 5일 (10일)

---

## 1. 저탄마을은 무엇을 하는 서비스인가

저탄마을은 정부가 운영하는 저탄소 농축산물 인증 사업에 참여하는 농가가 영농일지와 증빙 사진을 쉽게 관리할 수 있게 만든 서비스다. 사용자는 셋이다.

- **농민** — 60~80대가 대부분이다. 폰으로 사진을 찍어 올리고, 음성으로 영농일지를 적는다.
- **이장** — 마을 농가들의 기록 상태를 데스크톱에서 한눈에 보고, 누락이나 잘못 찍힌 사진에 재촬영을 요청한다.
- **관리자** — 정부 시행령을 읽어 사업을 등록하고, 활동·증빙 요건을 정의한다.

세 사용자는 하나의 데이터베이스를 같이 본다. 농민이 올린 사진은 이장 화면에 즉시 보이고, 이장이 승인하면 농민에게 알림이 간다. 마지막에는 사업 단위 PDF 리포트를 만들어 정부에 제출한다.

기술 구성은 backend 한 덩어리에 frontend 셋이다.

- backend: FastAPI, Python 3.10 이상, PostgreSQL (Supabase) + pgvector, OpenAI, Pillow
- frontend: Next.js 16 + React 19 + TypeScript 5.7 — 농민용 `app_user`, 이장용 `web_user`, 관리자용 `web_admin`
- 호스팅: backend = Render, frontend × 3 = Vercel, DB·Object Storage = Supabase

도메인 특수성 때문에 운영 원칙을 다섯 가지로 못 박아 두었다. AI 가 사용자 확인 없이 데이터를 저장하지 않는다. 오늘 할 일은 항상 DB 에서만 온다. 사진의 증빙 종류는 AI 가 후보만 제안하고 사용자가 확정한다. 농민 식별자는 `farmer_id` 하나로만 다닌다. 키와 비밀번호는 backend `.env` 에만 둔다. 이 다섯이 깨지면 정부 감사·컴플라이언스 문제로 바로 이어진다.

---

## 2. 스프린트 4 한눈에

| 항목 | 값 |
|---|---|
| 기간 | 2026-05-27 ~ 2026-06-05, 10일 |
| 커밋 수 | 74건 (merge 제외) |
| 변경 파일 | 1,168개 |
| 코드 추가 | +79,599줄 |
| 코드 삭제 | -14,607줄 |
| 기여자 | Chanho Park 43건, Changhee Ghang 29건, sunnypark 2건 |

큰 변경량 안에는 디렉토리 개명·임시 파일 정리처럼 줄 수가 부풀려진 작업도 포함된다. 실 작업의 무게는 §3 에서 영역별로 풀어 적었다.

이번 스프린트의 큰 줄기는 여섯이다.

1. PostgreSQL 이관 마무리와 디렉토리 구조 정리
2. RAG 시스템을 Chroma 에서 Supabase pgvector 로 이관
3. 농민 앱의 라이브 카메라 코칭과 음성 영농일지 강화
4. 이장 대시보드 재설계 — 알림·기록 도우미 시스템 추가
5. 관리자 화면 — 시행령 자동 청킹 후 사업 등록 흐름 완성
6. 테스트 시나리오 정립 — 요구사항 ↔ 테스트 양방향 추적

---

## 3. 영역별 작업 내용

### 3.1 아키텍처 — PostgreSQL 이관과 구조 정리

스프린트 초반은 데이터 계층 정리였다. 5월 28일 PostgreSQL 이관에 따른 백엔드 전반 리팩토링이 이뤄졌고, DBMS 중립 코드 가이드 문서도 함께 정리했다. 5월 29일에는 변경된 테이블·뷰를 마크다운으로 문서화하고 사업참여 todo 리스트도 새 구조에 맞춰 갱신했다.

6월 2일에는 디렉토리 이름을 바꿨다. 농민용 `v0_farmer` 가 `app_user` 로, 이장용 `v0_chief` 가 `web_user` 로 바뀌었다. 동시에 컴포넌트 평탄화 작업이 같이 진행되어 import 경로가 더 짧아졌다. 같은 날 `user_ville` view 의 컬럼도 fix 했고, 6월 2일 `parcel` 테이블 변경분을 backend·frontend 양쪽에 반영했다.

6월 4일에는 정리가 한 번 더 들어갔다. 임시 디렉토리 셋을 한 번에 삭제한 커밋이 -12,977줄을 차지한다. 같은 날 "구조 재편 + 이장 대시보드 개편 + 라이브 코칭 기준 dict + 문서 통합" 한 묶음의 커밋이 또 들어가, +1,702 / -6,115 의 변동이 났다. 큰 정리가 두 번 들어간 셈이다.

### 3.2 RAG — Chroma 에서 Supabase pgvector 로

영농 정책 문서를 검색해 농민에게 안내하는 RAG 가 한 번 갈렸다.

처음에는 Chroma 를 썼다. 5월 27일부터 RAG 성능을 손봤고, 5월 29일에는 단가표 검색을 보강하고 답변 단위·종결 표현을 정리했다. 같은 날 `chat_with_rag` 응답을 농민이 알아듣기 쉬운 톤으로 다듬고, 답변 끝에 붙는 인용 마커를 뺐다.

6월 4일에 큰 이관이 들어갔다. Chroma 를 떼고 Supabase pgvector 로 옮겼다. 같은 commit 에 시행지침 9페이지의 정확 기준을 prompt 에 박는 작업이 합쳐졌다. 청크 218개를 새로 임베딩해 적재했고, 비용은 약 $0.014 였다. 이관 후에도 활동 키워드 boost·금액 boost·MMR 후처리 같은 기존 응답 품질 보강 로직은 그대로 유지했다.

이관과는 별개로 음성·시각 AI 도 같이 다듬었다. 6월 4일 STT 로직과 TTS 안내 규칙을 업데이트해 농민이 잘못 들리는 단어를 줄였다.

### 3.3 농민 앱 — 라이브 카메라 코칭과 음성 영농일지

농민 앱은 스프린트 내내 손이 많이 갔다.

5월 27일에 영농일지에 AI 기능을 붙였고, 음성 대화 컨텍스트가 함께 들어갔다. 5월 28일에는 음성 인식 자체를 한 번 더 업데이트했다.

5월 31일에는 모바일 톤을 통일하고, backend 의 농가 컨텍스트를 prefetch 해 화면 전환 지연을 줄였다. 같은 날 홈 화면의 탭바도 손봤다.

6월 2일에는 마을 현황 redesign, 알림 시스템, 기록 도우미 모드, 고령 사용자 UX 를 한 묶음으로 정리했다. 글자가 더 커졌고, 카드 간격이 더 벌어졌으며, 도우미가 다른 농가 todo 를 대신 채울 수 있는 흐름이 들어갔다.

6월 4일에 큰 작업이 들어갔다. 카메라 기능을 새로 추가한 commit 이 1,724줄을 차지한다. `PhotoLiveCoachOverlay` 가 3초마다 frame 을 Vision 으로 보내 농민에게 음성으로 안내하는 흐름이다. 시행지침 9페이지의 evidence_type 별 정확 기준 (PIC1/PIC2/RCT/EDU × job_cd) 을 prompt 에 박아 두어, 농민 앞에서 농민이 잘 알아듣게 말한다.

### 3.4 이장 대시보드 — 마을 현황 재설계와 도우미 시스템

5월 31일 이장님 기능 업데이트와 대시보드 작업 연동이 있었다. 6월 1일에는 supabase 파일 서버 연동 클래스를 새로 짰다 — 이장이 사진 검토할 때 Supabase Object Storage 에서 바로 가져온다.

6월 2일에 마을 현황 화면이 통째로 다시 설계됐다. 오늘 먼저 챙길 농가 우선순위 카드, KPI 4종 (오늘 사진·전체 남은 일정·이번 주 마감·도움 필요), 오늘의 운영 메모, 챙겨야 할 농가 리스트, 최근 사진 썸네일, 마을 일정 캘린더가 같이 들어갔다. 알림 시스템과 기록 도우미 페어 흐름도 같은 커밋에 합쳐졌다.

같은 날 사업참여 화면에서 todo 리스트가 새 테이블 구조에 맞게 다시 그려졌고, 농가별 조회가 추가됐다.

### 3.5 관리자 — 시행령 자동 청킹과 사업 등록

관리자 화면 (`web_admin`) 은 이번 스프린트에서 가장 신규 작업이 몰렸다.

5월 30일 프로젝트 관리 화면과 backend 가 한 번에 들어갔다. 6월 1일 화면 분리, 6월 2일 프로젝트 관리 2차 작업과 1차 완성본이 이어졌다. 같은 날 마을관리 1차도 들어갔다. 6월 4일 날씨 정보 화면이 추가됐다.

6월 5일에 마지막 큰 신규 기능이 들어갔다 — 시행령 청킹 기능이다. 관리자가 정부 시행령 (.pdf / .docx / .hwpx) 을 업로드하면 backend 가 텍스트를 뽑아 청크로 나누고, Supabase pgvector 에 영구 적재한다. 그 뒤 LLM 으로 사업명·시행연도·주관기관·대상작물·지원조건·예산·문의처 같은 사업 메타데이터를 JSON 으로 뽑고, 시행령에 등장하는 작업 목록을 todo 초안으로 정리한다. 관리자가 form 에서 검토하고 수정해 사업으로 등록한다.

같은 날 `POST /project` 와 `POST /project/draft-from-document` 두 엔드포인트가 같이 들어갔다. program_master + project 두 row 를 한 트랜잭션으로 만들고, prj_id / biz_id 를 자동으로 채번한다.

### 3.6 인프라·배포

5월 28일 SUPABASE 파일 테스트가 시작이었다. 5월 29일 supabase 사진 증빙 이관, 파일 업로드/다운로드 라이브러리 작성, DB 백엔드 연동이 줄줄이 들어갔다.

6월 4일에는 배포 라인이 정비됐다. `render.yaml` 추가, `deploy.yml` 수정, vercel 배포 절차 정리, env 갱신, 127.0.0.1 / localhost 호환성 유지 등이 한꺼번에 들어갔다. backend 는 Render starter plan 으로 올라가 있고, frontend 셋은 각각 Vercel 에 붙어 있다.

### 3.7 시드 데이터

6월 4일 이장님 시연용 시드 + AI 사진 생성 스크립트가 들어갔다. 시연 농가 한 명 (김영수, login_id=ys.kim) 의 일정과 증빙을 미리 만들어 두어, 시연 직전 `POST /demo/seed` 한 번이면 데모 데이터가 준비된다. 다만 시드 안에는 의도된 미래 일정 placeholder 2건 (중간 물떼기 시작 6월 27일, 종료 7월 11일) 이 들어 있고, parcel 좌표가 실제 농지 위치가 아닌 placeholder 로 남아 있다. 이 두 가지는 §5 에 정리했다.

### 3.8 테스트와 QA

6월 4일 QA 산출물과 backend smoke 테스트가 들어갔다 (+2,438줄). 6월 5일에 비기능 테스트 계획서와 backend 의 작은 추가 손질이 있었고, 같은 날 마지막으로 테스트 시나리오 작성과 1회 실행이 진행됐다 (+2,910줄).

테스트 시나리오는 8개 영역으로 묶었다 — 농민 앱 핵심 경로, 이장 대시보드, 관리자 사업 생애주기, 데이터·보안 원칙, 정부 인증 컴플라이언스, AI 모듈 안전망, 시니어 가독성, 응답 속도. 검증 영역 이름은 "L1 Smoke" 같은 추상 라벨 대신 도메인 의미가 드러나는 한국어로 적었다.

검토 과정에서 받은 두 가지 피드백 — 테스트가 요구사항 없이 진행됨, PASS/FAIL 기준 불명확 — 에 맞춰 다음을 정리했다. 요구사항 표를 마이너 업데이트 (5건 갱신 + 2건 신규) 했고, 요구사항 ↔ 테스트의 양방향 매핑을 별도 표로 분리했다. 각 시나리오에는 HTTP status, response body 키, DB row 증감 같은 측정 가능한 PASS 조건만 박았다.

스프린트 4 마무리 시점의 테스트 결과는 다음과 같다 — 72건 통과 / 10건 자동 skip / 1건 알려진 이슈로 보류 (xfail) / 0건 실패. 실행 시간은 약 33초다. 만든 테스트 데이터는 모두 자동 정리되어 시드에 흔적이 남지 않는다.

### 3.9 문서

5월 28일 DBMS 중립 아키텍처 문서, 백엔드 서비스 개발 가이드 prompt 가 들어갔다. 5월 29일 테이블·뷰 수정 문서 두 건, 서비스 아키텍처 문서가 추가됐다. 6월 2일 dev-status 종합 brief 가 들어갔고, 6월 4일 멘토링 문서, RAG 이관에 따른 docs 갱신, AGENTS.md 의 항목 갱신이 묶여 들어갔다.

문서가 17개 정도 정리되고 9개가 새로 들어왔다. 디렉토리는 `architecture / database / business / spec / dev / demo / design-system / guidelines` 8개 카테고리로 다시 묶었다.

---

## 4. 핵심 산출물

### 4.1 코드 산출물 (영역별 대표)

| 영역 | 대표 파일 |
|---|---|
| RAG 이관 | `backend/app/services/supabase_rag_service.py`, `backend/scripts/ingest_to_supabase.py` |
| 시행령 청킹 | `backend/app/services/document_ingest_service.py`, `admin_project_draft_service.py`, `routers/project.py` (POST /project, POST /project/draft-from-document) |
| 라이브 카메라 코칭 | `app_user/components/PhotoLiveCoachOverlay.tsx`, `backend/app/services/photo_guard_service.py` |
| 이장 대시보드 재설계 | `web_user/app/dashboard/page.tsx`, `components/dashboard/*` 일괄 |
| 관리자 프로젝트 등록 | `web_admin/app/project/new/page.tsx`, `web_admin/lib/project-admin-api.ts` |
| 도우미 모드 | `app_user/lib/helper-mode-context.tsx`, `backend/app/services/farm_helper_service.py` |
| Supabase Storage | `library/locaville/storage_client.py` |

### 4.2 문서 산출물

| 문서 | 위치 |
|---|---|
| 인수 인계 — AI agent 진입점 | `AGENTS.md` |
| 시연 직전 체크리스트 | `docs/demo/demo-runbook.md` |
| 시연 시나리오 | `docs/demo/final-demo-scenario.md` |
| 테스트 시나리오 | `docs/dev/test-scenarios.md` |
| 요구사항 ↔ 테스트 매핑 | `docs/dev/test-requirement-mapping.md` |
| 테스트 실행 결과 (2026-06-05) | `docs/dev/test-results/2026-06-05.md` |
| 요구사항 표 (엑셀) | `docs/dev/0602_저탄마을_요구사항정의서_latest_screen_based_star.xlsx` |
| 멘토링 문서 | `docs/mentoring/` |
| 백엔드 서비스 개발 가이드 prompt | `docs/dev/team-dev-onboarding.md` |
| RAG 이관 docs 갱신 | `docs/architecture/` 안의 RAG 절 |
| DB 스키마 변경분 | `docs/database/` |
| dev-status 종합 brief | `docs/dev/dev-status-2026-06-01.md`, `2026-06-04.md` |

### 4.3 수치 결과

- 테스트: 72 통과 / 10 skip / 1 xfail / 0 실패, 약 33초
- 요구사항 표: 65건 → 67건 (5건 갱신 + 2건 신규)
- RAG 청크: Chroma 시절에서 옮긴 218개 청크 + 새 시행령 청킹 기능
- 시드: 농가 7명 + 의도된 미래 일정 placeholder 2건

---

## 5. 이번 스프린트에서 발견한 것

### 5.1 BIOCHAR 영수증 false positive

영수증을 사진으로 올리면 backend 가 vendor·items 텍스트로 활동 유형을 추정한다. 키워드 매칭이 너무 광범위했다. "탄소"·"숯"·"토양개량제" 같은 흔한 단어가 BIOCHAR (바이오차 투입) 로 자동 분류돼서, 일반 농자재 영수증·숯불 가게 영수증·석회 비료 영수증까지 모두 바이오차로 잡혔다. 시연 농가에서 "왜 우리 가게 영수증이 다 바이오차로 뜨지" 라는 의문이 나왔다.

키워드를 specific 한 것 (`바이오차`, `biochar`, `왕겨숯`, `탄화왕겨`) 으로 좁혔고, 단일 매칭은 confidence 0.45 의 낮은 신뢰로 표시하면서 evidence_type 을 자동으로 채우지 않게 바꿨다. 이 변경이 누군가 무심코 되돌리지 못하도록 회귀 보호 케이스 6개를 박아 두었다.

### 5.2 시드 parcel 좌표가 placeholder

GPS-농지 거리 invariant 를 자동 검증으로 만든 뒤 시드에 적용하니, evidence GPS 와 같은 농가의 parcel GPS 가 175km / 325km 떨어진 채로 박혀 있었다. parcel 좌표가 서울 종로 (37.527, 127.004) 로 들어가 있고, evidence GPS 는 전라남도·충남 일대 농지 실좌표였다. parcel 시드가 placeholder 였던 셈이다. 검증은 일단 `xfail` 로 표시했고, 시드 parcel 좌표를 정리하면 자동으로 통과 상태가 된다.

### 5.3 `LOCALVILLE01` (L 두 개) 오타

memory 와 AGENTS.md §7 의 데모 컨텍스트 표에 `LOCALVILLE01` 로 적혀 있었는데, 실제 DB 의 ville_id 는 `LOCAVILLE01` (L 한 개) 였다. memory 는 이번 라운드에서 갱신을 끝냈고, AGENTS.md 의 표 한 줄은 다음 사이클에 정리한다.

### 5.4 `.btn-lg` 시니어 권장 미달

이장·관리자 globals.css 의 큰 버튼이 실제로는 약 49px 로 렌더된다 (font 19px + padding 14·24). AGENTS.md §5 의 시니어 가이드는 버튼 ≥ 56px 다. 7px 부족이다. 시연 폰에서 누르기 어렵다는 피드백이 나올 가능성이 있어 디자인 검토 항목으로 남겼다.

### 5.5 시드의 의도된 미래 일정 placeholder

`capture_dt > NOW()` 인 evidence 2건이 시드에 들어 있다. 처음에는 컴플라이언스 위반인가 싶었는데, 시드 SQL 주석을 보니 시연용 미래 일정 placeholder 였다 (중간 물떼기 시작 6/27, 종료 7/11). invariant 정의를 "현재 시점 이전의 사진" 으로 좁혀, 위조 의심은 잡되 placeholder 는 통과하도록 정리했다.

---

## 6. 남은 과제와 다음 스프린트로

스프린트 4 마무리 시점에 명확해진 다음 작업.

### 6.1 정리 작업

- 시드 parcel 좌표를 실 농지 위치로 교체 — GPS-농지 거리 invariant xfail 자동 해소
- AGENTS.md §7 의 `LOCALVILLE01` → `LOCAVILLE01` 교정
- `.btn-lg` 시니어 권장 56px 충족 디자인 검토

### 6.2 자동 검증 확장

- Playwright 활성화 — `pnpm install -D @playwright/test && pnpm exec playwright install chromium` 후 4개 sample 실행. 이장 대시보드부터 시작해 농민 앱·관리자로 확장
- L3 시나리오 확장 — 도우미 모드의 recipient PoV (`approve` endpoint 흐름) 추가
- L3 시나리오 확장 — 음성 영농일지의 finalize 응답을 받아 frontend 가 `POST /diary` 까지 호출하는 한 묶음 e2e
- L4 시나리오 확장 — 워터마크 EXIF 박힌 JPEG fixture 강화 (piexif 도입 시)
- L7 활성화 조건 — Render plan 다운그레이드, 사용자 폭증, pgvector 검색이 느려질 때 `L7_RUN=1` 로 한 번 실행

### 6.3 도메인 신규 작업 후보

- 시행령 자동 등록의 실 e2e — 정부24 / data.go.kr 의 다양한 시행령 포맷에 대한 실측 테스트
- GPS-농지 폴리곤 매칭 — 단순 거리 (Haversine) 대신 PostGIS 도입 후 정확 매칭
- 관리자 앱의 사업 → 활동 → Job 흐름의 todo 초안 자동 등록 — 현재 사용자가 detail 페이지에서 다시 손으로 입력하는데, 시행령 청킹 결과를 받아 자동으로 활동 + Job 까지 만드는 흐름

---

## 7. 기여 분포

| 기여자 | 커밋 수 | 주된 영역 |
|---|---|---|
| Chanho Park | 43 | RAG·AI·라이브 카메라 코칭·시행령 청킹·테스트 시나리오·문서 |
| Changhee Ghang | 29 | 관리자 프로젝트 화면·DB 이관·파일 라이브러리·사업참여 |
| sunnypark | 2 | QA 산출물·prototype 정리 |

특정 영역에 작업이 몰리면서 동시에 PostgreSQL 이관과 디렉토리 개명처럼 횡단 작업이 같이 들어갔다. 큰 줄기 여섯이 서로 다른 사람의 책임 영역과 맞물려 있어, 매일 dev-status brief 와 멘토링 문서로 공유 상태를 유지했다.

---

## 8. 마무리

스프린트 4 의 색깔은 "기반을 다지면서 시연 흐름을 한 번 더 닫는다" 였다. PostgreSQL 이관·디렉토리 정리·RAG 이관 같은 기반 작업이 절반, 관리자 시행령 청킹·이장 대시보드 재설계·라이브 카메라 코칭 같은 도메인 가치 확장이 나머지 절반이다. 마지막 이틀에 테스트 시나리오와 양방향 매핑을 정립해, 다음 스프린트의 회귀 보호 안전망이 만들어졌다.

다음 스프린트는 시연 리허설을 한 번 거친 뒤, §6 의 정리 작업과 자동 검증 확장을 우선 마무리하고, 시행령 자동 등록의 실 e2e 와 도우미 모드 양쪽 PoV 까지 닫는 방향으로 가져갈 수 있다.
