# Chroma → Supabase pgvector 차이점 정리

> RAG 벡터스토어를 Chroma 에서 Supabase pgvector 로 이관하는 과정에서
> 알아야 할 차이점 + 추가로 직접 처리해야 할 작업 목록.

---

## 1. 한 줄 요약

> **"Chroma 가 알아서 해주던 일을 backend 가 명시적으로 코드에 작성해야 한다."**

Supabase pgvector 는 더 강력하지만 (SQL · 인덱스 · JOIN · 동시성 · ACID), 그만큼 backend 의 코드가
명시적이 된다.

---

## 2. 5가지 핵심 차이

| 차원 | Chroma | Supabase pgvector |
|---|---|---|
| **데이터 모델** | embedding + content + **자유 dict metadata** (chunk 별로 다른 키 OK) | **SQL 테이블 — 컬럼 schema 고정**. 모든 row 가 같은 컬럼 |
| **metadata filter** | `where={...}` 부분 매칭 — 인덱스 약함 | **컬럼화 → B-Tree/GIN 인덱스, WHERE 절, JOIN 가능** |
| **검색** | `collection.query(query_texts, where)` — SDK 함수 위주 | **SQL** — embedding 거리 + WHERE + GROUP BY + JOIN 조합 |
| **확장성** | 한 collection 안 단일 schema | **여러 테이블 / CTE / window 함수** — 관계 표현 |
| **hybrid** | embedding only | **`tsvector` + embedding 결합** 가능 (한국어는 별도 분석기 필요) |

---

## 3. Chroma 가 자동으로 해주던 작업 → Supabase 에서 별도 필요

### 3-1. 가장 시급한 6가지 (필수)

#### A. 쿼리 임베딩 생성 — 매 검색마다
- **Chroma**: `collection.query(query_texts=["질문"])` → 자동으로 OpenAI 호출해서 vector 화
- **Supabase**: backend 가 **직접 `OpenAIEmbeddings().embed_query(question)` 호출 후** `embedding <=> $1::vector` 로 쿼리

```python
qvec = embeddings.embed_query(question)
rows = fetch_all(
    "SELECT ... ORDER BY embedding <=> %s::vector LIMIT %s",
    [qvec, limit],
)
```

**영향**: 매 검색 = OpenAI API 호출 1회. 자주 검색하면 비용/지연 ↑.
**대응**: 같은 질문 재검색 시 cache. 시연 단계에선 그냥 호출 OK.

#### B. 신규 chunk INSERT 시 임베딩 생성
- **Chroma**: `collection.add(documents=[...])` → 자동 vector 화 후 저장
- **Supabase**: backend 가 **`embeddings.embed_documents(texts)` 호출 → INSERT 시 vector 같이 넘김**

```python
vecs = embeddings.embed_documents(chunk_texts)
for text, vec in zip(chunk_texts, vecs):
    cur.execute(
        "INSERT INTO rag_chunks (id, source, ..., content, embedding) "
        "VALUES (%s, %s, ..., %s, %s::vector)",
        [chunk_id, source, ..., text, vec],
    )
```

**migration 단계는 OK** — 옛 vector 그대로 옮기니 임베딩 호출 없음.
**신규 ingest pipeline 갱신 필요** — `hwpx_ingest_service.py`.

#### C. SQL 쿼리 작성 — WHERE / ORDER BY / LIMIT 모두 명시
- **Chroma**: `collection.query(query_texts, n_results, where={"source": "xxx"})`
- **Supabase**: SQL 직접 작성. 조건/정렬/페이지네이션/JOIN 모두 코드에 있음.

**영향**: `rag_service.py` 의 `_retrieve_from_chroma()` 전면 재작성.
**기회**: Chroma 의 `where=` filter 한계 (부분 매칭만) 가 SQL 로 풀려 강력해짐:

