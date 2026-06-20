# RAG 검색서비스 아키텍처

## 1. 문서 목적

이 문서는 Locaville의 RAG 검색 서비스가 현재 어떤 구조로 동작하는지, 그리고 프로젝트 등록/수정 관점에서 이미 구성된 RAG Vector를 어떻게 활용하여 프로젝트 관련 정보를 추출하는지 정리한다.

정리 범위는 다음 두 축이다.

- 전체 RAG 검색 흐름
- 이미 구성된 RAG Vector를 기반으로 프로젝트 기본정보/활동정보를 추출하고, 작업 등록까지 연결하는 흐름

이 문서는 현재 구현된 검색 구조와, `from-rag` 확장 흐름의 권장 구조를 함께 설명한다.

### 1.1.10. 2026.06.18 작업

1. 프로젝트 `from-rag` 흐름의 저장 경계를 `rag_vector 기반 제안`과 `저장된 activity 재사용`으로 분리했다.
   - 활동 제안 단계까지는 기존처럼 `rag_file` + `rag_vector`를 사용한다.
   - 활동이 저장된 이후의 작업 등록 단계에서는 실시간 RAG 재검색 대신 `prj_activity.description`, `prj_activity.activity_rule`를 1차 근거로 사용하도록 정리했다.
2. activity 제안 DTO 범위를 description/rule까지 확장했다.
   - backend `project_from_rag_service.py`는 activity 제안 시 `activity_name`, `main_content`, `unit_price` 외에 `description_suggestion`, `activity_rule_suggestion`도 함께 조립하도록 확장했다.
   - `description_suggestion`은 activity 표의 `주요 내용`과 같은 `heading_path` 섹션의 관련 부가 문장만 합쳐 생성하고, 메타 라인 및 중복 본문은 제거한다.
   - `activity_rule_suggestion`은 별도 prompt를 통해 `시작일`, `종료일`, `증빙조건` JSON 형태로 생성한다.
3. 활동 등록 이후 작업관리 단계의 책임을 backend `job-setup`으로 이동했다.
   - `GET /project/{prj_id}/activities/{activity_id}/job-setup` 응답이 기존 `jobs`, `job_options`, `exec_point_options`뿐 아니라 `repeat_count`, `repeat_job_cd`, `repeat_job_name`, `repeat_job_drafts`를 함께 반환하도록 정리했다.
   - `repeat_job_drafts`에는 작업별 `exec_point_cd`, `ref_job_cd`, `start_date_rule`, `end_date_rule`, 날짜 초안이 포함된다.
4. 반복작업 초안 생성 규칙은 `activity_rule` 기반으로 단순화했다.
   - 반복횟수는 `activity_rule.증빙조건.증빙회수`가 있으면 그 값을 사용하고, 없으면 `1`로 고정한다.
   - 시작/종료 기준작업은 `activity_rule.시작일.기준작업`, `activity_rule.종료일.기준작업`을 `farm_job`과 매칭해 사용한다.
   - 작업 순번별 시작일/종료일 규칙 JSON은 backend가 생성하고, frontend는 표시/수정만 담당한다.
5. 이에 따라 작업관리 화면은 더 가벼운 구조로 재정리했다.
   - frontend는 더 이상 `activity_rule`을 직접 해석해 반복횟수, 선후행작업, 규칙 JSON을 조립하지 않는다.
   - 별도 repeat-count 제안 API, 화면 내 디버그 출력, 즉석 RAG prompt 호출을 제거하고, 필요한 정보만 `job-setup` 호출로 지연 로딩한다.
6. 결과적으로 현재 아키텍처는 다음처럼 역할이 나뉜다.
   - `rag_vector`: 프로젝트 기본정보/활동정보 제안용 검색 자산
   - `prj_activity.description`, `prj_activity.activity_rule`: 저장 이후 작업 초안 생성용 구조화 자산
   - `job-setup`: 작업관리 화면 전용 lightweight orchestration API

---

## 2. 한 줄 요약

현재 Locaville의 RAG 검색은 backend의 `rag_service.py`가 공통 진입점이며, 기본적으로 PostgreSQL pgvector 검색을 우선 사용하고, 실패 시 Chroma, 그 다음 로컬 문서 키워드 검색으로 fallback 한다.

