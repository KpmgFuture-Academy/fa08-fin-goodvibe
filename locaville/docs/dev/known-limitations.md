# 저탄마을 알려진 제약 사항

기준일: 2026년 6월 5일 (스프린트 4 마무리 시점)

이 문서는 현재까지 의도적으로 미해결로 남겨둔 항목, 시연 시 주의할 점, 정식 출시 전 정리가 필요한 부분을 영역별로 정리한 것이다. 한 항목은 **현상 → 원인 → 우회 → 해소 계획** 순으로 적었다.

---

## 1. 시연 환경 제약 (브라우저·네트워크)

### 1.1 라이브 카메라는 HTTPS 또는 localhost 에서만 작동

- **현상**: `getUserMedia` 가 LAN IP HTTP (`http://192.168.x.x:3000`) 에서는 브라우저 보안 정책으로 차단된다. 폰을 같은 와이파이에 붙여 LAN 으로 시연하면 카메라가 안 켜진다.
- **원인**: 브라우저의 secure context 요구사항. 우회 불가.
- **우회**: 카메라가 안 열리면 file input fallback 으로 자동 진입한다 — 갤러리 또는 폰의 카메라 다이얼로그를 띄운다.
- **해소**: Vercel HTTPS 배포 URL 로 폰 접속이 기본 시연 환경이다. 임시로는 ngrok 또는 cloudflared 터널을 HTTPS 로 띄워 쓴다.

### 1.2 iOS Safari 흔들림 감지 권한

- **현상**: iOS 13 이상에서 `DeviceMotionEvent.requestPermission()` 이 사용자 제스처 안에서만 호출 가능하다. 현재 `PhotoLiveCoachOverlay` 에 명시적 권한 요청 UI 가 없어 흔들림 감지가 동작하지 않을 수 있다.
- **원인**: iOS 정책 변경.
- **우회**: 흔들림 감지가 실패해도 셔터는 사용자가 누르므로 사진은 정상 등록된다.
- **해소**: 정식 출시 전 권한 요청 모달 한 번 띄우는 흐름 추가.

### 1.3 Vercel 환경 변수는 빌드 시점에 박힌다

- **현상**: `NEXT_PUBLIC_*` 변수는 빌드 시점에 정적으로 인라인된다. 배포 후 `NEXT_PUBLIC_API_BASE_URL` 같은 값을 바꾸면 재배포가 필요하다.
- **원인**: Next.js 의 빌드 모델.
- **우회**: 변경 즉시 재배포. 시연 직전 변경은 피한다.
- **해소**: 변경 가능성이 큰 값은 frontend 가 backend 의 `/config` 엔드포인트에서 받아오게 변경. 정식 출시 단계 작업.

---

## 2. 데이터 모델과 시드의 어긋남

### 2.1 시드의 parcel 좌표가 placeholder

- **현상**: 김영수 농가 (`amo_regno=1110000002`) 의 parcel GPS 가 서울 종로 좌표 (37.527, 127.004) 로 박혀 있는데, evidence GPS 는 농지 실좌표 (전라남도·충남 일대) 다. GPS-농지 거리 invariant 자동 검증이 `xfail` 상태다.
- **원인**: 시드 SQL 작성 시 parcel 좌표를 실좌표 대신 placeholder 로 채웠다.
- **우회**: 자동 테스트는 `xfail` 마커로 분리 — 진짜 위조 의심은 잡되 이 케이스는 보류로 표시한다.
- **해소**: `library/sql/seed/transactions_demo.sql` 의 김영수 parcel 좌표를 실 농지 위치로 교체. 다음 사이클 정리 작업.

### 2.2 시드의 의도된 미래 일정 placeholder

- **현상**: `capture_dt > NOW()` 인 evidence 2건이 시드에 들어 있다 — 중간 물떼기 시작 (2026-06-27) 과 종료 (2026-07-11).
- **원인**: 시연 시 "다가오는 농작업" 을 보여 주려고 의도적으로 미래 시각으로 박았다. 시드 SQL 주석에 명시되어 있다.
- **우회**: 위조 차단 invariant 를 "현재 시점 이전의 사진" 으로 좁혀, 이 placeholder 는 통과로 인정한다.
- **해소**: 시연 종료 후 정식 출시 단계에서 placeholder 제거 또는 정식 일정 데이터로 교체.

