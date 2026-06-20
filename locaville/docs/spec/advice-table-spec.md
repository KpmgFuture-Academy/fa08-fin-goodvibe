# advice 테이블 신설 — DBA 협의 요청

농가/이장 양쪽에 **하루 한 줄 농사 조언**을 미리 생성해 캐시하는 신규 테이블 두 개.

---

## 1. 배경 / 목적

### 농가 화면 (app_user)
- 홈 진입 시 "오늘 한마디" chip-card 노출 — `🌾 내일 비 와요. 논물 사진은 오늘 남겨두면 좋아요.`
- 트리거: 농가 todo + 마을 날씨 + 농가 상태 (마지막 일지 일자, helper 모드 등) + 주간 농업정보
- 의미 있는 trigger 없는 날은 카드 자체 미노출

### 이장 대시보드 (web_user)
- 이미 존재하는 "오늘의 한 줄 조언" 카드 — 현재 매 진입마다 `/admin/ai-recommendation` 호출 → LLM 실시간 생성 → **레이턴시 1~3초**
- 응답 구조: `{ recommendation: string, sample_evidence: [...], context: {...} }`
- 캐시 테이블로 옮기면 응답 즉시 + 비용 ↓

### 공통 설계 원칙
- **매일 새벽 1회 배치**로 생성 → DB INSERT → 화면은 SELECT 만
- **농가/이장 둘 다 룰 매칭 + LLM 표현 변형 (`RULELLM`) 으로 생성**
  - 룰 = 시나리오·필드 결정 (deterministic, 환각 방지)
  - LLM = 그 시나리오 안에서 자연어 표현만 (200자, 약품/시기 단언 금지)
  - LLM 실패/검증 실패 시 룰 템플릿 fallback (`RULE`)
- 의미 있는 조언이 안 만들어지면 row 생성 안 함 (= NULL state 도 정상)
- 테이블 2개 분리 — **농가 단위**(user_no) 와 **마을 단위**(ville_id) 는 키와 컨텍스트가 다름

### 명명 컨벤션 (기존 테이블 동일)
- `*_no` : 정수 PK / 식별자 (user_no, notice_no, parcel_no)
- `*_cd` : 짧은 코드 (status_cd VARCHAR(8), content_cd VARCHAR(8))
- `*_dt` : 타임스탬프 (reg_dt, mod_dt, read_dt)
- `*_id` : 문자열 식별자 (ville_id, prj_id)
- `*_json` : JSONB 컬럼 (evidence.raw_json 패턴)
- audit : `reg_dt / reg_no / mod_dt / mod_no` 4 종

---

## 2. 제안 DDL (PostgreSQL)

### 2.1 farm_advice — 농가용 (농가별일조언)

```sql
CREATE TABLE farm_advice (
  user_no          INTEGER         NOT NULL,   -- 사용자번호 (FK: user_master.user_no)
  advice_date      DATE            NOT NULL,   -- 조언일자

  content          VARCHAR(200)    NOT NULL,   -- 내용 (한 줄 본문, 줄바꿈 1개까지)
  rule_cd          VARCHAR(20)     NOT NULL,   -- 조건코드 (어떤 룰이 매칭됐는지)
  action_url       VARCHAR(255)    NULL,       -- 이동주소 (클릭 시 frontend 라우트)

  source_json      JSONB           NULL,       -- 원본데이터 (생성 입력 스냅샷)
  gen_cd           VARCHAR(8)      NOT NULL DEFAULT 'RULELLM', -- 생성방식코드

  reg_dt           TIMESTAMPTZ     NOT NULL DEFAULT now(),   -- 등록일시
  reg_no           INTEGER         NULL,                     -- 등록자번호 (배치는 NULL)
  mod_dt           TIMESTAMPTZ     NULL,                     -- 수정일시
  mod_no           INTEGER         NULL,                     -- 수정자번호

  CONSTRAINT pk_farm_advice PRIMARY KEY (user_no, advice_date),
  CONSTRAINT fk_farm_advice_user FOREIGN KEY (user_no) REFERENCES user_master(user_no)
);

-- 분석용 보조 인덱스 (룰별 노출 빈도 등)
CREATE INDEX idx_farm_advice_rule
  ON farm_advice (rule_cd, advice_date);
```

