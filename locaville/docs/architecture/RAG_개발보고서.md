# RAG 개발보고서

## 1. 사용자 업무 처리 절차

### 1.1 작업 요약

#### 1.1.1 2026.06.09 이전 작업
1. RAG 파일 등록, 상세조회, 원본문서 다운로드, 벡터 임베딩 실행 흐름을 `web_admin`과 `backend`에 구현했다.
2. 문서 포맷별 parser, chunker, embedder를 분리하여 parsing → chunking → embedding 구조를 정리했다.
3. `rag_file`, `rag_heading`, `rag_vector` 기반의 등록/조회/재적재 구조와 상세 검증 UI를 마련했다.
4. HWPX 문단/표/캡션 처리, `heading_path`, `chunk_loc`, `attributes` 표시 규칙을 단계적으로 보강했다.

#### 1.1.2 2026.06.09 작업
1. 기존 backend 코드에 하드코딩되어 있던 목차 추출 규칙을 `rag_heading_rule` 테이블 레코드로 규격화했다.
2. `rag_heading.heading_schema`는 규칙 자체를 중복 저장하는 대신 `rule_id + rule_options override` 중심 구조로 정리했다.
3. `rag_file.heading_schema`도 같은 구조를 저장하도록 맞추고, 실행 시점에는 backend가 runtime 규칙으로 해석하도록 개선했다.
4. 이에 따라 Pre-Parsing, RAG 파일 등록/재등록, 상세조회, 벡터 임베딩 실행 경로 전반을 같은 규칙 해석 체계로 통일했다.
5. 상세 화면에는 삭제, 실행 결과 팝업, 벡터 파싱정보 조회, `rag_vector` 페이징 조회 등 운영 검증 UX를 추가했다.
6. `rag_heading_rule.match_location`은 제거하고, 위치 판정은 `heading_schema.level.location`만 사용하도록 단순화했다.
7. `location` 옵션은 `paragraph`, `table`, `both` 3가지로 확장했고, 단일행 table/box는 평탄화하여 목차 판정에 활용하되 결과 위치는 원본 `table`로 유지하도록 정리했다.
8. `numeric_dot_unified` 템플릿 식별자는 `numeric_dot`으로 통일했고, 템플릿명 표시는 프론트 하드코딩이 아니라 DB의 `heading_name`을 사용하도록 변경했다.

#### 1.1.3 2026.06.10 작업
1. Pre-Parsing 기준을 body / appendix 2축으로 재정의했다.
2. 등록 화면의 `Heading Template` 선택을 `Main Heading Template`과 `Appendix Template`으로 분리했고, appendix 는 기본값 `선택없음`으로 시작하도록 정리했다.
3. `rag_heading`에는 body / appendix 템플릿을 구분하는 `body_yn` 필드를 추가하는 방향으로 정리했다.
4. `rag_file`에는 `ref_appendix_id`, `appendix_schema`를 추가하여 문서별 body schema 와 appendix schema 를 함께 저장하는 구조로 정리했다.
5. appendix 시작점은 `참고 n | 제목` 형태의 1행 2열 table 제목행을 별도 `rag_heading_rule` / `rag_heading` 레코드로 관리하도록 정리했다.
6. Pre-Parsing 은 문서 전체를 빠르게 훑어 body 와 appendix 목차 후보를 함께 수집하되, appendix 도 body 와 동일하게 여러 단계 schema 를 가질 수 있도록 방향을 전환했다.
7. 다만 appendix 영역에서는 신규 후보 자동 추가보다는 기존 규칙 기준의 `유지 / 제외` 검토를 우선하는 운영 흐름으로 정리했다.
8. `Main Exit Criteria`, `Appendix Exit Criteria`를 등록 화면에 추가했고, 현재는 서로의 템플릿 목차 중 특정 항목을 만나면 body / appendix 모드를 전환하는 구조로 정리했다.
9. Pre-Parsing 과 실제 embedding parsing 의 목적을 분리했다.
   - Pre-Parsing: 문서 전체를 빠르게 스캔하여 목차 구조 후보를 제안
   - Embedding parsing: 확정된 schema 와 계층을 기준으로 상세 파싱 및 chunk 생성
10. HWPX Pre-Parsing 은 가능한 경우 원문 raw line 을 직접 읽는 경량 경로를 우선 사용하고, 상세 `extract_blocks` 기반 파싱은 fallback 으로만 사용하도록 보수화했다.
11. 단일행 table / box 처리 기준을 body 와 appendix 에서 다르게 정리했다.
   - body: box(1x1 table) 및 1행 다중셀 table 은 main 신규 후보 / main 유지 후보에서 최대한 제외
   - appendix: appendix 진입용 시작 제목행과 appendix 내부 기준 확인에는 제한적으로 활용
12. 출현 대상 팝업은 최대 20건까지만 보여주도록 하고, 표기 차이(`|`, 공백 유무, 로마자 뒤 공백, 숨은 문자)를 정규화해 중복 표시를 줄이는 방향으로 보강했다.
13. 출현횟수는 팝업에 남는 대표 샘플 수와 같은 기준으로 맞추도록 정리했다.

#### 1.1.4 2026.06.11 작업
1. HWPX Pre-Parsing, heading row 계산, body / appendix 분리 책임을 재정리하여 `rag_file_service.py`는 화면/DB orchestration 중심으로 두고, 실제 문서 내부 파싱 책임은 library의 `hwpx_heading_parser.py`로 모았다.
2. HWPX Pre-Parsing 은 `lxml.etree.XMLParser`를 명시적으로 사용하도록 정리했고, paragraph / table 블록을 구분하여 section / block_type / row_count / cell_count / style 계열 메타를 함께 보존하도록 보강했다.
3. table wrapper paragraph, 단일행 제목 배너 table, appendix 진입/복귀, appendix 내부 table 제목 처리 기준을 다시 정리하여 body / appendix 전환 오탐과 중복 후보를 줄였다.
4. `rag_heading_rule.notation_display` 기준을 runtime schema 와 상세조회 화면까지 연결하여, 표기 컬럼은 프론트 임의 변환이 아니라 DB / backend 가 해석한 `notation_display`를 그대로 우선 사용하도록 정리했다.
5. 등록 화면의 `schema_note`는 신규 / 제외 기호를 표기 기준으로 dedupe 하도록 정리했고, 혼동되던 기호 표시는 parser 보강이 아니라 화면 표시 및 `notation_display` 기준 연결로 해소하는 방향으로 최소 변경했다.
6. `rag_embedding_parser.py`, `rag_embedding_chunker.py`의 실제 구현은 `library/locaville/rag/hwpx_parser.py`, `library/locaville/rag/chunk_builder.py`로 이관하고, backend는 새 `HwpxParser`, `ChunkBuilder` 클래스를 직접 사용하도록 경계를 재정리했다.
7. 기존 backend의 `rag_embedding_parser.py`, `rag_embedding_chunker.py`는 library 구현을 다시 노출하는 compatibility wrapper 수준으로 축소해, 실제 parser / chunker 로직 중복을 제거했다.

#### 1.1.5 2026.06.12 작업
1. HWPX 임베딩 parsing 경로에도 body / appendix 전환 규칙을 실제로 반영하도록 정리했다.
   - `rag_embedding_service.py`가 `runtime_heading_schema`뿐 아니라 `runtime_appendix_schema`, `body_exit_criteria`, `appendix_exit_criteria`를 함께 parser 에 전달하도록 연결했다.
   - `hwpx_parser.py`는 body / appendix 별 heading stack, pending stack, sector 상태를 분리해 관리하도록 보강했다.
2. appendix 진입/복귀 기준을 embedding parsing 기준으로 다시 정리했다.
   - appendix template 의 depth 1 을 만나면 appendix mode 로 전환
   - appendix mode 에서는 appendix 내부 schema 기준으로 자체 목차 계층을 구성
   - main depth 1~2 또는 explicit appendix exit criteria 를 만나면 main mode 로 복귀
3. pre-parse 전용으로 쓰이던 `appendix_title_table`(예: `참고 1 | 제목` 1행 2셀 표) 규칙을 embedding parser runtime 매칭에도 반영했다.
   - runtime compiled level 에도 `appendix_title_table` 레벨이 유지되도록 정리했다.
   - HWPX event 의 `row_count`, `cell_count` 메타를 실제 heading/exit 판정에 전달하도록 보강했다.
   - 이에 따라 `참고 1 농업법인 및 생산자단체` 같은 appendix 시작행을 embedding 실행 시에도 appendix depth 1 로 인식하도록 정리했다.
4. appendix depth 1 은 rule_type 이 `symbol`, `circled_number` 계열이더라도 appendix 시작 제목이면 우선 `title`로 취급해 표시되도록 보강했다.
5. HWPX segment / chunk 메타에 `sector`(`main` / `appendix`)를 추가했다.
   - parser 단계의 `ParsedSegment` 자체가 `sector`를 직접 보유하도록 정리했다.
   - chunk builder 는 parser 가 준 `sector`를 우선 사용해 chunk 경계를 나누고, `attributes.sector`에 그대로 반영하도록 보강했다.
   - 상세 화면의 attributes 표시는 `sector`가 앞쪽에 보이도록 정리했다.
6. table / box / single-row table 관련 임베딩 표시 규칙을 추가 보강했다.
   - paragraph 안의 짧은 1x1 box table 은 `(농식품부)` 형태로 본문에 병합
   - table cell 안의 짧은 1x1 box 는 `[신청가능]` 형태로 셀 텍스트에 병합
   - 행 전체가 비어 있거나 단순 기호(`⇓` 등)만 있는 table row 는 chunk 생성 대상에서 제외
   - table / table-row / table-single-row 는 pending heading 을 본문 앞에 중복 병합하지 않도록 정리했다.
7. chunk builder 의 최종 `heading_path` 조립 규칙을 보강해 중복 계층 표기를 줄였다.
   - `title_path` 와 `structural_path`를 합칠 때 겹치는 경로는 dedupe 하도록 보강했다.
   - appendix sector 는 title seen / structural count 상태를 main 과 분리해, appendix 내부에서 독립적인 목차 흐름으로 표시되도록 정리했다.

#### 1.1.6 2026.06.12 - 두번째 작업
1. HWPX 줄바꿈 복원 기준을 다시 정리했다.
   - XML 상 `hp:t`가 여러 조각으로 나뉘어 있어도 한글 화면에서 한 줄로 보이는 경우가 많아, 단순 text node 분할 기준으로 줄바꿈을 넣지 않도록 보수화했다.
   - 실제 줄바꿈은 paragraph 경계와 explicit break 중심으로만 반영하고, `hp:linesegarray`는 화면 줄바꿈 완전 복원 기준이 아니라 참고 메타 수준으로 취급하도록 정리했다.
   - 상세 검증 화면에는 `line_count`, `newline_count`, `content_preview`를 함께 노출해, 줄바꿈이 parser 단계에서 있는지/없는지 즉시 확인할 수 있도록 보강했다.
2. HWPX 표 파싱을 사람이 읽는 기준에 더 가깝게 재정리했다.
   - `TablePattern`을 `HEADER_ROW_RECORDS`, `HEADER_VALUE_PAIRS`, `HEADER_VALUE_PAIR_GROUPS` 3종으로 명시화했다.
   - `Header.xml`의 cell 배경색(`borderFill`)을 읽어 header/data cell 을 추정하고, 표 전체가 아니라 행 단위로 패턴을 다시 판정하도록 보강했다.
   - 첫 행이 헤더인 일반 표, 헤더-값 쌍 표, 헤더-(소헤더:값) 목록 표를 각각 다른 문장화 규칙으로 출력하도록 정리했다.
3. 표 내부 노이즈 제거 및 의미 보존 규칙을 추가 보강했다.
   - spacer/empty 행·열은 자동 제거하되, `-` 값은 삭제 대상이 아니라 실제 값으로 유지하도록 정리했다.
   - header cell 안 줄바꿈은 공백으로 접어 `예산 (백만원): 25,713`처럼 보이게 정리했다.
   - 상태값 box(`신청가능`, `신청불가`)는 장식 요소로 보고 괄호 없이 평문으로 처리하고, 목차/보조라벨 box 만 `(텍스트)` 형태를 유지하도록 정리했다.
4. nested table 처리 기준을 다시 정리했다.
   - cell 안 nested table 은 top-level table event로 재파싱하지 않도록 막았다.
   - 다중행 nested table 은 markdown table 형태로, 단일행/단일셀 nested table 은 plain text 로 평탄화하도록 정리했다.
   - caption 역할을 하는 표 내부 첫 행은 body와 중복되지 않게 한 번만 유지하도록 보강했다.
5. heading_path 와 표/문장형 목차의 중복 표시를 추가 보정했다.
   - content 안에 이미 `○ 제목...` 전체가 보이면 `heading_path`에서는 해당 구조형 단계는 기호만 남기거나 생략하도록 정리했다.
   - main/app appendix 모두 symbol 목차의 “본문 중복 표시”와 “후속 chunk 문맥 보존” 사이 균형을 맞추는 방향으로 후처리를 보강했다.
