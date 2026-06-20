"""RAG (Retrieval-Augmented Generation) 서비스.

``/ai/chat`` 의 답변 근거가 되는 정책 문서 청크 검색을 담당합니다. 두 가지 모드:

  1) **Chroma 벡터 DB** (있을 때): HWPX 시행지침을 임베딩해서 벡터 검색
  2) **로컬 마크다운 폴백**: backend README + docs + ``프로젝트헌장.txt`` 텍스트
     키워드 매칭 (벡터 DB 없거나 langchain 미설치 시)

To-do 산정에는 절대 사용하지 않습니다 (regulation 명시).
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

try:
    from langchain_chroma import Chroma
    from langchain_openai import OpenAIEmbeddings
except ImportError:  # pragma: no cover
    Chroma = None
    OpenAIEmbeddings = None


WORKSPACE_DIR = Path(__file__).resolve().parents[4]
ROOT_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = Path(__file__).resolve().parents[2]
HWPX_CHUNK_DIR = BACKEND_DIR / "rag_sources" / "chunks"
DEFAULT_VECTORSTORE_DIR = WORKSPACE_DIR / "database" / "chroma_hwpx_db"
DEFAULT_COLLECTION_NAME = "hwpx_documents"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
RAG_FILE_CANDIDATES = [
    BACKEND_DIR / "README.md",
    *sorted((BACKEND_DIR / "docs").glob("*.md")),
    ROOT_DIR / "README.md",
    *sorted((ROOT_DIR / "docs").glob("*.md")),
    WORKSPACE_DIR / "README.md",
    *sorted((WORKSPACE_DIR / "docs").glob("*.md")),
    WORKSPACE_DIR / "프로젝트헌장.txt",
]
_VECTORSTORE_CACHE: object | None = None


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in re.findall(r"\w+", text, flags=re.UNICODE)]


def _split_into_chunks(text: str, max_chars: int = 700) -> list[str]:
    chunks: list[str] = []
    current = ""
    for block in re.split(r"\n\s*\n", text):
        clean = re.sub(r"\s+", " ", block).strip()
        if len(clean) < 20:
            continue
        if len(current) + len(clean) + 1 <= max_chars:
            current = f"{current}\n{clean}".strip()
            continue
        if current:
            chunks.append(current)
        if len(clean) <= max_chars:
            current = clean
            continue
        for start in range(0, len(clean), max_chars):
            piece = clean[start : start + max_chars].strip()
            if piece:
                chunks.append(piece)
        current = ""
    if current:
        chunks.append(current)
    return chunks


def _score_chunk(question_tokens: list[str], chunk: str) -> int:
    chunk_lower = chunk.lower()
    score = 0
    for token in question_tokens:
        if len(token) < 2:
            continue
        if token in chunk_lower:
            score += 3
    score += min(len(set(question_tokens) & set(_tokenize(chunk))), 10)
    return score


def _load_hwpx_chunk_documents() -> list[dict[str, str]]:
    documents: list[dict[str, str]] = []
    if not HWPX_CHUNK_DIR.exists():
        return documents

    for path in sorted(HWPX_CHUNK_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        chunk_items = payload.get("chunks", []) if isinstance(payload, dict) else []
        source_file = str(payload.get("source_file") or path.name) if isinstance(payload, dict) else path.name
        for item in chunk_items:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if len(text) < 20:
                continue
            title = str(item.get("title") or "").strip()
            chunk_id = str(item.get("chunk_id") or "")
            snippet = f"{title}\n{text}".strip() if title else text
            documents.append(
                {
                    "path": f"{source_file}#{chunk_id}" if chunk_id else source_file,
                    "snippet": snippet,
                }
            )
    return documents


def _display_path(path: Path) -> str:
    for base_dir in (WORKSPACE_DIR, ROOT_DIR, BACKEND_DIR):
        try:
            return path.relative_to(base_dir).as_posix()
        except ValueError:
            continue
    return path.name


def _is_hwpx_context_path(path: str) -> bool:
    return ".hwpx" in (path or "").lower()


def _embedding_model_name() -> str:
    return os.getenv("RAG_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip() or DEFAULT_EMBEDDING_MODEL


def _resolve_vectorstore_dir() -> Path:
    configured = os.getenv("RAG_CHROMA_PERSIST_DIR", "").strip()
    if configured:
        return Path(configured).expanduser()
    return DEFAULT_VECTORSTORE_DIR


def _collection_name() -> str:
    return os.getenv("RAG_CHROMA_COLLECTION", DEFAULT_COLLECTION_NAME).strip() or DEFAULT_COLLECTION_NAME


def _score_from_distance(distance: float) -> int:
    # Chroma distance is lower-is-better. Convert to an int score used by current API.
    if distance < 0:
        return 1000
    score = int(round(1000 - (distance * 1000)))
    return max(1, score)


# 질문에서 저탄소 핵심 활동을 감지 — heading_path 매칭으로 검색 정밀도 ↑.
# 매칭되면 해당 활동이 heading 에 포함된 청크에 점수 보너스를 준다.
_ACTIVITY_HEADING_KEYWORDS: list[str] = [
    "중간 물떼기",
    "중간물떼기",
    "논물 얕게 걸러대기",
    "논물얕게걸러대기",
    "논물 얕게",
    "논물얕게",
    "바이오차",
    "가을 경운",
    "가을경운",
    "가을갈이",
    "영농폐기물",
    "영농 폐기물",
]


def _detect_money_intent(question: str) -> bool:
    """질문에 금액·단가·지원금 의도가 있는지.

    매칭되면 retrieval 단계에서:
      - 검색어를 '지원금 활동비 단가 ha 원/ha 면적당' 으로 보강해 단가표 chunk 를 fetch_k 안으로
      - heading_path 에 '단가/활동비/지원금/지급/보조금' 토큰 포함된 chunk 에 +250 boost
      - 본문에 ha 단가 패턴 ('150천원/ha' 등) 매칭 시 +125 boost
    """
    if not question:
        return False
    q = question.replace(" ", "")
    return any(kw.replace(" ", "") in q for kw in _MONEY_INTENT_KEYWORDS)


def _detect_activity_keyword(question: str) -> str | None:
    """질문에 핵심 활동 키워드가 있으면 가장 길게 매칭된 것을 반환."""
    if not question:
        return None
    normalized_q = question.replace(" ", "")
    best: str | None = None
    for keyword in _ACTIVITY_HEADING_KEYWORDS:
        if keyword.replace(" ", "") in normalized_q:
            if best is None or len(keyword) > len(best):
                best = keyword
    return best


_ACTIVITY_HEADING_BOOST = 250  # heading_path 매칭 시 score 가산

# 금액·단가 의도 — 질문에 보이면 단가표 chunk 를 우선 retrieve.
_MONEY_INTENT_KEYWORDS = [
    "얼마", "얼만큼", "받을", "받아", "받는", "받게", "받으",
    "지원금", "활동비", "보조금", "지급", "지급액", "단가", "비용",
    "금액", "원/ha", "ha당", "헥타르당", "면적당",
]
# 단가표가 위치한 heading 의 핵심 토큰.
_MONEY_HEADING_TOKENS = ["단가", "활동비", "지원금", "지급", "보조금"]
_MONEY_HEADING_BOOST = 250

# MMR (Maximal Marginal Relevance) — Phase 3-B.
# 결과 다양성을 높이기 위한 람다 (1.0 = 순수 relevance, 0.0 = 순수 다양성). 0.7 이 일반적 default.
_MMR_LAMBDA = 0.7


def _jaccard_similarity(a: str, b: str) -> float:
    """단어/2-gram 기반 Jaccard 유사도. langchain mmr 가 embedding 거리 쓰지만
    여기서는 임베딩 없이 빠르게 측정. RAG 청크는 대개 어휘 중복도가 높아 효과적.
    """
    def tokens(s: str) -> set[str]:
        s = re.sub(r"\s+", " ", (s or "").strip().lower())
        words = set(re.findall(r"\w+", s))
        # 2-gram 추가로 짧은 청크에서도 유사도 잡기
        bigrams = {s[i : i + 2] for i in range(len(s) - 1) if s[i] != " " and s[i + 1] != " "}
        return words | bigrams

    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    union = len(ta | tb)
    return inter / union if union else 0.0


def _mmr_rerank(
    candidates: list[dict[str, str | int]],
    top_k: int,
    lambda_param: float = _MMR_LAMBDA,
) -> list[dict[str, str | int]]:
    """MMR (Maximal Marginal Relevance) 으로 결과 다양성 + 정확도 균형.

    각 단계에서: 최고 점수 후보 중 이미 선택된 결과와 가장 덜 유사한 것을 선택.
    공식: MMR = λ·sim(query) - (1-λ)·max(sim(이미 선택된 것들))
    여기서는 sim(query) 대신 score 를 사용 (이미 score 가 query 유사도 + heading boost 반영).
    """
    if not candidates:
        return []
    if top_k >= len(candidates):
        return candidates

    # 1번째는 가장 점수 높은 것 (보통 query 와 가장 유사).
    candidates_sorted = sorted(candidates, key=lambda r: -int(r["score"]))
    selected = [candidates_sorted[0]]
    remaining = candidates_sorted[1:]

    # 정규화용: 최고/최저 score
    scores = [int(c["score"]) for c in candidates_sorted]
    score_max = max(scores) if scores else 1
    score_min = min(scores) if scores else 0
    score_range = max(1, score_max - score_min)

    while len(selected) < top_k and remaining:
        best_idx = 0
        best_mmr = -1e9
        for i, cand in enumerate(remaining):
            # relevance — score 를 0~1 정규화
            rel = (int(cand["score"]) - score_min) / score_range
            # max similarity to already selected
            cand_text = str(cand.get("snippet") or "")
            sim_max = 0.0
            for s in selected:
                sim = _jaccard_similarity(cand_text, str(s.get("snippet") or ""))
                if sim > sim_max:
                    sim_max = sim
            mmr = lambda_param * rel - (1 - lambda_param) * sim_max
            if mmr > best_mmr:
                best_mmr = mmr
                best_idx = i
        selected.append(remaining.pop(best_idx))

    return selected


def _load_chroma_vectorstore() -> object | None:
    global _VECTORSTORE_CACHE
    if _VECTORSTORE_CACHE is not None:
        return _VECTORSTORE_CACHE
    if Chroma is None or OpenAIEmbeddings is None:
        return None
    persist_dir = _resolve_vectorstore_dir()
    if not persist_dir.exists():
        return None
    try:
        embeddings = OpenAIEmbeddings(model=_embedding_model_name())
        vectorstore = Chroma(
            persist_directory=str(persist_dir),
            collection_name=_collection_name(),
            embedding_function=embeddings,
        )
        _VECTORSTORE_CACHE = vectorstore
        return vectorstore
    except Exception:
        return None


def _retrieve_from_pgvector(question: str, limit: int) -> list[dict[str, str | int]]:
    """Supabase pgvector 검색 — Chroma 의 응답 형태를 유지.

    Chroma 시절 후처리 (활동 boost / 금액 boost / MMR) 와 동일 흐름.
    임베딩 모델: text-embedding-3-large + dimensions=1536 (supabase_rag_service 와 같음).
    """
    capped_limit = max(1, min(limit, 12))

    activity_keyword = _detect_activity_keyword(question)
    activity_key_norm = activity_keyword.replace(" ", "") if activity_keyword else ""
    money_intent = _detect_money_intent(question)

    fetch_multiplier = 3 if (activity_keyword or money_intent) else 2
    fetch_k = min(30, max(capped_limit * fetch_multiplier, capped_limit + 6))

    search_query = question
    if money_intent:
        search_query = f"{question} 지원금 활동비 단가 ha 원/ha 면적당"

    # 임베딩 — supabase_rag_service 와 동일 model + dimensions 유지 (검색/적재 정합)
    try:
        from app.services.supabase_rag_service import _get_embeddings_client, _resolve_table
        embeddings = _get_embeddings_client()
        qvec = embeddings.embed_query(search_query)
        table = _resolve_table()
    except Exception:
        return []

    # cosine 거리 검색 — `<=>` 작을수록 유사. Chroma 의 distance 와 같은 의미.
    try:
        from locaville.dbcom import fetch_all
        rows = fetch_all(
            f"""
            SELECT
                id, source, doc_type, heading_path, position,
                content,
                embedding <=> %s::vector AS distance
            FROM {table}
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            [qvec, qvec, fetch_k],
        )
    except Exception:
        return []

    candidates: list[dict[str, str | int]] = []
    for row in rows:
        content = (row.get("content") or "").strip()
        if not content:
            continue
        source = row.get("source") or "rag_chunks"
        position = row.get("position") or ""
        heading_path = row.get("heading_path") or ""
        doc_type = row.get("doc_type") or ""

        path_parts: list[str] = [source]
        if heading_path:
            path_parts.append(heading_path)
        path = " > ".join(path_parts)
        if position:
            path = f"{path} #position={position}"
        if doc_type:
            path = f"{path} ({doc_type})"

        distance = float(row.get("distance") or 0.0)
        base_score = _score_from_distance(distance)

        # 활동 키워드 boost — Chroma 시절과 같은 정책
        if activity_key_norm and activity_key_norm in heading_path.replace(" ", ""):
            base_score += _ACTIVITY_HEADING_BOOST

        # 금액 의도 boost — heading_path 단가표 토큰 + 본문 단가 패턴
        if money_intent:
            if any(tok in heading_path for tok in _MONEY_HEADING_TOKENS):
                base_score += _MONEY_HEADING_BOOST
            if re.search(r"\d[\d.,]*\s*(천원|만원|원)\s*/\s*(ha|㎡)", content):
                base_score += _MONEY_HEADING_BOOST // 2

        candidates.append({"path": path, "snippet": content, "score": base_score})

    if not candidates:
        return []

    use_mmr = os.getenv("RAG_DISABLE_MMR", "").strip() not in ("1", "true", "True")
    if use_mmr and len(candidates) > capped_limit:
        return _mmr_rerank(candidates, top_k=capped_limit)

    candidates.sort(key=lambda r: -int(r["score"]))
    return candidates[:capped_limit]