### 2.2 village_advice — 이장용 (마을별일조언)

```sql
CREATE TABLE village_advice (
  ville_id         VARCHAR(20)     NOT NULL,   -- 마을ID (FK: village.ville_id)
  advice_date      DATE            NOT NULL,   -- 조언일자

  content          VARCHAR(500)    NOT NULL,   -- 내용 (1~3줄, 농가용보다 길게)
  rule_cd          VARCHAR(20)     NOT NULL,   -- 조건코드

  evidence_json    JSONB           NULL,       -- 참고증빙 (조언 근거 evidence_id 배열)
  context_json     JSONB           NULL,       -- 컨텍스트 (생성 입력 스냅샷: 날씨/todo/통계)

  gen_cd           VARCHAR(8)      NOT NULL DEFAULT 'RULELLM', -- 생성방식코드
  audio_url        VARCHAR(500)    NULL,       -- 음성주소 (TTS 캐시 url)

  reg_dt           TIMESTAMPTZ     NOT NULL DEFAULT now(),   -- 등록일시
  reg_no           INTEGER         NULL,                     -- 등록자번호
  mod_dt           TIMESTAMPTZ     NULL,                     -- 수정일시
  mod_no           INTEGER         NULL,                     -- 수정자번호

  CONSTRAINT pk_village_advice PRIMARY KEY (ville_id, advice_date),
  CONSTRAINT fk_village_advice_ville FOREIGN KEY (ville_id) REFERENCES village(ville_id)
);

CREATE INDEX idx_village_advice_rule
  ON village_advice (rule_cd, advice_date);
```

---

## 3. 컬럼 설명

### farm_advice (농가별일조언)

| 컬럼명 | 한글명 | 타입 | 설명 |
|---|---|---|---|
| `user_no` | 사용자번호 | INTEGER PK | `user_master.user_no` FK |
| `advice_date` | 조언일자 | DATE PK | 같은 농가에 하루 1 row |
| `content` | 내용 | VARCHAR(200) | 한 줄 본문 (예: "내일 비 와요. 논물 사진은 오늘 남겨두면 좋아요.") |
| `rule_cd` | 조건코드 | VARCHAR(20) | 매칭된 룰 식별자 (예: `RAIN_WATER`, `HOT_OUTDOOR`, `DIARY_IDLE`) |
| `action_url` | 이동주소 | VARCHAR(255) NULL | 클릭 시 frontend 라우트. 없으면 카드만 표시 |
| `source_json` | 원본데이터 | JSONB NULL | 입력 스냅샷 — `{weather_today, weather_tomorrow, open_todos, last_diary_date, helper_state, ...}` |
| `gen_cd` | 생성방식코드 | VARCHAR(8) | default `RULELLM`. LLM 실패/검증 실패 시 `RULE` 로 INSERT (fallback 추적). `MANUAL` = 시연용 수동 |
| `reg_dt` | 등록일시 | TIMESTAMPTZ | 배치 INSERT 시각 |
| `reg_no` | 등록자번호 | INTEGER NULL | 배치는 NULL, 수동 생성 시 user_no |
| `mod_dt` | 수정일시 | TIMESTAMPTZ NULL | — |
| `mod_no` | 수정자번호 | INTEGER NULL | — |

### village_advice (마을별일조언)