6. chunk 병합 전략을 body/appendix 별 하위 완결성 중심으로 재정의했다.
   - `main`은 depth 2까지는 기본 분리, depth 3부터는 같은 depth 2 아래에서만 병합하도록 정리했다.
   - 다만 서로 다른 depth 3 묶음이 섞이지 않도록, depth 4는 자기 depth 3 부모와 함께만 움직이는 bottom-up 완결성 기준을 추가했다.
   - `appendix`는 depth 1을 기본 분리 경계로 두고, 같은 depth 1 아래에서만 하위 목차를 병합하되 depth 2 서브트리 완결성을 우선 보장하도록 정리했다.
   - 긴 table row / 긴 paragraph 는 먼저 완결 묶음을 만든 뒤, 후단에서 문장 단위 overlap 분할로 나누도록 chunk builder 책임을 분리했다.

#### 1.1.7 2026.06.15 작업
1. 청킹 병합 기준을 depth 고정 경계 중심에서 `크기 + 연속성 + 상위 title 공유` 중심의 soft merge 구조로 재정리했다.
   - `ChunkBuilder`에 `min_chars=350`, `target_chars=750`, `max_chars=1000` 기준을 명시했다.
   - `sector 변경`, cover/title 구간, 상위 title 전환, 서로 다른 table cluster 는 hard boundary 로 유지했다.
   - 그 외에는 `heading_path`, structural key, title prefix, block family, depth 인접성 등을 점수화하여 병합 여부를 결정하도록 정리했다.
2. 상위 depth short chunk 문제를 완화하도록 rescue merge 규칙을 추가했다.
   - 현재 chunk 길이가 `min_chars`보다 작은 경우에는 heading 이 일부 달라도 같은 상위 title 흐름 안이면 다음 본문 chunk 로 흡수할 수 있도록 보강했다.
   - 이에 따라 depth 1~2 상위 라벨성 chunk 가 과도하게 잘게 남는 문제를 줄이는 방향으로 정리했다.
3. 기존 split 규칙은 유지하되 역할을 후단 fallback 으로 분리했다.
   - 병합 단계에서는 `max_chars`를 넘지 않게 제어하고,
   - 정말 긴 paragraph / table-row 에 대해서만 기존 overlap split 규칙을 그대로 적용하도록 정리했다.
4. 임베딩 검증 화면의 가독성을 다시 정리했다.
   - `내용 미리보기`에서 줄바꿈 위치를 보여주던 `[LF]` 표시는 제거하고, 실제 줄바꿈만 유지하도록 정리했다.
   - `attributes` 표시에서는 `chunk_loc`, `segment_count`를 숨기고, 검증에 필요한 핵심 메타만 남기도록 정리했다.
5. `rag_vector.attributes` 저장 구조도 화면 표시 기준에 맞춰 다시 정리했다.
   - 저장 시점부터 `chunk_loc`, `segment_count`를 `attributes`에서 제외하고, `chunk_loc`는 별도 컬럼으로만 관리하도록 정리했다.
   - 조회 시에도 과거 데이터에 남아 있는 `chunk_loc`, `segment_count`는 화면용 metadata 에서 제거하도록 보강했다.
6. `chunk_loc` 표기 규칙을 운영 검증 기준으로 단순화했다.
   - `s0:35`, `11:heading:1` 같은 내부 경로/marker 표시는 제거하고, 순수 파싱 block 번호만 보이도록 정리했다.
   - 연속 구간은 `2~3~4~5~6~7~8` 대신 `2~8`처럼 압축해 표시하도록 보강했다.
7. parser 계층을 파일 포맷 독립 wrapper + 포맷별 구현체 구조로 재정리했다.
   - library 에 `document_parser.py`를 추가하고, `DocumentParser`가 확장자 기준으로 `hwpx/docx/pdf/markdown` parser 를 dispatch 하도록 정리했다.
   - `docx_parser.py`, `pdf_parser.py`, `markdown_parser.py`를 분리하고, 현재 HWPX parsing 계열과 같은 `ParsedSegment` 계약을 따르도록 맞췄다.
   - 공통 파라미터는 `heading_schema`, `appendix_schema`, `body_exit_criteria`, `appendix_exit_criteria`로 통일했고, 비-HWPX parser 도 현재는 미사용 값까지 같은 시그니처로 받도록 정리했다.
8. parser / chunker 공통 타입을 HWPX 구현체에서 분리했다.
   - `HeadingNode`, `ParsedSegment`, `RagEmbeddingParseError`를 `document_models.py`로 이동해, `chunk_builder.py`가 특정 파일 포맷 parser 모듈에 직접 의존하지 않도록 정리했다.
   - 이에 따라 parser 는 포맷별 구현, chunk builder 는 공통 `ParsedSegment` 계약만 소비하는 구조로 경계를 더 명확히 했다.
9. embedder 계층도 parser 와 같은 wrapper 구조로 재정리했다.
   - library `locaville.rag` 아래에 `vector_embedder.py`를 추가하고, `VectorEmbedder`가 provider 기준으로 실제 임베더를 dispatch 하도록 정리했다.
   - 현재 구현체는 library 의 `openai_embedder.py` `OpenAIEmbedder` 1종이며, 이후 provider 확장을 위한 진입점을 먼저 마련했다.
10. 임베딩 service 와 legacy 파일 정리를 마무리했다.
   - `rag_embedding_service.py`는 이제 `DocumentParser` / `ChunkBuilder` / `VectorEmbedder` 경로를 직접 사용하도록 정리했다.
   - 기존 `rag_embedding_embedder.py`는 삭제했고, 이후 `rag_embedding_parser.py`, `rag_embedding_chunker.py`, `rag_embedding_models.py`도 backend 에서 제거해 `rag_embedding_service.py`만 남도록 정리했다.
11. 등록 화면의 업로드 오류 표시를 운영 검증 기준으로 보정했다.
   - 지원하지 않는 확장자 선택 시, 파일명과 허용 확장자 안내가 두 줄로 보이도록 줄바꿈 표시를 추가했다.

#### 1.1.8 2026.06.15 - 프로젝트 RAG 검색/등록 연계 작업
1. 프로젝트 신규 등록 화면에서 RAG 파일을 선택한 뒤, `RAG 파일로부터 프로젝트 등록` 버튼으로 기본정보 제안을 받아 prefill 하는 흐름을 정리했다.
2. 프로젝트 기본정보 추출은 `rag_file` 메타와 `rag_vector` 본문을 함께 읽어, 프로젝트명 / 발주기관 / 공고일자 / 시행연도를 추출하도록 연결했다.
3. 프로젝트 활동 제안은 LLM prompt 중심이 아니라, `rag_vector.heading_path`, `chunk_loc`, `attributes`를 활용한 규칙 기반 추출로 방향을 정리했다.
4. 활동 제안 단계에서는 `활동`, `활동명`, `작업`, `단가`, `지원` 계열 키워드가 있는 표를 우선 검색하고, `활동명:` 라벨 및 `header_row` 기준으로 activity 후보를 구성하도록 보강했다.
5. 활동 제안 상세는 단순 JSON 노출이 아니라, `활동명 | 주요 내용 | 단가` 표와 `부가 내용` 박스로 읽을 수 있게 `web_admin` UI를 정리했다.
6. 같은 `heading_path` 아래에 이어지는 문단은 `source_order_start`, `source_order_end` 기준 순서대로 다시 모아 activity 상세의 부가 설명으로 노출하도록 정리했다.
7. 활동 등록 화면에서는 제안 활동명과 단가를 바로 가져와 등록할 수 있도록 연결했고, `RAG 등록 기준 단가` 원문도 정보성 안내로 표시하도록 정리했다.
8. 활동ID는 생성 모드에서 `순번 2자리 + 활동명 hash 6자리` 규칙으로 자동 생성하고, 순번 dropdown(`01`~`10`)과 읽기 전용 활동ID 입력칸을 분리 배치하도록 보강했다.
9. 이미 등록된 활동명과 동일한 제안은 `활동등록` 버튼을 비활성화하고 `등록완료` 상태로 보이도록 처리했다.
10. 작업 등록 및 반복작업 등록에서는 현재 활동명과 `farm_job.job_name`을 비교해, 정확 일치 또는 부분 일치 시 `대상작업` 기본값을 자동 선택하도록 연결했다.

#### 1.1.9 2026.06.17 작업
1. 프로젝트 활동 제안 상세/등록 흐름을 실제 운영 검토 기준에 맞게 다시 정리했다.
   - `활동등록 제안` 목록이 첫 번째 activity 1건만 보이던 문제를 수정해, 같은 표 안의 여러 activity row를 각각 제안하도록 보강했다.
   - 제안 상세 팝업도 선택한 activity별로 `활동명 / 주요 내용 / 단가`가 각각 다른 값으로 보이도록 row 매핑 로직을 수정했다.
   - activity명 안의 줄바꿈은 공백으로 정규화하고, 표 본문이 `부가 내용`으로 중복 유입되던 문제를 제거했다.
2. 활동 제안 상세 UI를 읽기 쉬운 형태로 보강했다.
   - 상세 팝업 폭을 넓히고 `주요 내용` 열 폭을 확장해 수직 스크롤 부담을 줄였다.
   - 닫기 아이콘/버튼 동작을 재점검해 팝업 닫힘 흐름이 일관되게 동작하도록 수정했다.
3. 활동 등록 전 제안값 확장 범위를 일정/대상농지까지 넓혔다.
   - 활동명, 활동비 외에 `예상시작일자`, `예상종료일자`, `대상농지` 후보를 활동 등록 모달에 prefill 하도록 연계했다.
   - 일정은 `farm_job.job_name`과 활동명을 공백/띄어쓰기 무시 기준으로 비교하고, 유사도가 높은 작업의 `start_mmdd`, `end_mmdd`를 프로젝트 시행연도로 보정해 제안하도록 정리했다.
   - `시작일과 종료일의 최대 간격은 30일 이내` 같은 문맥은 activity 주요 내용에서 추가로 읽어, 종료일 보정 규칙에 반영하도록 보강했다.
4. 대상농지 제안은 단일 LLM 호출이 아니라 `규칙 기반 1차 후보 추출 + LLM 문맥 판정 + LLM 최종 검증` 구조로 재정리했다.
   - `code_detail(grp_cd='PARCEL')`를 기준으로 대상농지 코드 목록을 읽고, activity 표의 `주요 내용`에서 우선 후보를 찾도록 했다.
   - 1차 후보가 없을 때만 같은 activity의 `heading_path` 섹션 전체로 문맥 범위를 확장한다.
   - `논`, `밭`뿐 아니라 `답`, `전` 같은 별칭도 판정할 수 있도록 별칭 사전을 별도 설정 파일로 분리했다.
   - 다만 문맥상 제외(`논을 제외한 ...`) 또는 단순 배경 설명으로 나온 경우는 최종 검증 단계에서 탈락시키도록 보수화했다.
5. 대상농지 별칭/프롬프트/검증 자산을 운영 가능한 구조로 정리했다.
   - 일반적인 프롬프트는 소스 내부에 유지하되, 특정 목적 프롬프트는 `locaville/backend/app/prompts/project_from_rag/` 아래 text 파일로 분리했다.
   - 대상농지 별칭은 하드코딩 대신 `locaville/backend/app/config/parcel_aliases.json`으로 분리했다.
   - 목적별 prompt는 `parcel_suggestion_system.txt`, `parcel_inference_system.txt`, `parcel_validation_system.txt`로 나누어, 후보 추출/문맥 확장/최종 검증 책임을 분리했다.
6. 대상농지 판정 기준을 더 엄격하게 정리했다.
   - 프로젝트 제목의 `경종` 같은 일반 문맥은 후보를 넓히는 근거가 아니라, 가능한 범위를 제한하는 힌트로만 쓰도록 정리했다.
   - 반대로 activity 주요 내용에서 `지목·재배 품목과 관계없이 바이오차 투입후 경운이 가능한 농지`처럼 명시적 확장 근거가 있는 경우에는 `논/밭/과수원`까지 허용하도록 보강했다.
   - 이에 따라 `중간 물떼기`처럼 실제 본문이 `논`만 가리키는 activity에서 과수원/밭이 과다 제안되던 문제를 줄이고, `바이오차 투입`처럼 명시적 범용 문맥이 있는 activity는 필요한 범위만 확장하도록 수정했다.
7. 활동비 단위 처리도 활동 등록 연계 관점에서 다시 정리했다.
   - 화면 입력/표시 단위는 `원/ha`로 유지하고, DB 저장 단위는 `원/㎡`로 유지했다.
   - DB 컬럼이 decimal 임을 반영해 `원/㎡` 소수점 1자리까지 저장할 수 있도록 조정했다.
   - 이에 따라 화면에서 `364,000 원/ha`를 입력하면 DB에는 `36.4 원/㎡`로 저장되고, 반대로 조회 시에는 다시 `364,000 원/ha`로 환산해 표시하도록 정리했다.

#### 1.1.10. 2026.06.18 작업
1. 프로젝트 활동 등록 구조를 `활동 제안 -> 활동 저장 -> 작업 등록` 3단계 관점으로 다시 정리했다.
   - `prj_activity`에 `description`, `activity_rule`를 저장하는 방향으로 정리하고, 활동 등록/수정 화면에서 `활동설명`, `활동규칙`을 함께 입력·조회할 수 있도록 연결했다.
   - 활동 삭제 시에는 활동만이 아니라 소속 작업까지 함께 삭제하는 운영 흐름을 추가했다.
