-- ============================================================
-- prj_activity migration check SQL
--   - migration_20260618 적용 후 검증
-- ============================================================

-- 1) 건수 비교
SELECT 'bak' AS table_name, COUNT(*) AS row_count
FROM public.prj_activity_bak_20260618
UNION ALL
SELECT 'new' AS table_name, COUNT(*) AS row_count
FROM public.prj_activity;

-- 2) 신규 컬럼 확인
SELECT
    prj_id,
    activity_id,
    activity_name,
    subsidy_amt,
    description
FROM public.prj_activity
ORDER BY prj_id, activity_id
FETCH FIRST 20 ROWS ONLY;

-- 3) NOT NULL 컬럼 이상 여부 확인
SELECT COUNT(*) AS invalid_subsidy_amt_count
FROM public.prj_activity
WHERE subsidy_amt IS NULL;

-- 4) audit 컬럼 이관 확인
SELECT
    prj_id,
    activity_id,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
FROM public.prj_activity
ORDER BY prj_id, activity_id
FETCH FIRST 20 ROWS ONLY;