프로젝트 관련 등록/수정 흐름은 이미 저장된 `rag_file` + `rag_vector`를 기반으로 `/project/from-rag/basic`, `/project/{prj_id}/from-rag/activity` 흐름과 활동 이후 작업 등록 흐름으로 구성된다.

---

## 3. 관련 핵심 파일

### 3.1 RAG 검색 공통

- [ai_service.py](./locaville/backend/app/services/ai_service.py)
  - AI 호출 공통 엔진
  - `retrieve_relevant_snippets(...)`를 호출하는 주요 사용처
- [rag_service.py](./locaville/backend/app/services/rag_service.py)
  - RAG 검색 공통 진입점
  - pgvector / Chroma / 로컬 문서 fallback 검색 구현
- [rag_rdb.py](./locaville/backend/app/repositories/rag_rdb.py)
  - `rag_file`, `rag_vector` 저장/조회 repository

### 3.2 RAG 파일 등록/임베딩

- [rag.py](./locaville/backend/app/routers/rag.py)
  - RAG 관리 API 라우터
- [rag_file_service.py](./locaville/backend/app/services/rag_file_service.py)
  - RAG 파일 등록/상세조회/삭제/기본정보 수정
- [rag_embedding_service.py](./locaville/backend/app/services/rag_embedding_service.py)
  - 등록된 RAG 파일을 파싱하고 `rag_vector`에 임베딩 적재

### 3.3 프로젝트 `from-rag` 확장 대상

- [project.py](./locaville/backend/app/routers/project.py)
  - 프로젝트 관련 라우터
- [rag_rdb.py](./locaville/backend/app/repositories/rag_rdb.py)
  - `rag_file`, `rag_vector` 기반 프로젝트 정보 추출용 조회 repository
- [ai_service.py](./locaville/backend/app/services/ai_service.py)
  - 프로젝트 정보 추출 시 사용할 공통 AI 호출 레이어

### 3.4 프론트 연계

- [project/new/page.tsx](./locaville/web_admin/app/project/new/page.tsx)
  - 프로젝트 신규 등록 화면
  - 기반 사업 및 관련 문서 선택 UI
- [project-api.ts](./locaville/web_admin/lib/project-api.ts)
  - 프로젝트 관련 frontend API wrapper
- [rag-api.ts](./locaville/web_admin/lib/rag-api.ts)
  - RAG 파일 목록 조회 wrapper

---

## 4. 전체 RAG 검색 서비스 아키텍처

### 4.1 목적

RAG 검색 서비스의 목적은 정책 문서, 공고문, 시행지침 등에서 관련 근거 텍스트를 검색하여 AI 응답의 근거 컨텍스트로 제공하는 것이다.

현재 주요 사용처는 다음과 같다.

- `/ai/chat`
- `/ai/policy/calc`
- `/ai/policy/rule`
- 프로젝트 관련 정보 추출 시 작업별 일정 규칙 보조 추출

---

### 4.2 현재 검색 공통 진입점

현재 RAG 검색의 공통 진입점은 [rag_service.py](./locaville/backend/app/services/rag_service.py)의 다음 함수다.

- `retrieve_relevant_snippets(question, extra_terms=None, limit=4)`

이 함수는 질문과 보조 검색어를 받아 관련 snippet 목록을 반환한다.

반환 데이터 형식은 대략 다음과 같다.

```python
[
  {
    "path": "...",
    "snippet": "...",
    "score": 912,
  }
]
```

---

### 4.3 검색 우선순위

`retrieve_relevant_snippets(...)`는 다음 우선순위로 검색한다.

1. PostgreSQL pgvector 검색
2. Chroma 검색
3. 로컬 문서 키워드 검색 fallback

즉 현재 기본 검색은 pgvector다.

---

### 4.4 pgvector 검색 흐름

구현 위치:

- [rag_service.py](./locaville/backend/app/services/rag_service.py)의 `_retrieve_from_pgvector(...)`

흐름:

1. 질문 문자열을 준비한다.
2. 필요 시 activity keyword, money intent를 감지하여 검색어를 보강한다.
3. OpenAI embedding으로 query vector를 생성한다.
4. pgvector 테이블에서 cosine distance 검색을 수행한다.
5. 점수 보정과 후처리를 수행한다.
6. 최종 snippet 목록을 반환한다.

핵심 SQL 개념은 다음과 같다.