2. 활동 제안 단계에서 문서 의미를 더 보존하도록 description/rule 생성 기준을 보강했다.
   - `주요 내용`은 이미 파싱한 activity 표 본문을 그대로 우선 사용하고, 같은 `heading_path` 아래의 부가 문장 중 실제 activity와 관련된 문장만 골라 `활동설명` 후보로 연결하도록 정리했다.
   - `활동명: ...`, `주요 내용: ...` 같은 메타 라인이나 이미 본문과 중복되는 문장은 부가 내용/설명에 다시 섞이지 않도록 보정했다.
   - 줄바꿈, `▸`, `*`, `**`, `(증빙방법)` 같은 기호는 가능한 한 원문 형태를 유지하도록 정리했다.
3. 활동규칙 생성 책임을 별도 prompt 흐름으로 분리했다.
   - 프로젝트 기본정보/활동목록 추출 prompt와 섞지 않고, 활동설명 분석용 `activity_rule` 전용 prompt를 별도 파일로 분리했다.
   - 생성 결과는 `활동명`, `시작일`, `종료일`, `증빙조건` JSON 구조로 저장하고, `증빙방법` 문장과 `근거` 문장을 함께 남기도록 정리했다.
4. 반복작업 등록 흐름은 실시간 RAG 검색 의존을 줄이고 저장된 activity 정보 재사용 중심으로 재정리했다.
   - 반복횟수는 `prj_activity.activity_rule.증빙조건.증빙회수`가 있으면 그 값을 사용하고, 없으면 기본 `1회`로 단순화했다.
   - 작업관리 등록 화면의 `작업등록(RAG)`는 별도 RAG vector 재검색 대신 저장된 `prj_activity.description`, `activity_rule`를 기준으로 작업 초안을 계산하는 방향으로 바꿨다.
5. 작업 초안 생성 책임을 frontend에서 backend로 이동했다.
   - backend `job-setup` 응답이 `repeat_count`, 대상 `farm_job`, 작업별 `exec_point`, `ref_job_cd`, `start_date_rule`, `end_date_rule` 초안을 함께 반환하도록 정리했다.
   - frontend는 더 이상 `activity_rule`을 직접 해석하거나 반복횟수/선후행작업/규칙 JSON을 조합하지 않고, backend가 계산한 초안을 그대로 표시·수정하는 구조로 단순화했다.
6. 작업관리 화면의 불필요한 RAG 보조 로직과 디버그 요소를 정리했다.
   - 반복횟수 판단 근거, 디버그 팝업, 별도 repeat-count 제안 API, 화면 내 즉석 prompt 호출 등을 제거했다.
   - 작업관리 팝업 최초 진입 시에도 전체 RAG 파일 정보나 불필요한 공통 코드 목록을 미리 적재하지 않고, 해당 activity의 `job-setup`에 필요한 정보만 지연 로딩하도록 경량화했다.

#### 1.1.11. 2026.06.19 작업
1. 활동규칙 생성 입력을 `활동설명` 중심으로 다시 단순화했다.
   - `activity_rule` 전용 prompt는 `활동명 + 활동설명 + farm_job 목록`만 입력으로 사용하도록 정리했다.
   - 프론트는 제안 상세에서 만든 `활동설명`만 backend `activity-rule` API에 전달하고, 규칙 생성 책임은 backend prompt/후처리 경로로 모았다.
2. 활동규칙 JSON 정규화 책임을 backend에 더 명확히 모았다.
   - `기준작업`은 작업 ID가 아니라 `farm_job.job_name` 기준으로 맞추도록 보강했다.
   - `farm_job`에 없는 외부 기준작업은 `완전 물떼기(미등록)`처럼 표시해, `본활동`과 미등록 외부 작업을 구분하도록 정리했다.
   - `본활동` 기준 종료 규칙은 `시작 후`를 우선 해석하고, `이전/이후` 표현은 `시작 전/완료 후` 방향으로 정규화하도록 보강했다.
3. 활동 지속기간 및 반복 간격 해석을 prompt와 후처리 양쪽에서 보강했다.
   - `2주 이상`, `N일 이상`은 종료일 `최소경과일수` 후보로 읽도록 정리했다.
   - `N회[최소 M일 간격]`, `N회(최소 M일 간격)`은 backend 후처리에서 `(N-1) * M`으로 계산하도록 보강했다.
   - 프롬프트 예시 문구 자체를 입력 근거처럼 해석하지 않도록, `입력된 활동설명에 있는 숫자와 표현만 사용` 규칙을 추가했다.
4. 증빙조건 후처리를 더 엄격하게 정리했다.
   - `(증빙방법)` 줄이 있으면 `증빙조건.근거`는 그 한 줄만 유지하고, 다른 설명 문장은 섞지 않도록 보강했다.
   - `증빙방법` 또는 `근거`가 있으면 `증빙회수` 기본값은 `1`로 backend가 정규화하도록 정리했다.
5. 활동등록/작업등록 화면의 프론트 동작도 backend 정규화 결과 중심으로 다시 맞췄다.
   - 활동 등록 제안 버튼 클릭 시 `활동 등록 준비 중 ...` 대기 메시지를 추가해, 규칙 생성 대기 구간을 사용자에게 안내하도록 보강했다.
   - 활동규칙 편집창은 `기준작업`이 있는 날짜 규칙에 한해서만 `경과일수: 0` 보정을 적용하고, 원래 `{}`인 날짜 규칙은 그대로 유지하도록 보정 범위를 축소했다.
   - 반복작업 등록 완료 안내는 같은 활동 안에서 직전 작업코드와 동일한 경우에만 `동일 작업 ... 추가 등록` 문구가 보이도록 조건을 좁혔다.
6. 작업등록 화면의 규칙 입력 보조도 실제 운영 입력 기준으로 보강했다.
   - 선후행작업을 선택하면 시작일규칙에 `{"ref":"REF","condition":"END","offset":0}` 기본값을 자동 채우도록 연결했다.
   - 반복작업 등록 draft에서도 같은 선후행작업 선택 규칙이 적용되도록 맞췄다.

### 1.2 주요 문제 및 해결 내역
1. HWPX 내부 구조상 같은 제목이 `table`과 `paragraph` 경로로 동시에 존재하는 경우가 있어, 화면상 동일한 제목이 Pre-Parsing 후보 목록에 중복으로 나타나는 사례가 아직 남아 있다.
   - 해결 방식: `lxml.etree.XMLParser` 기반으로 top-level paragraph / table 블록을 분리하고, table 을 감싸는 wrapper paragraph 는 수집 단계에서 제외하도록 보강했다. 또한 heading 유사 샘플은 정규화 key 기준으로 대표화했다.
   - 결과: `table` + `paragraph` 이중 유입으로 인한 중복 후보는 크게 줄었고, 대표 샘플/출현횟수도 안정화되었다. 다만 XML 원문 구조가 예외적인 문서는 추가 회귀 점검이 필요하다.
2. 일부 section 에서 XML parse fallback 이 동작하면 table / box 내부 문단이 `paragraph`로 다시 유입될 가능성이 있어, Q&A box 나 제목 배너가 main 후보로 재등장하는 케이스를 추가 확인해야 한다.
   - 해결 방식: HWPX Pre-Parsing 기본 경로를 explicit XML block 판독으로 전환하고, fallback 은 예외 상황에서만 제한적으로 사용하도록 보수화했다.
   - 결과: fallback 재유입으로 인한 box / 배너 오탐 빈도는 낮아졌고, 일반 운영 문서에서는 XML 기본 경로가 우선 동작하도록 정리되었다. fallback 자체를 완전히 제거한 것은 아니므로 잔여 예외는 추가 확인 대상이다.
3. `1행 table 제목 배너`, `appendix 시작 제목행`, `본문 box 제목`은 화면상 유사하지만 처리 기준이 서로 달라, 현재 규칙만으로는 모든 문서에서 완전히 일반화되지는 않았다.
   - 해결 방식: body / appendix 모드별로 단일행 table 처리 기준을 분리하고, embedding parser runtime 에도 `appendix_title_table` 규칙, appendix depth 1 title 처리, main/app appendix sector 분리를 함께 반영했다.
   - 결과: `참고 n | 제목` 형태 appendix 시작행은 embedding 실행 시에도 appendix 로 인식되도록 개선되었고, body box / appendix 시작행 오분류도 이전보다 줄었다. 다만 문서별 예외 패턴과 layout 변형은 계속 회귀 점검이 필요하다.
4. 현재 Pre-Parsing 은 빠른 구조 스캔 중심으로 보수화했지만, 반대로 진짜 목차성 항목을 너무 일찍 제외할 위험도 있어 실문서 기준의 회귀 점검이 더 필요하다.
5. appendix 진입 / 복귀는 pre-parse 와 embedding parsing 모두에서 많이 안정화되었지만, 문서별 appendix 구조 편차가 커 완전 일반화까지는 추가 보강이 필요하다.
   - 해결 방식: explicit `body_exit_criteria`, `appendix_exit_criteria` 외에도, embedding parser 에서 appendix depth 1 진입, appendix 자체 stack 구성, main depth 1~2 복귀, sector 분리를 함께 반영했다.
   - 결과: appendix 시작행을 만나도 `sector=main`으로 남던 사례, appendix 계층이 main 흐름에 섞이던 사례는 줄었다. 다만 문서별 layout 편차, 부록 내부 예외 목차, 본문과 부록이 유사한 표 레이아웃을 쓰는 경우는 추가 회귀 점검이 필요하다.
6. 문서 화면상으로는 동일한 제목이라도 HWPX 원문에서는 공백, 숨은 문자, table flatten 결과 차이로 서로 다른 raw line 으로 남는 사례가 있어, 대표화 규칙을 추가 보강할 필요가 있다.
   - 해결 방식: 공백, `|`, 로마자 뒤 공백, 숨은 문자 제거, 단일행 table flatten 정규화, `notation_display` 기준 화면 표시를 함께 적용했다.
   - 결과: 출현 대상 팝업, 출현횟수, schema_note, 표기 컬럼에서 보이던 중복/혼동 사례는 줄었고, 화면상 대표 표기도 DB의 `notation_display` 기준으로 일관되게 맞춰졌다.
7. HWPX 화면 줄바꿈과 XML text 조각 분리가 일치하지 않아, 표/box 내부 문장이 잘못 끊기거나 반대로 붙는 사례가 있었다.
   - 해결 방식: `hp:t` 분할 개수나 `linesegarray` 개수만으로 줄바꿈을 복원하지 않고, paragraph 및 explicit break 중심으로만 줄바꿈을 반영하도록 보수화했다.
   - 결과: 한글 에디터에서는 한 줄로 보이는데 XML 조각 수 때문에 잘못 개행되던 사례는 줄었다. 다만 실제 시각 줄맞춤(자동 wrap)까지 완전히 복원하는 것은 현재 목표 범위에서 제외했다.
8. 표가 일반 header row 인지, header-value pair 인지, header-(소헤더:값) 목록인지 문서마다 달라 단일 규칙으로는 문장화가 자주 틀어졌다.
   - 해결 방식: `TablePattern` 3종을 명시하고, `Header.xml` 배경색과 행 단위 cell 패턴을 함께 이용해 표 형식을 재판정하도록 보강했다.
   - 결과: `재원구성 (%): 국고 : 100%, 지방비 : -, ...` 같은 헤더-값 목록형 표와, 일반 row record 표를 구분하는 정확도는 높아졌다. 다만 색 정보가 없거나 문서 제작 방식이 불규칙한 표는 추가 예외 규칙이 필요하다.
9. nested table, 상태값 box, spacer row/column 같은 장식성 구조가 그대로 남으면 실제 검색에 불필요한 노이즈가 커졌다.
   - 해결 방식: nested table 은 단일행이면 평탄화, 다중행이면 markdown화하고, spacer 행·열은 제거하되 `-`는 의미 있는 값으로 유지하도록 분리했다. 상태값 box 는 장식 요소로 보고 평문 처리하도록 정리했다.
   - 결과: 검증 화면 가독성과 검색용 본문 정합성은 좋아졌지만, 어떤 box 를 장식으로 볼지와 어떤 nested table 을 독립 의미 구조로 볼지는 문서군별 회귀 점검이 더 필요하다.
10. 청크를 너무 보수적으로 자르면 하위 목차가 흩어지고, 너무 공격적으로 합치면 서로 다른 하위 단계가 한 청크에 섞이는 문제가 있었다.
   - 해결 방식: 기존 depth 경계 중심 규칙에 더해, 2026.06.15 기준으로 `min_chars / target_chars / max_chars` 기반 soft merge 와 short-chunk rescue 규칙을 추가했다. hard boundary 는 `sector`, 상위 title 전환, table cluster 전환 등 꼭 필요한 경우로만 남기고, 나머지는 heading/structure/title prefix 연속성 점수로 병합 여부를 판단하도록 보강했다.
   - 결과: 상위 단계의 짧은 제목성 chunk 가 다음 본문 chunk 로 흡수되는 경우가 늘어 chunk 수와 상위 short chunk 문제는 이전보다 완화되었다. 다만 threshold(`350/750/1000`)가 문서군별로 항상 최적인지는 아직 검증 중이며, retrieval top-k 품질과 표/문단 혼합 구간의 병합 품질은 추가 평가가 더 필요하다.

