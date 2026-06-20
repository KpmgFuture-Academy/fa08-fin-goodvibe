# RAG 구축서비스 아키텍처

## 1. 문서 목적

이 문서는 Locaville의 RAG 구축 서비스가 현재 어떤 구조로 동작하는지, 그리고 원본문서를 어떻게 `rag_file`, `rag_vector` 자산으로 구축하는지 정리한다.

정리 범위는 다음 두 축이다.

- RAG 파일 등록 및 메타 관리 흐름
- 문서 파싱, 청킹, 임베딩, 검증, 재적재 흐름

이 문서는 현재 구현된 구축 구조와 운영 시 유의사항을 함께 설명한다.

---

## 2. 한 줄 요약

현재 Locaville의 RAG 구축은 `rag_file_service.py`가 등록/조회 orchestration을 담당하고, `rag_embedding_service.py`가 `DocumentParser -> ChunkBuilder -> VectorEmbedder` 흐름으로 문서를 `rag_vector`에 적재하는 구조다.

문서별 목차 인식은 `rag_heading_rule`, `rag_heading`, `rag_file.heading_schema/appendix_schema`를 기반으로 runtime 규칙을 구성해 처리하며, 구축 결과는 상세 검증 화면에서 `heading_path`, `chunk_loc`, `attributes`, `content preview` 기준으로 확인한다.

---

## 3. 관련 핵심 파일

### 3.1 구축 API / 서비스

- [rag.py](./locaville/backend/app/routers/rag.py)
  - RAG 관리 API 라우터
  - 목록, 상세, pre-parse, 등록, 원본문서 다운로드, 임베딩 실행/테스트, 삭제
- [rag_file_service.py](./locaville/backend/app/services/rag_file_service.py)
  - RAG 파일 등록/상세조회/삭제 orchestration
  - heading runtime schema 해석
- [rag_embedding_service.py](./locaville/backend/app/services/rag_embedding_service.py)
  - 문서 재로딩
  - parser / chunker / embedder 호출
  - `rag_vector` 적재 및 `embedding_yn` 갱신

### 3.2 구축 데이터 저장소

- [rag_rdb.py](./locaville/backend/app/repositories/rag_rdb.py)
  - `rag_file`, `rag_heading`, `rag_heading_rule`, `rag_vector` 조회/저장 SQL
- [dbcom.py](./locaville/library/locaville/dbcom.py)
  - 공통 DB execute/fetch/transaction

### 3.3 파싱 / 청킹 / 임베딩 공용 라이브러리

- [document_parser.py](./locaville/library/locaville/rag/document_parser.py)
  - 파일 포맷별 parser dispatch
- [document_models.py](./locaville/library/locaville/rag/document_models.py)
  - `ParsedSegment`, `HeadingNode`, `RagEmbeddingParseError`
- [hwpx_heading_parser.py](./locaville/library/locaville/rag/hwpx_heading_parser.py)
  - HWPX pre-parse용 heading 후보 추출
- [hwpx_parser.py](./locaville/library/locaville/rag/hwpx_parser.py)
  - HWPX runtime parsing 본체
- [chunk_builder.py](./locaville/library/locaville/rag/chunk_builder.py)
  - soft merge / rescue merge 기반 chunk 생성
- [vector_embedder.py](./locaville/library/locaville/rag/vector_embedder.py)
  - embedding provider wrapper
- [openai_embedder.py](./locaville/library/locaville/rag/openai_embedder.py)
  - OpenAI embedding 구현체

### 3.4 프론트 연계

- [rag/page.tsx](./locaville/web_admin/app/rag/page.tsx)
  - RAG 목록 화면
- [rag/new/page.tsx](./locaville/web_admin/app/rag/new/page.tsx)
  - RAG 파일 등록 화면
- [rag/[file_id]/page.tsx](./locaville/web_admin/app/rag/[file_id]/page.tsx)
  - RAG 파일 상세 및 검증 화면
- [rag-api.ts](./locaville/web_admin/lib/rag-api.ts)
  - 구축 관련 frontend API wrapper
- [rag-types.ts](./locaville/web_admin/lib/rag-types.ts)
  - 화면/응답 타입 정의

---

