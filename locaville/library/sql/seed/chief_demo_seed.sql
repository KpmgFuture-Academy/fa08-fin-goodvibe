-- =============================================================================
-- 저탄마을 이장님 시연용 추가 시드 — laggard + retake + helper + notification
-- =============================================================================
-- 작성: 2026-06-04
-- 시연 목적: web_user (이장님 화면) 의 시각 풍부도
--   - 대시보드: laggard 농가 (오늘 챙길 일) + KPI 풍부
--   - 사진 검토: retake_required 사진 1장 (재촬영 시연용)
--   - 농사 도와주기: helper pair (완료 1, pending 1)
--   - 알림 이력: 이장님이 보낸 알림 3건
--
-- 전제: 마스터 시드 (user_master/amo_family/parcel/project/prj_activity/prj_todo_list 등)
-- + transactions_demo.sql 이 이미 적용된 상태.
--
-- 등장 인물 (기존 시드 농가, user_no 사용):
--   - 박정호 (10000001, amo=1110000001) — 이장님이자 농가
--   - 김영수 (10000002, amo=1110000002) — 시연 주인공
--   - 이순자 (10000003, amo=1110000003) — 어르신 (helper recipient 후보)
--
-- DBMS 중립 원칙: 표준 SQL + 반복 실행 안전 (시드 PK 범위 DELETE 후 INSERT)
--
-- 적용 (psql 권장 — Supabase Dashboard SQL Editor 또는):
--   psql $DB_URL -f locaville/library/sql/seed/chief_demo_seed.sql
-- (또는 transactions_demo.sql 와 같은 방식)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. 시드 PK 정리 — 반복 실행 안전
-- -----------------------------------------------------------------------------

-- 0-A. 박정호의 5/20 바이오차 evidence (retake 시연용)
DELETE FROM evidence
WHERE user_no = 10000001
  AND job_date = DATE '2026-05-20'
  AND seq_no = 1;

-- 0-B. farm_helper 시드 (이장님 시연용 pair)
-- 데모 농가 (10000001~10000003) 의 helper row 를 광범위하게 정리해 PK 충돌 회피.
-- 시연 환경 전용 — 운영 데이터 무관.
DELETE FROM farm_helper
WHERE helper_user_no IN (10000001, 10000002, 10000003);

-- 0-C. notification 시드 — title prefix '[데모]' 로 식별
DELETE FROM notification
WHERE user_no IN (10000001, 10000002, 10000003)
  AND title LIKE '[데모]%';


-- -----------------------------------------------------------------------------
-- A. 재촬영 요청 evidence — 박정호 5/20 바이오차 사진 1장
-- -----------------------------------------------------------------------------
-- 이장님이 박정호 바이오차 사진을 검토했는데 "바이오차 양이 안 보여요" 라는 사유로
-- 재촬영 요청한 시나리오. status 는 evidence.raw_json 의 JSON 안에 저장
-- (evidence 테이블 스키마 변경 없이 운영 변화 흡수 — 멘토링 문서 §3 참조).
--
-- 시연 흐름:
--   1. 이장님 사진 갤러리 → 박정호 바이오차 사진 클릭
--   2. "재촬영 요청" chip 보임 + 사유 "바이오차 양이 안 보여요..."
--   3. 농민 앱 (박정호 본인) 의 홈에서 "다시 찍어주세요" 빨간 카드로 노출
INSERT INTO evidence (
    group_no, amo_regno, user_no, seq_no, job_date, exec_no,
    gps_lat, gps_long, capture_dt,
    ai_label, evid_cd, file_path, raw_json, reg_dt
) VALUES
    (100001, '1110000001', 10000001, 1, DATE '2026-05-20', 1,
     35.9481, 126.9572, TIMESTAMP '2026-05-20 11:30:00',
     'BIOCHAR_APPLICATION', 'PIC1',
     'uploads/evidence/demo_biochar_blur.jpg',
     '{"status":"retake_required","user_message":"바이오차 양이 사진에 안 보여요. 포대까지 같이 찍어주세요.","reviewed_by":10000001,"reviewed_dt":"2026-05-21T09:00:00"}',
     CURRENT_TIMESTAMP);