### 1.3 RAG 파일 등록
1. 관리자는 `web_admin` 사이드바의 `RAG 관리` 메뉴로 이동한다.
2. 목록 화면에서 `RAG 파일 등록` 버튼을 누른다.
3. 등록 화면에서 원본 문서를 선택하거나 드래그 앤 드롭한다.
4. `Main Heading Template`를 선택하고, 필요 시 `Appendix Template`를 선택한 뒤 `Pre-Parsing`을 실행한다.
5. 시스템은 다음을 제안한다.
   - 파일명, 파일형식
   - 문서명, 문서구분
   - 파일ID, 문서버전
   - 공개일자, 문서번호, 담당기관/담당자
   - body / appendix 목차 구조 후보 및 단계별 출현횟수
   - 초기 파싱 미리보기
6. 관리자는 목차 구조에서 각 단계를 검토한다.
   - body 기존 단계는 `유지` 또는 `제외`
   - body 신규 기호는 `신규` 또는 `무시`
   - appendix 단계는 우선 기존 규칙 기준으로 `유지` 또는 `제외`
   - 필요 시 단계 번호를 위/아래 버튼으로 조정
   - 필요 시 `단계 재정렬`
7. `RAG 파일 등록` 버튼을 누르면, 단계 번호가 연속적이지 않은 경우 `목차 단계를 재정렬하시겠습니까` 확인 팝업이 뜬다.
8. 확인 후 backend는 다음만 수행한다.
   - 원본 파일을 Storage의 `document` 버킷 `rag/` 경로에 업로드
   - `rag_file` 레코드 저장
   - 이때 `heading_schema`, `appendix_schema`는 `rule_id + override` 구조로 저장
   - `embedding_yn = 'N'` 저장
9. 등록 완료 후 목록 화면 `/rag` 로 복귀한다.

### 1.4 RAG 파일 조회
1. `/rag` 목록에서 문서명, 문서구분, 문서담당자/기관, 벡터등록여부를 확인한다.
2. 행 전체를 클릭하면 문서 상세 화면으로 이동한다.
3. `원본문서 다운로드` 버튼을 누르면 원본 문서를 내려받는다.
   - backend가 Storage에서 임시 다운로드
   - `file_id + 확장자` 이름으로 응답
   - 응답 후 임시 파일은 백그라운드 삭제

### 1.5 RAG 파싱 & 임베딩
1. 상세 화면 `/rag/[file_id]` 에서 `벡터 임베딩 실행` 또는 `벡터 임베딩 재실행` 버튼을 누른다.
2. backend는 Storage 또는 저장 경로에서 원본 문서를 다시 읽는다.
3. backend는 `rag_file.heading_schema`를 runtime 규칙으로 해석한 뒤 파서에 전달한다.
4. 파서는 문서 포맷별로 원문을 읽어 `segment` 단위로 분해한다.
   - `paragraph`
   - `heading-inline`
   - `table`
   - `table-row`
5. `heading_schema`를 기준으로 제목형 목차와 문장형/구조형 목차를 구분한다.
   - 제목형: `1.`, `가.` 등 `heading_path`의 기본 축이 되는 단계
   - 구조형: `○`, `①` 등 문단/표의 구조를 나누는 단계
6. 청커는 아래 기준으로 chunk를 만든다.
   - `heading_path` 변경 시 분리
   - 상위 구조형 그룹(`○` 등) 변경 시 분리
   - 표 row와 일반 paragraph는 분리
   - separator-only 텍스트(`-----`)는 제거
   - 동일 `heading_path` 안의 짧은 trailing 문구는 앞 청크에 합침
   - 동일 구조 안의 짧은 paragraph는 합칠 수 있음
   - `sector 변경`, cover/title 구간, 상위 title 전환, 서로 다른 table cluster 는 hard boundary 로 분리
   - 그 외에는 `heading_path`, structural key, title prefix, block family, depth 인접성 기준의 merge score 를 계산해 `min_chars=350`, `target_chars=750`, `max_chars=1000` 안에서 병합
   - 현재 chunk 길이가 `min_chars` 미만이면 같은 상위 title 흐름 안의 다음 본문 chunk 로 rescue merge 할 수 있음
   - 한 행 또는 한 문단 묶음이 `max_chars`를 넘으면 기존 후단 문장 단위 overlap split 규칙으로 분할
7. 생성된 chunk마다 메타 정보를 구성한다.
   - `chunk_loc`
   - `heading_path`
   - `attributes`
8. 각 chunk 본문으로 embedding을 수행한다.
9. 현재 운영 확인 단계에서는 결과를 완료 팝업과 상세 화면의 벡터 파싱정보 표로 함께 검증한다.
10. 임베딩 실행 시 `rag_vector`는 `file_id` 기준 `delete 후 insert` 방식으로 재적재한다.
11. 적재가 완료되면 `rag_file.embedding_yn`을 `Y` 또는 `N`으로 갱신한다.

### 1.6 현재 범위에서 제외한 절차
- 자동 품질 판정 없이 즉시 운영 배포
- 검색 단계 hybrid retrieval / reranking
- 문서별 커스텀 schema 편집 UI
- 임베딩 이력/버전 관리

## 2. 각 화면별/항목별 요구사항/구현사항

### 2.1 `/rag` 목록 화면
#### 요구사항
- 등록된 RAG 파일을 한눈에 조회
- 신규 등록 진입
- 원본문서 다운로드
- 행 클릭 시 상세 이동

#### 구현사항
- 컬럼을 최종적으로 아래 항목 중심으로 단순화
  - 문서명
  - 문서구분
  - 문서담당자/기관
  - 벡터등록여부
- 행 전체 클릭으로 상세 화면 이동
- 행 끝에 `원본문서 다운로드` 버튼 추가
- `embedding_yn` 기준으로 `등록 / 미등록` 배지 표시

### 2.2 `/rag/new` 등록 화면
#### 요구사항
- 파일 선택
- 템플릿 선택 후 초기 파싱
- 문서 메타정보 검토 및 수정
- 목차 구조 후보 검토
- 최종 등록

#### 구현사항
##### 1) 파일 선택 및 Pre-Parsing
- `pdf`, `docx`, `hwpx`, `md` 허용
- 클릭 선택 및 drag & drop 지원
- `Main Heading Template`, `Appendix Template` 선택 후 `Pre-Parsing` 실행
- `Appendix Template` 기본값은 `선택없음`

##### 2) 메타정보 배치
- 한 줄 배치 구조를 아래처럼 정리
  1. 파일명 / 파일형식
  2. 문서명 / 문서구분
  3. 파일ID / 문서버전
  4. 공개일자 / 문서번호 / 담당기관/담당자
- 파일명은 수정 불가
- 문서명은 수정 가능
- 파일ID는 수정 가능
- `문서명 반영` 버튼을 두어 현재 문서명 기준으로 파일ID 재생성
- 파일ID 최대 길이는 64자

##### 3) 담당기관/담당자 처리
- 기존 `파일관리자` 표현을 `담당기관/담당자`로 변경
- 사람이름 또는 공공기관명으로 보기 어려운 값은 비워두는 보수적 추출 적용

##### 4) 목차 구조 표
- `heading_schema` 원문 JSON 대신 표 형식으로 표시
- body 와 appendix schema 는 구분해서 검토할 수 있도록 확장 예정
- 컬럼
  - 단계
  - 규칙
  - 표기
  - 출현횟수
  - 처리방안
- `location`은 `paragraph`, `table`, `both` 기준으로 저장
  - `table`은 box(1x1 table 포함)와 단일행 table 목차 후보를 의미
  - `both`는 paragraph와 table 양쪽에서 후보 탐색
- 표기 컬럼은 frontend 임의 치환이 아니라 backend runtime schema 의 `notation_display`를 우선 사용
- 각 단계 클릭 시 출현 대상 목록 팝업 표시
- 출현횟수 0인 경우에도 클릭 가능하며 `해당 단계 목차가 발견되지 않았습니다.` 안내
- 기존 표준 규칙은 `rule_id`를 유지하고, 문서별 예외는 `rule_options` override 또는 custom rule로 저장
- body 영역은 기존처럼 신규 기호를 `신규 / 무시`로 검토
- appendix 영역은 우선 기존 규칙 기준 `유지 / 제외` 검토를 우선하고, 자동 신규 추가는 제외
- 삭제 계열 행은 회색 비활성 스타일 적용
  - 기존 단계: `유지 / 제외`
  - 신규 기호: `신규 / 무시`
- 활성 행에만 위/아래 삼각형 버튼 노출
  - 위 클릭 시 단계 숫자 감소
  - 아래 클릭 시 단계 숫자 증가
- `단계 재정렬` 버튼을 `단계` 헤더 옆에 배치

##### 5) 등록 버튼 동작
- 버튼명 `RAG 파일 등록`
- 저장 전 단계 번호 비연속 시 재정렬 확인 팝업 표시
- 팝업 버튼 순서 및 문구
  - `확인`
  - `취소`
- 등록 완료 후 상세가 아니라 목록으로 복귀

##### 6) 초기 파싱 미리보기
- 최대 100개까지 표시
- HWPX 원문 paragraph 기준으로 보여주도록 보강

### 2.3 `/rag/[file_id]` 상세 화면
#### 요구사항
- 등록된 `rag_file`의 세부 속성 확인
- 재등록 진입
 - 임베딩 실행 및 결과 검증

#### 구현사항
- 메타정보 상세 조회
- `문서담당자/기관` 라벨 사용
- `RAG 파일 재등록` 버튼 유지
- `RAG 파일 삭제` 버튼 추가
  - 삭제 확인 팝업 제공
  - `embedding_yn='Y'` 또는 `rag_vector` 존재 시 벡터 데이터도 같이 삭제된다는 문구 표시
  - 삭제 성공 후 상세가 아니라 목록 화면으로 즉시 복귀
- `벡터 임베딩 실행 / 재실행` 버튼 추가
- `벡터 임베딩 테스트` 버튼 추가
  - preview-only 로 parsing / chunking / embedding 결과를 즉시 검증할 수 있도록 정리
- 임베딩 실행 완료 시 결과 팝업 추가
  - `확인` 버튼만 노출
- `RAG 벡터 파싱정보 보기/닫기` 버튼 추가
  - 표는 `rag_vector`를 50건씩 조회
  - 하단 `다음` 버튼으로 연속 조회
  - 이번 실행 결과가 없더라도 기존 `rag_vector`가 있으면 그 내용을 표시
  - 테스트 실행 시에는 이번 preview 결과를 즉시 같은 표에 보여주도록 정리
- 참조 템플릿명은 프론트 하드코딩이 아니라 DB의 `rag_heading.heading_name` 기준으로 표시

### 2.4 `/rag/[file_id]/embedding` 상세 검증 영역
#### 요구사항
- 임베딩 전 parsing/chunking 결과를 레코드 단위로 확인
- `heading_path`, `chunk_loc`, chunk 본문이 함께 보여야 함
- 표/문장형 목차/통합 청크가 사람이 읽는 기준으로 자연스럽게 보여야 함
- 내부 디버깅용 메타와 사용자 검증용 메타를 구분

#### 구현사항
##### 1) 실행 결과 표
- 상세 화면 하단에 실행 결과 표를 추가
- 상세 화면 최초 진입 시에는 기존 `rag_vector` 저장값을 기준으로 조회 가능
- 한 번에 50개씩 로드
- 맨 끝에 `다음` 버튼으로 추가 조회
- 컬럼
  - `chunk_id`
  - `heading_path`
  - `chunk_loc`
  - `attributes`
  - `내용 미리보기`
- `내용 미리보기`는 현재 500자 기준
- 줄바꿈 검증을 위해 `line_count`, `newline_count`를 함께 표시
- 줄바꿈 자체는 유지하되, 미리보기 내부 `[LF]` 보조 표시는 제거

##### 2) parsing 및 chunk 분리 규칙
- HWPX는 표/문단/heading-inline을 별도 segment로 분리
- 단일 셀 배너 표는 일반 table로 유지
- 다중 셀 표는 `table-row` 중심으로 분해
- 단일행 table/box는 목차 추출 판단을 위해 내부적으로 평탄화 가능
  - 단, 결과 `location`은 `paragraph`로 바꾸지 않고 `table` 유지
- HWPX 줄바꿈은 text node 분할 개수가 아니라 paragraph / explicit break 중심으로만 반영
- 같은 `heading_path`라도 구조형 상위 그룹(`○`)이 바뀌면 분리
- `table-row`와 일반 paragraph는 별도 chunk 유지
- 초반 cover/title 영역은 독립 chunk로 유지
- nested table 은 top-level table 로 중복 파싱하지 않음
- nested table 이 다행일 때만 markdown table 로 변환하고, 단일행/단일셀 nested table 은 plain text 로 유지

