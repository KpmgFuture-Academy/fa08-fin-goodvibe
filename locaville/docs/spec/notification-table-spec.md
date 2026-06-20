# notification 테이블 신설 — DBA 협의 요청

## 1. 배경 / 목적

저탄마을 앱의 **알림(notification) 흐름을 한 곳으로 통합**하기 위한 신규 테이블.

현재는 evidence row 의 `raw_json.status='retake_required'` 만 알림으로 활용 중이며 다음 한계가 있음:

| 한계 | 영향 |
|---|---|
| 읽음/안 읽음 구분 X | 농가가 봤는지 모름 — 항상 알림 표시 |
| 이력 (audit log) X | 처리 후 옛 알림이 사라지면 추적 불가 |
| 다른 종류 알림 못 담음 | 가입 안내 · todo 마감 · 사업 등록 등 evidence 와 무관한 알림 미지원 |
| 푸시 알림 (FCM) 확장 어려움 | 발송 대기 큐 등 별도 컬럼 필요 |

`notification` 테이블 도입 후 처리 대상:
- v0_chief 의 `projects/[id]` "알람 보내기" (현재 `window.alert()` stub)
- v0_farmer 헤더의 종 아이콘 (현재 "준비 중" alert)
- 재촬영 요청 (현재 evidence.status 기반 — 점진 이관)
- 향후 가입 안내, todo 마감 임박, 새 사업 등록 등

---

## 2. 제안 DDL (PostgreSQL)

```sql
CREATE TABLE notification (
  -- PK: 시퀀스 자동 채번 (시드 패턴과 일치 — amo_regno 처럼 정수)
  notification_id   BIGINT          NOT NULL,

  -- 수신자 식별
  -- 'farmer' = amo_regno(varchar) 를 target_ref 에 저장
  -- 'chief'  = user_no(int)        를 target_ref 에 저장 (이장님 알림용)
  target_type       VARCHAR(10)     NOT NULL CHECK (target_type IN ('farmer', 'chief')),
  target_ref        VARCHAR(32)     NOT NULL,

  -- 알림 분류 (확장 가능)
  -- 'retake'      = 이장님이 재촬영 요청
  -- 'invite'      = 이장님이 농가 초대 발송
  -- 'todo_due'    = todo 마감 임박
  -- 'new_project' = 새 사업 등록
  -- 'manual'      = 이장님이 농가에게 직접 보낸 알람 (projects 알람 보내기 등)
  -- 'system'      = 시스템 공지
  notif_type        VARCHAR(20)     NOT NULL,

  -- 표시 내용
  title             VARCHAR(120)    NOT NULL,
  message           VARCHAR(500)    NULL,

  -- 클릭 시 이동할 url (예: '/residents/1110000002', '/journal/...') — frontend route
  link_url          VARCHAR(255)    NULL,

  -- 연관 entity (선택) — 예: evidence_id, todo_id, prj_id
  related_kind      VARCHAR(20)     NULL,
  related_id        VARCHAR(64)     NULL,

  -- 읽음 상태
  read_dt           TIMESTAMPTZ     NULL,

  -- audit
  reg_dt            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  reg_no            INTEGER         NULL,   -- 발송자(이장님) user_no. system 알림은 NULL.
  mod_dt            TIMESTAMPTZ     NULL,
  mod_no            INTEGER         NULL,
  deleted_dt        TIMESTAMPTZ     NULL,   -- soft delete (옛 알림 숨김)

  CONSTRAINT pk_notification PRIMARY KEY (notification_id)
);

-- 시퀀스 (기존 amo_regno / user_no 시드와 같이 큰 정수 사용)
CREATE SEQUENCE seq_notification_id START WITH 1 INCREMENT BY 1;

-- 인덱스
-- (1) 수신자별 안 읽은 알림 빠른 조회 (가장 자주 호출)
CREATE INDEX idx_notification_unread
  ON notification (target_type, target_ref, read_dt)
  WHERE deleted_dt IS NULL AND read_dt IS NULL;

-- (2) 수신자별 최근 N개 (시간순)
CREATE INDEX idx_notification_recent
  ON notification (target_type, target_ref, reg_dt DESC)
  WHERE deleted_dt IS NULL;

-- (3) 연관 entity 로 역조회 (예: 어떤 evidence 에 어떤 알림이 걸려있나)
CREATE INDEX idx_notification_related
  ON notification (related_kind, related_id)
  WHERE deleted_dt IS NULL;
```

---