### 2.3 `LOCALVILLE01` (L 두 개) 오타

- **현상**: memory 와 `AGENTS.md` §7 데모 컨텍스트 표에 `LOCALVILLE01` 로 적혀 있다. 실제 DB 의 `ville_id` 는 `LOCAVILLE01` (L 한 개) 다.
- **원인**: 시드 SQL 의 ville_id 가 한 번 바뀐 뒤 문서 갱신이 누락됐다.
- **우회**: 코드와 DB 는 `LOCAVILLE01` 로 맞춰져 있어 동작에는 영향 없다. 문서만 잘못 적혀 있다.
- **해소**: memory 는 갱신 완료. `AGENTS.md` §7 의 표 한 줄을 다음 사이클에 교정.

### 2.4 `parcel.usage` 컬럼명

- **현상**: 옛 컬럼명은 `usage` / `area`, 신 컬럼명은 `parcel_usage` / `parcel_area` 다. backend SQL 에 양쪽 alias 처리가 들어가 있다 (`SELECT parcel_usage AS usage`).
- **원인**: DB 스키마 변경 이후 frontend 의 참조가 옛 이름으로 남아 있다.
- **우회**: alias 로 양쪽 다 동작.
- **해소**: frontend 의 `parcel.usage` 참조를 `parcel.parcel_usage` 로 통일. 정리 시점은 정식 출시 전.

### 2.5 시연용 하드코딩 잔여물

| 항목 | 위치 |
|---|---|
| 데모 사용자 기본 `ys.kim` | `app_user/lib/sample-user-context.ts` |
| 데모 마을 fallback `LOCAVILLE01` | `web_user/components/*.tsx` |
| `MOCK_RESIDENTS` 3명 | `web_user/components/residents/VillageResidentsPage.tsx` |
| `DEFAULT_PROJECTS` / `DEFAULT_GROUPS` fallback | `web_user/components/residents/ResidentDetailPage.tsx` |

정식 출시 전 환경별 분기로 옮기거나 제거.

### 2.6 농민 식별자가 네 종류

- **현상**: 사용자 식별자가 `login_id`, `farmer_regno`, `user_no`, `amo_regno` 네 가지다.
- **원인**: 기존 시스템과의 호환 + 정부 제출용 표준 ID 가 함께 살아남았다.
- **우회**: `identity_rdb.resolve_*` 가 어느 형태로 들어와도 정규화한다. frontend 는 `farmer_id` 하나로만 전달한다.
- **해소**: 새 엔드포인트 작성 시 항상 `farmer_id` 만 받는 규칙을 유지. 자동 테스트에 frontend 코드의 직접 ID 노출 여부 검증이 들어가 있다.

---

## 3. AI 와 RAG

### 3.1 RAG 의 표 데이터 추출

- **현상**: HWPX 를 텍스트로 변환할 때 표 구조가 손실된다. 시행지침의 evidence_type 별 기준이 표로 되어 있어 RAG 검색 정확도가 낮다.
- **원인**: HWPX 의 표 셀 메타데이터를 현재 청크 전략이 보존하지 못한다.
- **우회**: 시연지침 9페이지의 핵심 기준은 `photo_guard_service.py` 의 `PHOTO_CRITERIA` dict 에 하드코딩되어 있다.
- **해소**: 표 청커 개선 또는 표 내용 검수 후 dict 갱신. 후자가 빠르다.

### 3.2 RAG baseline 부정확 케이스 2건

Supabase pgvector 이관 후 10개 baseline 쿼리 검증 결과, 2건이 부정확하다. 시연 핵심 시나리오에는 영향 없다.

| # | 쿼리 | top 1 결과 | 원인 | 개선 방향 |
|---|---|---|---|---|
| 4 | "사업 참여 절차" | "사업포기 유의사항" | 일반 쿼리에 활동 keyword boost 미적용, embedding 어긋남 | `_ACTIVITY_HEADING_KEYWORDS` 에 "사업참여", "사업등록" 추가 |
| 7 | "사업 포기 신청 방법" | 신청서 form chunk | "사업포기 절차" chunk 가 짧거나 다른 chunk 에 묻힘 | `hwpx_ingest_service` 청크 전략 재검토 |