##### 3) 통합 규칙
- 같은 `heading_path`와 같은 상위 구조 안에서 짧은 paragraph는 합칠 수 있음
- 날짜/기관명 같은 짧은 trailing 문구는 앞 paragraph에 합침
- separator-only line은 버림
- 첫 chunk에는 필요한 제목형 목차만 본문에 prepend
- 중복 prepend는 본문 첫 줄과 prefix 유사도 기준으로 제거
- `sector 변경`, cover/title 구간, 상위 title 전환, 서로 다른 table cluster 는 hard boundary 로 유지
- `heading_path`, structural key, title prefix, block family, depth 인접성 기준 merge score 를 계산해 `350/750/1000` 기준 안에서 soft merge
- 현재 chunk 가 짧으면(`min_chars=350` 미만) 같은 상위 title 흐름 안의 다음 chunk 를 rescue merge 하여 상위 short chunk 를 줄임
- table row 병합 시에는 행 사이에 짧은 구분자(`---`)를 두어 검증성과 완결성을 함께 유지
- 문장형 목차(`○ + 본문`)는 아래처럼 처리
  - 한 청크만 차지하면 `heading_path`에서는 제외
  - 첫 등장 청크는 본문에 이미 있으므로 `heading_path`에서 제외
  - 표 또는 하위 목차 청크는 기호만 표시 (`○`)
  - 이후 일반 문단 청크는 `○ + 본문` 전체 표시

##### 4) heading_path 규칙
- 제목형 목차(`1.`, `가.`)는 `heading_path`의 기본 축으로 사용
- 구조형 목차(`○`, `①`)는 필요할 때만 `heading_path`에 승격
- `○ > ① ...` 같이 하위 구조가 생기면 상위 `○`는 기호만 표시
- 표 caption이 있으면 `> 📋 {caption}` 형식으로 표시
- 동일 구조가 여러 chunk로 나뉘면 이후 chunk에서는 구조형 정보를 `heading_path`에 반영

##### 5) chunk_loc 규칙
- 내부 section 경로, 파일명, heading marker 는 표시에서 제외
- 단일 segment면 순수 block 번호만 표시
  - 예: `35`
- 여러 segment 통합 청크면 시작/종료 block 번호만 표시
  - 예: `17~21`
- 연속된 구간을 table row 병합 등으로 이어 붙인 경우에도 `2~3~4~5~6~7~8` 대신 `2~8`처럼 압축 표시

##### 6) attributes 규칙
- `attributes`는 검증용 요약 메타만 노출
- 다음 항목은 `attributes` 기록에서 제외
  - `heading_path`
  - `section`
  - `chunk_loc`
  - `segment_count`
  - `_heading_nodes_runtime`
  - `structural_group_key`
  - `source_order_start`, `source_order_end`
- 단일값 중복 정리
  - `locations`와 `location`이 같으면 배열 숨김
  - `block_types`와 `block_type`이 같으면 배열 숨김
- 여러 segment가 합쳐진 chunk는 `block_types`, `locations` 목록 위주로 표시
- table 관련 메타는 `table_meta`로 묶음
  - `row_count`
  - `cell_count`
  - `header_row`
  - `table_pattern`
  - `table_caption`
  - `table_caption_position`
- `row_index`는 table 전체 메타가 아니라 행별 정보이므로 `location` 쪽에 표시
  - 예: `"location": { "row_index": 2 }`
- 화면 표시 기준으로 `table-row`는 `block_type: "table"`로 보이게 정규화

##### 7) 통합 청크 메타 정보 구성안
- 대표 메타
  - `block_type`
  - `location`
  - `table_meta`
- 조각별 값이 다를 경우
  - `block_types`: 여러 유형이 섞인 경우만 표시
  - `locations`: 여러 위치가 섞인 경우만 표시
  - `heading_path`: 최종 통합된 대표 경로 1개만 유지
- 통합 기준이 되는 값
  - 첫 segment의 `section`
  - 첫 segment의 `heading_nodes`
  - 시작/종료 `source_order`
  - 시작/종료 `chunk_loc`

### 2.5 backend `/rag` API
#### 구현사항
- `GET /rag`
  - 목록 조회
- `GET /rag/headings`
  - body / appendix 템플릿 조회
- `GET /rag/{file_id}/vectors`
  - `rag_vector` 50건 단위 페이징 조회
- `GET /rag/{file_id}`
  - 상세 조회
  - 저장 원문 `heading_schema`
  - runtime 해석본 `runtime_heading_schema`
  - appendix 도 runtime 해석본 `runtime_appendix_schema` 제공
- `POST /rag/pre-parse`
  - 파일 초기 분석 및 메타/목차 구조 초안 생성
  - body / appendix template 기준으로 문서 전체를 빠르게 훑어 목차 후보를 생성
- `POST /rag/register`
  - 원본 파일 업로드 + `rag_file` 저장
- `GET /rag/{file_id}/original`
  - Storage에서 원본문서 임시 다운로드 후 응답
- `POST /rag/{file_id}/embedding`
  - 원본문서 재로딩
  - `rule_id + override` 구조를 runtime 규칙으로 해석
  - `location=paragraph/table/both` 기준으로 목차 판정
  - parsing → chunking → embedding 수행
  - 상세 검증용 record 반환
  - `rag_vector`는 `delete 후 insert`
  - `embedding_yn` 갱신
- `DELETE /rag/{file_id}`
  - `rag_file` 삭제
  - 관련 `rag_vector` 삭제
  - 원본 Storage 파일 best-effort 삭제

### 2.6 프로젝트 등록/활동/작업 화면 연계
#### 요구사항
- 기존 RAG 파일을 선택하여 프로젝트 기본정보를 제안받을 수 있어야 함
- 프로젝트 저장 후 같은 RAG 문서를 기반으로 활동 후보를 제안받을 수 있어야 함
- 제안 활동을 상세 검토한 뒤 바로 활동 등록할 수 있어야 함
- 활동 등록 후 작업 등록 및 반복작업 등록 단계에서 `farm_job` 기본값을 자동 추천할 수 있어야 함

#### 구현사항
##### 1) 프로젝트 기본정보 제안
- `/project/new` 화면에서 기반 사업과 RAG 파일을 선택
- `POST /project/from-rag/basic` 호출로 프로젝트명 / 발주기관 / 공고일자 / 시행연도 prefill
- 프로젝트ID는 `연도 2자리 + (프로젝트명 + 발주기관) hash 6자리` 자동 생성

##### 2) 활동 제안 목록
- 프로젝트 저장 후 `POST /project/{prj_id}/from-rag/activity` 호출
- 제안 목록은 `우선 검토 대상`과 `검토 가능 후보`로 나누어 표시
- 이미 등록된 활동명과 동일한 제안은 `활동등록` 버튼 비활성화

##### 3) 활동 상세 검토
- `상세 보기`는 JSON 원문이 아니라 표 형식으로 표시
  - `활동명`
  - `주요 내용`
  - `단가`
- 표 아래에는 같은 `heading_path` 섹션의 이어지는 문단을 `부가 내용` 박스로 표시

##### 4) 활동 등록 연계
- 제안 항목의 `활동등록` 버튼으로 기존 활동 등록 모달을 재사용
- 활동명, 활동비를 제안값으로 prefill
- 단가는 `46.0만원/ha -> 460000`처럼 원 단위 숫자로 변환
- 활동ID는 `순번 2자리 + 활동명 hash 6자리` 자동 생성

##### 5) 작업 등록 / 반복작업 등록 연계
- 활동명과 `farm_job.job_name`을 비교해 `대상작업` 기본값을 자동 선택
- 우선순위는 정확 일치 후 부분 일치
- 같은 기준을 작업 등록과 반복작업 등록에 공통 적용

## 3. 파싱, 청킹, 및 검색 알고리즘

### 3.1 파싱 알고리즘
#### 3.1.1 공통 흐름
1. backend 는 `rag_file.heading_schema`, `appendix_schema`, exit criteria 를 읽어 runtime 규칙으로 해석한다.
2. backend 의 `DocumentParser`가 문서 확장자를 보고 실제 parser 구현체를 선택한다.
   - `.hwpx` → `HwpxParser`
   - `.docx` → `DocxDocumentParser`
   - `.pdf` → `PdfDocumentParser`
   - `.md` → `MarkdownDocumentParser`
3. 선택된 parser 는 공통 시그니처(`heading_schema`, `appendix_schema`, `body_exit_criteria`, `appendix_exit_criteria`)로 호출되고, 결과를 `ParsedSegment` 목록으로 통일한다.
3. 각 segment 에는 최소한 다음 정보를 부여한다.
   - `source_order`
   - `location`
   - `block_type`
   - `heading_depth`, `heading_text`, `heading_path`
   - `chunk_loc`
   - `metadata`
   - `heading_nodes`
4. `ParsedSegment`, `HeadingNode`, `RagEmbeddingParseError` 같은 공통 타입은 `document_models.py`에 모아 두고, parser / chunker 가 공통 계약으로 함께 사용한다.
5. HWPX 의 경우 body / appendix mode, pending heading, table caption, table metadata 같은 후처리를 parser 단계에서 먼저 정리한다.

#### 3.1.2 HWPX 파싱 알고리즘
1. `Contents/section*.xml`을 순서대로 읽어 top-level paragraph / table event 를 추출한다.
2. 각 event 에 대해 `source_order`를 1씩 증가시키며 문서 순서를 보존한다.
3. paragraph 는 nested table 텍스트를 제외한 rendered text 를 우선 추출하고, explicit break 중심으로 줄바꿈을 복원한다.
4. table 은 row/cell 메타, header 추정, nested table flatten 결과를 포함한 별도 event 로 만든다.
5. event 마다 body / appendix mode 를 판정한다.
   - body mode 에서 appendix depth 1 또는 body exit criteria 를 만나면 appendix 로 전환
   - appendix mode 에서 main re-entry 또는 appendix exit criteria 를 만나면 main 으로 복귀
6. active mode 의 heading schema 로 현재 event 가 heading 인지 판정한다.
7. heading 인 경우
   - heading stack 을 갱신
   - pending heading stack 을 준비
   - inline payload 가 있으면 `heading-inline` segment 로 즉시 생성
8. 일반 본문 / 표 event 인 경우
   - pending heading 을 적절히 본문에 병합
   - table 계열은 duplicate title line 제거, caption 귀속, symbol-only row 제외 규칙을 적용
   - `heading_nodes`, `heading_path`, `sector`를 포함한 `ParsedSegment`를 생성
9. 전체 segment 생성 후 cover 영역 paragraph/table 중복 제거, table caption propagation 같은 후처리를 수행한다.

#### 3.1.3 비-HWPX 문서 파싱 알고리즘
- `md`: 줄 단위 heading 탐지 후 paragraph segment 생성
- `docx`: paragraph 와 table 을 함께 순회하며 `source_order`를 증가시키고, heading style 또는 runtime schema 기준으로 heading 여부를 판정
- `pdf`: 페이지/문단 기준으로 text 를 읽고 page/para 기반 `chunk_loc`를 부여
- 공통적으로 runtime heading schema 를 이용해 heading 여부를 판정하고, `ParsedSegment` 형식으로 통일한다.
- 현재 비-HWPX parser 도 모두 `appendix_schema`, `body_exit_criteria`, `appendix_exit_criteria` 파라미터를 같은 인터페이스로 받되, 실제 appendix 분리 로직은 HWPX 중심으로 우선 적용되어 있다.

### 3.2 청킹 알고리즘
#### 3.2.1 입력과 목표
- 입력: `ParsedSegment` 목록
- 출력: `RagChunk` 목록
- 목표:
  - 문서 순서를 유지하면서 retrieval 에 적합한 의미 단위 chunk 생성
  - 상위 짧은 제목성 chunk 를 줄이고, 근거 본문과 함께 회수되기 쉬운 크기로 병합
  - 표/문단/부록 경계를 과도하게 훼손하지 않음

#### 3.2.2 전처리와 hard boundary
1. 비어 있는 segment, separator-only 텍스트는 제외한다.
2. 다음 경우는 hard boundary 로 본다.
   - `sector` 변경
   - cover/title 독립 구간
   - 상위 title 전환
   - text family 와 table family 전환
   - 서로 다른 table cluster 전환
3. table cluster 는 `heading_path`, section, header row 가 같은 `table-row` 묶음으로 본다.

#### 3.2.3 soft merge 점수 계산
1. hard boundary 가 아닌 경우 현재 chunk 와 다음 segment 의 merge score 를 계산한다.
2. 점수 요소 예시
   - 같은 block family
   - 같은 `heading_path`
   - 같은 primary structural key
   - 같은 structural key
   - 같은 depth 1 / depth 2 title prefix
   - depth 차이가 작음
   - 같은 table cluster
3. 반대로 heading 이 달라지거나 structural key 가 달라지면 감점한다.

#### 3.2.4 크기 기반 병합 규칙
1. 현재 chunk 길이 계산에는 본문 길이와 `heading_path` 길이를 함께 반영한다.
2. 기준값은 다음과 같다.
   - `min_chars = 350`
   - `target_chars = 750`
   - `max_chars = 1000`
