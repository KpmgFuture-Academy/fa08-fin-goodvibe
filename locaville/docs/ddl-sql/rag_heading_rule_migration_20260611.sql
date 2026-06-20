-- ============================================================
-- rag_heading_rule migration
--   1) 기존 rag_heading_rule 백업
--   2) 동일 테이블명으로 신규 rag_heading_rule 생성
--   3) 백업 테이블 데이터를 신규 테이블로 이관
--   4) notation_display 를 이관 시점에 함께 반영
-- 기준일: 2026-06-11
-- ============================================================

BEGIN;

-- 0) 기존 백업 테이블이 있으면 삭제한다.
DROP TABLE IF EXISTS public.rag_heading_rule_bak_20260611;

-- 1) 기존 rag_heading_rule 백업
ALTER TABLE public.rag_heading_rule
    RENAME TO rag_heading_rule_bak_20260611;

COMMENT ON TABLE public.rag_heading_rule_bak_20260611 IS '2026-06-11 migration 이전 rag_heading_rule 백업본';

-- 2) 동일 테이블명으로 신규 rag_heading_rule 생성
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

-- 3) 백업 테이블 데이터를 신규 테이블로 이관
-- 4) notation_display 는 이관 시점에 함께 반영
INSERT INTO public.rag_heading_rule (
    rule_id,
    rule_name,
    rule_type,
    notation,
    notation_display,
    pattern_text,
    rule_options,
    active_yn,
    reg_dt,
    reg_no,
    mod_dt,
    mod_no
)
SELECT
    bak.rule_id,
    bak.rule_name,
    bak.rule_type,
    bak.notation,
    CASE bak.rule_id
        WHEN 'appendix_title_table_ko' THEN '참고 1 | 제목, 첨부 2 | 제목'
        WHEN 'roman' THEN 'Ⅰ, Ⅱ, Ⅲ...'
        WHEN 'numeric_dot_1' THEN '1, 2, 3... 또는 1., 2., 3....'
        WHEN 'numeric_dot_2' THEN '1.1, 1.2... 또는 1.1., 1.2....'
        WHEN 'numeric_dot_3' THEN '1.1.1, 1.1.2... 또는 1.1.1., 1.1.2....'
        WHEN 'numeric_dot_4' THEN '1.1.1.1, 1.1.1.2... 또는 1.1.1.1., 1.1.1.2....'
        WHEN 'korean_letter_dot' THEN '가, 나, 다...'
        WHEN 'numeric_paren' THEN '1), 2), 3)...'
        WHEN 'korean_letter_paren' THEN '가), 나), 다)...'
        WHEN 'circled_number' THEN '①, ②, ③...'
        WHEN 'circled_korean' THEN '㉮, ㉯, ㉰...'
        WHEN 'paren_numeric' THEN '(1), (2), (3)...'
        WHEN 'paren_korean' THEN '(가), (나), (다)...'
        WHEN 'legal_article' THEN '제1조, 제2조... / 제3조의2...'
        ELSE bak.notation
    END AS notation_display,
    bak.pattern_text,
    bak.rule_options,
    COALESCE(bak.active_yn, 'Y') AS active_yn,
    COALESCE(bak.reg_dt, CURRENT_TIMESTAMP) AS reg_dt,
    bak.reg_no,
    bak.mod_dt,
    bak.mod_no
FROM public.rag_heading_rule_bak_20260611 bak;

COMMIT;