## 4. 전체 RAG 구축 서비스 아키텍처

### 4.1 목적

RAG 구축 서비스의 목적은 정책 문서, 공고문, 시행지침, HWPX/DOCX/PDF/Markdown 파일을 검색 가능한 구조화 자산으로 바꾸는 것이다.

구축 결과물은 다음 두 저장 축으로 정리된다.

- `rag_file`: 원본문서 메타와 schema 정보
- `rag_vector`: 검색용 chunk 본문과 embedding

---

### 4.2 구축 공통 흐름

현재 구축 공통 흐름은 다음과 같다.

1. 관리자가 문서를 업로드
2. `Pre-Parsing`으로 목차 구조 후보와 메타를 확인
3. `rag_file` 등록
4. 필요 시 상세 화면에서 `벡터 임베딩 실행`
5. parser / chunker / embedder가 실행
6. `rag_vector`를 `delete 후 insert` 방식으로 재적재
7. 상세 검증 화면에서 결과 확인

---

### 4.3 구축 서비스의 계층 분리

현재 구현은 다음처럼 계층을 분리한다.

- `rag_file_service.py`
  - 등록/상세/삭제 orchestration
- `rag_embedding_service.py`
  - 임베딩 구축 orchestration
- `DocumentParser`
  - 파일 포맷별 원문 파싱
- `ChunkBuilder`
  - 검색 가능한 단위로 청킹
- `VectorEmbedder`
  - embedding 생성
- `rag_rdb.py`
  - DB 저장/조회

즉, “문서 이해”와 “DB 반영”, “운영 UI”를 한 파일에 몰지 않고 단계별 책임을 분리하는 구조다.

---

## 5. RAG 구축 데이터 아키텍처

### 5.1 `rag_file`

역할:

- 원본문서 메타 저장
- 파일 식별자, 문서명, 문서구분, 담당기관/담당자, 공개일자, schema 정보 관리

주요 필드:

- `file_id`
- `file_name`
- `doc_name`
- `doc_cat`
- `doc_version`
- `publication_date`
- `doc_number`
- `doc_manager`
- `embedding_yn`
- `ref_heading_id`
- `ref_appendix_id`
- `heading_schema`
- `appendix_schema`
- `body_exit_criteria`
- `appendix_exit_criteria`

---

### 5.2 `rag_heading_rule`

역할:

- 목차 탐지 규칙 원형 저장
- 과거 하드코딩 규칙을 DB 레코드로 정규화

주요 속성:

- `rule_id`
- `rule_name`
- `rule_type`
- `notation`
- `notation_display`
- `pattern_text`
- `rule_options`

---

### 5.3 `rag_heading`

역할:

- 실제 템플릿 단위 목차 구조 저장
- `rule_id + override` 구조로 schema 구성
- body / appendix 템플릿 구분

주요 속성:

- `heading_id`
- `heading_name`
- `heading_summary`
- `heading_schema`
- `body_yn`

---

### 5.4 `rag_vector`

역할:

- 검색용 chunk 저장
- chunk 본문, `heading_path`, `chunk_loc`, `attributes`, embedding 관리

주요 필드:

- `file_id`
- `chunk_id`
- `heading_path`
- `chunk_loc`
- `content`
- `embedding`
- `attributes`

현재 `attributes`에는 검증/검색에 필요한 핵심 메타만 저장하고, `chunk_loc`, `segment_count` 같은 값은 제외한다.

---

## 6. 구축 범위와 제외 범위

### 6.1 현재 구축 범위

- 파일 업로드 및 등록
- heading template / appendix template 선택
- Pre-Parsing
- 문서 메타 제안
- body / appendix schema 검토
- 벡터 임베딩 실행/재실행
- 상세 검증 UI
- 삭제 및 원본문서 다운로드

### 6.2 현재 범위에서 제외

- 자동 품질 판정 후 운영 반영
- 문서별 자유 형식 schema 편집기
- embedding 버전 이력 관리
- 운영용 reranking / hybrid retrieval 고도화

---

## 7. RAG 파일 등록 흐름

### 7.1 사용자 기준 흐름

