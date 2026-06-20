-- =============================================================================
-- 저탄마을 데모 트랜잭션 시드 — journal / prj_journal / evidence
-- =============================================================================
-- 작성: 2026-05-29 (Phase D)
-- 시연 주인공: 김영수 (amo_regno=1110000002, user_no=10000002, login_id=ys.kim)
--   - 1번 논 (parcel_no=1, parcel_regno=4677031099-1-0108-0000, RPA 4310㎡)
--
-- 시연 핵심 시나리오:
--   1. 5/27 모내기 (일반 일지) — 사업 외 작업
--   2. 6/27 중간 물떼기 시작 — 사업 연결 (KK26A001 / AWT0011 / seq=1)
--          + 증빙 사진 (MID_DRAINAGE_START)
--   3. 7/11 중간 물떼기 완료 — 사업 연결 (위 동일 todo)
--          + 증빙 사진 (MID_DRAINAGE_END)
--
-- 서브 — 마을주민 탭의 풍부도 확보:
--   4. 박정호 5/15 비료 일지 (A0001)
--   5. 박정호 5/20 바이오차 일지 (RD001)
--   6. 이순자 5/30 모내기 일지 (R0005)
--
-- DBMS 중립 원칙:
--   - 표준 SQL 만 사용 (백틱 X, INSERT IGNORE X, ON DUPLICATE KEY X)
--   - CURRENT_TIMESTAMP / CURRENT_DATE (CURDATE/NOW 등 MySQL 전용 X)
--   - 반복 실행 안전: 시드 PK 범위 DELETE 후 INSERT (가이드의 "충돌 명시 처리")
--
-- 적용 (venv python 권장):
--   cd locaville/backend
--   .\.venv\Scripts\python.exe -c "from locaville.dbcom import connect, transaction; \
--     sql=open('../../library/sql/seed/transactions_demo.sql', encoding='utf-8').read(); \
--     [c.execute(s) for c in [connect().cursor()] for s in sql.split(';') if s.strip()]"
-- (또는 psql / mysql 클라이언트로 직접)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 시드 PK 정리 — 반복 실행 안전
-- -----------------------------------------------------------------------------
-- evidence → prj_journal → journal 순으로 삭제 (FK 의존 역순).
DELETE FROM evidence
WHERE user_no IN (10000001, 10000002, 10000003)
  AND job_date BETWEEN DATE '2026-05-15' AND DATE '2026-07-11';

DELETE FROM prj_journal
WHERE user_no IN (10000001, 10000002, 10000003)
  AND job_date BETWEEN DATE '2026-05-15' AND DATE '2026-07-11';

DELETE FROM journal
WHERE user_no IN (10000001, 10000002, 10000003)
  AND job_date BETWEEN DATE '2026-05-15' AND DATE '2026-07-11';


-- -----------------------------------------------------------------------------
-- 1. journal (영농일지 본문) — 6 건
-- -----------------------------------------------------------------------------
-- PK: (user_no, job_date, exec_no). exec_no 는 같은 날 여러 건이면 증가.
INSERT INTO journal (
    user_no, job_date, exec_no,
    amo_regno, job_cd, exec_desc,
    input_type_cd, job_cmpl_yn, parcel_no, reg_dt
) VALUES
    -- 1) 김영수 5/27 모내기 (1번 논)
    (10000002, DATE '2026-05-27', 1,
     '1110000002', 'R0005', '1번 논 모내기 완료. 모판 30판 사용.',
     'VOICE', 'Y', 1, CURRENT_TIMESTAMP),

    -- 2) 김영수 6/27 중간 물떼기 시작 (모내기 +30일 경과)
    (10000002, DATE '2026-06-27', 1,
     '1110000002', 'R0008', '모내기 후 한 달 경과. 물꼬 열어 중간 물떼기 시작.',
     'VOICE', 'N', 1, CURRENT_TIMESTAMP),

    -- 3) 김영수 7/11 중간 물떼기 완료 (14일 경과)
    (10000002, DATE '2026-07-11', 1,
     '1110000002', 'R0008', '14일 경과. 토양 충분히 갈라짐 확인. 다시 물 댐.',
     'VOICE', 'Y', 1, CURRENT_TIMESTAMP),

    -- 4) 박정호 5/15 비료 일지 (1번 논)
    (10000001, DATE '2026-05-15', 1,
     '1110000001', 'A0001', '1번 논 밑거름 살포. 복합비료 1포대.',
     'MANUAL', 'Y', 1, CURRENT_TIMESTAMP),

    -- 5) 박정호 5/20 바이오차 일지 (1번 논)
    (10000001, DATE '2026-05-20', 1,
     '1110000001', 'RD001', '1번 논 바이오차 투입. 약 80kg 시용.',
     'VOICE', 'Y', 1, CURRENT_TIMESTAMP),

    -- 6) 이순자 5/30 모내기 일지 (윗논)
    (10000003, DATE '2026-05-30', 1,
     '1110000003', 'R0005', '윗논 모내기 마무리. 가족 도움.',
     'MANUAL', 'Y', 1, CURRENT_TIMESTAMP);


