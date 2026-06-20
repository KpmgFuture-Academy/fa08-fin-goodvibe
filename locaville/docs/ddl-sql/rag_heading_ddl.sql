-- ============================================================
-- rag_heading_rule / rag_heading / rag_file DDL
--   - appendix heading 지원 반영
--   - pre-parsing 은 전체 파일을 목차 중심으로 빠르게 훑되,
--     appendix 도 body 와 동일하게 여러 단계 schema 를 가질 수 있다.
--   - appendix 신규 후보 자동 추가는 하지 않고, 유지/삭제 대상만 정의한다.
-- ============================================================

DROP TABLE IF EXISTS public.rag_heading CASCADE;
DROP TABLE IF EXISTS public.rag_heading_rule CASCADE;

CREATE TABLE public.rag_heading_rule (
    rule_id TEXT PRIMARY KEY,
    rule_name TEXT NOT NULL,
    rule_type TEXT NOT NULL,
    notation TEXT NOT NULL,
    notation_display TEXT,
    pattern_text TEXT,
    rule_options JSONB,
    active_yn CHARACTER(1) NOT NULL DEFAULT 'Y',
    reg_dt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reg_no INTEGER,
    mod_dt TIMESTAMP WITH TIME ZONE,
    mod_no INTEGER,
    CONSTRAINT rag_heading_rule_active_yn_chk CHECK (active_yn IN ('Y', 'N'))
);

COMMENT ON TABLE public.rag_heading_rule IS 'RAG heading 규칙 원문 저장 테이블';
COMMENT ON COLUMN public.rag_heading_rule.rule_id IS '규칙 식별자. heading_schema.levels[].rule_id 에서 참조하는 고유 키';
COMMENT ON COLUMN public.rag_heading_rule.rule_name IS '관리자/개발자용 규칙 표시명';
COMMENT ON COLUMN public.rag_heading_rule.rule_type IS '파서 분기용 규칙 유형 예: numeric_dot, korean_letter_dot, roman, appendix_title_table';
COMMENT ON COLUMN public.rag_heading_rule.notation IS '관리자 UI 표시용 대표 표기 예: 1., 가., ①, Ⅰ, 참고 n | 제목';
COMMENT ON COLUMN public.rag_heading_rule.notation_display IS '사용자에게 보여줄 표기 예시 예: 1, 2, 3... / 가, 나, 다...';
COMMENT ON COLUMN public.rag_heading_rule.pattern_text IS '백슬래시/유니코드 포함 regex 원문 보존용';
COMMENT ON COLUMN public.rag_heading_rule.rule_options IS '파서 rule_type 해석용 옵션 JSON';
COMMENT ON COLUMN public.rag_heading_rule.active_yn IS '규칙 사용 여부. Y=사용, N=미사용';

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
COMMENT ON COLUMN public.rag_heading.heading_schema IS
'예시:
{
  "hierarchy_type": "ko_government",
  "levels": [
    {
      "depth": 1,
      "rule_id": "numeric_dot_1",
      "notation": "1.",
      "location": "paragraph",
      "rule_options": {
        "segments": 1,
        "trailing_dot": "required",
        "leading_space_max": 10,
        "trailing_space_max": 3
      }
    },
    {
      "depth": 2,
      "rule_id": "korean_letter_dot",
      "notation": "가.",
      "location": "paragraph",
      "rule_options": {
        "letter_range": "가-히",
        "trailing_dot": "required",
        "leading_space_max": 10,
        "trailing_space_max": 3
      }
    }
  ]
}';

-- ============================================================
-- rag_file 신규 생성 기준 DDL
--   - body / appendix schema 분리 저장
--   - body / appendix 복귀 기준(JSONB) 저장
-- ============================================================

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
COMMENT ON COLUMN public.rag_file.ref_heading_id IS '참조 body heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.ref_appendix_id IS '참조 appendix heading 템플릿 ID';
COMMENT ON COLUMN public.rag_file.heading_schema IS '문서별 body heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.appendix_schema IS '문서별 appendix heading schema(rule_id + override 저장 구조)';
COMMENT ON COLUMN public.rag_file.body_exit_criteria IS 'body 모드 종료 또는 appendix 진입/전환 판단용 문서별 override 기준 JSON. 초기값 NULL';
COMMENT ON COLUMN public.rag_file.appendix_exit_criteria IS 'appendix 모드 종료 후 body 복귀 판단용 문서별 override 기준 JSON. 초기값 NULL';