| 컬럼명 | 한글명 | 타입 | 설명 |
|---|---|---|---|
| `ville_id` | 마을ID | VARCHAR(20) PK | `village.ville_id` FK |
| `advice_date` | 조언일자 | DATE PK | 같은 마을에 하루 1 row |
| `content` | 내용 | VARCHAR(500) | 이장 화면 카드 본문 (1~3줄, 마을 전체 정보 종합) |
| `rule_cd` | 조건코드 | VARCHAR(20) | 룰 식별자 (예: `RAIN_PEND_TODO`, `LAGGARD_ALERT`) |
| `evidence_json` | 참고증빙 | JSONB NULL | 근거 증빙 ID 배열 — `["1000000101-20260520-1-1", ...]` (현재 `AiRecommendation.sample_evidence` 매핑) |
| `context_json` | 컨텍스트 | JSONB NULL | 입력 스냅샷 — `{rain_days, upcoming_todos, village_stats: {pending_total, laggard_count}, ...}` (현재 `AiRecommendation.context` 매핑) |
| `gen_cd` | 생성방식코드 | VARCHAR(8) | `RULE` / `RULELLM` / `LLM` / `MANUAL` (이장은 LLM 활용 비중 ↑) |
| `audio_url` | 음성주소 | VARCHAR(500) NULL | "들어보기" TTS 캐시 url (Supabase Storage 등) |
| `reg_dt` | 등록일시 | TIMESTAMPTZ | — |
| `reg_no` | 등록자번호 | INTEGER NULL | — |
| `mod_dt` | 수정일시 | TIMESTAMPTZ NULL | — |
| `mod_no` | 수정자번호 | INTEGER NULL | — |

---

## 4. 코드 값 (`*_cd`) 정의

### gen_cd — 생성방식코드 (VARCHAR(8))

| 코드 | 한글 | 설명 |
|---|---|---|
| `RULE` | 룰기반 | 룰 매칭 + 정적 템플릿 |
| `RULELLM` | 룰+생성형 | 룰 매칭 + LLM 표현 변형 |
| `LLM` | 생성형 | 룰 없이 LLM 만 (Phase 2+) |
| `MANUAL` | 수동입력 | 시연/테스트용 직접 입력 |

### rule_cd — 조건코드 (VARCHAR(20)) — MVP 시드 예시

| 코드 | 한글 | 트리거 |
|---|---|---|
| `RAIN_TOMORROW` | 내일비 | 내일 강수확률 ≥ 70% |
| `RAIN_WATER` | 내일비+논물todo | 내일 비 + 미완료 논물 todo 있음 |
| `HOT_OUTDOOR` | 폭염+야외todo | 오늘 최고기온 ≥ 30°C + 야외 작업 todo |
| `DIARY_IDLE` | 일지공백 | 마지막 일지 3일 전 이상 |
| `RETAKE_PEND` | 재촬영대기 | 미처리 재촬영 요청 있음 |
| `HELPER_TODAY` | 도우미활성 | helper 모드 활성화된 농가 |
| `RAIN_OVER` | 비그침 | 어제 비, 오늘 맑음 (작물 확인 권장) |
| `SEASON_HARVEST` | 수확임박 | 작목 수확기 ±7일 |
| `LAGGARD_ALERT` | 미응답농가 | (마을용) 일지/증빙 미입력 농가 ≥ N명 |
| `RAIN_PEND_TODO` | 비+미완료todo | (마을용) 내일 비 + 마을 미완료 todo 총합 ↑ |

(코드는 backend 측 enum / 상수로 관리. DB 는 문자열로만 보관)

---

## 4.1 LLM 생성 안전망 (`RULELLM` 흐름)

농가/이장 advice 둘 다 LLM 표현 변형을 거치며, 다음 두 겹의 안전망으로 환각 방지:

### Stage 1 — 룰이 시나리오·필드 확정 (deterministic)
LLM 에는 자유 생성 권한이 없음. 룰이 미리 결정한 시나리오 + 명시 필드만 전달.
```
{
  "scenario_cd": "RAIN_WATER",
  "farmer_name": "김영수",
  "weather": "내일 강수확률 80%",
  "todo": "논물 얕게 걸러대기",
  "due_date": "2026-07-15"
}
```