```sql
-- 활동 keyword pre-filter + 벡터 거리 결합 (Chroma 에선 어려움)
SELECT *, 1 - (embedding <=> $1::vector) AS similarity
FROM rag_chunks
WHERE heading_path ILIKE '%중간 물떼기%'
ORDER BY embedding <=> $1::vector
LIMIT 5;
```

#### D. ID / metadata 변환 — schema 강제
- **Chroma**: id 안 주면 자동 UUID, metadata 는 자유 dict
- **Supabase**: `PRIMARY KEY` 라 **unique id 직접 부여** 필수, metadata 는 **컬럼 + JSONB 분리**

migration 시:
```python
chunk_id = chroma_meta["chunk_id"]  # 옛 패턴 유지: "파일명-0001"
columns = {
    "source": Path(chroma_meta["source_file"]).stem,
    "doc_type": chroma_meta.get("type"),
    "heading_path": chroma_meta.get("heading_path"),
    ...
}
extra = {k: v for k, v in {
    "table_caption": chroma_meta.get("table_caption"),
    "table_header": chroma_meta.get("table_header"),
}.items() if v}
```

#### E. 벡터 차원 strict 검증
- **Chroma**: 컬렉션이 정한 dim 과 다른 vector 넣으면 자동 reject 메시지
- **Supabase**: `VECTOR(1536)` 컬럼. 다른 dim 시 **PostgreSQL 에러** — 코드에서 매핑 필요

```python
try:
    cur.execute("INSERT ... %s::vector", [vec])
except psycopg.errors.DataException as e:
    # "expected 1536 dimensions, not N" 같은 에러
    raise EmbeddingDimError(f"임베딩 차원 불일치: {e}") from e
```

**향후**: 임베딩 모델 변경 시 (`text-embedding-3-large` = 3072-dim) 새 컬럼 추가 또는 새 테이블.

#### F. 응답 형태 변환
- **Chroma**: `{ids: [...], distances: [...], documents: [...], metadatas: [...]}` 분리된 array
- **Supabase**: SQL row 1개 = dict 1개. 변환 코드 필요.

```python
# Chroma (옛)
ids = result["ids"][0]
distances = result["distances"][0]
docs = result["documents"][0]

# Supabase (신)
rows = fetch_all(sql, params)
for row in rows:
    chunk_id = row["id"]
    similarity = row["similarity"]
    content = row["content"]
```

기존 `rag_service.py` 의 사후 처리 (activity boost / MMR) 도 같이 바꿔야.

---

### 3-2. 부수 작업 (덜 시급, 단 알아두기)

#### G. 인덱스 관리
- **Chroma**: 자동 HNSW
- **Supabase**: `CREATE INDEX ... USING hnsw` 명시. 대량 INSERT 후엔 `ANALYZE rag_chunks` 권장.

#### H. 트랜잭션
- **Chroma**: 단일 프로세스 가정, transaction 개념 약함
- **Supabase**: ACID. 대량 INSERT 시 `with transaction()` 명시 (이미 dbcom 패턴).

#### I. 동시성 / connection pool
- **Chroma**: in-memory, 단일 프로세스 동시 write 시 lock
- **Supabase**: 다중 connection. **Supabase pooler 가 transaction mode 라 일부 SQL 동작 제한** (prepared statement, LISTEN/NOTIFY).

#### J. 컬렉션 → 테이블 관리
- **Chroma**: `client.delete_collection(name)`
- **Supabase**: `TRUNCATE rag_chunks` 또는 `DROP TABLE`. RLS 추가 가능.

#### K. 백업
- **Chroma**: 디렉토리 통째 복사 (`chroma.sqlite3` + uuid dir)
- **Supabase**: `pg_dump` / dashboard 자동 백업 / CSV export

#### L. 에러 메시지
- **Chroma**: SDK 의 비교적 명확한 메시지
- **Supabase**: PostgreSQL vendor code → backend 에서 사용자 친화 메시지로 변환. 이미 `DBExecutionError` 패턴 있음 (`locaville.dbcom`).

