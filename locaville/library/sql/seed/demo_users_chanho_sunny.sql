-- =============================================================================
-- 시연용 추가 농가 — 박찬호 + 박순선 (필지 10개씩 / 10장 안정빵)
-- =============================================================================
-- 작성: 2026-06-12 (논 현장 시연 D-1)
-- 시연 목적:
--   - 박찬호 (chanho0123) + 박순선 (sunnypark) 둘 다 농가로 로그인
--   - 저탄선도마을 LOCAVILLE01 / 그룹 100001 / 사업 KK26A001 같이 참여
--   - 각자 필지 10개 (1번 논 ~ 10번 논) → 안정빵 사진 10장 시연
--   - 바이오차 (RD001) 는 봄에 이미 완료 (parcel_no=1 한 건)
--   - 중간물떼기 1차 (R0008) 가 오늘~내일 활성 — **필지마다 1개씩 10건 todo**
--
-- 등장 인물:
--   - 박찬호 user_no=10000004, amo_regno=1110000004, login_id=chanho0123
--   - 박순선 user_no=10000005, amo_regno=1110000005, login_id=sunnypark
--
-- 적용:
--   Supabase Dashboard → SQL Editor → 통째 붙여넣고 Run.
--   (또는 psql $DB_URL -f locaville/library/sql/seed/demo_users_chanho_sunny.sql)
--
-- 반복 실행 안전: 시드 PK 범위 DELETE 후 INSERT.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 시드 PK 정리 — 반복 실행 안전 (FK 의존 역순)
-- -----------------------------------------------------------------------------
DELETE FROM evidence
WHERE user_no IN (10000004, 10000005);

DELETE FROM prj_journal
WHERE user_no IN (10000004, 10000005);

DELETE FROM journal
WHERE user_no IN (10000004, 10000005);

DELETE FROM prj_todo_list
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM act_grp_parcel
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM act_grp
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM group_member
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM parcel
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM amo_family
WHERE amo_regno IN ('1110000004', '1110000005');

DELETE FROM user_master
WHERE user_no IN (10000004, 10000005);


-- -----------------------------------------------------------------------------
-- 1. user_master — 로그인 계정
-- -----------------------------------------------------------------------------
-- passwd 는 데모용 더미 (운영은 backend identity_repository 가 bcrypt 검증).
-- 시연: 농가 앱 "직접 로그인" 에 login_id 만 입력하면 통과.
-- NOTE: phone_no/주소/email 등은 NOT NULL 컬럼이라 더미값 채움.
INSERT INTO user_master (
    user_no, user_name, login_id, phone_no,
    zip_cd, addr_1, addr_2,
    auth_key, email, status_cd, passwd,
    reg_dt, reg_no
) VALUES
    (10000004, '박찬호', 'chanho0123', '010-0000-0004',
     '54900', '전북 군산시 저탄선도길 4', '101동 401호',
     'demo', 'chanho@example.com', 'NORM', 'demo',
     CURRENT_TIMESTAMP, 10000001),

    (10000005, '박순선', 'sunnypark', '010-0000-0005',
     '54900', '전북 군산시 저탄선도길 5', '102동 501호',
     'demo', 'sunny@example.com', 'NORM', 'demo',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 2. amo_family — 농가(가족 단위) 등록
-- -----------------------------------------------------------------------------
INSERT INTO amo_family (
    amo_regno, ville_id, amo_name, chief_no,
    zip_cd, addr_1, addr_2, phone_no,
    reg_dt, reg_no
) VALUES
    ('1110000004', 'LOCAVILLE01', '박찬호', 10000004,
     '54900', '전북 군산시 저탄선도길 4', '101동 401호', '010-0000-0004',
     CURRENT_TIMESTAMP, 10000001),

    ('1110000005', 'LOCAVILLE01', '박순선', 10000005,
     '54900', '전북 군산시 저탄선도길 5', '102동 501호', '010-0000-0005',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 3. parcel — 각자 필지 10개씩 (현장 GPS 는 당일 /dev/seed-here 로 덮어쓰기)
-- -----------------------------------------------------------------------------
-- generate_series 로 1~10번 논 한 번에 생성. parcel_area 는 3500~4400 가변.
INSERT INTO parcel (
    amo_regno, parcel_no, parcel_name, parcel_area, parcel_usage,
    zip_cd, addr_1, addr_2, parcel_regno,
    reg_dt, reg_no
)
SELECT
    amo, n, n::text || '번 논', 3400 + n * 100, '논',
    '54900', '전북 군산시 저탄선도길', n::text || '번지',
    prefix || '-' || LPAD(n::text, 4, '0') || '-0000',
    CURRENT_TIMESTAMP, 10000001
FROM (
    VALUES
        ('1110000004', '4677031099-1'),
        ('1110000005', '4677031099-2')
) AS f(amo, prefix)
CROSS JOIN generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 4. group_member — 저탄소농법선도반 (group_no=100001) 가입
-- -----------------------------------------------------------------------------
INSERT INTO group_member (
    group_no, amo_regno, relation, role,
    join_date, active_yn,
    reg_dt, reg_no
) VALUES
    (100001, '1110000004', NULL, 'MEMBER', DATE '2026-03-01', 'Y',
     CURRENT_TIMESTAMP, 10000001),
    (100001, '1110000005', NULL, 'MEMBER', DATE '2026-03-01', 'Y',
     CURRENT_TIMESTAMP, 10000001);


-- -----------------------------------------------------------------------------
-- 5. act_grp + act_grp_parcel — 사업 KK26A001 의 AWT0011(중간 물떼기) 참여
-- -----------------------------------------------------------------------------
-- act_grp: 농가 × 활동 1행. act_grp_parcel: 필지마다 1행씩 (필지 10개 → 10행).
INSERT INTO act_grp (
    group_no, amo_regno, prj_id, activity_id, reg_no
) VALUES
    (100001, '1110000004', 'KK26A001', 'AWT0011', 10000001),
    (100001, '1110000005', 'KK26A001', 'AWT0011', 10000001);

INSERT INTO act_grp_parcel (
    group_no, amo_regno, prj_id, activity_id, parcel_no, reg_no
)
SELECT 100001, amo, 'KK26A001', 'AWT0011', n, 10000001
FROM (VALUES ('1110000004'), ('1110000005')) AS f(amo)
CROSS JOIN generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 6. prj_todo_list — 시연용 작업 일정
-- -----------------------------------------------------------------------------
-- 각자:
--   job_seq=1       : 바이오차 (RD001, parcel_no=1) — 봄에 완료
--   job_seq=11..20  : 중간 물떼기 1차 (R0008, parcel_no=1..10) — 오늘~내일 활성
--   job_seq=21..30  : 중간 물떼기 2차 (R0008, parcel_no=1..10) — 7월 초
-- ※ job_seq 는 (group_no, amo_regno, prj_id, activity_id) 안에서 unique.

-- 6-1. 바이오차 (RD001) — 봄 완료 (parcel_no=1 한 건씩)
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
) VALUES
    (100001, '1110000004', 'KK26A001', 'AWT0011', 1, 1, 'RD001',
     DATE '2026-04-20', DATE '2026-05-10', 10000001),
    (100001, '1110000005', 'KK26A001', 'AWT0011', 1, 1, 'RD001',
     DATE '2026-04-20', DATE '2026-05-10', 10000001);

-- 6-2. 중간 물떼기 1차 (R0008) — 필지마다 1개씩 (D-day 오늘~내일)
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
)
SELECT 100001, amo, 'KK26A001', 'AWT0011', n, 10 + n, 'R0008',
       CURRENT_DATE, CURRENT_DATE + INTERVAL '1 day', 10000001