def _retrieve_from_chroma(question: str, limit: int) -> list[dict[str, str | int]]:
    """Chroma 벡터 검색 + 활동 키워드 boost + MMR 다양성 재정렬.

    Phase 2-C 개선:
      - 질문에 핵심 활동(중간 물떼기/바이오차 등) 이 명시되면 더 많이 가져와서
        heading_path 에 그 활동이 포함된 청크에 score 보너스를 준 뒤 정렬.
      - capped_limit 6 → 12 로 상한 확대 (calc/rule endpoint 가 더 많은 근거 필요).

    Phase 3-B 개선:
      - 항상 더 많이 fetch (capped_limit * 2~3) 한 뒤 MMR 로 top-N 선택.
      - 같은 표·문단의 거의 같은 청크가 결과를 점유하던 문제 해결 → 답변 컨텍스트
        다양성 ↑, LLM 이 한 단면만 보고 답하지 않음.
      - 환경변수 RAG_DISABLE_MMR=1 로 비활성화 가능 (디버그용).
    """
    vectorstore = _load_chroma_vectorstore()
    if vectorstore is None:
        return []
    capped_limit = max(1, min(limit, 12))

    activity_keyword = _detect_activity_keyword(question)
    activity_key_norm = activity_keyword.replace(" ", "") if activity_keyword else ""
    money_intent = _detect_money_intent(question)

    # Phase 3-B: 항상 더 많이 가져와서 MMR 적용 (활동 boost 와 시너지).
    # 활동 키워드 또는 금액 의도 있으면 추가로 더 가져옴.
    fetch_multiplier = 3 if (activity_keyword or money_intent) else 2
    fetch_k = min(30, max(capped_limit * fetch_multiplier, capped_limit + 6))

    # 금액 의도가 있으면 검색어 자체를 보강해야 단가표 chunk 가 fetch_k 안에 들어옴.
    # 단순 "얼마 받아?" 만으로는 dense embedding 이 선정통지서·참여면적 등을 더 가까이 봄.
    search_query = question
    if money_intent:
        search_query = f"{question} 지원금 활동비 단가 ha 원/ha 면적당"
    try:
        docs_with_scores = vectorstore.similarity_search_with_score(search_query, k=fetch_k)
    except Exception:
        return []

    candidates: list[dict[str, str | int]] = []
    for doc, distance in docs_with_scores:
        content = str(getattr(doc, "page_content", "") or "").strip()
        if not content:
            continue
        metadata = getattr(doc, "metadata", {}) or {}
        source = (
            str(metadata.get("source") or "")
            or str(metadata.get("source_file") or "")
            or str(metadata.get("path") or "")
            or "chroma_hwpx_db"
        )
        position = str(metadata.get("position") or "")
        heading_path = str(metadata.get("heading_path") or "")
        doc_type = str(metadata.get("type") or "")
        # LLM 이 인용·신뢰도 판단할 수 있도록 path 에 heading + position 도 포함.
        path_parts: list[str] = [source]
        if heading_path:
            path_parts.append(heading_path)
        path = " > ".join(path_parts)
        if position:
            path = f"{path} #position={position}"
        if doc_type:
            path = f"{path} ({doc_type})"

        base_score = _score_from_distance(
            float(distance) if isinstance(distance, (int, float)) else 0.0
        )
        # 활동 키워드가 heading_path 에 매칭되면 보너스 — 해당 활동 섹션 청크 우선.
        if activity_key_norm and activity_key_norm in heading_path.replace(" ", ""):
            base_score += _ACTIVITY_HEADING_BOOST

        # 금액 의도 + heading_path 에 단가표 핵심 토큰 매칭 시 boost.
        # 본문에 ha/㎡ 단가 패턴 ('150천원/ha', '46만원/ha' 등) 이 있으면 추가 boost.
        if money_intent:
            if any(tok in heading_path for tok in _MONEY_HEADING_TOKENS):
                base_score += _MONEY_HEADING_BOOST
            if re.search(r"\d[\d.,]*\s*(천원|만원|원)\s*/\s*(ha|㎡)", content):
                base_score += _MONEY_HEADING_BOOST // 2

        candidates.append({"path": path, "snippet": content, "score": base_score})

    if not candidates:
        return []

    # MMR rerank — 비활성화 환경 변수 체크.
    use_mmr = os.getenv("RAG_DISABLE_MMR", "").strip() not in ("1", "true", "True")
    if use_mmr and len(candidates) > capped_limit:
        return _mmr_rerank(candidates, top_k=capped_limit)

    # MMR 미사용 시 단순 score 정렬.
    candidates.sort(key=lambda r: -int(r["score"]))
    return candidates[:capped_limit]


