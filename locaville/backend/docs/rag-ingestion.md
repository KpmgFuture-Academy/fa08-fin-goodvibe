# HWPX RAG Ingestion

`/ai/chat`은 backend의 local RAG source를 keyword search로 검색합니다. 이번 단계에서는 HWPX 원문을 직접 응답에 노출하지 않고, ingest된 chunk snippet만 `used_context`에 제한적으로 포함합니다.

## Source 구조

- `rag_sources/raw_hwpx`
  - 원본 `.hwpx` 보관 폴더
- `rag_sources/parsed_text`
  - 추출된 plain text `.txt`
- `rag_sources/chunks`
  - RAG 검색용 chunk metadata `.json`

## Chunk 구조

각 chunk JSON은 아래 정보를 포함합니다.

- `source_file`
- `chunk_id`
- `title`
- `section`
- `text`

예시:

```json
{
  "source_file": "2026년 저탄소농업 프로그램 시범사업(경종) 사업시행지침(시행용).hwpx",
  "chunk_id": "2026년 저탄소농업 프로그램 시범사업(경종) 사업시행지침(시행용)-0001",
  "title": "Ⅱ 지원대상 활동",
  "section": "Contents/section3.xml",
  "text": "중간 물떼기 활동은 ..."
}
```

## Ingest 실행

backend 작업 디렉터리에서 실행합니다.

```bash
python scripts/ingest_hwpx.py --input ../../docs/2026년\ 저탄소농업\ 프로그램\ 시범사업\(경종\)\ 사업시행지침\(시행용\).hwpx
```

또는 이미 관리 폴더에 넣은 파일을 그대로 ingest할 수 있습니다.

```bash
python scripts/ingest_hwpx.py --input rag_sources/raw_hwpx/sample.hwpx
```

## 검색 연결

- `app/services/rag_service.py`는 기존 markdown/txt source와 함께 `rag_sources/chunks/*.json`을 함께 읽습니다.
- `/ai/chat`의 `used_context[].path`에는 `source_file#chunk_id` 형식이 포함될 수 있습니다.
- RAG는 제도/사업 안내 Q&A에만 사용하고, `/todos`, `/todos/today`, `computed_status`에는 연결하지 않습니다.