1. `/rag` 목록 화면 진입
2. `RAG 파일 등록` 버튼 클릭
3. 원본문서 업로드
4. `Main Heading Template`, 필요 시 `Appendix Template` 선택
5. `Pre-Parsing` 실행
6. 메타정보와 목차 구조 후보 검토
7. `RAG 파일 등록`
8. 목록 화면으로 복귀

---

### 7.2 Pre-Parsing 목적

Pre-Parsing은 임베딩 구축 전, 문서 구조를 빠르게 훑어 다음을 제안하는 단계다.

- 파일명 / 파일형식
- 문서명 / 문서구분
- 파일ID / 문서버전
- 공개일자 / 문서번호 / 담당기관/담당자
- body / appendix 목차 구조 후보
- 초기 파싱 미리보기

현재 HWPX는 가능한 경우 원문 raw line 기반의 경량 경로를 우선 사용하고, 상세 block parsing은 fallback으로만 사용한다.

---

### 7.3 등록 시 저장 동작

`POST /rag/register` 시 backend는 다음을 수행한다.

1. 원본 파일을 Storage `document/rag/` 경로에 업로드
2. `rag_file` 레코드 저장
3. `heading_schema`, `appendix_schema`를 `rule_id + override` 구조로 저장
4. `embedding_yn = 'N'` 상태로 기록

즉, 등록과 임베딩 적재를 분리하여 운영자가 구조를 먼저 검토할 수 있도록 설계되어 있다.

---

## 8. 파싱 아키텍처

### 8.1 공통 parser dispatch

`DocumentParser`는 확장자 기준으로 실제 parser를 선택한다.

- `.hwpx` -> `HwpxParser`
- `.docx` -> `DocxDocumentParser`
- `.pdf` -> `PdfDocumentParser`
- `.md` -> `MarkdownDocumentParser`

모든 parser는 공통적으로 `ParsedSegment` 목록을 반환한다.

공통 입력:

- `heading_schema`
- `appendix_schema`
- `body_exit_criteria`
- `appendix_exit_criteria`

공통 출력 핵심:

- `source_order`
- `location`
- `block_type`
- `heading_path`
- `chunk_loc`
- `metadata`
- `heading_nodes`
- `sector`

---

### 8.2 HWPX parser 핵심 규칙

HWPX는 현재 가장 많은 규칙이 구현된 포맷이다.

핵심 처리:

1. `section*.xml`에서 top-level paragraph / table event 추출
2. `source_order` 증가로 문서 순서 보존
3. paragraph와 table을 구분해 별도 event 구성
4. body / appendix mode 판정
5. runtime heading schema로 heading 여부 판정
6. pending heading, caption, table metadata 후처리
7. `ParsedSegment` 생성

현재 보강된 세부 규칙:

- appendix 진입/복귀
- single-row table / box 처리
- nested table flatten
- 상태값 box 평문화
- explicit break 중심 줄바꿈 복원
- `sector=main/appendix` 분리

---

### 8.3 table 구조 해석

표는 단순 문자열 묶음이 아니라 row/cell 메타를 함께 해석한다.

현재 구분하는 패턴:

- `HEADER_ROW_RECORDS`
- `HEADER_VALUE_PAIRS`
- `HEADER_VALUE_PAIR_GROUPS`

활용 메타:

- `row_count`
- `cell_count`
- `header_row`
- `table_pattern`
- `table_caption`
- `table_caption_position`
- `table_row_role`

이 구조는 이후 검색 단계에서 표 기반 질의, 활동/단가 표 해석에도 재사용된다.

---

## 9. 청킹 아키텍처

### 9.1 목적

청킹의 목적은 parser가 만든 `ParsedSegment`를 검색 가능한 길이와 문맥 단위로 재구성하는 것이다.

현재 목표:

- 상위 제목과 하위 본문 맥락 보존
- 표/문단/부록 경계 보존
- 지나치게 짧은 제목성 chunk 감소
- 검색 가능한 길이 유지

---

### 9.2 hard boundary

다음 경우는 hard boundary로 본다.

- `sector` 변경
- cover/title 독립 구간
- 상위 title 전환
- text family / table family 전환
- 서로 다른 table cluster 전환

---

### 9.3 soft merge