```sql
SELECT
    id,
    source,
    doc_type,
    heading_path,
    position,
    content,
    embedding <=> %s::vector AS distance
FROM {table}
ORDER BY embedding <=> %s::vector
LIMIT %s
```

여기서 `<=>`는 pgvector의 distance 연산자이며, 값이 작을수록 더 유사하다.

---

### 4.5 Chroma fallback

구현 위치:

- [rag_service.py](./locaville/backend/app/services/rag_service.py)의 `_retrieve_from_chroma(...)`

역할:

- 과거 Chroma vectorstore를 사용하는 경로
- pgvector 검색이 비활성화되었거나 실패한 경우 fallback

현재는 운영 기준 기본 경로가 아니며, 호환성과 rollback 용도에 가깝다.

---

### 4.6 로컬 문서 fallback

구현 위치:

- `load_rag_documents()`
- `_score_chunk(...)`

역할:

- vector 검색이 모두 실패한 경우 로컬 markdown/text 문서를 키워드 점수화하여 사용

검색 대상:

- backend README
- docs/*.md
- workspace README
- `프로젝트헌장.txt`
- HWPX chunk json

---

### 4.7 검색 후처리

검색 후처리에는 다음이 포함된다.

- activity keyword 감지 후 heading boost
- 금액/단가 의도 감지 후 heading boost
- MMR 기반 다양성 재정렬

즉, 단순 nearest neighbor 검색만 수행하는 것이 아니라 질문 유형에 따라 ranking 보정이 들어간다.

---

## 5. RAG 데이터 저장 아키텍처

### 5.1 `rag_file`

역할:

- RAG 원본문서 메타 저장
- 파일 식별자, 문서명, 파일명, 문서구분, 담당기관, schema 정보 등 관리

예시 필드:

- `file_id`
- `file_name`
- `doc_name`
- `doc_cat`
- `embedding_yn`
- `heading_schema`
- `appendix_schema`

---

### 5.2 `rag_vector`

역할:

- 문서 청크 단위 임베딩 저장

예시 필드:

- `file_id`
- `chunk_id`
- `heading_path`
- `chunk_loc`
- `content`
- `embedding`
- `attributes`

---

### 5.3 저장 흐름

문서가 RAG로 등록될 때의 일반 흐름:

1. 원본문서를 `rag_file`에 등록
2. 파서/청커가 문서를 청크 단위로 분해
3. embedding 생성
4. `rag_vector`에 `delete 후 insert` 방식으로 적재
5. `rag_file.embedding_yn` 갱신

관련 파일:

- [rag_file_service.py](./locaville/backend/app/services/rag_file_service.py)
- [rag_embedding_service.py](./locaville/backend/app/services/rag_embedding_service.py)
- [rag_rdb.py](./locaville/backend/app/repositories/rag_rdb.py)

---

## 6. 프로젝트 관련 RAG 활용 범위

이 문서에서 다루는 프로젝트 관련 RAG 활용 범위는 다음으로 한정한다.

- `rag_file`과 `rag_vector`가 이미 구성되어 있음
- 사용자는 프로젝트 등록/수정 화면에서 기존 RAG 파일을 선택함
- backend는 해당 RAG Vector를 검색하여 프로젝트 정보를 수집함

즉 다음 단계는 이 문서의 범위에서 제외한다.

- 신규 문서 업로드
- 원문 파싱
- 청킹 생성
- 임베딩 적재
- 업로드 직후 초안 생성

이 문서는 “이미 저장된 RAG 검색 자산을 사용해 프로젝트 정보를 수집하는 흐름”만 설명한다.

---

## 7. 프로젝트 등록/수정 관점의 현재 RAG 활용 흐름

### 7.1 요구사항 관점

프로젝트 등록 및 수정 관점에서는 사용자가 다음 흐름으로 작업하게 된다.

1. 기반 사업 선택
2. 관련 RAG 문서 선택
3. RAG 문서 내용을 바탕으로 프로젝트 기본정보 추출
4. 사용자 수정 후 프로젝트 저장
5. 저장된 프로젝트 기준으로 활동정보 추출 및 활동 등록
6. 저장된 프로젝트 기준으로 작업정보 등록
7. 사용자 검토 후 확정

이 흐름에서는 “청크”가 사용자나 API의 주 인터페이스가 아니다.

주 인터페이스는 다음이어야 한다.

- `rag_file_id`
- 추출 목적 (`basic`, `activity`)

즉, 내부적으로는 vector record나 chunk 성격의 본문 단위를 읽고 조립하더라도 외부 구조는 `from-rag` 기반으로 감춰져야 한다.

---

### 7.2 현재 API 구조

현재 사용 중인 엔드포인트:

- `POST /project/from-rag/basic`
- `POST /project/{prj_id}/from-rag/activity`

현재 운영 흐름은 다음 순서로 정리된다.

1. `basic`
2. 사용자 수정
3. 실제 `project` 저장
4. `activity`
5. 활동 등록
6. 작업 등록
즉 저장 흐름은 아래 순서를 권장한다.

`basic -> 사용자 수정 -> project 저장 -> activity 제안 -> 활동 등록 -> 작업 등록`

---

### 7.3 현재 backend 구성

#### 7.3.1 `project_from_rag_service.py`

역할:

- `rag_file_id` 또는 `prj_id`를 입력으로 받는다
- `rag_file`, `rag_vector`를 조회한다
- 기본정보와 활동정보에 대해 서로 다른 방식으로 컨텍스트를 구성한다
- 기본정보는 LLM 추출을 사용하고, 활동정보는 규칙 기반으로 구성한다
- frontend가 바로 사용할 수 있는 DTO를 조립한다

현재 주요 함수:

- `build_project_basic_from_rag(file_id: str) -> dict[str, Any]`
- `build_project_activities_from_rag(prj_id: str) -> dict[str, Any]`

현재 `activity` 단계는 prompt 기반 활동 추출이 아니라 다음 규칙 기반 흐름을 사용한다.

1. `rag_vector`에서 선택한 파일의 row를 조회
2. `heading_path`, `attributes`, `table_caption`, `header_row`, `table_row_role`를 분석
3. `활동`, `활동명`, `작업`, `단가`, `지원` 계열 키워드가 있는 표를 우선 선별
4. 같은 표 안에 여러 activity row가 있으면 각 row를 독립 activity 후보로 분리하고, `활동명:` 또는 `작업명:` 라벨이 있는 row를 activity 후보로 그룹화
5. 같은 `heading_path` 섹션의 본문을 순서대로 재구성하되, 이미 표에서 소모한 `활동명/주요 내용/단가` 라인은 부가 설명으로 중복 유입하지 않도록 정리
6. activity명 내부 줄바꿈은 공백으로 정규화하고, 활동명 / 주요 내용 / 단가 / 부가 내용으로 frontend에 반환

또한 activity 단계의 속성 추출은 현재 아래처럼 단계적으로 나뉜다.

1. activity 표 row 자체에서 활동명 / 주요 내용 / 단가를 규칙 기반으로 추출
2. 일정 후보는 `farm_job` 유사 작업명 검색 결과와 activity 본문 문맥을 함께 사용해 구성
3. 대상농지 후보는 규칙 기반 1차 후보 추출 후 LLM 문맥 판정과 최종 검증을 거쳐 확정

즉, 현재 `project_from_rag_service.py`는 다음 두 성격을 동시에 가진다.

- 기본정보 추출 orchestration
- 활동정보 규칙 기반 정리 서비스

#### 7.3.2 `project_draft_extraction_service.py`

역할:

- prompt 로딩
- LLM 호출용 system/user prompt 구성
- 기본정보 추출
- JSON 파싱

현재 실제 사용 함수:

- `extract_project_basic(context_text: str) -> dict[str, Any]`

현재 활동정보 추출에는 사용하지 않는다.

#### 7.3.3 `rag_rdb.py`

역할:

- `rag_file`, `rag_vector` 조회
- `rag_file_id` 기준 컨텍스트 조립에 필요한 데이터 제공
- `attributes`를 포함한 row metadata 반환

현재 핵심 함수:

- `get_rag_file(file_id: str)`
- `list_rag_vector_contents_for_file(file_id: str, limit: int = ...)`

repository는 SQL만 담당하고, 추출 판단은 service 레이어로 올린다.

---

## 8. 프로젝트 `from-rag` 현재 코드 흐름

### 8.1 프로젝트 기본정보 추출

목표:

- 프로젝트명
- 발주기관
- 공고일자
- 시행연도

흐름:

1. frontend가 `rag_file_id`를 선택
2. `POST /project/from-rag/basic`
3. router가 `project_from_rag_service.build_project_basic_from_rag(file_id)` 호출
4. service가 `rag_rdb`를 통해 관련 vector/text 조회
5. service가 basic 추출용 컨텍스트를 조립
6. `project_draft_extraction_service.extract_project_basic(context_text)` 호출
7. extraction service가 prompt 기반으로 JSON 추출
8. frontend가 prefill
9. 최종 사용자가 수정 후 저장

현재 frontend 반영 사항:

- `RAG 파일로부터 프로젝트 등록` 버튼을 통해 기본정보 제안 요청
- 프로젝트명, 발주기관, 공고일자, 시행연도 prefill
- 프로젝트ID는 자동 생성 규칙 사용
  - 프로젝트 등록화면: `연도 2자리 + (프로젝트명 + 발주기관) hash 6자리`

---

### 8.2 프로젝트 활동정보 추출

목표:

- 프로젝트 활동 목록
- 활동명
- 활동 설명
- 단가
- 예상시작일자 / 예상종료일자 후보
- 대상농지 후보
- 같은 목차 아래의 부가 설명

흐름:

1. 프로젝트 기본 row가 저장되어 `prj_id`가 생성됨
2. `POST /project/{prj_id}/from-rag/activity`
3. backend가 `project.rag_file_id`로 연결된 `rag_vector`를 다시 조회
4. `heading_path`, `attributes`, `table_caption`, `header_row`, `table_row_role`를 기준으로 activity/price table row를 우선 선별
5. 같은 표 안의 각 activity row를 activity별 후보로 나누고, `활동명:` 라벨이 있는 row는 별도 후보로 묶는다
6. 같은 heading 섹션의 문맥을 재정렬하되, 표 본문과 중복되는 라인은 `부가 내용`에서 제외한다
7. activity 본문에서 단가 패턴과 날짜/기간 표현을 읽고, `farm_job` 유사 작업명 검색 결과와 함께 일정 후보를 계산한다
8. 대상농지 코드는 `code_detail(grp_cd='PARCEL')` 목록과 별칭 사전을 기준으로 1차 후보를 찾고, 필요 시 같은 heading 섹션 전체 문맥으로 확장한 뒤 LLM으로 최종 검증한다
9. 각 제안 항목에 대해 다음 정보를 반환
   - `activity_name`
   - `heading_path`
   - `source_excerpt`
   - `unit_price.amount`
   - `unit_price.raw_text`
   - `schedule_suggestion.est_start_date`
   - `schedule_suggestion.est_end_date`
   - `schedule_suggestion.job_cd`
   - `schedule_suggestion.job_name`
   - `parcel_suggestion.selected_codes`
   - `parcel_suggestion.selected_names`
   - `heading_context_lines`
10. frontend가 제안 활동 목록을 우선 검토 대상 / 검토 가능 후보로 구분하여 표시
11. 사용자는 `상세 보기`에서 표 형식으로 내용을 확인
12. 사용자는 `활동등록` 버튼으로 바로 활동 등록 모달을 열 수 있음

현재 frontend 상세 표시 방식:

- 상단: `활동명 | 주요 내용 | 단가` 3열 표
- 하단: 같은 목차(`heading_path`) 섹션에서 표 아래 이어지는 설명을 `부가 내용` 박스로 표시

현재 activity 단계의 특징:

- 활동명과 단가는 RAG 표에서 직접 읽는다
- `farm_job`와의 매핑은 activity 제안 단계에서 하지 않는다
- 활동 등록 이후에 작업 등록 단계에서 `farm_job` 연계가 시작된다

---

### 8.3 활동 등록 화면 반영 흐름

목표:

- 제안 활동을 바로 활동 row로 등록
- RAG 표 원문 단가를 숫자형 활동비로 제안
- 일정/대상농지 제안까지 활동 등록 모달에 함께 반영

흐름:

1. 사용자가 제안 목록에서 `활동등록` 클릭
2. 기존 활동 등록 모달을 재사용하여 열림
3. 다음 값을 prefill
   - 활동명: 제안 활동명
   - 활동비: `unit_price.amount`
   - 예상시작일자: `schedule_suggestion.est_start_date`
   - 예상종료일자: `schedule_suggestion.est_end_date`
   - 대상농지: `parcel_suggestion.selected_codes`
   - 안내문: `RAG 등록 기준 단가: {unit_price.raw_text}`
4. 활동ID는 자동 생성
   - 앞 2자리: 순번 dropdown (`01`~`10`)
   - 뒤 6자리: 활동명 hash
5. 이미 등록된 활동명과 동일한 제안은 `활동등록` 버튼을 비활성화

현재 비교 기준:

- 등록된 `project.activities[].activity_name`
- 제안 `activity_name`
- 공백 제거 후 소문자 비교

활동비 단위 기준:

- 화면 입력/표시: `원/ha`
- DB 저장: `원/㎡`
- 저장 정밀도: 소수점 1자리까지 허용
- 예: `364,000 원/ha -> 36.4 원/㎡`

---

### 8.4 작업 등록 / 반복작업 등록 흐름

목표:

- 활동이 등록된 뒤, 해당 활동에 맞는 `farm_job` 작업코드/작업명을 빠르게 연결

흐름:

1. 사용자가 특정 활동의 `작업관리` 진입
2. `작업 등록` 또는 `반복작업 등록` 선택
3. frontend가 현재 활동명과 `job_options`(`farm_job`) 목록을 비교
4. 다음 우선순위로 기본 작업 후보를 찾음
   - 1순위: 활동명과 작업명 정확 일치
   - 2순위: 활동명이 작업명에 포함되거나 작업명이 활동명에 포함
5. 매칭 성공 시 `대상작업` 필드에 기본 선택값을 자동 입력

현재 특징:

- 이 작업은 frontend에서 `job_options`를 이용한 기본 추천
- 활동명 비교 시 공백/띄어쓰기 차이는 무시하고, 정확 일치 후 부분 일치 순으로 매칭한다
- activity 제안 단계에서 이미 `farm_job` 유사 작업 후보를 일정 추정에 사용하지만, 실제 job 등록은 여전히 사용자가 검토 후 확정한다
- 즉 작업 등록은 “RAG activity -> 등록된 activity -> farm_job 기본 선택” 흐름으로 동작하고, 일정 제안은 그 직전 activity 등록 단계에서 먼저 반영된다

---

## 9. `ai_service.py`의 역할

프로젝트 `from-rag` 구조에서도 `ai_service.py`는 사라지지 않는다.

역할은 다음과 같다.

- OpenAI/Gemini/Upstage 호출 공통 진입점
- `_run_text_response(...)`
- `_extract_first_json_object(...)`
- 공통 예외 처리와 fallback 정책

즉 `ai_service.py`는 AI 인프라 레이어이며, 프로젝트 등록/수정 업무 흐름 자체를 직접 소유하지는 않는다.

역할 분리는 다음처럼 본다.

- `ai_service.py`
  - AI 호출 엔진
- `project_draft_extraction_service.py`
  - 기본정보 prompt/응답 구조화
- `project_from_rag_service.py`
  - 업무 orchestration + activity 규칙 기반 정리

---

## 10. Prompt 관리 현황과 원칙

프로젝트 `from-rag` 흐름에서는 일반적인 짧은 프롬프트는 소스 안에 둘 수 있지만, 특정 목적의 프롬프트는 별도 text 파일로 분리하는 것을 원칙으로 한다.

예시 경로:

- `./locaville/backend/app/prompts/project_from_rag/basic_system.txt`
- `./locaville/backend/app/prompts/project_from_rag/parcel_suggestion_system.txt`
- `./locaville/backend/app/prompts/project_from_rag/parcel_inference_system.txt`
- `./locaville/backend/app/prompts/project_from_rag/parcel_validation_system.txt`

장점:

- 코드 컴파일 대상과 분리
- prompt 수정 시 코드 변경 최소화
- 리뷰/버전관리 용이
- 후보 추출/문맥 확장/최종 검증처럼 목적별 책임 분리 가능

권장 로딩 위치:

- `project_draft_extraction_service.py`

현재 구현 기준 정리:

- `basic` 단계: prompt 사용
- `activity` 단계:
  - 활동명/주요 내용/단가: 규칙 기반 파싱
  - 대상농지 문맥 판정/검증: 목적별 prompt 사용

추가 설정 자산:

- 대상농지 별칭은 `./locaville/backend/app/config/parcel_aliases.json`에 분리 저장
- 예: `논/답`, `밭/전`처럼 한글/한자/별칭을 같은 코드 후보군으로 묶어 1차 판정에 사용

즉, prompt 파일은 extraction service가 읽고, `project_from_rag_service.py`는 가능하면 prompt 파일을 직접 알지 않도록 유지한다.

---

## 11. 전체 구조 다이어그램

### 11.1 현재 전체 RAG 검색 흐름

```text
Frontend / Backend Caller
        |
        v
ai_service.py
        |
        v
retrieve_relevant_snippets()  in rag_service.py
        |
        +--> pgvector search (default)
        |      |
        |      v
        |   rag_vector / rag chunks
        |
        +--> Chroma fallback
        |
        +--> local docs fallback
        |
        v
snippet list
        |
        v
LLM answer / policy rule / chat response
```

### 11.2 현재 프로젝트 `from-rag` 흐름

```text
web_admin project/new
        |
        v
rag_file 선택 (rag_file_id)
        |
        v
/project/from-rag/basic
        |
        v
project_from_rag_service.py
        |
        +--> rag_rdb.py (rag_file, rag_vector 조회)
        |
        +--> context 조립
        |
        +--> project_draft_extraction_service.py
                  |
                  +--> prompt 로드
                  +--> ai_service.py
                  +--> JSON 추출
        |
        v
project basic draft
        |
        v
사용자 수정 후 project 저장
        |
        +--> /project/{prj_id}/from-rag/activity
        |         |
        |         +--> project_from_rag_service.py
        |         +--> rag_rdb.py
        |         +--> table / heading / attributes 기반 activity 추출
        |         +--> 활동명 / 주요 내용 / 단가 / 부가 내용 제안
        |
        +--> 활동 등록
        |         |
        |         +--> 활동명 / 활동비 prefill
        |         +--> 활동ID 자동 생성
        |
        +--> 작업 등록 / 반복작업 등록
                  |
                  +--> farm_job 기본 매칭
                  +--> 대상작업 기본 선택
```

---

## 12. 구현 시 유의사항

### 12.1 청크를 외부 인터페이스에 노출하지 않음

내부 구현은 `rag_vector`의 청크/segment를 사용하더라도, API와 서비스 공개 함수는 `rag_file_id` 중심으로 설계한다.

즉 다음은 피하는 것이 좋다.

- `extract_*_from_chunks(...)`를 외부 service API로 직접 노출

대신 다음이 권장된다.

- `build_*_from_rag(file_id)`

---

### 12.2 프로젝트 단계별 분리

기본정보와 활동정보는 한 번에 생성하지 않는 것이 좋다.

이유:

- 실패 지점 분리
- 부분 재시도 가능
- 사용자의 검토/수정 UX 개선
- 등록 후 수정 흐름과 자연스럽게 연결

현재는 이 원칙이 다음과 같이 구현되어 있다.

- `basic`: 저장 전 prefill
- `activity`: 저장 후 제안/등록
- `job`: activity 저장 후 수동/반자동 등록
### 12.3 activity와 job의 역할 분리

현재 구현에서는 activity와 job을 의도적으로 분리한다.

- activity
  - RAG 표와 목차를 읽어 사용자에게 이해 가능한 “활동” 단위를 제안
  - 활동명, 주요 내용, 단가, 부가 설명 중심
- job
  - 등록된 activity를 실제 `farm_job` 코드와 연결
  - 작업코드, 실행시점, 선후행작업, 일정 규칙 입력 중심

즉, activity 단계에서는 업무 의미를 살리고, job 단계에서 표준 작업체계와 연결한다.

---

## 13. 결론

현재 Locaville의 RAG 검색은 `rag_service.py`를 중심으로 pgvector 우선 검색 구조를 갖고 있으며, `ai_service.py`가 이를 호출해 chat/policy/rule 등 여러 AI 기능에 공통으로 활용하고 있다.

프로젝트 등록/수정 관점에서는 이미 저장된 `rag_file`과 `rag_vector`를 활용하는 `from-rag` 흐름을 분리하는 것이 맞다. 현재 구조는 다음처럼 정리된다.

- 검색/조회: `rag_rdb.py`
- 업무 orchestration + activity 정리: `project_from_rag_service.py`
- basic prompt/추출 공통: `project_draft_extraction_service.py`
- AI 호출 공통: `ai_service.py`

현재 구현 기준 등록 흐름은 아래 순서를 따른다.

`basic -> 사용자 수정 -> project 저장 -> activity 제안 -> 활동 등록 -> 작업 등록`

이 구조를 따르면 기존 RAG 검색 자산을 재사용하면서도, 프로젝트 등록/수정 업무 흐름에 맞는 단계적 추출과 사용자 검토 과정을 자연스럽게 구현할 수 있다. 또한 activity 단계에서는 문서 의미를 보존하고, job 단계에서는 `farm_job` 표준 작업체계와 연결하는 역할 분리가 가능하다.

---

## 14. 향후 개선사항

현재 구현은 프로젝트 기본정보 추출과 활동 제안, 일정/대상농지 제안, 작업 등록 기본 추천까지를 우선 안정화한 상태다. 다음 단계에서는 activity와 job의 추론 정확도와 설명 가능성을 더 높이는 방향으로 확장할 수 있다.

### 14.1 프로젝트 활동 정보 지능화

활동 단계의 향후 개선 목표는 현재 도입된 일정/대상농지 제안을 더 정교하게 만들고, 활동 자체의 운영 속성을 더 구조화하는 것이다.

우선 검토할 항목은 다음과 같다.

- 예상일자 판별 로직
  - 현재는 `farm_job` 유사 작업명과 activity 본문 규칙을 함께 사용하므로, 이후에는 월 단위/상반기·하반기/상대기간 추론을 더 보강할 수 있음
  - `최대 30일 이내` 같은 제약 문구 외에도 최소 간격, 반복 회수, 특정 마감일 제약을 구조화하는 방향으로 확장 가능
- 대상농지 판별 로직
  - 현재는 alias 사전 + 규칙 기반 후보 + LLM 검증을 사용하므로, 이후에는 부정문/예외문/조건부 허용 문맥의 회귀 평가를 더 체계화할 수 있음
  - 예를 들어 논/밭, 전/답, 특정 작물 재배지, 참여 제외 필지 조건 등을 더 넓은 문서군에서 검증할 필요가 있음

즉, activity 단계는 향후 다음 속성까지 자동 보조하는 방향으로 확장할 수 있다.

- `activity_name`
- `subsidy_amt`
- `est_start_date`
- `est_end_date`
- `target_parcel_candidates`

### 14.2 작업 정보 지능화

작업 단계의 향후 개선 목표는 현재의 `farm_job` 기본 매칭을 넘어서, 문서에서 실제 작업 운영 규칙을 읽어 구조화하는 것이다.

우선 검토할 항목은 다음과 같다.

- 개별 작업회수 추출
  - 동일 작업이 연 1회인지, 월별 반복인지, 특정 기간 동안 N회 반복인지 문서에서 판별
  - 반복작업 등록 시 회수 기본값과 작업순번 생성 보조에 활용
- 선후 작업 관계 추출
  - 특정 작업이 다른 작업의 선행인지 후행인지 문장/표/목차 흐름에서 추출
  - 예를 들어 “A 작업 후 B 작업 실시”, “파종 전/후”, “수확 후 즉시” 같은 문구를 구조화

즉, job 단계는 향후 다음 속성까지 자동 보조하는 방향으로 확장할 수 있다.

- `job_cd` 추천
- `job_seq_count`
- `ref_job_cd`
- `start_date_rule`
- `end_date_rule`
- `mandatory_yn`
- `evidence_yn`

### 14.3 권장 구현 방향

위 개선사항은 한 번에 모두 넣기보다 다음 순서로 단계적으로 확장하는 것이 바람직하다.

1. activity 예상일자 후보 추출
2. activity 대상농지 후보 추출
3. job 반복회수 추출
4. job 선후행 관계 추출

구현 방식은 규칙 기반과 AI 기반을 혼합하는 것이 적절하다.

- 1차: `heading_path`, `attributes`, 날짜 패턴, 표 구조를 이용한 규칙 기반 추출
- 2차: ambiguity가 큰 경우에만 `ai_service.py`를 통한 LLM 보정

이렇게 하면 현재의 안정적인 구조를 유지하면서도, 프로젝트 활동과 작업 등록 과정의 자동화 수준을 점진적으로 높일 수 있다.