-- -----------------------------------------------------------------------------
-- B. farm_helper — 도우미 매칭 2쌍
-- -----------------------------------------------------------------------------
-- 1) 박정호 (helper) → 이순자 (recipient): 양쪽 동의 완료, 진행 중
--    시연 — "농사 도와주기 연결" 카드의 "연결 완료" 상태 노출
--    이순자는 어르신 페르소나라 박정호가 일지 입력 대신 도와줌
--
-- 2) 김영수 (helper) → 박정호 (recipient): pending (양쪽 동의 대기)
--    시연 — "양쪽 승인 대기" 또는 "농가 승인 대기" chip 노출
--    이장님이 "승인 대기 1건" KPI 확인하는 시나리오
INSERT INTO farm_helper (
    helper_user_no, help_seq, recipient_user_no,
    assigned_dt, est_end_date,
    helper_appr_dt, recipient_appr_dt,
    reg_dt, reg_no
) VALUES
    -- 박정호 → 이순자: 완료
    (10000001, 1, 10000003,
     TIMESTAMP '2026-05-25 10:00:00', DATE '2026-08-31',
     TIMESTAMP '2026-05-25 10:00:00', TIMESTAMP '2026-05-25 14:30:00',
     CURRENT_TIMESTAMP, 10000001),

    -- 김영수 → 박정호: pending (helper 만 동의, recipient 미동의)
    (10000002, 1, 10000001,
     TIMESTAMP '2026-06-03 09:00:00', DATE '2026-09-30',
     TIMESTAMP '2026-06-03 09:00:00', NULL,
     CURRENT_TIMESTAMP, 10000002);


-- -----------------------------------------------------------------------------
-- C. notification — 이장님이 보낸 알림 이력 3건
-- -----------------------------------------------------------------------------
-- 시연 — 농민 앱 (각 농가 로그인) 의 알림 panel 에서 노출.
-- notice_no 는 sequence seq_notice_no 자동 채번.
-- sender_cd: 'C' (Chief, 이장), 'S' (System, 자동), 'F' (Farmer)
-- content_cd: 'MANUAL' (이장 수동) / 'TODO_DUE' (마감) / 'RETAKE' (재촬영 요청)
--            / 'HLP_INV' (도우미 초대) / 'HLP_REV' (도우미 응답)
--   ※ backend 의 admin_service.py / evidence_service.py / farm_helper_service.py 의 실제 사용 값 확인됨
INSERT INTO notification (
    notice_no, user_no, sender_cd, content_cd, title, content,
    sent_dt, action_url, related_no, reg_dt, reg_no
) VALUES
    -- 1) 김영수에게 7/11 중간 물떼기 마감 알림 (실제 시드와 일치)
    (nextval('seq_notice_no'), 10000002, 'C', 'TODO_DUE',
     '[데모] 중간 물떼기 마감 안내',
     '7월 11일까지 중간 물떼기 완료 사진을 올려주세요.',
     TIMESTAMP '2026-07-09 09:00:00',
     '/home', NULL, CURRENT_TIMESTAMP, 10000001),

    -- 2) 박정호에게 바이오차 재촬영 요청 알림 (위 evidence 와 연결)
    (nextval('seq_notice_no'), 10000001, 'C', 'RETAKE',
     '[데모] 바이오차 사진 다시 찍어주세요',
     '바이오차 양이 사진에 안 보여요. 포대까지 같이 찍어주세요.',
     TIMESTAMP '2026-05-21 09:00:00',
     '/home', NULL, CURRENT_TIMESTAMP, 10000001),

    -- 3) 이순자에게 도우미 연결 안내 (박정호가 도와줄 거라는 알림 — HLP_INV)
    (nextval('seq_notice_no'), 10000003, 'S', 'HLP_INV',
     '[데모] 박정호님이 기록을 도와주실 거예요',
     '박정호 농가가 이순자님 기록을 도와드리는 연결이 완료됐어요.',
     TIMESTAMP '2026-05-25 14:35:00',
     '/help', NULL, CURRENT_TIMESTAMP, 10000001);


-- =============================================================================
-- 검증 — 적용 후 결과 확인용
-- =============================================================================
-- SELECT count(*) AS retake_count FROM evidence
--   WHERE raw_json::text LIKE '%retake_required%';
-- → 1
--
-- SELECT helper_user_no, recipient_user_no,
--        (helper_appr_dt IS NOT NULL) AS helper_ok,
--        (recipient_appr_dt IS NOT NULL) AS recipient_ok
-- FROM farm_helper
-- WHERE helper_user_no IN (10000001, 10000002);
-- → 2 rows (1 완료, 1 pending)
--
-- SELECT notice_no, user_no, title FROM notification
-- WHERE title LIKE '[데모]%' ORDER BY sent_dt;
-- → 3 rows