### Stage 2 — system prompt 로 금지 규칙
- 출력 한 줄, 200자 이내
- 위 fields 안의 정보만 사용
- 약품 / 비료 / 농약 권장 금지
- "지금이 적기" 같은 시기 단언 금지
- fields 에 없는 정보 추측 금지

### Stage 3 — output validation
다음 중 하나라도 위반하면 **룰 템플릿 fallback** + `gen_cd='RULE'` 로 INSERT:
- 200자 초과
- 금지 키워드 (약품명 / 단언어 / 시나리오 밖 토픽) 매칭
- JSON 외 형식 오류

### Stage 4 — 사람 검수 (운영)
- 매주 랜덤 50건 샘플링 → 검수
- 문제 패턴 발견 시 → 금지 키워드 / system prompt 보강

---

## 5. 운영 룰

### 5.1 배치 스케줄
- **매일 05:00 KST** cron job 1회
  - 모든 active 농가 → `farm_advice` INSERT (룰 매칭되는 케이스만)
  - 모든 active village → `village_advice` INSERT (마을마다 1건)
- 실패 시: 해당 row skip, 다음 날 다시 시도. 기존 row 가 있어도 그대로.

### 5.2 보관 정책
- 보관 기간: **30일** (`advice_date < CURRENT_DATE - INTERVAL '30 days'` 인 row 삭제)
- 별도 cron job (예: 03:00) 또는 PostgreSQL `pg_cron` 으로 정리
- 30일 보관 이유: 룰 노출 빈도 / LLM 출력 다양성 분석용

### 5.3 갱신 정책
- 같은 날(`advice_date`) 갱신은 **upsert** 로 (예: 오후 날씨 급변 시 재생성)
- 단 MVP 에서는 새벽 1회만 — 갱신 케이스는 Phase 2

### 5.4 NULL state 정상
- 룰 매칭 안 되는 농가 → row 생성 안 함
- frontend 는 row 없으면 카드 미노출

---

## 6. backend API

### 신규 농가 endpoint
```
GET /farmer/{farmer_id}/advice/today
  → 200 { advice_date, content, action_url, rule_cd }
  → 404 (오늘 조언 없음 — 카드 미노출)
```

### 기존 이장 endpoint 동작 변경 — 캐시 우선
```
GET /admin/ai-recommendation
  → 1) village_advice 에서 (current_ville_id, today) SELECT
  → 2) 있으면 row 를 응답 schema 로 변환 후 반환
        content        → recommendation
        evidence_json  → sample_evidence
        context_json   → context
  → 3) 없으면 graceful fallback (또는 실시간 LLM)
```

응답 schema (`AiRecommendation`) 그대로 유지 → frontend 변경 없음.

### TTS 캐시 활용
```
POST /admin/ai-recommendation/tts
  → village_advice.audio_url 있으면 그대로 반환
  → 없으면 OpenAI TTS 호출 → Supabase 저장 → audio_url upsert → 반환
```

---

## 7. 마이그레이션 SQL (참고용)