hard boundary가 아닌 경우 다음 요소를 점수화해 병합 여부를 결정한다.

- 같은 `heading_path`
- 같은 structural key
- 같은 title prefix
- 같은 block family
- depth 인접성
- 같은 table cluster

기준값:

- `min_chars = 350`
- `target_chars = 750`
- `max_chars = 1000`

현재 chunk가 너무 짧으면 rescue merge를 허용해 상위 short chunk 문제를 줄인다.

---

### 9.4 heading_path / chunk_loc / attributes 구성

chunk flush 시 다음 대표 메타를 만든다.

- `heading_path`
- `chunk_loc`
- `attributes`

현재 규칙:

- `heading_path`는 제목형 목차와 구조형 목차를 구분해 조립
- 표 caption은 `📋 {caption}` 형식으로 부착 가능
- `chunk_loc`는 순수 block 번호 중심으로 정규화
- `attributes`는 검증용 핵심 메타만 저장

---

## 10. 임베딩 아키텍처

### 10.1 embedding 실행 흐름

`POST /rag/{file_id}/embedding` 시 `rag_embedding_service.py`는 다음을 수행한다.

1. 원본문서 재로딩
2. runtime schema 해석
3. `DocumentParser` 호출
4. `ChunkBuilder` 호출
5. `VectorEmbedder` 호출
6. `rag_vector` `delete 후 insert`
7. `rag_file.embedding_yn` 갱신

---

### 10.2 VectorEmbedder 계층

현재 embedder 계층은 provider wrapper 구조다.

- `VectorEmbedder`
  - provider dispatch
- `OpenAIEmbedder`
  - 실제 embedding 생성

즉, 향후 provider 확장을 고려한 구조를 먼저 마련한 상태다.

---

## 11. 검증 및 운영 UI 아키텍처

### 11.1 목록 화면

목록 화면에서는 다음을 확인한다.

- 문서명
- 문서구분
- 문서담당자/기관
- 벡터등록여부

행 클릭 시 상세로 이동하고, 원본문서 다운로드를 지원한다.

---

### 11.2 상세 화면

상세 화면에서는 다음을 수행한다.

- 메타정보 조회
- 원본문서 다운로드
- RAG 파일 재등록
- RAG 파일 삭제
- 벡터 임베딩 실행 / 재실행
- 벡터 임베딩 테스트
- `rag_vector` 페이징 검증

---

### 11.3 임베딩 검증 표

검증 표는 현재 50건 단위 페이징으로 구성된다.

핵심 확인 항목:

- `chunk_id`
- `heading_path`
- `chunk_loc`
- `attributes`
- `내용 미리보기`

가독성 보강 사항:

- `[LF]` 표시 제거, 실제 줄바꿈만 유지
- `attributes`에서 과한 내부 메타 제거
- `sector`를 앞쪽에 표시
- `chunk_loc`는 압축된 block 범위로 표시

---

## 12. 검색 서비스와의 연결

RAG 구축 서비스의 결과물은 검색 서비스가 그대로 사용한다.

연결 지점은 다음과 같다.

- `rag_file`
  - 파일 메타, 문서명, 담당기관, schema 정보 제공
- `rag_vector`
  - `heading_path`, `content`, `attributes`, embedding 제공

특히 최근 프로젝트 `from-rag` 흐름에서는 구축 단계에서 정리한 메타가 직접 재사용된다.

예시:

- `heading_path`
- `chunk_loc`
- `attributes.header_row`
- `attributes.table_caption`
- `attributes.table_row_role`
- `attributes.source_order_start`
- `attributes.source_order_end`

즉, 구축 품질은 검색 품질과 프로젝트 정보 추출 품질에 직접 연결된다.

---

## 13. 프로젝트 등록/활동/작업 흐름과의 연결

구축 결과는 단순 chat 검색뿐 아니라 프로젝트 등록/수정에도 재사용된다.

### 13.1 기본정보 추출

- `rag_file` 메타 + `rag_vector` 본문을 사용
- 프로젝트명, 발주기관, 공고일자, 시행연도 추출

### 13.2 활동 제안

