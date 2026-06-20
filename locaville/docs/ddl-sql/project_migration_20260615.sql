-- ============================================================
-- project migration SQL
--   - backup => 신규 구조 생성 => 데이터 복사
--   - 기준 DDL: project_ddl.sql
--   - project.rag_file_id nullable 추가
-- ============================================================

BEGIN;

-- 1) backup
ALTER TABLE IF EXISTS public.project RENAME TO project_bak_20260615;

-- 2) 신규 테이블 생성
CREATE TABLE public.project (
    prj_id VARCHAR(15) NOT NULL,
    prj_name VARCHAR(32),
    exec_year INTEGER,
    biz_id VARCHAR(15) NOT NULL,
    post_date DATE,
    issuer VARCHAR(32),
    rag_file_id TEXT,
    reg_dt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no INTEGER,
    mod_dt TIMESTAMP WITH TIME ZONE,
    mod_no INTEGER,
    CONSTRAINT project_pk PRIMARY KEY (prj_id)
);

COMMENT ON TABLE public.project IS '프로젝트(실행사업) 기본 정보';
COMMENT ON COLUMN public.project.prj_id IS '프로젝트ID';
COMMENT ON COLUMN public.project.prj_name IS '프로젝트명';
COMMENT ON COLUMN public.project.exec_year IS '시행연도';
COMMENT ON COLUMN public.project.biz_id IS '사업ID';
COMMENT ON COLUMN public.project.post_date IS '공고일자';
COMMENT ON COLUMN public.project.issuer IS '발주기관';
COMMENT ON COLUMN public.project.rag_file_id IS 'RAG파일ID. RAG 문서 기반으로 등록된 프로젝트일 경우 연결되는 rag_file.file_id';
COMMENT ON COLUMN public.project.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.project.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.project.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.project.mod_no IS '최종 수정자 식별값';

-- 3) 데이터 이관
--   - 신규 rag_file_id 는 nullable 이므로 기존 데이터는 NULL 로 이관
INSERT INTO public.project (
    prj_id,
    prj_name,
    exec_year,
    biz_id,
    post_date,
    issuer,
    rag_file_id,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    prj_id,
    prj_name,
    exec_year,
    biz_id,
    post_date,
    issuer,
    NULL AS rag_file_id,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
FROM public.project_bak_20260615;

COMMIT;

-- 검증 예시
-- SELECT COUNT(*) FROM public.project;
-- SELECT prj_id, prj_name, rag_file_id FROM public.project ORDER BY prj_id;
