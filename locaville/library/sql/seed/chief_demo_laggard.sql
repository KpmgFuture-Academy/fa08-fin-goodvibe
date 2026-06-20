-- =============================================================================
-- 이장님 시연용 — laggard 농가 시뮬레이션
-- =============================================================================
-- 목적: 대시보드 "오늘 먼저 챙길 일" 카드를 채우기 위한 미이행 todo 시드.
-- 기준: 오늘(2026-06-04) ± 7일 윈도우 안에 due_date 있고 journal 없는 todo.
--
-- backend 의 admin_service._is_unfulfilled():
--   - computed_status != 완료/done/completed, OR missing_evidence_types ≥ 1
-- backend 의 get_laggard_farmers(days=7):
--   - prj_todo_list 의 due_date 가 today ± 7 (즉 5/28 ~ 6/11) 안
--
-- 추가 농가:
--   - 박정호 (1110000001): 6/10 까지 영수증 + 6/08 까지 중간 물떼기 (2건 미이행)
--   - 이순자 (1110000003): 6/07 까지 중간 물떼기 시작 (1건 미이행)
--
-- (김영수는 일부러 미이행 안 만듦 — 시연 주인공이라 잘 진행 중 컨셉 유지)
-- =============================================================================


-- 0. 반복 실행 안전 — 시드 PK 정리
DELETE FROM prj_todo_list
WHERE amo_regno IN ('1110000001', '1110000003')
  AND job_seq IN (97, 98, 99);


-- 1. 미이행 todo INSERT (journal/evidence 없음 → laggard 로 인식)
INSERT INTO prj_todo_list (
    group_no, amo_regno, prj_id, activity_id,
    parcel_no, job_seq, job_cd,
    est_start_date, est_end_date, reg_no
) VALUES
    -- 박정호 (1110000001):
    --   1) 6/10 영수증 마감 (R0008 중간 물떼기 활동의 영수증 같은 가정)
    (100001, '1110000001', 'KK26A001', 'AWT0011', 1, 97, 'R0008',
     DATE '2026-06-01', DATE '2026-06-10', 10000001),
    --   2) 6/08 중간 물떼기
    (100001, '1110000001', 'KK26A001', 'AWT0011', 1, 98, 'R0008',
     DATE '2026-05-30', DATE '2026-06-08', 10000001),

    -- 이순자 (1110000003):
    --   1) 6/07 중간 물떼기 시작 (모내기 5/30 + 8일 경과)
    (100001, '1110000003', 'KK26A001', 'AWT0011', 1, 99, 'R0008',
     DATE '2026-05-31', DATE '2026-06-07', 10000001);


-- 검증 — 적용 후
-- SELECT amo_regno, job_seq, est_end_date FROM prj_todo_list
-- WHERE amo_regno IN ('1110000001', '1110000003')
--   AND est_end_date BETWEEN DATE '2026-05-28' AND DATE '2026-06-11'
-- ORDER BY est_end_date;
