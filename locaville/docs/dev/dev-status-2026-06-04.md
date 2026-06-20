# Dev Status — 2026-06-04

> Chroma → Supabase pgvector RAG 이관 완료. 시연 핵심 시나리오 검증 통과.

---

## 오늘 한 일

### 1. 디렉토리/문서 정리 (오전)
- `library/` → `locaville/library/` 이동, editable install 경로 갱신
- `docs/` 통합 + 카테고리 정리 (architecture / business / database / spec / dev / demo / design-system / guidelines)
- 옛 docs 17개 삭제, 신규 9개 재작성, AGENTS.md root 신규
- 임시 파일 정리: `_proj_test.json`, `프로젝트헌장.txt`, `.tmp_pgcheck/`, `.tmp_ui_ref/`, `config/`, `c:tmp*` 6개

### 2. 라이브 코칭 시행지침 9p 정확 기준 적용 + 쉬운 말 규칙
- `photo_guard_service.PHOTO_CRITERIA` 12개 entry → 시행지침 9p 표 그대로 (배수물꼬 2주 / 2~5cm 4회 / 납품된 바이오차 / 볏짚 절단·경운)
- `_COACH_PROMPT_PIC` + `_build_pic_criteria_block` 에 "전문 용어 금지 + 어르신 쉬운 말" 규칙 + 4가지 변환 예시

### 3. RAG 이관 — **Chroma → Supabase pgvector** (Phase C ~ F 완료)

#### Phase C: Schema
- `vector` + `pg_trgm` extension
- `rag_chunks` 컬럼 9개 (id, source, doc_type, heading_path, position, document_date, content, embedding, extra JSONB)
- HNSW (cosine) + B-Tree (source, doc_type) + GIN (extra, heading_path trigram)
- `updated_at` 자동 trigger

#### Phase D: Ingest
- `supabase_rag_service.py` 신규 — 청크 개선 후처리 (날짜 패턴 제거, 작은 라벨 흡수) + OpenAI embed + INSERT
- `scripts/ingest_to_supabase.py` CLI — `--all` / `--file` / `--dry-run` / `--truncate` / `--stats`
- 임베딩: `text-embedding-3-large` + `dimensions=1536` (native reduction, HNSW 호환)
- 결과: raw 241 → improved **218 chunks** INSERT 성공
- 비용: 약 $0.014 (배치 50개씩)

#### Phase E: 검색 함수 교체
- `_retrieve_from_pgvector()` 신규 — Chroma 의 응답 형태 유지
- 활동 keyword boost / 금액 boost / MMR 후처리 그대로
- `RAG_USE_PGVECTOR=0` 환경변수로 옛 Chroma fallback (rollback 안전망)

#### Phase F: 검증
- 10개 baseline 쿼리 실행
- 평균 응답 시간 **385 ms** (OpenAI embed + Supabase + 후처리)
- 정확도 **80%** (5 명확 + 3 부분 + 2 부정확)
- 시연 핵심 시나리오 (중간 물떼기 단가, 바이오차 증빙 사진, AWD 4회) 모두 top-3 정확

#### Phase G: 정리
- 옛 Chroma DB (`database/chroma_hwpx_db/`) 보존 — rollback 용
- `requirements.txt` 의 `chromadb`, `langchain-chroma` 제거
- 문서 갱신: `architecture/Backend_아키텍처_구성안.md`, `database/chroma-vs-supabase.md`, `dev/known-limitations.md`

---

## 알려진 부정확 케이스 (시연 후 개선)

- baseline #4 "사업 참여 절차" → "사업포기 유의사항" chunk 가 잡힘 (활동 keyword 확장 필요)
- baseline #7 "사업 포기 신청 방법" → 신청서 form chunk (사업포기 절차 chunk 크기 부족)

→ [`known-limitations.md` § 4-A](./known-limitations.md) 참고.

---

## 추후 작업

1. **등록신청 공고 (.hwpx) 도 ingest** — 현재 시행지침 1개만. 옛 Chroma 에는 17 chunk 더 있었음.
2. **부정확 케이스 개선** — `_ACTIVITY_HEADING_KEYWORDS` 확장 + 청크 전략 재검토
3. **임베딩 캐시** (옵션) — 자주 검색되는 질문은 query embedding 재사용
4. **Phase G 2주 후** — Chroma DB 디렉토리 정식 삭제