```sql
BEGIN;

-- 농가별일조언
CREATE TABLE farm_advice (
  user_no          INTEGER         NOT NULL,
  advice_date      DATE            NOT NULL,
  content          VARCHAR(200)    NOT NULL,
  rule_cd          VARCHAR(20)     NOT NULL,
  action_url       VARCHAR(255)    NULL,
  source_json      JSONB           NULL,
  gen_cd           VARCHAR(8)      NOT NULL DEFAULT 'RULELLM',
  reg_dt           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reg_no           INTEGER         NULL,
  mod_dt           TIMESTAMPTZ     NULL,
  mod_no           INTEGER         NULL,
  CONSTRAINT pk_farm_advice PRIMARY KEY (user_no, advice_date),
  CONSTRAINT fk_farm_advice_user FOREIGN KEY (user_no) REFERENCES user_master(user_no)
);
CREATE INDEX idx_farm_advice_rule ON farm_advice (rule_cd, advice_date);

-- 마을별일조언
CREATE TABLE village_advice (
  ville_id         VARCHAR(20)     NOT NULL,
  advice_date      DATE            NOT NULL,
  content          VARCHAR(500)    NOT NULL,
  rule_cd          VARCHAR(20)     NOT NULL,
  evidence_json    JSONB           NULL,
  context_json     JSONB           NULL,
  gen_cd           VARCHAR(8)      NOT NULL DEFAULT 'RULELLM',
  audio_url        VARCHAR(500)    NULL,
  reg_dt           TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reg_no           INTEGER         NULL,
  mod_dt           TIMESTAMPTZ     NULL,
  mod_no           INTEGER         NULL,
  CONSTRAINT pk_village_advice PRIMARY KEY (ville_id, advice_date),
  CONSTRAINT fk_village_advice_ville FOREIGN KEY (ville_id) REFERENCES village(ville_id)
);
CREATE INDEX idx_village_advice_rule ON village_advice (rule_cd, advice_date);

COMMIT;
```

---

## 8. 두 테이블 분리 vs 단일 테이블 — 분리 사유

| 항목 | farm_advice | village_advice |
|---|---|---|
| PK 단위 | `user_no` (농가) | `ville_id` (마을) |
| 본문 길이 | VARCHAR(200) (한 줄) | VARCHAR(500) (1~3줄) |
| 부가 데이터 | `source_json` | `evidence_json`, `context_json`, `audio_url` |
| 생성 방식 default | `RULELLM` | `RULELLM` |
| 노출 위치 | app_user 홈 chip | web_user 대시보드 카드 |
| 음성 TTS | 없음 | 있음 |

→ 컬럼·운영 정책이 달라서 **단일 테이블 + target_type 분기** 보다 분리가 깔끔.

---

## 9. DBA 확인 요청 사항

1. **PostgreSQL JSONB** 컬럼 운영 OK 한지 (notification 테이블에선 안 쓰셨던 듯 — JSON 인덱스 정책 등)
2. **FK ON DELETE** 정책 — 농가 탈퇴 / 마을 삭제 시 advice cascade 또는 set null
3. **시퀀스 불필요** — PK 가 (user_no, advice_date) / (ville_id, advice_date) 복합키라 별도 시퀀스 없음. 시드 호환 OK 한지
4. **30일 보관 cron** — pg_cron 사용 가능한지, 또는 backend 측 별도 cron job 으로 처리
5. **권한** — backend service account 가 INSERT / SELECT / DELETE 가능한지
6. **`gen_cd` VARCHAR(8)** — 코드 길이가 기존 `status_cd`/`content_cd` 와 동일 (8자) 한지 OK

---

## 10. 도입 후 backend 변경 범위 (참고)

- `backend/app/repositories/advice_rdb.py` (신규 — farm/village advice upsert/select)
- `backend/app/services/advice_rules.py` (신규 — 룰 정의 10개 + 시나리오 필드 추출)
- `backend/app/services/advice_llm.py` (신규 — LLM 호출 + system prompt + output validation + 룰 fallback)
- `backend/app/services/advice_service.py` (신규 — 룰 매칭 → LLM → upsert 오케스트레이션)
- `backend/app/services/advice_batch.py` (신규 — 매일 05:00 cron, 농가/마을 전체 순회)
- `backend/app/routers/farmer.py` — `GET /farmer/{farmer_id}/advice/today` 추가
- `backend/app/routers/admin.py` — `/admin/ai-recommendation` 캐시 우선 동작 변경
- `backend/.env` — `OPENAI_API_KEY` 기존 사용 그대로 (RAG/chat 과 공유)