-- -----------------------------------------------------------------------------
-- 2. prj_journal (사업 일지 — journal 과 1:1 PK 공유)
-- -----------------------------------------------------------------------------
-- 김영수의 중간 물떼기 (6/27 시작, 7/11 완료) 가 사업 활동
-- (group_no=100001, prj_id=KK26A001, activity_id=AWT0011, job_seq=1) 의 수행분.
-- parcel_no=1 (1번 논, RPA 4310㎡) — 위 journal 과 일치해야 함.
INSERT INTO prj_journal (
    user_no, job_date, exec_no, job_cd,
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, reg_dt
) VALUES
    (10000002, DATE '2026-06-27', 1, 'R0008',
     100001, '1110000002', 'KK26A001', 'AWT0011',
     1, 1, CURRENT_TIMESTAMP),
    (10000002, DATE '2026-07-11', 1, 'R0008',
     100001, '1110000002', 'KK26A001', 'AWT0011',
     1, 1, CURRENT_TIMESTAMP);


-- -----------------------------------------------------------------------------
-- 3. evidence (증빙 사진/영수증) — 2 건 (김영수 중간 물떼기 시작/완료)
-- -----------------------------------------------------------------------------
-- PK: (user_no, seq_no, job_date, exec_no). seq_no 는 같은 일지 내 증빙 일련번호.
-- GPS 는 마을 인근 좌표 (실제 사진은 없어도 path 만 저장 — 데모 목적).
-- evid_cd 는 code_detail (grp_cd=EVIDENCE) 표준 코드 (varchar(8)):
--   PIC2 = 작업 전/시작 시점 사진, PIC1 = 작업 완료 사진.
-- ai_label (varchar(128)) 에 의미적 라벨을 풍부하게 저장.
INSERT INTO evidence (
    group_no, amo_regno, user_no, seq_no, job_date, exec_no,
    gps_lat, gps_long, capture_dt,
    ai_label, evid_cd, file_path, reg_dt
) VALUES
    -- 김영수 6/27 중간 물떼기 시작 사진
    (100001, '1110000002', 10000002, 1, DATE '2026-06-27', 1,
     35.9481, 126.9572, TIMESTAMP '2026-06-27 09:20:00',
     'MID_DRAINAGE_START', 'PIC2',
     'uploads/evidence/demo_water_start.jpg', CURRENT_TIMESTAMP),

    -- 김영수 7/11 중간 물떼기 완료 사진
    (100001, '1110000002', 10000002, 1, DATE '2026-07-11', 1,
     35.9481, 126.9572, TIMESTAMP '2026-07-11 16:10:00',
     'MID_DRAINAGE_END', 'PIC1',
     'uploads/evidence/demo_water_end.jpg', CURRENT_TIMESTAMP);


-- =============================================================================
-- 검증 (선택) — 적용 후 결과 확인용 SELECT
-- =============================================================================
-- SELECT count(*) AS journal_count FROM journal
--   WHERE job_date BETWEEN DATE '2026-05-15' AND DATE '2026-07-11';
-- SELECT count(*) AS prj_journal_count FROM prj_journal;
-- SELECT count(*) AS evidence_count FROM evidence;