나머지 8건 (중간 물떼기 단가, 바이오차 증빙, AWD 4회 등) 은 top-3 안에 정확 chunk 가 들어온다.

### 3.3 `evidence_type` 코드 매핑

- **현상**: `JOB_EVIDENCE_TO_CRITERIA` dict 가 `(job_cd, evidence_type)` → criteria key 로 매핑한다. 새 `job_cd` 나 `evidence_type` 추가 시 이 dict 도 같이 갱신해야 한다.
- **원인**: dict 가 manual 정의다.
- **우회**: 현재 시드 데이터에 해당하는 매핑은 다 들어 있다.
- **해소**: backend 의 `farm_job` / `code_detail` 에서 evidence 정의를 가져와 dict 를 자동 생성하는 흐름 추가.

### 3.4 영수증 활동 분류는 키워드 매칭 한계

- **현상**: 영수증 OCR 결과의 vendor·items 텍스트로 활동 유형 (BIOCHAR, WASTE 등) 을 키워드 매칭으로 추정한다. 광범위한 단어가 들어가면 false positive 가 났다.
- **원인**: 단순 텍스트 매칭. 의미 분석이 없다.
- **우회**: BIOCHAR 의 광범위 키워드 (`탄소`, `숯`, `토양개량제`) 를 specific 한 것 (`바이오차`, `biochar`, `왕겨숯`, `탄화왕겨`) 으로 좁혔다. 단일 키워드 매칭은 confidence 0.45 로 표시하고 `evidence_type` 자동 매핑을 차단한다. 사용자에게 직접 선택을 요구한다.
- **해소**: 정식 출시 단계에서 영수증 분류 자체를 별도 LLM 호출로 옮기는 방향. 현재는 회귀 보호 6개 테스트로 false positive 가 다시 나오지 않도록 막아 두었다.

### 3.5 음성 세션이 in-memory dict

- **현상**: `/ai/voice/session/*` 가 backend 의 in-memory dict 로 세션을 유지한다. backend 가 재시작되거나 다중 인스턴스가 되면 세션이 손실된다.
- **원인**: 현재 단일 인스턴스 운영을 가정한 단순 구현.
- **우회**: 시연은 단일 인스턴스 + 짧은 세션이라 문제 없다.
- **해소**: Redis 같은 외부 store 로 이전. 사용자가 늘어나거나 다중 인스턴스 운영이 필요해질 때.

### 3.6 도우미 모드의 사진 GPS

- **현상**: 도우미가 피도움 농가의 todo 로 사진을 등록할 때 GPS 는 도우미의 폰 위치다. 워터마크 주소가 피도움자의 농가가 아닐 수 있다.
- **원인**: 사진 메타데이터는 촬영자의 폰에서 온다.
- **우회**: 워터마크에 GPS 는 그대로 박는다 (감사 추적용).
- **해소**: 정식 출시 시 도우미가 명시적으로 피도움 농가의 농지를 선택하게 하거나, GPS 를 별도로 입력받는 흐름 추가.

### 3.7 STT 의 도메인 단어 인식

- **현상**: Whisper 가 한국 농업 어휘 (바이오차, 중간 물떼기, 폐비닐 수거 등) 를 일반 단어로 잘못 인식할 때가 있다.
- **원인**: 음성 인식 모델이 일반 도메인 학습 분포에 기울어 있다.
- **우회**: `_get_stt_prompt` 에 도메인 어휘를 prompt 로 흘려보내 인식률을 보완한다. prompt 가 leak 된 출력은 prompt 없이 재시도한다.
- **해소**: 도메인 fine-tuning 또는 자주 잘못 인식되는 표현의 후처리 fuzzy fix 보강. 후자는 `_apply_stt_fuzzy_fixes` 에 일부 들어가 있다.

---

## 4. UI 와 UX

### 4.1 시니어 권장 버튼 크기 미달