def load_hwpx_chunks_for_summary(
    activity_keyword: str = "",
    max_chunks: int = 60,
) -> tuple[list[str], list[str], int]:
    """정책 문서 요약용으로 청크 텍스트를 모은다.

    chunks JSON 의 원본 청크를 source_order/section/block_index 순으로 정렬해서
    LLM 이 문서 흐름대로 요약할 수 있게 한다.

    Args:
      activity_keyword: 비어 있으면 전체 청크, 있으면 title/text 에 매칭되는 것만.
      max_chunks: 최대 청크 수 (LLM context 한계 고려).

    Returns:
      (snippets, source_files, total_chunk_count)
    """
    if not HWPX_CHUNK_DIR.exists():
        return [], [], 0

    chunks: list[tuple[int, str, str]] = []  # (sort_key, text, source_file)
    source_files: list[str] = []
    total_count = 0
    keyword_norm = activity_keyword.replace(" ", "").lower() if activity_keyword else ""

    for path in sorted(HWPX_CHUNK_DIR.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        source_file = str(payload.get("source_file") or path.name)
        if source_file not in source_files:
            source_files.append(source_file)
        chunk_items = payload.get("chunks", [])
        for item in chunk_items:
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            if len(text) < 30:
                continue
            title = str(item.get("title") or "").strip()
            total_count += 1

            if keyword_norm:
                haystack = (title + " " + text).replace(" ", "").lower()
                if keyword_norm not in haystack:
                    continue

            chunk_id = str(item.get("chunk_id") or "")
            # chunk_id 가 "0001" 같은 0-pad 숫자면 정렬에 쓰기 좋음
            try:
                sort_key = int(re.sub(r"\D", "", chunk_id) or "999999")
            except Exception:
                sort_key = 999999

            snippet = f"[{title}]\n{text}" if title else text
            chunks.append((sort_key, snippet, source_file))

    chunks.sort(key=lambda x: x[0])
    if max_chunks > 0:
        chunks = chunks[:max_chunks]

    return [c[1] for c in chunks], source_files, total_count


def load_rag_documents() -> list[dict[str, str]]:
    documents: list[dict[str, str]] = []
    for path in RAG_FILE_CANDIDATES:
        if not path.exists() or not path.is_file():
            continue
        if path.name == "AGENTS.md":
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            content = path.read_text(encoding="utf-8", errors="ignore")
        rel_path = _display_path(path)
        for chunk in _split_into_chunks(content):
            documents.append({"path": rel_path, "snippet": chunk})
    documents.extend(_load_hwpx_chunk_documents())
    return documents


def retrieve_relevant_snippets(question: str, extra_terms: list[str] | None = None, limit: int = 4) -> list[dict[str, str | int]]:
    query = " ".join([question, *(extra_terms or [])]).strip()
    question_tokens = _tokenize(query)
    if not question_tokens:
        return []
    # 신: Supabase pgvector 우선. 실패 시 옛 Chroma → 그것도 실패 시 마크다운 폴백.
    # env `RAG_USE_PGVECTOR=0` 으로 옛 Chroma 강제 가능 (rollback 용).
    use_pgvector = os.getenv("RAG_USE_PGVECTOR", "1").strip() in ("1", "true", "True", "yes")
    if use_pgvector:
        pg_results = _retrieve_from_pgvector(query, limit=limit)
        if pg_results:
            return pg_results
    chroma_results = _retrieve_from_chroma(query, limit=limit)
    if chroma_results:
        return chroma_results

    ranked: list[dict[str, str | int]] = []
    for item in load_rag_documents():
        score = _score_chunk(question_tokens, item["snippet"])
        if score <= 0:
            continue
        ranked.append(
            {
                "path": item["path"],
                "snippet": item["snippet"],
                "score": score,
            }
        )
    ranked.sort(key=lambda item: int(item["score"]), reverse=True)
    capped_limit = max(1, min(limit, 6))
    selected = ranked[:capped_limit]

    if not any(_is_hwpx_context_path(str(item["path"])) for item in selected):
        hwpx_candidates = [item for item in ranked if _is_hwpx_context_path(str(item["path"]))]
        if hwpx_candidates:
            selected = [*selected[: max(0, capped_limit - 1)], hwpx_candidates[0]]
            selected.sort(key=lambda item: int(item["score"]), reverse=True)

    return selected