3. 병합 규칙
   - trailing date / 기관명 같은 짧은 문구는 앞 paragraph 에 우선 병합
   - 같은 heading 의 짧은 paragraph 들은 우선 병합
   - 현재 chunk 가 `min_chars` 미만이면 rescue merge 를 허용
   - `target_chars` 이내에서는 merge score 가 충분하면 병합
   - `target_chars`를 넘더라도 `max_chars` 이내이고 점수가 매우 높으면 제한적으로 병합
   - `max_chars`를 넘기면 flush 후 새 chunk 시작

#### 3.2.5 heading_path 와 본문 보강
1. chunk flush 시 공통 heading node 를 추려 대표 `heading_path`와 metadata 를 만든다.
2. 문장형 구조 목차(`○ + 본문`)는 첫 등장/후속 chunk/table chunk 여부에 따라
   - 생략
   - 기호만 유지
   - 전체 문구 유지
   규칙을 달리 적용한다.
3. 표 caption 이 있는 table-row chunk 는 `heading_path` 뒤에 `📋 {caption}`을 붙인다.
4. title line 이 아직 본문에 드러나지 않은 첫 chunk 에는 필요한 title line 만 prepend 한다.

#### 3.2.6 표 전용 병합과 split
1. 같은 table cluster 의 `table-row` chunk 는 `---` 구분자를 넣어 재병합할 수 있다.
2. 너무 긴 table-row chunk 는 기존 규칙대로 줄 단위로 분리한다.
3. 너무 긴 paragraph / heading-inline chunk 는 기존 문장 단위 overlap split 규칙으로 분리한다.
4. 즉, split 은 후단 fallback 이고, 우선은 병합 단계에서 `max_chars` 안에 들어오게 제어한다.

### 3.3 검색 알고리즘
#### 3.3.1 공통 RAG 검색 흐름
1. 공통 검색 진입점은 backend `rag_service.py`의 `retrieve_relevant_snippets(...)`다.
2. 검색 우선순위는 다음과 같다.
   - PostgreSQL `pgvector`
   - Chroma fallback
   - 로컬 문서 keyword fallback
3. query embedding 생성 후 `rag_vector` 계열 저장소에서 유사도 검색을 수행한다.
4. 검색 후에는 activity keyword, money intent, heading boost, MMR 재정렬 같은 후처리를 적용한다.

#### 3.3.2 프로젝트 기본정보 검색
1. `build_project_basic_from_rag(file_id)`는 `rag_file` 메타와 `rag_vector` 본문을 함께 읽는다.
2. `사업명`, `프로젝트명`, `공고명`, `공고일자`, `발주기관`, `시행연도` 계열 키워드가 있는 row를 우선 점수화한다.
3. 상위 `heading_path` 및 인접 `source_order` 기준으로 관련 row를 확장해 basic context를 구성한다.
4. 이 context를 `project_draft_extraction_service.extract_project_basic(...)`에 전달하여 JSON 추출을 수행한다.

#### 3.3.3 프로젝트 활동정보 검색
1. `build_project_activities_from_rag(prj_id)`는 프로젝트에 연결된 `rag_file_id`를 읽는다.
2. `list_rag_vector_contents_for_file(...)`로 `heading_path`, `chunk_loc`, `content`, `attributes`를 포함한 row를 조회한다.
3. 활동 제안은 prompt 기반이 아니라 규칙 기반 검색/추출로 구성한다.
4. 다음 조건을 만족하는 row를 우선 activity table 후보로 본다.
   - `활동`, `활동명`, `작업`, `단가`, `지원` 계열 키워드 포함
   - `table_caption`, `header_row`, `table_row_role`, `block_type`가 표 구조와 일치
5. `활동명:` 또는 `작업명:` 라벨이 있는 row를 activity 후보로 그룹화한다.
6. 단가는 `만원`, `원`, `만원/ha`, `원/ha` 패턴을 읽어 원 단위 숫자로 변환한다.
7. 같은 `heading_path` 섹션의 문단은 `source_order_start`, `source_order_end` 순으로 재정렬해 activity 상세의 `부가 내용`으로 사용한다.

#### 3.3.4 작업 등록 추천 검색
1. activity 저장 후 작업 등록 단계에서는 현재 활동명과 `farm_job.job_name`을 비교한다.
2. 정확 일치 우선, 없으면 부분 일치 기준으로 `대상작업` 기본값을 선정한다.
3. 즉 현재 구조는
   - activity 단계: RAG 문서 의미 보존 중심
   - job 단계: `farm_job` 표준 작업체계 연결 중심
   으로 역할을 분리한다.

## 4. 작성 및 수정된 파일 목록 및 역할

### 4.1 Frontend
- `locaville/web_admin/app/rag/page.tsx`
  - RAG 목록 화면
  - 행 클릭 상세 이동
  - 원본문서 다운로드 버튼
- `locaville/web_admin/app/rag/new/page.tsx`
  - 파일 등록 화면
  - body / appendix template 선택
  - Pre-Parsing, 메타 검토, 목차 구조 조정, 등록
  - `notation_display` 기준 표기/상세 표시
  - `schema_note` 신규/제외 표기 dedupe
  - 지원하지 않는 확장자 오류 문구를 2줄 안내로 표시
- `locaville/web_admin/app/rag/[file_id]/page.tsx`
  - RAG 파일 상세 화면
  - 파일 삭제 / 재등록 / 임베딩 실행 / 임베딩 테스트
  - 임베딩 결과 팝업
  - 임베딩 실행 버튼
  - `rag_vector` 페이징 기반 chunk 검증 테이블
  - 내용 미리보기 줄바꿈 표시 단순화
  - attributes 정리/표시 규칙
  - `attributes.sector`가 앞쪽에 보이도록 표시 순서 보강
- `locaville/web_admin/lib/rag-api.ts`
  - RAG 관련 API 호출 모음
  - 임베딩 실행 API 호출
  - `rag_vector` 페이징 조회 API 호출
- `locaville/web_admin/lib/rag-types.ts`
  - RAG 화면/응답 타입 정의
  - chunk 검증 record 타입 포함
  - `rag_vector` 페이지 응답 타입 포함
- `locaville/web_admin/app/project/new/page.tsx`
  - 기반 사업 및 RAG 파일 선택
  - 프로젝트 기본정보 RAG 제안 반영
- `locaville/web_admin/app/project/[prj_id]/page.tsx`
  - 활동 제안 목록
  - 활동 상세 표/부가 내용 표시
  - 활동 등록 연계
  - 작업 등록/반복작업 등록 시 `farm_job` 기본 매칭
- `locaville/web_admin/lib/project-api.ts`
  - `/project/from-rag/basic`
  - `/project/{prj_id}/from-rag/activity`
  - 프로젝트/활동/작업 관련 API 호출
- `locaville/web_admin/lib/project-types.ts`
  - 프로젝트 등록/상세/활동 제안 응답 타입 정의

### 4.2 Backend
- `locaville/backend/app/routers/rag.py`
  - `/rag` 라우터 정의
  - 원본문서 다운로드 응답 처리
  - 임베딩 실행 엔드포인트 추가
  - 삭제 엔드포인트 추가
  - `rag_vector` 페이징 조회 엔드포인트 추가
- `locaville/backend/app/services/rag_file_service.py`
  - RAG 파일 등록/상세조회 orchestration
  - 파일 업로드
  - `rag_file` 등록
  - 원본문서 임시 다운로드 경로 생성
  - `rag_heading_rule` 기반 runtime 규칙 해석
  - `paragraph/table/both` 위치 판정 반영
  - 상세조회 시 원본 schema / runtime schema / runtime appendix schema 분리 제공
  - 파일 삭제 orchestration
- `locaville/backend/app/services/rag_embedding_service.py`
  - 임베딩 실행 orchestration
  - 원본문서 재로딩
  - runtime schema 해석 → `DocumentParser` → `ChunkBuilder` → `VectorEmbedder` 연결
  - `runtime_appendix_schema`, `body_exit_criteria`, `appendix_exit_criteria`를 parser 에 함께 전달
  - `rag_vector` delete 후 insert 저장
- `locaville/backend/app/repositories/rag_rdb.py`
  - `rag_file`, `rag_heading`, `rag_heading_rule`, `rag_vector` 조회/저장 SQL
  - 임베딩용 `rag_vector` row 구성
  - `attributes.sector`를 포함한 chunk metadata 저장
  - `chunk_loc`, `segment_count`를 `attributes` 저장 대상에서 제외
  - `chunk_loc`를 순수 block 번호 중심으로 정규화해 조회/저장
  - `rag_vector` delete 후 insert 저장 구조
- `locaville/backend/app/routers/project.py`
  - `/project/from-rag/basic`
  - `/project/{prj_id}/from-rag/activity`
  - 프로젝트/활동/작업 등록 관련 라우터
- `locaville/backend/app/services/project_from_rag_service.py`
  - 프로젝트 기본정보 추출 orchestration
  - activity table row 검색/활동 제안 구성
  - `heading_path`, `attributes`, `source_order` 기반 부가 내용 재구성
- `locaville/backend/app/services/project_draft_extraction_service.py`
  - 프로젝트 기본정보 prompt 기반 추출
- `locaville/backend/app/services/project_service.py`
  - 프로젝트/활동/작업 저장 orchestration
- `locaville/backend/app/repositories/project_rdb.py`
  - `project`, `project_activity`, `project_job`, `farm_job` 조회/저장 SQL
  - 활동/작업 등록 및 기본 선택 데이터 제공
  - `rag_vector` 50건 페이징 조회
- `locaville/backend/app/schemas/rag.py`
  - FastAPI request/response 모델
  - 임베딩 실행 응답 모델 추가
  - `rag_vector` 페이지 응답 모델 추가

### 4.3 공용 라이브러리
- `locaville/library/locaville/rag/hwpx_heading_parser.py`
  - HWPX heading / appendix pre-parse 전용 parser
  - XML block 판독, heading row 계산, body / appendix 분리
  - 공통 `extract_blocks` fallback 제공
- `locaville/library/locaville/rag/document_models.py`
  - parser / chunker 공통 모델
  - `HeadingNode`, `ParsedSegment`, `RagEmbeddingParseError`
- `locaville/library/locaville/rag/document_parser.py`
  - 파일 확장자 기준 parser wrapper
  - 공통 parser 인터페이스와 dispatch 담당
- `locaville/library/locaville/rag/hwpx_parser.py`
  - HWPX 임베딩 parser 본체
  - `HwpxParser`
  - HWPX body / appendix mode 전환, appendix 자체 heading stack, `sector` 부여
  - `appendix_title_table` runtime 매칭, appendix depth 1 title 처리
  - paragraph/table/table-cell box 텍스트 병합 및 symbol-only row 제외 규칙
- `locaville/library/locaville/rag/markdown_parser.py`
  - Markdown 전용 parser
  - 줄 단위 heading 탐지와 paragraph segment 생성
- `locaville/library/locaville/rag/docx_parser.py`
  - DOCX 전용 parser
  - paragraph / table 순회와 table row 평탄화 기반 segment 생성
- `locaville/library/locaville/rag/pdf_parser.py`
  - PDF 전용 parser
  - page / paragraph 기반 segment 생성
- `locaville/library/locaville/rag/chunk_builder.py`
  - 임베딩용 chunk builder 본체
  - `ChunkBuilder`, `RagChunk`
  - heading_path / chunk_loc / table caption / metadata 통합 규칙
  - sector 변경 시 chunk flush, appendix sector 독립 heading_path/title tracking
  - `350/750/1000` 기준 soft merge 와 short-chunk rescue 규칙
- `locaville/library/locaville/rag/vector_embedder.py`
  - 임베딩 provider wrapper
  - `VectorEmbedder`, `BaseVectorEmbedder`
  - provider 기준 실제 모델별 embedder dispatch
- `locaville/library/locaville/rag/openai_embedder.py`
  - OpenAI 전용 embedding 구현체
  - `RAG_EMBEDDING_MODEL`, `RAG_EMBEDDING_DIMENSIONS` 기반 벡터 생성
- `locaville/library/locaville/storage_client.py`
  - Supabase Storage 업로드/다운로드
  - `BUCKET_DOCUMENT` 기반 원본문서 저장/다운로드
  - Storage 파일 삭제
- `locaville/library/locaville/utilities.py`
  - `.env` 로드 유틸
  - `randomize_filename()` 공용 함수

### 4.4 DB/문서
- `locaville/docs/ddl-sql/rag_heading_ddl.sql`
  - `rag_heading_rule`, `rag_heading`, `rag_file` DDL 통합본
- `locaville/docs/ddl-sql/rag_heading_rule_insert.sql`
  - 하드코딩 규칙을 DB seed 로 이관한 insert SQL
  - appendix 시작 제목행 rule 추가
- `locaville/docs/ddl-sql/rag_heading_insert.sql`
  - `rule_id + override` 구조 기준 `rag_heading` seed SQL
  - appendix 시작 템플릿 seed 추가
- `locaville/docs/ddl-sql/rag_heading_migration_20260610.sql`
  - `rag_heading`, `rag_file` appendix 확장 이관 SQL