- **현상**: 이장 대시보드와 관리자의 큰 버튼 (`.btn-lg`) 이 실제로는 약 49px 로 렌더된다. `AGENTS.md` §5 의 시니어 가이드는 ≥ 56px 다. 7px 부족이다.
- **원인**: font 19px + padding 14·24 조합으로 계산상 49px.
- **우회**: 자동 테스트는 font-size 17px 이상까지만 강제한다. 시연에는 영향 없는 수준.
- **해소**: 디자인 검토 후 padding 또는 min-height 조정. 시연 폰에서 누르기 어렵다는 피드백이 나오면 우선순위를 올린다.

### 4.2 "글자 크게 보기" 일관성

- **현상**: 이장 대시보드의 사이드바에 "글자 크게 보기" 토글이 있다. 일부 px 고정 폰트는 이 토글에 영향을 받지 않는다.
- **원인**: 폰트 크기 지정이 일부 컴포넌트에서 `em` 이 아닌 `px` 로 박혀 있다.
- **우회**: 핵심 본문 텍스트는 정상 적용된다. 일부 작은 라벨이나 chip 만 안 변한다.
- **해소**: 정식 출시 전 일관 적용. globals.css 의 `body[data-large-text]` 룰에 누락 셀렉터 추가.

### 4.3 알림이 1분 지연

- **현상**: `LocavilleApp` 이 60초마다 `fetchFarmerUnreadCount` 를 호출한다. 새 알림이 와도 최대 1분 지연된다.
- **원인**: 단순 폴링.
- **우회**: 시연에는 충분히 빠른 수준.
- **해소**: SSE 또는 WebSocket 으로 푸시로 전환. 정식 출시 단계 작업.

---

## 5. 테스트 자동화 미적용 영역

자동 테스트가 닿지 못해 수동·시연 리허설로 남겨둔 영역.

### 5.1 Playwright 실 실행

- **현상**: 이장 대시보드 (`web_user`) 에 Playwright skeleton 4개가 작성되어 있지만 chromium 다운로드 (~150MB) 가 보류 상태다.
- **원인**: install 시간·디스크 부담.
- **우회**: backend pytest 의 CSS 정적 분석으로 핵심 항목 (폰트, 큰 글자 모드, 버튼 사이즈, 색 토큰) 은 자동 검증된다.
- **해소**: 사용자가 `pnpm install -D @playwright/test && pnpm exec playwright install chromium` 실행 후 4 sample 한 번 돌리면 활성화된다. 그 다음 농민 앱·관리자로 확장.

### 5.2 시연 폰의 실 렌더

- **현상**: 시연용 iPhone 14, Galaxy S22 의 실제 렌더가 Playwright 의 device emulation 과 미세하게 다를 수 있다.
- **원인**: 폰별 시스템 폰트·DPR·노치 영역 차이.
- **우회**: 시연 직전 직접 폰으로 한 번 확인.
- **해소**: 자동화 어려움. 시연 리허설 체크리스트에 포함.

### 5.3 PDF 의 시각 검토

- **현상**: 자동 테스트는 `%PDF-` 헤더와 본문 크기 (1KB 이상) 까지만 확인한다.
- **원인**: PDF 안의 한글 폰트 정상 렌더, 사진 배치, 페이지 footer 같은 시각 요소는 자동으로 잡을 수 없다.
- **우회**: 시연 리허설에서 사람이 한 번 확인.
- **해소**: 자동화 어려움. 정기 점검 항목.

### 5.4 시행령 자동 등록의 실 e2e

- **현상**: REQ_WEB_036·037 의 단위 검증 (청크 helper, LLM 출력 파싱) 은 통과하지만, 실 시행령 파일을 업로드해 끝까지 가는 흐름은 수동 시연으로 남겨두었다.
- **원인**: 다양한 정부 시행령 포맷 의존. 표 추출 한계 (§3.1) 와도 맞물려 있다.
- **우회**: 시연 리허설에서 실 hwpx 한 번 업로드해 본다.
- **해소**: 시행령 표본 파일 fixture 를 모아 자동 e2e 로 묶기. 다음 사이클 후보.

### 5.5 GPS-농지 폴리곤 매칭

