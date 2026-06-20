-- ============================================================
-- prj_activity migration SQL
--   - backup => 신규 구조 생성 => 데이터 복사
--   - 기준 DDL: prj_activity_ddl.sql
--   - description nullable 추가
--   - 최신 운영 코드 기준 subsidy_amt 포함 정의로 동기화
-- ============================================================

BEGIN;

-- 1) backup
ALTER TABLE IF EXISTS public.prj_activity RENAME TO prj_activity_bak_20260618;

-- 2) 신규 테이블 생성
CREATE TABLE public.prj_activity (
    prj_id VARCHAR(15) NOT NULL,
    activity_id VARCHAR(15) NOT NULL,
    activity_name VARCHAR(32),
    est_start_date DATE,
    est_end_date DATE,
    subsidy_amt DECIMAL(12,2) NOT NULL,
    description VARCHAR(512),
    reg_dt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no INTEGER,
    mod_dt TIMESTAMP WITH TIME ZONE,
    mod_no INTEGER,
    CONSTRAINT prj_activity_pkey PRIMARY KEY (prj_id, activity_id)
);

COMMENT ON TABLE public.prj_activity IS '프로젝트 활동 정보';
COMMENT ON COLUMN public.prj_activity.prj_id IS '프로젝트ID';
COMMENT ON COLUMN public.prj_activity.activity_id IS '활동ID';
COMMENT ON COLUMN public.prj_activity.activity_name IS '활동명';
COMMENT ON COLUMN public.prj_activity.est_start_date IS '예정시작일';
COMMENT ON COLUMN public.prj_activity.est_end_date IS '예정종료일';
COMMENT ON COLUMN public.prj_activity.subsidy_amt IS '활동지원비';
COMMENT ON COLUMN public.prj_activity.description IS '활동내역';
COMMENT ON COLUMN public.prj_activity.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.prj_activity.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.prj_activity.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.prj_activity.mod_no IS '최종 수정자 식별값';

-- 3) 데이터 이관
--   - 신규 description 은 nullable 이므로 기존 데이터는 NULL 로 이관
INSERT INTO public.prj_activity (
    prj_id,
    activity_id,
    activity_name,
    est_start_date,
    est_end_date,
    subsidy_amt,
    description,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    prj_id,
    activity_id,
    activity_name,
    est_start_date,
    est_end_date,
    subsidy_amt,
    NULL AS description,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
FROM public.prj_activity_bak_20260618;

COMMIT;