---

## 4. migration 작업 단계별 작업량

| 단계 | 추가 코드 양 | 작업 시간 |
|---|---|---|
| Phase C: schema 설계 + Supabase 적용 | SQL 한 화면 | 30분 |
| Phase D: `scripts/migrate_chroma_to_supabase.py` | ~150줄 | 1-2h |
| **Phase E: `_retrieve_from_pgvector()` 신규** | ~80줄 (`rag_service.py`) | 1-2h |
| 쿼리 임베딩 + 거리 계산 | 10줄 (위 함수 안) | 즉시 |
| 응답 형태 변환 (Chroma → dict) | 20줄 | 즉시 |
| 에러 매핑 (vector dim 등) | 15줄 | 즉시 |
| (옵션) 쿼리 embedding cache | 30줄 | 1h |
| **(옵션) 신규 ingest pipeline 갱신** | ~100줄 (`hwpx_ingest_service.py`) | 별도 작업 |

---

## 5. mind shift

| Chroma 시절 | Supabase 시절 |
|---|---|
| "vector store 가 알아서 함" | **"backend 가 임베딩 + SQL 직접 다룸"** |
| `query(query_texts)` 한 줄 | embed + SQL + 후처리 명시적 작성 |
| metadata dict 자유 | **컬럼 schema + JSONB 분리 설계** |
| 단일 프로세스 가정 | **ACID + connection pool 인식** |

→ Supabase 가 더 powerful 하지만, 그만큼 코드가 명시적이 됨.

---

## 6. 참고

- **현재 운영**: **Supabase pgvector** (`rag_chunks` 테이블, **218 chunk**, **`text-embedding-3-large` dim=1536**)
- **옛 Chroma 보존**: `database/chroma_hwpx_db/` (8MB, 300 chunk). `RAG_USE_PGVECTOR=0` 로 rollback 가능
- **검색 코드**: [`backend/app/services/rag_service.py`](../../backend/app/services/rag_service.py) — `_retrieve_from_pgvector()`
- **신규 ingest 코드**: [`backend/app/services/supabase_rag_service.py`](../../backend/app/services/supabase_rag_service.py)
- **HWPX 파싱**: [`backend/app/services/hwpx_ingest_service.py`](../../backend/app/services/hwpx_ingest_service.py)
- **CLI 진입점**: [`backend/scripts/ingest_to_supabase.py`](../../backend/scripts/ingest_to_supabase.py)
- **공용 DB 어댑터**: [`library/locaville/dbcom.py`](../../library/locaville/dbcom.py)
- **DBMS 중립 코드 가이드**: [`DBMS_중립코드_작성_수정_가이드.md`](./DBMS_중립코드_작성_수정_가이드.md)

---

## 7. 이관 완료 결과 (Phase F 검증)

| 항목 | 값 |
|---|---|
| Schema 적용 | Supabase 대시보드 SQL Editor — 컬럼 9개 + 인덱스 4개 + extensions 2개 |
| Ingest | 시행지침 1개 파일 → 청크 개선 후 218 chunks INSERT |
| 청크 개선 효과 | raw 241 → improved 218 (23개 작은 라벨 흡수) |
| 임베딩 비용 | 약 $0.014 (`text-embedding-3-large`, dim=1536, batch=50) |
| 평균 검색 시간 | **385 ms** (OpenAI embed + Supabase 쿼리 + 후처리) |
| baseline 정확도 | **5/10 명확 + 3/10 부분 + 2/10 부정확 = 80%** |
| 시연 핵심 시나리오 | 중간 물떼기 단가 / 바이오차 증빙 / AWD 4회 등 모두 top-3 정확 |

부정확 케이스 (#4 사업참여 절차, #7 사업포기 신청 방법) 는 시연 후 개선 — 청크 전략 재검토 또는 활동 keyword 확장.
