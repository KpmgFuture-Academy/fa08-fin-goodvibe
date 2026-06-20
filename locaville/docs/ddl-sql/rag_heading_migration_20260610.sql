-- ============================================================
-- rag_heading / rag_file migration SQL
--   - backup => 신규 구조 생성 => 데이터 복사
--   - 기준 DDL: rag_heading_ddl.sql
--   - appendix 지원 컬럼(body_yn, ref_appendix_id, appendix_schema) 반영
--   - 문서별 body/appendix exit criteria(JSONB) 컬럼 반영
-- ============================================================

BEGIN;

-- 1) backup
ALTER TABLE IF EXISTS public.rag_heading RENAME TO rag_heading_bak_20260610;
ALTER TABLE IF EXISTS public.rag_file RENAME TO rag_file_bak_20260610;

-- 2) 신규 테이블 생성
CREATE TABLE public.rag_heading (
    heading_id TEXT PRIMARY KEY,
    heading_name TEXT NOT NULL,
    heading_summary TEXT NOT NULL,
    heading_schema JSONB NOT NULL,
    body_yn CHARACTER(1) NOT NULL DEFAULT 'Y',
    active_yn CHARACTER(1) NOT NULL DEFAULT 'Y',
    reg_dt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no INTEGER,
    mod_dt TIMESTAMP WITH TIME ZONE,
    mod_no INTEGER,
    CONSTRAINT rag_heading_body_yn_chk CHECK (body_yn IN ('Y', 'N')),
    CONSTRAINT rag_heading_active_yn_chk CHECK (active_yn IN ('Y', 'N'))
);

COMMENT ON TABLE public.rag_heading IS 'RAG heading 템플릿 마스터';
COMMENT ON COLUMN public.rag_heading.heading_id IS '템플릿 식별자. 앱과 관리 화면에서 사용하는 고유 키';
COMMENT ON COLUMN public.rag_heading.heading_name IS '관리자/사용자 화면 표시용 템플릿 이름';
COMMENT ON COLUMN public.rag_heading.heading_summary IS '관리자 UI 표시용 축약 표기 예: Ⅰ > 1. > 가.';
COMMENT ON COLUMN public.rag_heading.heading_schema IS 'rule_id 참조형 heading schema JSON';
COMMENT ON COLUMN public.rag_heading.body_yn IS '본문 템플릿 여부. Y=body/main heading, N=appendix heading';
COMMENT ON COLUMN public.rag_heading.active_yn IS '템플릿 사용 여부. Y=사용, N=미사용';
COMMENT ON COLUMN public.rag_heading.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.rag_heading.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.rag_heading.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.rag_heading.mod_no IS '최종 수정자 식별값';

-- ------------------------------------------------------------
-- 2-1) rag_file 신규 구조
--   - ref_appendix_id / appendix_schema 추가
--   - body_exit_criteria / appendix_exit_criteria JSONB 추가
--   - 기존 데이터는 신규 컬럼을 모두 NULL 로 이관
-- ------------------------------------------------------------
CREATE TABLE public.rag_file (
    file_id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT,
    format_type TEXT NOT NULL,
    doc_name TEXT NOT NULL,
    doc_cat TEXT NOT NULL,
    doc_version NUMERIC(10, 2) NOT NULL DEFAULT 1.0,
    publication_date DATE,
    doc_number TEXT,
    doc_manager TEXT,
    embedding_yn CHARACTER(1) NOT NULL DEFAULT 'N',
    ref_heading_id TEXT,
    ref_appendix_id TEXT,
    heading_schema JSONB NOT NULL,
    appendix_schema JSONB,
    body_exit_criteria JSONB,
    appendix_exit_criteria JSONB,
    schema_note TEXT,
    reg_dt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no INTEGER,
    mod_dt TIMESTAMP WITH TIME ZONE,
    mod_no INTEGER,
    CONSTRAINT rag_file_embedding_yn_chk CHECK (embedding_yn IN ('Y', 'N')),
    CONSTRAINT rag_file_ref_heading_id_fk FOREIGN KEY (ref_heading_id) REFERENCES public.rag_heading (heading_id),
    CONSTRAINT rag_file_ref_appendix_id_fk FOREIGN KEY (ref_appendix_id) REFERENCES public.rag_heading (heading_id)
);

