-- ============================================================
-- rag_heading seed data
--   - rule_id 참조형 heading_schema 기준
--   - regex 원문은 public.rag_heading_rule 에서 관리
-- ============================================================

-- 안전한 재적재용 delete & insert
--   - 각 heading_id 단위로 먼저 삭제 후 재등록

-- ============================================================
-- 0) appendix 시작 제목(1x2 표)
-- ============================================================
DELETE FROM public.rag_heading
WHERE heading_id = 'appendix_entry_ko_table';

INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt
)
VALUES (
    'appendix_entry_ko_table',
    '참고/첨부 시작 제목(1x2 표)',
    '참고 n | 제목',
    CAST('{
        "hierarchy_type": "appendix_entry_ko_table",
        "levels": [
            {
                "depth": 1,
                "rule_id": "appendix_title_table_ko",
                "location": "table",
                "notation": "참고 n | 제목",
                "rule_options": {
                    "keywords": ["참고", "첨부"],
                    "single_row_table_only": true,
                    "require_cell_count": 2,
                    "left_cell_number_required": true,
                    "title_cell_min_length": 2
                }
            }
        ]
    }' AS JSONB),
    'N',
    'Y',
    CURRENT_TIMESTAMP
);

-- ============================================================
-- 1) (로마자) 공공기관/정부 확장 목차
-- ============================================================
DELETE FROM public.rag_heading
WHERE heading_id = 'ko_gov_roman';

INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt
)
VALUES (
    'ko_gov_roman',
    '(로마자)공공기관/정부 확장 목차',
    'Ⅰ >1. > 가. > 1) > 가) > ① > ㉮',
    CAST('{
        "hierarchy_type": "ko_gov_roman",
        "levels": [
            {
                "depth": 1,
                "rule_id": "roman",
                "location": "both",
                "notation": "Ⅰ",
                "rule_options": {
                    "segments": 1,
                    "trailing_dot": "either",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 2,
                "rule_id": "numeric_dot_1",
                "location": "paragraph",
                "notation": "1.",
                "rule_options": {
                    "segments": 1,
                    "trailing_dot": "required",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 3,
                "rule_id": "korean_letter_dot",
                "location": "paragraph",
                "notation": "가.",
                "rule_options": {
                    "letter_range": "가-히",
                    "trailing_dot": "required",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 4,
                "rule_id": "numeric_paren",
                "location": "paragraph",
                "notation": "1)",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 5,
                "rule_id": "korean_letter_paren",
                "location": "paragraph",
                "notation": "가)",
                "rule_options": {
                    "letter_range": "가-히",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 6,
                "rule_id": "circled_number",
                "location": "paragraph",
                "notation": "①",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 0
                }
            },
            {
                "depth": 7,
                "rule_id": "circled_korean",
                "location": "paragraph",
                "notation": "㉮",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 0
                }
            }
        ]
    }' AS JSONB),
    'Y',
    'Y',
    CURRENT_TIMESTAMP
);

-- ============================================================
-- 1) 공공기관/정부 표준 대위계 체계
-- ============================================================
DELETE FROM public.rag_heading
WHERE heading_id = 'ko_government';

INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt
)
VALUES (
    'ko_government',
    '공공기관/정부 표준 목차',
    '1. > 가. > 1) > 가) > ① > ㉮ > (1) > (가)',
    CAST('{
        "hierarchy_type": "ko_government",
        "levels": [
            {
                "depth": 1,
                "rule_id": "numeric_dot_1",
                "location": "paragraph",
                "notation": "1.",
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
                "location": "paragraph",
                "notation": "가.",
                "rule_options": {
                    "letter_range": "가-히",
                    "trailing_dot": "required",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 3,
                "rule_id": "numeric_paren",
                "location": "paragraph",
                "notation": "1)",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 4,
                "rule_id": "korean_letter_paren",
                "location": "paragraph",
                "notation": "가)",
                "rule_options": {
                    "letter_range": "가-히",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 5,
                "rule_id": "circled_number",
                "location": "paragraph",
                "notation": "①",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 0
                }
            },
            {
                "depth": 6,
                "rule_id": "circled_korean",
                "location": "paragraph",
                "notation": "㉮",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 0
                }
            },
            {
                "depth": 7,
                "rule_id": "paren_numeric",
                "location": "paragraph",
                "notation": "(1)",
                "rule_options": {
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            },
            {
                "depth": 8,
                "rule_id": "paren_korean",
                "location": "paragraph",
                "notation": "(가)",
                "rule_options": {
                    "letter_range": "가-히",
                    "leading_space_max": 10,
                    "trailing_space_max": 3
                }
            }
        ]
    }' AS JSONB),
    'Y',
    'Y',
    CURRENT_TIMESTAMP
);

-- ============================================================
-- 2) 일반 기술/학술 문서 통합 체계
--    4단계까지 확장
-- ============================================================
DELETE FROM public.rag_heading
WHERE heading_id = 'numeric_dot';

INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt
)
VALUES (
    'numeric_dot',
    '일반 기술/학술 문서 목차',
    '1 > 1.1 > 1.1.1 > 1.1.1.1',
    CAST('{
        "hierarchy_type": "numeric_dot",
        "levels": [
            {
                "depth": 1,
                "rule_id": "numeric_dot_1",
                "location": "paragraph",
                "notation": "1 / 1.",
                "rule_options": {
                    "segments": 1,
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true,
                    "allow_missing_terminal_dot": true
                }
            },
            {
                "depth": 2,
                "rule_id": "numeric_dot_2",
                "location": "paragraph",
                "notation": "1.1 / 1.1.",
                "rule_options": {
                    "segments": 2,
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true
                }
            },
            {
                "depth": 3,
                "rule_id": "numeric_dot_3",
                "location": "paragraph",
                "notation": "1.1.1 / 1.1.1.",
                "rule_options": {
                    "segments": 3,
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true
                }
            },
            {
                "depth": 4,
                "rule_id": "numeric_dot_4",
                "location": "paragraph",
                "notation": "1.1.1.1 / 1.1.1.1.",
                "rule_options": {
                    "segments": 4,
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true
                }
            }
        ]
    }' AS JSONB),
    'Y',
    'Y',
    CURRENT_TIMESTAMP
);

-- ============================================================
-- 3) 대한민국 법조문 표준 체계
-- ============================================================
DELETE FROM public.rag_heading
WHERE heading_id = 'legal_act';

INSERT INTO public.rag_heading (
    heading_id,
    heading_name,
    heading_summary,
    heading_schema,
    body_yn,
    active_yn,
    reg_dt
)
VALUES (
    'legal_act',
    '대한민국 법조문 표준 목차',
    '제0조 > ① > 1. > 가.',
    CAST('{
        "hierarchy_type": "legal_act",
        "levels": [
            {
                "name": "조",
                "depth": 1,
                "rule_id": "legal_article",
                "location": "paragraph",
                "notation": "제0조",
                "rule_options": {
                    "allow_sub_article": true,
                    "allow_title_paren": true,
                    "allow_leading_space": true
                }
            },
            {
                "name": "항",
                "depth": 2,
                "rule_id": "circled_number",
                "location": "paragraph",
                "notation": "①",
                "rule_options": {
                    "allow_leading_space": true,
                    "require_space_or_eol": false
                }
            },
            {
                "name": "호",
                "depth": 3,
                "rule_id": "numeric_dot_1",
                "location": "paragraph",
                "notation": "1.",
                "rule_options": {
                    "segments": 1,
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true
                }
            },
            {
                "name": "목",
                "depth": 4,
                "rule_id": "korean_letter_dot",
                "location": "paragraph",
                "notation": "가.",
                "rule_options": {
                    "letter_range": "가-히",
                    "trailing_dot": "either",
                    "allow_leading_space": true,
                    "require_space_or_eol": true
                }
            }
        ]
    }' AS JSONB),
    'Y',
    'Y',
    CURRENT_TIMESTAMP
);