FROM (VALUES ('1110000004'), ('1110000005')) AS f(amo)
CROSS JOIN generate_series(1, 10) AS n;

-- 6-3. 중간 물떼기 2차 (R0008) — 7월 초 (시연 후속)
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
)
SELECT 100001, amo, 'KK26A001', 'AWT0011', n, 20 + n, 'R0008',
       DATE '2026-07-05', DATE '2026-07-11', 10000001
FROM (VALUES ('1110000004'), ('1110000005')) AS f(amo)
CROSS JOIN generate_series(1, 10) AS n;


-- -----------------------------------------------------------------------------
-- 7. 바이오차 완료 journal (RD001) — 각자 1건씩 (parcel_no=1)
-- -----------------------------------------------------------------------------
-- prj_journal 이 있으면 backend 가 해당 prj_todo_list row 를 "완료" 로 인식.
INSERT INTO journal (
    user_no, job_date, exec_no,
    amo_regno, job_cd, exec_desc,
    input_type_cd, job_cmpl_yn, parcel_no, reg_dt
) VALUES
    (10000004, DATE '2026-05-03', 1,
     '1110000004', 'RD001', '바이오차 1번 논 봄 투입 완료. 포대 단위 살포.',
     'MANUAL', 'Y', 1, CURRENT_TIMESTAMP),

    (10000005, DATE '2026-05-05', 1,
     '1110000005', 'RD001', '바이오차 1번 논 봄 투입 완료.',
     'MANUAL', 'Y', 1, CURRENT_TIMESTAMP);

INSERT INTO prj_journal (
    group_no, amo_regno, user_no, prj_id, activity_id,
    job_seq, job_cd, job_date, exec_no, parcel_no, reg_dt, reg_no
) VALUES
    (100001, '1110000004', 10000004, 'KK26A001', 'AWT0011',
     1, 'RD001', DATE '2026-05-03', 1, 1, CURRENT_TIMESTAMP, 10000004),

    (100001, '1110000005', 10000005, 'KK26A001', 'AWT0011',
     1, 'RD001', DATE '2026-05-05', 1, 1, CURRENT_TIMESTAMP, 10000005);


-- =============================================================================
-- 검증 — 적용 후
-- =============================================================================
-- SELECT user_no, user_name, login_id FROM user_master WHERE user_no IN (10000004, 10000005);
-- → 박찬호 chanho0123 / 박순선 sunnypark
--
-- SELECT amo_regno, COUNT(*) AS parcels FROM parcel
--   WHERE amo_regno IN ('1110000004', '1110000005') GROUP BY amo_regno;
-- → 각자 10
--
-- SELECT amo_regno, job_cd, COUNT(*) AS todos FROM prj_todo_list
--   WHERE amo_regno IN ('1110000004', '1110000005')
--   GROUP BY amo_regno, job_cd ORDER BY amo_regno, job_cd;
-- → 각자 RD001=1 / R0008=20 (1차10 + 2차10)
--
-- SELECT amo_regno, job_seq, est_start_date, est_end_date FROM prj_todo_list
--   WHERE amo_regno IN ('1110000004', '1110000005')
--     AND job_cd = 'R0008'
--     AND est_start_date = CURRENT_DATE
--   ORDER BY amo_regno, job_seq;
-- → 각자 10개 (1차 활성, 오늘 ~ 내일)
