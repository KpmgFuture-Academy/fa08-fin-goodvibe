-- ============================================================
-- farm_job PostgreSQL 마이그레이션
--   - 기존 public.farm_job 테이블을 public.farm_job_bak 으로 백업
--   - 신규 public.farm_job 테이블 생성
--   - 기존 데이터 복사
--   - 신규 컬럼 start_mmdd, end_mmdd 는 NULL 로 적재
--   - start_mmdd, end_mmdd 타입은 CHAR(4)
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.farm_job_bak;

ALTER TABLE IF EXISTS public.farm_job
RENAME TO farm_job_bak;

CREATE TABLE public.farm_job (
    job_cd      VARCHAR(8)   NOT NULL,
    job_name    VARCHAR(32)  NOT NULL,
    job_desc    VARCHAR(255) NULL,
    job_cat     VARCHAR(32)  NULL,
    start_mmdd  CHAR(4)      NULL,
    end_mmdd    CHAR(4)      NULL,
    reg_dt      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no      INTEGER      NULL,
    mod_dt      TIMESTAMP WITH TIME ZONE NULL,
    mod_no      INTEGER      NULL,
    CONSTRAINT pk_farm_job PRIMARY KEY (job_cd)
);

COMMENT ON TABLE public.farm_job IS '영농작업';
COMMENT ON COLUMN public.farm_job.job_cd IS '작업코드';
COMMENT ON COLUMN public.farm_job.job_name IS '작업명';
COMMENT ON COLUMN public.farm_job.job_desc IS '작업설명';
COMMENT ON COLUMN public.farm_job.job_cat IS '작업구분';
COMMENT ON COLUMN public.farm_job.start_mmdd IS '시작월일';
COMMENT ON COLUMN public.farm_job.end_mmdd IS '마감월일';
COMMENT ON COLUMN public.farm_job.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.farm_job.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.farm_job.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.farm_job.mod_no IS '최종 수정자 식별값';

INSERT INTO public.farm_job (
    job_cd,
    job_name,
    job_desc,
    job_cat,
    start_mmdd,
    end_mmdd,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    job_cd,
    job_name,
    job_desc,
    job_cat,
    NULL::CHAR(4) AS start_mmdd,
    NULL::CHAR(4) AS end_mmdd,
    NULL::INTEGER AS reg_no,
    NULL::TIMESTAMP WITH TIME ZONE AS mod_dt,
    NULL::INTEGER AS mod_no
FROM public.farm_job_bak;

COMMIT;

-- 이미 생성된 테이블의 타입만 변경할 경우 사용
-- ALTER TABLE public.farm_job
--     RENAME COLUMN start_date TO start_mmdd,
--     RENAME COLUMN end_date TO end_mmdd;
--
-- ALTER TABLE public.farm_job
--     ALTER COLUMN start_mmdd TYPE CHAR(4) USING LEFT(COALESCE(start_mmdd::TEXT, ''), 4),
--     ALTER COLUMN end_mmdd TYPE CHAR(4) USING LEFT(COALESCE(end_mmdd::TEXT, ''), 4);