- `locaville/docs/architecture/RAG_개발보고서.md`
  - RAG 등록/임베딩/검색 및 프로젝트 연계 구현 현황 문서화

## 5. 구현상 어려웠던 사항 및 대처/우회 방안

### 5.1 HWPX 목차 단계 인식의 불안정성
#### 문제
- `가.`, `나.` 같은 단계가 실제 문서에는 있는데 화면에서 0건으로 보이는 현상
- fallback block 파서가 연속 heading을 유실

#### 대처
- HWPX `ParsedBlock` 기반 집계만 쓰지 않고, 원문 paragraph 라인을 직접 읽어 카운트
- 초기 파싱 미리보기도 같은 원문 기준으로 통일

### 5.2 숫자 계층 오인
#### 문제
- `2026년도`, `36.4만원/ha` 같은 값이 `1.` 계층으로 잘못 카운트됨

#### 대처
- `ko_government` 규칙에서 `1.`은 점이 필수인 구조로 해석
- 날짜형/소수점형 숫자 오인 방지 규칙 추가
- 표 내부 문단은 기본적으로 목차 탐지 대상에서 제외

### 5.3 JSON 정규식 관리의 복잡성
#### 문제
- `heading_schema.pattern`을 SQL + JSON + regex 이스케이프 형태로 관리하면서 과이스케이프/오타 발생

#### 대처
- 하드코딩 규칙을 `rag_heading_rule` 테이블 레코드로 정규화
- `rag_heading.heading_schema`는 `rule_id + rule_options override` 구조로 전환
- backend가 실행용 runtime schema 와 regex를 생성하도록 변경
- `ko_government` 스펙도 `segments`, `trailing_dot`, `leading_space_max`, `trailing_space_max` 식으로 점진 정리

### 5.11 table/box 목차 판정과 원본 위치 보존의 충돌
#### 문제
- box(1x1 table)나 단일행 table 안의 목차도 탐지하고 싶었지만, 이를 paragraph처럼 평탄화하면 결과에서 원본 양식이 훼손되거나 중복 인식처럼 보일 수 있었음

#### 대처
- 평탄화는 목차 후보 여부를 판단하기 위한 내부 절차로만 사용
- `location` 옵션을 `paragraph`, `table`, `both`로 확장
- 단일행 table/box는 평탄화 후 regex 매칭을 수행하되, 최종 결과의 `location`은 `table`로 유지
- 복수 행 table은 목차 후보에서 제외

### 5.12 템플릿 식별자 및 UI 하드코딩 의존
#### 문제
- `numeric_dot_unified` 같은 과거 식별자와 프론트 표시명 하드코딩이 남아 있으면, DB 기준 명칭 변경 시 화면과 데이터가 다시 어긋날 수 있었음

#### 대처
- 템플릿 식별자를 `numeric_dot`으로 통일
- 상세 화면의 참조 템플릿명은 DB의 `heading_name`을 직접 사용
- 프론트의 템플릿 표시 하드코딩을 제거

### 5.10 schema 저장 구조와 실행 구조를 동시에 만족시켜야 하는 문제
#### 문제
- 운영 저장 구조는 단순하고 재사용 가능해야 했고, 실행 시에는 parser가 바로 쓸 수 있는 `rule_type/pattern/rule_options` 형태가 필요했음
- 저장 시점과 실행 시점 요구가 달라 한 구조로 모두 만족시키기 어려웠음

#### 대처
- `rag_file.heading_schema`에는 `rule_id + override` 중심의 원본 구조를 저장
- 상세조회와 임베딩 실행 시점에는 backend가 `runtime_heading_schema`로 해석
- 화면은 목적에 따라 원본 schema 또는 runtime schema 를 분리 사용

### 5.4 신규 기호 단계 처리
#### 문제
- 표준 순서 외에 `○` 같은 예상외 계층을 잡아내야 했음

#### 대처
- 기존 표준 순서는 그대로 카운트
- 예상외 기호는 신규 후보 행으로 별도 표시
- 단계 재배치 자체는 사용자 검토 후 조정하도록 UI 제공

### 5.5 원본문서 다운로드 처리
#### 문제
- Storage 공개 URL 직접 연결은 제어가 약하고, 다운로드 파일명/임시파일 정리가 애매했음

#### 대처
- backend가 storage에서 임시 다운로드 후 `FileResponse`로 직접 응답
- 사용자 표시 파일명은 `file_id + 확장자`
- 응답 후 `BackgroundTasks`로 임시 파일 삭제

### 5.6 HWPX 표와 본문 경계가 섞이는 문제
#### 문제
- 표 직전 문단에 표 header나 row 내용 일부가 같이 흡수되거나, 반대로 제목 줄이 표 신호로 잘리는 문제가 반복 발생

#### 대처
- HWPX paragraph 추출 시 nested table 텍스트는 제외
- 다중 셀 표는 row 단위 event로 대표시키고, paragraph와 별도 흐름으로 분리
- 표 시작 신호 제거 로직은 제목 첫 줄이 아니라 줄바꿈 이후 본문에서만 동작하도록 보정

### 5.7 문장형 목차(`○ + 본문`)의 heading_path 표현 기준
#### 문제
- `○` 계층은 제목처럼 보이기도 하고 본문처럼 보이기도 해서, 모든 chunk에 전체 문구를 넣으면 중복이 심하고, 반대로 전부 기호만 남기면 문맥이 약해짐

#### 대처
- 제목형과 구조형을 분리
- 문장형 목차는 첫 등장 chunk에서는 `heading_path`에서 제외
- 표/하위 구조 chunk에서는 기호만 표시
- 이후 일반 문단 chunk에서는 `기호 + 본문`으로 복원

### 5.8 표 caption의 귀속 위치 판단
#### 문제
- `《 신청 시 주요 제출서류 》` 같은 caption이 표 앞 문단에 붙어 있거나, 표 뒤 설명처럼 보이는 경우가 있어 단순 앞줄 기준으로는 귀속이 불안정했음

#### 대처
- caption 탐지를 parser 단계의 별도 규칙으로 분리
- 같은 `heading_path` 범위 안에서 직전/직후 table cluster를 찾아 귀속
- table chunk에는 `table_caption`, `table_caption_position` 메타를 부여

### 5.9 검증용 메타 정보의 과다 노출
#### 문제
- 내부 런타임용 키(`_heading_nodes_runtime`, `structural_group_key`)와 사용자 검증용 정보가 한 화면에 섞여 가독성이 떨어졌음
- `chunk_loc`, `segment_count`처럼 이미 별도 컬럼/문맥에서 확인 가능한 값이 `attributes`에도 중복 노출되어 검증 집중도가 떨어졌음
- 미리보기에서 `[LF]` 표기가 반복되면 줄바꿈 자체보다 표시 기호가 더 눈에 띄는 문제가 있었음

#### 대처
- 화면에서 숨길 메타와 보여줄 메타를 구분
- table 관련 값은 `table_meta`로 묶어 노출
- 중복 키(`location/locations`, `block_type/block_types`)는 상황별로 정리
- `chunk_loc`, `segment_count`는 `attributes` 저장/표시 대상에서 제외하고, `chunk_loc`는 별도 컬럼으로만 유지
- `내용 미리보기`는 실제 줄바꿈만 유지하고 `[LF]` 보조 표시는 제거

### 5.13 Pre-Parsing 과 Embedding Parsing 의 appendix 기준 불일치
#### 문제
- pre-parse 에서는 `참고 n | 제목` 1행 2셀 표를 appendix 시작행으로 보는데, embedding parser runtime 에서는 같은 규칙이 빠져 있어 실제 임베딩 실행 시 `sector=main`으로 남는 사례가 있었음

#### 대처
- `appendix_title_table` 규칙을 pre-parse 전용으로 두지 않고 `hwpx_parser.py` runtime 매칭에도 반영
- compiled level 목록에서 regex 패턴이 없는 `appendix_title_table`도 유지
- event 의 `row_count`, `cell_count` 메타를 heading / exit criteria 판정에 함께 전달

### 5.14 body / appendix 전환 시 parser 와 chunker 경계 문제
#### 문제
- parser 에서 body / appendix mode 를 나누더라도, chunk builder 가 sector 를 경계로 취급하지 않으면 main 과 appendix segment 가 같은 chunk 로 합쳐질 수 있었음
- 이 경우 `attributes.sector`가 `main`으로 남거나 appendix 내부 목차가 main 흐름에 섞여 보일 수 있었음

#### 대처
- `ParsedSegment` 자체가 `sector`를 직접 보유하도록 변경
- chunk builder 는 parser 가 준 `segment.sector`를 우선 사용하고, sector 변경 시 무조건 flush 하도록 정리
- title seen / structural count 상태도 sector 별로 분리해 appendix 내부에서 독립적인 목차 흐름이 유지되도록 보강

### 5.15 single-row table / box 의 본문 중복과 노이즈
#### 문제
- paragraph 안의 짧은 box table, table cell 안 nested 1x1 box, `⇓` 같은 symbol-only row 가 그대로 남으면 content 와 heading_path 검증이 지저분해졌음
- table / table-row / table-single-row 에 pending heading 을 그대로 병합하면 heading_path 와 내용 미리보기에 같은 제목이 중복으로 보였음

#### 대처
- paragraph 안의 짧은 1x1 box 는 `(텍스트)` 형태로 병합
- table cell 안 nested 1x1 box 는 `[텍스트]` 형태로 병합
- row 전체가 비어 있거나 단순 기호만 있는 경우 chunk 생성 대상에서 제외
- table 계열 block 은 pending heading 을 본문 앞에 다시 붙이지 않도록 정리

### 5.16 HWPX XML 조각 분리와 화면 줄바꿈의 불일치
#### 문제
- 같은 문장이 XML 에서는 여러 `hp:t` 조각으로 나뉘어 있지만, 한글 화면에서는 한 줄로 보이는 경우가 많아 단순 조각 기준 줄바꿈 복원은 오탐이 많았음
- 반대로 실제 paragraph 경계나 explicit break 가 사라지면 표 내용이 한 줄로 붙어 가독성이 떨어졌음

#### 대처
- 줄바꿈 복원 기준을 paragraph / explicit break 중심으로 제한
- `linesegarray`는 시각 줄위치 힌트일 뿐, 자동 wrap 을 그대로 본문 개행으로 승격하지 않도록 보수화
- 검증 화면에는 `line_count`, `newline_count`를 함께 표시해 parser 결과를 직접 확인할 수 있게 정리

### 5.17 표 패턴 분류와 header/value 문장화 문제
#### 문제
- 공공문서 HWPX 표는 일반 header row, header-value pair, header-(소헤더:값) 목록이 섞여 있어 단일한 row flatten 규칙으로는 의미가 자주 왜곡되었음

#### 대처
- `TablePattern`을 `HEADER_ROW_RECORDS`, `HEADER_VALUE_PAIRS`, `HEADER_VALUE_PAIR_GROUPS`로 명시화
- `Header.xml`의 cell 배경색을 읽어 header/data cell 을 추정하고, 행 단위로 패턴을 재판정
- 헤더 cell 줄바꿈은 공백으로 접어 `예산 (백만원): 25,713` 같은 표현으로 정리

### 5.18 spacer 제거와 `-` 값 보존의 충돌
#### 문제
- 빈 행/열과 spacer column 을 제거하는 과정에서 `-` 값까지 공백처럼 취급하면, 실제 의미가 있는 표 값이 누락되는 문제가 있었음

#### 대처
- spacer/empty 제거는 행·열 구조 정리 단계에서만 수행
- `-`, `–`, `—`, `~` 는 이후 문장화 단계에서는 실제 값으로 취급하도록 분리
- 이에 따라 `재원구성 (%): 국고 : 100%, 지방비 : -, 융자 : -, 자부담 : -` 같은 결과를 유지하도록 정리

### 5.19 nested table 재파싱과 caption 중복 문제
#### 문제
- cell 안 nested table 을 top-level table 로 다시 파싱하면 같은 내용이 별도 row chunk 로 중복 생성되었고, 표 내부 caption 성격의 첫 행이 본문과 중복되는 문제도 있었음

#### 대처
- nested table 은 top-level event 재파싱 대상에서 제외
- 다중행 nested table 만 markdown table 로 변환하고, 단일행/단일셀 nested table 은 plain text 로 유지
- caption 역할의 첫 행은 body와 중복되면 한 번만 남기도록 정리

### 5.20 하위 목차 완결성을 보장하는 청킹 경계
#### 문제
- 청크 길이 제한만 먼저 적용하면 같은 depth 3/4 하위 묶음이 여러 chunk로 갈라져 문맥이 끊기고, 반대로 같은 depth 2 아래라는 이유만으로 합치면 서로 다른 하위 항목이 한 chunk에 섞이는 문제가 있었음

#### 대처
- `main`은 depth 2를 기본 경계로 두되, depth 3/4는 같은 depth 3 부모 아래에서만 병합해 bottom-up 완결성을 보장
- `appendix`는 depth 1을 기본 경계로 두고, 같은 depth 2 부모 아래에서만 병합해 부록 항목별 완결성을 보장
- 완결 묶음이 커지는 경우에는 후단에서 문장 단위 overlap 분할로 나누도록 parser/chunker 책임을 분리