## 3. 컬럼 설명

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `notification_id` | BIGINT PK | 시퀀스 자동 채번 (`nextval('seq_notification_id')`) |
| `target_type` | VARCHAR(10) | `'farmer'` 또는 `'chief'`. 어떤 종류 수신자인지 |
| `target_ref` | VARCHAR(32) | farmer 면 `amo_regno`, chief 면 `user_no` 의 문자열. JOIN 안 하기 위해 가벼운 식별자만 |
| `notif_type` | VARCHAR(20) | 알림 카테고리. 새 종류 추가는 backend 코드만 변경, schema X |
| `title` | VARCHAR(120) | 한 줄 제목 (예: "재촬영 요청") |
| `message` | VARCHAR(500) | 본문 (예: "논 가운데가 잘 안 보입니다. 다시 찍어 올려주세요.") |
| `link_url` | VARCHAR(255) | 클릭 시 frontend 라우트 (예: `/journal/10000002-20260601-1-5`) |
| `related_kind` / `related_id` | VARCHAR | 연관 entity (`evidence` / `todo` / `prj` 등) |
| `read_dt` | TIMESTAMPTZ | NULL = 안 읽음, 값 있으면 읽은 시각 |
| `reg_dt` / `reg_no` | audit | 발송 시각 + 발송자 user_no |
| `deleted_dt` | TIMESTAMPTZ | soft delete (옛 알림 숨김 — UI 노출 X 지만 DB row 는 유지) |

---

## 4. backend 가 사용할 쿼리 예시

### 4-1. 알림 INSERT
```sql
INSERT INTO notification
  (notification_id, target_type, target_ref, notif_type, title, message,
   link_url, related_kind, related_id, reg_dt, reg_no)
VALUES
  (nextval('seq_notification_id'), %s, %s, %s, %s, %s, %s, %s, %s, now(), %s);
```

### 4-2. 안 읽은 알림 count (헤더 종 아이콘 뱃지)
```sql
SELECT COUNT(*) AS unread
FROM notification
WHERE target_type = %s AND target_ref = %s
  AND deleted_dt IS NULL AND read_dt IS NULL;
```

### 4-3. 최근 N개 list (panel)
```sql
SELECT notification_id, notif_type, title, message, link_url,
       related_kind, related_id, read_dt, reg_dt
FROM notification
WHERE target_type = %s AND target_ref = %s
  AND deleted_dt IS NULL
ORDER BY reg_dt DESC
LIMIT 30;
```

### 4-4. 한 알림 읽음 처리
```sql
UPDATE notification
SET read_dt = now(), mod_dt = now(), mod_no = %s
WHERE notification_id = %s AND read_dt IS NULL;
```

### 4-5. 전체 읽음 처리 (한 수신자)
```sql
UPDATE notification
SET read_dt = now(), mod_dt = now(), mod_no = %s
WHERE target_type = %s AND target_ref = %s
  AND deleted_dt IS NULL AND read_dt IS NULL;
```

### 4-6. soft delete (옛 알림 정리)
```sql
UPDATE notification
SET deleted_dt = now(), mod_dt = now(), mod_no = %s
WHERE notification_id = %s;
```

---

## 5. 사용 시나리오 (data 예시)

### 시나리오 A — 이장님이 evidence 재촬영 요청
```
(이장님 user_no=10000001 이 evidence_id=10000002-20260601-1-5 의 농가 amo_regno=1110000002 에게)

INSERT INTO notification VALUES (
  nextval('seq_notification_id'),
  'farmer', '1110000002',
  'retake',
  '이장님이 사진을 다시 찍어 달라고 했어요',
  '논 바닥이 안 보입니다. 가운데서 한 번 더 찍어주세요.',
  '/journal/10000002-20260601-1-5',
  'evidence', '10000002-20260601-1-5',
  now(), 10000001
);
```

### 시나리오 B — 이장님이 projects/[id] 에서 "알람 보내기"
```
(이장님이 사업 KK26A001 의 누락 농가들에게 일괄 발송)

INSERT INTO notification ... VALUES
  ('farmer', '1110000002', 'manual', '논물관리 활동 점검 안내',
   '저탄소농업 사업 누락 항목이 있어요. 사진 확인 부탁드립니다.',
   '/projects/KK26A001', 'prj', 'KK26A001', now(), 10000001);
```

### 시나리오 C — 가입 안내
```
(이장님이 새 주민 등록 후 초대 발송)
INSERT INTO notification ... VALUES
  ('farmer', '1110000010', 'invite', '저탄마을에 초대되었어요',
   '저탄마을 앱에 가입해 주세요.', '/onboarding', NULL, NULL, now(), 10000001);
```

---

## 6. 운영 정책 제안

| 항목 | 제안 |
|---|---|
| **보관 기간** | 1년 (1년 이상 된 deleted_dt IS NULL & read_dt IS NOT NULL 알림은 batch 로 deleted_dt 채움) |
| **rate limit** | 같은 (target, related) 조합 30분 내 중복 INSERT 방지 (application 레벨) |
| **soft delete vs hard delete** | soft delete 만. audit 용으로 row 보존 |
| **개인정보** | message 안에 농가 본명 외 민감 정보 X (전화번호·주소 X) |
| **권한** | INSERT — backend 서버만. UPDATE(read_dt) — 본인 (target) 만 |

---

## 7. 마이그레이션 영향도

- **신규 테이블만 추가** — 기존 row / schema 변경 0
- 기존 evidence 의 `raw_json.status='retake_required'` 로직과 **공존 가능** (점진 이관)
- 인덱스 3개 (소량 — 알림 테이블은 read-heavy)
- 시퀀스 1개 신규 (`seq_notification_id`)

DBA 측 작업: 위 DDL 실행 → 끝. 데이터 마이그레이션 없음.

승인 주시면 backend repository / service / router 구현 시작합니다.