- `활동`, `활동명`, `단가`, `지원` 계열 표를 우선 검색
- `활동명:` 라벨과 `header_row`를 기준으로 activity 후보 구성
- 같은 `heading_path` 섹션 문단을 부가 내용으로 재정렬

### 13.3 작업 등록 추천

- 등록된 활동명과 `farm_job.job_name` 비교
- 정확 일치 -> 부분 일치 순으로 기본 작업 추천

### 13.4 활동규칙 및 작업 초안 연계

- 활동 제안 단계에서는 `rag_vector`에서 추출한 `주요 내용 + 같은 heading_path의 관련 문장`을 합쳐 `활동설명(description)` 후보를 만든다.
- 활동 저장 후에는 `prj_activity.description`, `prj_activity.activity_rule`가 작업등록의 기준 자산으로 재사용된다.
- `activity_rule` 생성은 별도 `activity_rule` prompt 경로에서 수행하며, 입력은 `활동명`, `활동설명`, `farm_job` 목록으로 제한한다.
- `farm_job` 목록은 prompt에 주입되지만, 현재 이 경로는 LangChain retriever 체인이 아니라 backend가 직접 prompt text를 렌더링하는 구조다.
- `activity_rule` 정규화는 backend 후처리가 담당한다.
  - `기준작업`은 가능한 한 `farm_job.job_name`으로 맞춘다.
  - `farm_job`에 없는 외부 기준작업은 `완전 물떼기(미등록)`처럼 표시한다.
  - `(증빙방법)` 줄이 있으면 `증빙조건.근거`와 `증빙조건.증빙방법`의 핵심 근거로 우선 사용한다.
  - `증빙방법` 또는 `근거`가 있으면 `증빙회수` 기본값은 `1`로 정규화한다.
- 작업관리 팝업은 더 이상 RAG vector를 즉석 재검색하지 않고, backend `job-setup` 응답을 사용한다.
  - `repeat_count`
  - 기본 대상 `farm_job`
  - 작업별 `exec_point_cd`
  - `ref_job_cd`
  - `start_date_rule`
  - `end_date_rule`
- 프론트는 위 초안을 그대로 표시·수정하고, 화면 내 반복횟수 판단이나 규칙 JSON 해석 책임은 최소화한다.

즉, 구축 단계에서 표/목차/메타를 얼마나 잘 보존하느냐가 이후 프로젝트 업무 자동화 품질을 좌우한다.

---

## 14. 향후 개선사항

### 14.1 구축 품질 측면

- 문서군별 parser 회귀 테스트셋 강화
- appendix 전환 규칙 일반화
- table pattern 분류 정확도 개선
- caption 귀속 규칙 고도화
- chunk threshold(`350/750/1000`) 재평가

### 14.2 운영 측면

- embedding 이력/버전 관리
- preview 결과와 저장 결과 비교 UX 강화
- schema 변경 이력 표시
- 문서별 품질 점검 체크리스트 추가

### 14.3 검색 연계 측면

- metadata filter 적극 활용
- 표 질의 전용 retrieval 전략 검토
- hybrid retrieval / reranking 고도화
- 구축 메타 기반 프로젝트 activity / job 속성 추출 정교화

---

## 15. 결론

현재 Locaville의 RAG 구축 서비스는 등록, 파싱, 청킹, 임베딩, 검증을 분리한 구조로 정리되어 있으며, `rag_file`과 `rag_vector`를 중심으로 검색 가능한 자산을 안정적으로 생성하는 방향으로 고도화되어 왔다.

핵심 구조는 다음과 같다.

- 등록/조회 orchestration: `rag_file_service.py`
- 임베딩 구축 orchestration: `rag_embedding_service.py`
- 포맷별 파싱: `DocumentParser`와 각 parser 구현체
- 청킹: `ChunkBuilder`
- 임베딩: `VectorEmbedder`
- 저장/조회: `rag_rdb.py`

이 구조를 기반으로 현재는 chat/policy 검색뿐 아니라 프로젝트 기본정보 추출, 활동 제안, 작업 등록 기본 추천까지 연결되고 있다. 즉, RAG 구축 서비스는 단순 데이터 적재 기능이 아니라 이후 검색과 업무 자동화의 기반 자산을 만드는 핵심 인프라로 동작한다.
