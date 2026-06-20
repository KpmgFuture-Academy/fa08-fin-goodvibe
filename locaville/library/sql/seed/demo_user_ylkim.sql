-- =============================================================================
-- 시연용 추가 농가 — 김영리 (ylkim)
-- =============================================================================
-- 작성: 2026-06-12
-- 시연 목적:
--   - 박찬호/박순선과 동일 구성 (LOCAVILLE01 · 그룹 100001 · 사업 KK26A001)
--   - 필지 10개, 바이오차 완료
--   - **차이점**: 중간물떼기 1차 데드라인이 일요일(2026-06-14) — D-day 시급
--
-- 등장 인물:
--   - 김영리 user_no=10000006, amo_regno=1110000006, login_id=ylkim
--
-- 적용:
--   Supabase Dashboard → SQL Editor → 통째 붙여넣고 Run.
--
-- 반복 실행 안전: 시드 PK 범위 DELETE 후 INSERT.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 시드 PK 정리
-- -----------------------------------------------------------------------------
DELETE FROM evidence       WHERE user_no = 10000006;
DELETE FROM prj_journal    WHERE user_no = 10000006;
DELETE FROM journal        WHERE user_no = 10000006;
DELETE FROM prj_todo_list  WHERE amo_regno = '1110000006';
DELETE FROM act_grp_parcel WHERE amo_regno = '1110000006';
DELETE FROM act_grp        WHERE amo_regno = '1110000006';
DELETE FROM group_member   WHERE amo_regno = '1110000006';
DELETE FROM parcel         WHERE amo_regno = '1110000006';
DELETE FROM amo_family     WHERE amo_regno = '1110000006';
DELETE FROM user_master    WHERE user_no = 10000006;


-- -----------------------------------------------------------------------------
-- 1. user_master
-- -----------------------------------------------------------------------------
INSERT INTO user_master (
    user_no, user_name, login_id, phone_no,
    zip_cd, addr_1, addr_2,
    auth_key, email, status_cd, passwd,
    reg_dt, reg_no
) VALUES
    (10000006, '김영리', 'ylkim', '010-0000-0006',
     '54900', '전북 군산시 저탄선도길 6', '103동 601호',
     'demo', 'ylkim@example.com', 'NORM', 'demo',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 2. amo_family
-- -----------------------------------------------------------------------------
INSERT INTO amo_family (
    amo_regno, ville_id, amo_name, chief_no,
    zip_cd, addr_1, addr_2, phone_no,
    reg_dt, reg_no
) VALUES
    ('1110000006', 'LOCAVILLE01', '김영리', 10000006,
     '54900', '전북 군산시 저탄선도길 6', '103동 601호', '010-0000-0006',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 3. parcel — 필지 10개
-- -----------------------------------------------------------------------------
INSERT INTO parcel (
    amo_regno, parcel_no, parcel_name, parcel_area, parcel_usage,
    zip_cd, addr_1, addr_2, parcel_regno,
    reg_dt, reg_no
)
SELECT
    '1110000006', n, n::text || '번 논', 3400 + n * 100, '논',
    '54900', '전북 군산시 저탄선도길', n::text || '번지',
    '4677031099-3-' || LPAD(n::text, 4, '0') || '-0000',
    CURRENT_TIMESTAMP, 10000001
FROM generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 4. group_member
-- -----------------------------------------------------------------------------
INSERT INTO group_member (
    group_no, amo_regno, relation, role,
    join_date, active_yn,
    reg_dt, reg_no
) VALUES
    (100001, '1110000006', NULL, 'MEMBER', DATE '2026-03-01', 'Y',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 5. act_grp + act_grp_parcel
-- -----------------------------------------------------------------------------
INSERT INTO act_grp (
    group_no, amo_regno, prj_id, activity_id, reg_no
) VALUES
    (100001, '1110000006', 'KK26A001', 'AWT0011', 10000001);

INSERT INTO act_grp_parcel (
    group_no, amo_regno, prj_id, activity_id, parcel_no, reg_no
)
SELECT 100001, '1110000006', 'KK26A001', 'AWT0011', n, 10000001
FROM generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 6. prj_todo_list
-- -----------------------------------------------------------------------------
-- job_seq=1       : 바이오차 (RD001, parcel_no=1) — 봄에 완료
-- job_seq=11..20  : 중간 물떼기 1차 (R0008, parcel_no=1..10) — **일요일(2026-06-14) 데드라인**
-- job_seq=21..30  : 중간 물떼기 2차 (R0008, parcel_no=1..10) — 7월 초

-- 6-1. 바이오차 완료
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
) VALUES
    (100001, '1110000006', 'KK26A001', 'AWT0011', 1, 1, 'RD001',
     DATE '2026-04-20', DATE '2026-05-10', 10000001);

-- 6-2. 중간 물떼기 1차 — 일요일까지 (시급)
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
)
SELECT 100001, '1110000006', 'KK26A001', 'AWT0011', n, 10 + n, 'R0008',
       DATE '2026-06-08', DATE '2026-06-14', 10000001
FROM generate_series(1, 10) AS n;

-- 6-3. 중간 물떼기 2차 — 7월 초
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
)
SELECT 100001, '1110000006', 'KK26A001', 'AWT0011', n, 20 + n, 'R0008',
       DATE '2026-07-05', DATE '2026-07-11', 10000001
FROM generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 7. 바이오차 완료 journal
-- -----------------------------------------------------------------------------
INSERT INTO journal (
    user_no, job_date, exec_no,
    amo_regno, job_cd, exec_desc,
    input_type_cd, job_cmpl_yn, parcel_no, reg_dt
) VALUES
    (10000006, DATE '2026-05-04', 1,
     '1110000006', 'RD001', '바이오차 1번 논 봄 투입 완료. 포대 단위 살포.',
     'MANUAL', 'Y', 1, CURRENT_TIMESTAMP);

INSERT INTO prj_journal (
    group_no, amo_regno, user_no, prj_id, activity_id,
    job_seq, job_cd, job_date, exec_no, parcel_no, reg_dt, reg_no
) VALUES
    (100001, '1110000006', 10000006, 'KK26A001', 'AWT0011',
     1, 'RD001', DATE '2026-05-04', 1, 1, CURRENT_TIMESTAMP, 10000006);


-- =============================================================================
-- 검증
-- =============================================================================
-- SELECT user_no, user_name, login_id FROM user_master WHERE user_no = 10000006;
-- → 김영리 ylkim
--
-- SELECT job_seq, job_cd, est_start_date, est_end_date FROM prj_todo_list
--   WHERE amo_regno = '1110000006'
--     AND job_cd = 'R0008'
--     AND est_end_date <= DATE '2026-06-14'
--   ORDER BY job_seq;
-- → 10개 (1차 R0008, 일요일 데드라인)
