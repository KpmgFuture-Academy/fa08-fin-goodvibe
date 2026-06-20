-- ============================================================
-- rag_heading_rule seed data
--   - regex 원문(pattern_text) 보존
--   - 공통 규칙 catalog
-- ============================================================

DELETE FROM public.rag_heading_rule
WHERE rule_id IN (
    'appendix_title_table_ko',
    'roman',
    'numeric_dot_1',
    'numeric_dot_2',
    'numeric_dot_3',
    'numeric_dot_4',
    'korean_letter_dot',
    'numeric_paren',
    'korean_letter_paren',
    'circled_number',
    'circled_korean',
    'paren_numeric',
    'paren_korean',
    'legal_article'
);

INSERT INTO public.rag_heading_rule (
    rule_id,
    rule_name,
    rule_type,
    notation,
    notation_display,
    pattern_text,
    rule_options,
    active_yn,
    reg_dt
)
VALUES
(
    'appendix_title_table_ko',
    '참고/첨부 표형식 제목행',
    'appendix_title_table',
    '참고 n | 제목',
    '참고 1 | 제목, 첨부 2 | 제목',
    NULL,
    CAST('{
        "keywords": ["참고", "첨부"],
        "single_row_table_only": true,
        "require_cell_count": 2,
        "left_cell_number_required": true,
        "title_cell_min_length": 2
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'roman',
    '로마자 단계',
    'roman',
    'Ⅰ',
    'Ⅰ, Ⅱ, Ⅲ...',
    $$^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ](?:\.)?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "segments": 1,
        "roman_range": "ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ"
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'numeric_dot_1',
    '숫자점 1단계',
    'numeric_dot',
    '1 / 1.',
    '1, 2, 3... 또는 1., 2., 3....',
    $$^[0-9]+(?:\.)?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "segments": 1
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'numeric_dot_2',
    '숫자점 2단계',
    'numeric_dot',
    '1.1 / 1.1.',
    '1.1, 1.2... 또는 1.1., 1.2....',
    $$^[0-9]+\.[0-9]+\.?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "segments": 2
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'numeric_dot_3',
    '숫자점 3단계',
    'numeric_dot',
    '1.1.1 / 1.1.1.',
    '1.1.1, 1.1.2... 또는 1.1.1., 1.1.2....',
    $$^[0-9]+\.[0-9]+\.[0-9]+\.?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "segments": 3
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'numeric_dot_4',
    '숫자점 4단계',
    'numeric_dot',
    '1.1.1.1 / 1.1.1.1.',
    '1.1.1.1, 1.1.1.2... 또는 1.1.1.1., 1.1.1.2....',
    $$^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+\.?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "segments": 4
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'korean_letter_dot',
    '한글점 단계',
    'korean_letter_dot',
    '가.',
    '가, 나, 다...',
    $$^[가-히](?:\.)?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "letter_range": "가-히"
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'numeric_paren',
    '숫자괄호 단계',
    'numeric_paren',
    '1)',
    '1), 2), 3)...',
    $$^[0-9]+\)\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{}' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'korean_letter_paren',
    '한글괄호 단계',
    'korean_letter_paren',
    '가)',
    '가), 나), 다)...',
    $$^[가-히]\)\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "letter_range": "가-히"
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'circled_number',
    '원문자 숫자 단계',
    'circled_number',
    '①',
    '①, ②, ③...',
    $$^[①-⑳]\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{}' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'circled_korean',
    '원문자 한글 단계',
    'circled_korean',
    '㉮',
    '㉮, ㉯, ㉰...',
    $$^[㉮-㉻]\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{}' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'paren_numeric',
    '괄호숫자 단계',
    'paren_numeric',
    '(1)',
    '(1), (2), (3)...',
    $$^\([0-9]+\)\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{}' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'paren_korean',
    '괄호한글 단계',
    'paren_korean',
    '(가)',
    '(가), (나), (다)...',
    $$^\([가-히]\)\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "letter_range": "가-히"
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
),
(
    'legal_article',
    '법조문 단계',
    'legal_article',
    '제0조',
    '제1조, 제2조... / 제3조의2...',
    $$^\s*제[0-9]+조(?:의[0-9]+)?(?:\s*\([^\)]+\))?\s*(?=.*[가-힣A-Za-z]).+$$,
    CAST('{
        "allow_sub_article": true,
        "allow_title_paren": true,
        "allow_leading_space": true
    }' AS JSONB),
    'Y',
    CURRENT_TIMESTAMP
);