## 6. 시도를 했지만 제대로 동작하지 않았던 사항

### 6.1 등록 시 `rag_vector`까지 즉시 적재
- 처음에는 `RAG 파일 등록`과 동시에 청킹, 임베딩, `rag_vector` INSERT까지 한 번에 수행하도록 구성했음
- 그러나 임시 청킹/임베딩 결과가 만족스럽지 않았고, 애초에 사전 확정한 목차 구조를 기준으로 다시 파싱한 뒤 벡터를 생성하는 방향이 더 적절하다고 판단함
- 이에 따라 현재는 파일 등록과 임베딩 절차를 분리하고, 등록 시점에는 `rag_file` 메타정보와 원본문서 저장까지만 수행하도록 정리함

### 6.2 `heading_schema` 원문 JSON 직접 편집
- 처음에는 JSON textarea 형태로 노출
- 운영자가 직관적으로 검토하기 어려워 표 기반 UI로 변경

### 6.3 출현 대상 일부를 행 안에서 미리 노출
- 일부 샘플을 각 행에 1~2줄씩 표시했으나 행 높이가 지나치게 커짐
- 현재는 행 내부 미리보기 제거, 클릭 팝업 방식으로 변경

### 6.4 신규 단계 중첩 해석
- `○ ①...` 같은 줄에서 `①`를 별도 하위 단계로 계속 카운트할지 여러 차례 조정
- 현재는 줄 시작 기준 탐지를 우선하고, 문서별 해석은 이후 별도 임베딩 단계에서 재검토 가능하도록 남김

### 6.5 다운로드 파일명 정책
- 원래는 원래 파일명 유지, 랜덤명 저장, public URL 방식 등 여러 안을 검토
- 최종적으로는 원본문서 다운로드 시 `file_id + 확장자`로 정리
- 비슷한 맥락으로 `chunk_loc` 표시도 초기에 `s0:35`, `11:heading:1`, `2~3~4~5~6~7~8`처럼 내부 경로와 marker 를 더 많이 노출해 보았음
- 그러나 운영 검증 관점에서는 내부 section prefix 나 heading marker 보다 순수 block 번호가 더 직관적이어서,
  현재는 `35`, `11`, `2~8`처럼 단순화된 표기만 남기도록 정리함

### 6.6 표 caption 후처리를 chunker 한 곳에서만 해결
- 처음에는 chunker 단계에서만 직전 paragraph를 잘라 caption을 다음 table에 붙이는 방식으로 처리했음
- 그러나 caption이 표 앞/뒤 어디에 놓였는지, 표 cluster가 어디서 시작하는지 안정적으로 판단하기 어려웠음
- 현재는 parser 단계에서 caption 판별과 귀속을 먼저 수행하고, chunker는 이를 소비하는 쪽으로 정리함

### 6.7 문장형 목차를 항상 `heading_path`에 전체 노출
- `○ 신청 자격을 갖춘 ...` 같은 문장형 목차를 항상 `heading_path`에 전체 문구로 노출해 보았음
- 하지만 첫 chunk의 content와 중복되고, 표 chunk까지 같은 긴 문구가 반복되어 오히려 검증성이 떨어졌음
- 현재는 첫 chunk 제외 / 표·하위 구조는 기호만 / 이후 일반 문단은 전체 문구 표시 방식으로 정리함

### 6.8 `rag_vector` 적재를 즉시 운영 저장
- 임베딩 결과를 바로 DB에 넣는 흐름까지 연결했으나, 청킹 규칙이 계속 조정되는 기간에는 운영 데이터가 자주 바뀌어 검증이 어려웠음
- 현재는 언제든 `delete 후 insert` 방식으로 재실행할 수 있도록 저장 구조는 마련하되, 실제 적재는 preview-only로 잠시 보류함
- 이후 운영 검증 흐름이 정리되면서, 현재는 상세 실행 시 `rag_vector`를 실제로 재적재하고 결과를 검증하는 방향으로 정리함

### 6.9 appendix 를 chunker 후처리만으로 분리
- 처음에는 appendix 표시 문제를 chunk builder 후처리만으로 보정하려 했음
- 하지만 parser 단계에서 `appendix_title_table`, depth 1 title, sector, main 복귀 기준이 먼저 확정되지 않으면 downstream 에서 안정적으로 복원하기 어려웠음
- 현재는 `hwpx_parser.py`가 body / appendix 전환과 sector 를 먼저 확정하고, chunk builder 는 이를 소비하는 구조로 정리함

## 7. RAG 관련 테이블 설명

### 7.1 `rag_heading`
- 목차 템플릿 마스터 테이블
- 문서군별 표준 목차 구조를 저장
- `body_yn`으로 body / appendix 템플릿을 구분
- `heading_schema`는 각 level의 `depth`, `notation`, `rule_id`, 문서별 `rule_options override`를 담음
- 예: 공공기관/정부 표준 목차, 법령형 목차, 로마자 확장 목차, appendix 시작 템플릿

### 7.2 `rag_heading_rule`
- 목차 추출 규칙 마스터 테이블
- 과거 하드코딩되어 있던 `numeric_dot`, `korean_letter_dot`, `roman`, `legal_article`, `appendix_title_table` 등의 판정 규칙을 DB 레코드로 정규화
- `rule_type`, `notation`, `pattern_text`, `rule_options`를 통해 공통 규칙을 재사용
- 위치 정보는 이 테이블에 두지 않고, 각 template/document의 `heading_schema.level.location`에서 관리
- `rag_heading` 또는 향후 사용자 정의 schema 가 `rule_id`로 참조

### 7.3 `rag_file`
- 등록된 RAG 원본문서의 메타정보 테이블
- 원본문서 식별값, 문서명, 문서구분, 담당기관/담당자, Storage 경로, 템플릿 참조, `embedding_yn` 등을 저장
- `heading_schema`에는 해당 문서의 body 목차 규칙 구조를 저장
- `ref_appendix_id`, `appendix_schema`에는 appendix 템플릿 참조와 문서별 appendix 목차 규칙 구조를 저장
- 운영상 RAG 등록/재등록의 기준점이 되는 테이블

### 7.4 `rag_vector`
- 실제 검색/질의응답에 사용될 chunk 벡터 저장 테이블
- `chunk_id`, `heading_path`, `chunk_loc`, `content`, `embedding`, `attributes`를 저장
- `attributes`에는 `sector(main/appendix)`, table 메타, caption, location, block_type 등이 함께 들어감
- 한 문서의 임베딩을 재실행할 때는 `file_id` 기준으로 기존 값을 삭제한 뒤 다시 적재
- 상세 화면의 벡터 파싱정보 표도 이 테이블 기준으로 확인

## 8. 향후 과제

### 8.1 임베딩 서비스 분리
- `rag_vector` 적재를 별도 서비스/화면/배치로 분리
- 현재 parsing / chunking / embedding은 분리된 서비스 파일로 구성했으므로, 향후에는 실행 이력/배치/재시도 정책을 더 분리할 필요가 있음

### 8.2 Pre-Parsing 사용자 커스텀 기능
- Pre-Parsing 단계에서 참조 목차구조를 사용자가 추가/수정할 수 있는 기능 필요
- 예:
  - 로마자 계층
  - 특수 기호 계층
  - 문서별 예외 표기
- 현재는 표준 템플릿 + 신규 기호 탐지 중심이므로, 추후에는 운영자가 문서 특성에 맞게 규칙을 직접 보강할 수 있어야 함

### 8.3 특이한 상황에서의 목차 추출 고도화
- 현재는 `location = paragraph` 중심으로 안정화했으나, 실제 문서에는 표/박스/라벨/caption 안에 목차성 정보가 들어갈 수 있음
- 특히 사용자가 인지하지 못한 숨은 목차 후보를 AI 또는 후처리 규칙으로 탐지하는 방안 검토 필요
- 예:
  - 표의 `(1,1)` 셀에만 들어가는 상위 라벨
  - caption 성격의 짧은 제목 줄
  - 박스 안의 정책 요약 제목

### 8.4 heading_path 정밀화
- 현재 구현으로 제목형 목차와 문장형/구조형 목차를 분리하여 `heading_path` 표시 규칙을 상세화했음
  - 제목형(`1.`, `가.`)은 기본 경로
  - 문장형(`○ + 본문`)은 첫 chunk 제외 / 표·하위 구조는 기호만 / 이후 일반 문단은 전체 문구
  - 하위 구조(`①` 등)가 생기면 상위 `○`는 기호만 유지
  - 표 caption은 `📋` 구분자로 연결
  - appendix sector 는 main 과 독립적인 title / structural 추적 상태를 유지
- 남은 과제
  - 더 다양한 문서 레이아웃에 대해 문장형 목차 판정 일반화
  - appendix depth 1 / appendix_title_table / main 복귀 규칙의 문서군별 테스트셋화
  - 표/박스/caption과 일반 문단 사이의 `heading_path` 상속 규칙 테스트셋화
  - 검색 단계에서 `heading_path`를 metadata filter와 함께 적극 활용

### 8.5 chunk_loc의 실질적 활용 방안
- 남은 과제
  - 물리 페이지 또는 화면상 위치와 연결되는 provenance 체계 보강
  - `heading_path` 기반 상대 위치 표현과 병행
  - `source_order`, `page_start`, `page_end` 같은 메타 구조 재검토

### 8.6 표/박스/caption 정보 정밀화
- 현재는 다중 셀 표를 row 중심 chunk로 분해하고, `table_caption`을 별도 메타로 유지하는 수준까지 구현됨
- 남은 과제
  - caption 없는 표의 귀속 규칙 일반화
  - 2컬럼 배너 표 / 1셀 긴 표 / 가짜 표 분류 고도화
  - multi-page table 병합 가능성 검토
  - 검색 단계에서 `table_meta` 활용 방안 정교화

### 8.7 Pre-Parsing 규칙 고도화
- 들여쓰기, 정렬, 폰트 크기, bold 여부 같은 레이아웃 메타를 반영한 판정
- HWPX 표/박스/라벨 블록의 세분화
- 날짜형 문구(`2026. 1.`), 숫자 오인, pseudo-table 같은 오탐 패턴을 별도 규칙으로 관리
- 실제 문서별 실패 사례를 축적해 규칙 테스트셋으로 운영할 필요가 있음

### 8.8 청킹 전략 분리 및 표 전용 청킹
- 남은 과제
  - sector(main/appendix)를 retrieval metadata 에서 어떻게 적극 활용할지 검토
  - 표 row를 다시 key-value semantic chunk로 세분화할지 검토
  - 긴 표의 row 병합 기준, 최대 글자수, 헤더 반복 기준 보강
  - main depth 2 / appendix depth 1 기준의 하위 완결 청킹이 실제 retrieval 품질에 주는 영향 측정
  - `caption + table + row`가 함께 검색되도록 retrieval 메타 설계

### 8.8.1 상위 단계 short-chunk 병합 규칙 제안
- 문제의식
  - 하위 완결성을 우선 보장하는 현재 규칙은 문맥 보존에는 유리하지만, 반대로 depth 1~2 상위 단계 chunk 가 너무 짧게 분리되는 경우가 생길 수 있음
  - 이 경우 검색 시 제목성 chunk 만 먼저 매칭되고 실제 근거 본문 chunk 가 함께 회수되지 않아 정확도와 효율성이 모두 떨어질 수 있음
- 후속 검토 항목
  - `350/750/1000` 임계값이 문서군별로 적절한지 실문서 기준 회귀 점검
  - short-chunk 병합 전/후 retrieval top-k 품질 비교
  - heading_path 유지 방식과 content prefix 병합 방식 중 어느 쪽이 더 안정적인지 비교
  - 표/문단 혼합 구간에서 상위 short-chunk 를 표 row 앞에 붙일지 별도 유지할지 검토

### 8.9 검색 품질 고도화
- 현재 등록 단계와 별도로, 추후 검색 단계에서는 다음 보강이 필요함
  - metadata filter 적극 활용
  - Dense + keyword 기반 hybrid retrieval 검토
  - MMR, reranking 같은 후처리 전략 검토
  - 질문 유형별 retriever 또는 prompt 분기
- 특히 표 질의는 일반 서술형 질의와 다른 retrieval 전략이 필요할 가능성이 큼

### 8.10 파싱/청킹/벡터저장 단계 분리
- 향후에는 각 단계별 로그, 테스트, 재실행 기능을 더 독립적으로 운영할 필요가 있음

### 8.11 목록/상세 UX 보강
- 상세 화면에서 등록 이력, 스키마 변경 이력, 원본문서 메타 표시 강화
- 임베딩 실행 이력, chunk 수 변화, 검증/확정 전환 UI 추가 검토
- preview-only 테스트 결과와 실제 저장 결과의 비교 UX, raw block 수 / parsed segment 수 / final chunk 수를 함께 보여주는 UX 도 추가 검토

### 8.12 문서 메타 추출 정교화
- 문서명, 문서구분, 문서번호, 담당기관/담당자에 대해 2차 검토 로직 추가
- 필요 시 전체 문서 파싱 후 LLM 보조 검토 분리