- **현상**: 현재는 단순 거리 (Haversine) 만 자동 검증한다. 농지의 정확한 폴리곤 안에 들어왔는지는 검증하지 않는다.
- **원인**: PostGIS 미도입.
- **우회**: 단순 거리로도 큰 어긋남은 잡힌다.
- **해소**: PostGIS 도입 후 ST_Within 등으로 폴리곤 매칭.

### 5.6 색약 시뮬레이션

- **현상**: 빨강·녹색 단독으로 의미를 전달하는 영역이 있는지는 자동으로 잡지 않는다.
- **원인**: 시각적 판단이 필요한 영역.
- **우회**: Chrome DevTools 의 "Emulate vision deficiencies" 로 사람이 한 번 둘러본다.
- **해소**: 자동화 어려움. 정기 점검.

### 5.7 응답 속도 회귀

- **현상**: L7 latency 테스트 9건은 작성되어 있지만 환경변수 `L7_RUN=1` 일 때만 활성화된다.
- **원인**: backend 가 Render starter plan 으로 올라가 cold start 우려가 없다. 일상 회귀 대상에서 제외했다.
- **우회**: 응답 지연이 의심되면 `L7_RUN=1` 로 한 번 실행해 baseline 비교.
- **해소**: Render plan 다운그레이드, 사용자 폭증, pgvector 검색 latency 의심 시 활성화.

---

## 6. 인프라

### 6.1 Storage fallback 의 데이터 손실 위험

- **현상**: backend 의 `storage_client.py` 가 Supabase Storage → 로컬 fs fallback 한다. Render 의 ephemeral filesystem 에 파일이 떨어지면 재시작 시 손실된다.
- **원인**: Supabase 키 미설정 시 안전 fallback.
- **우회**: 운영 환경에는 Supabase 키를 반드시 설정한다.
- **해소**: 운영 매뉴얼에 명시. 시연 직전 `SUPABASE_URL` / `SUPABASE_KEY` 설정 여부 확인.

### 6.2 사진 워터마크 폰트

- **현상**: Pillow 가 한국어 폰트를 찾지 못하면 워터마크 글자가 깨질 수 있다.
- **원인**: 운영 환경마다 시스템 폰트 위치가 다르다.
- **우회**: `evidence_service` 의 `_get_watermark_font` 가 후보 경로 다섯 곳을 순차 시도한다.
- **해소**: 정식 출시 시 폰트 파일을 backend 배포 산출물에 같이 포함.

### 6.3 RAG 이관 후 Chroma 보존

- **현상**: 현재 운영은 Supabase pgvector (`rag_chunks` 테이블, 218 chunk). 옛 Chroma 디렉토리 (`database/chroma_hwpx_db/`, 8MB) 도 그대로 유지된다.
- **원인**: 이관 후 rollback 안전망.
- **우회**: backend `.env` 에 `RAG_USE_PGVECTOR=0` 추가 후 재시작하면 옛 Chroma 로 fallback 한다.
- **해소**: 시연 종료 + Supabase 안정 운영 확인 (약 2주) 후 Chroma 디렉토리 삭제. `chromadb` 패키지는 이미 제거됐다.

---

## 7. 다음 사이클 정리 우선순위

| 순위 | 항목 | 해당 절 |
|---|---|---|
| 1 | 시드 parcel 좌표를 실 농지 위치로 교체 | §2.1 |
| 2 | `AGENTS.md` §7 의 `LOCALVILLE01` 교정 | §2.3 |
| 3 | `.btn-lg` 시니어 권장 56px 디자인 검토 | §4.1 |
| 4 | Playwright install + 4 sample 실 실행 | §5.1 |
| 5 | 시연용 하드코딩 제거 (sample-user-context, MOCK_RESIDENTS, DEFAULT_*) | §2.5 |
| 6 | `parcel.usage` 컬럼명 통일 | §2.4 |
| 7 | PHOTO_CRITERIA 정확 내용 검수 | §3.1 |
| 8 | 시행령 자동 등록 실 e2e fixture | §5.4 |
| 9 | 음성 세션 외부 store (Redis) | §3.5 |
| 10 | Chroma 디렉토리 정리 | §6.3 |