COMMENT ON TABLE public.rag_file IS '등록된 RAG 원본문서 메타 및 문서별 body/appendix schema 저장';
COMMENT ON COLUMN public.rag_file.file_id IS 'RAG 원본문서 식별자';
COMMENT ON COLUMN public.rag_file.file_name IS '사용자 표시용 원본 파일명';
COMMENT ON COLUMN public.rag_file.file_path IS 'Storage 또는 원격 저장소 내 원본 파일 경로';
COMMENT ON COLUMN public.rag_file.format_type IS '문서 형식 표시값 예: 한글, PDF, MS워드';
COMMENT ON COLUMN public.rag_file.doc_name IS '문서명';
COMMENT ON COLUMN public.rag_file.doc_cat IS '문서구분';
COMMENT ON COLUMN public.rag_file.doc_version IS '문서버전';
COMMENT ON COLUMN public.rag_file.publication_date IS '문서 공개일자';
COMMENT ON COLUMN public.rag_file.doc_number IS '문서번호';
COMMENT ON COLUMN public.rag_file.doc_manager IS '문서 담당기관/담당자';
COMMENT ON COLUMN public.rag_file.embedding_yn IS '벡터 적재 여부. Y=적재, N=미적재';
COMMENT ON COLUMN public.rag_file.ref_heading_id IS '참조 body heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.ref_appendix_id IS '참조 appendix heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.heading_schema IS '문서별 body heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.appendix_schema IS '문서별 appendix heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.body_exit_criteria IS 'body 모드 종료 또는 appendix 진입/전환 판단용 문서별 override 기준 JSON. 초기값 NULL';
COMMENT ON COLUMN public.rag_file.appendix_exit_criteria IS 'appendix 모드 종료 후 body 복귀 판단용 문서별 override 기준 JSON. 초기값 NULL';
COMMENT ON COLUMN public.rag_file.schema_note IS 'pre-parsing 결과에서 신규/삭제 등 운영 메모 JSON 또는 텍스트';
COMMENT ON COLUMN public.rag_file.reg_dt IS '최초 등록 시각';
COMMENT ON COLUMN public.rag_file.reg_no IS '최초 등록자 식별값';
COMMENT ON COLUMN public.rag_file.mod_dt IS '최종 수정 시각';
COMMENT ON COLUMN public.rag_file.mod_no IS '최종 수정자 식별값';

-- ------------------------------------------------------------
-- 3) 데이터 복사
--   3-1) rag_heading: 기존 active_yn 유지, body_yn 은 기본 Y 부여
--   3-2) rag_file: 기존 body schema 유지
--        appendix / exit criteria 계열 컬럼은 모두 NULL 초기화
-- ------------------------------------------------------------
INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    'Y' AS body_yn,
    COALESCE(active_yn, 'Y') AS active_yn,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
FROM public.rag_heading_bak_20260610;

-- 3-2) rag_file 이관
INSERT INTO public.rag_file (
    file_id,
    file_name,
    file_path,
    format_type,
    doc_name,
    doc_cat,
    doc_version,
    publication_date,
    doc_number,
    doc_manager,
    embedding_yn,
    ref_heading_id,
    ref_appendix_id,
    heading_schema,
    appendix_schema,
    body_exit_criteria,
    appendix_exit_criteria,
    schema_note,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    file_id,
    file_name,
    file_path,
    format_type,
    doc_name,
    doc_cat,
    doc_version,
    publication_date,
    doc_number,
    doc_manager,
    COALESCE(embedding_yn, 'N') AS embedding_yn,
    ref_heading_id,
    NULL AS ref_appendix_id,
    heading_schema,
    NULL AS appendix_schema,
    NULL AS body_exit_criteria,
    NULL AS appendix_exit_criteria,
    schema_note,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
FROM public.rag_file_bak_20260610;

COMMIT;
