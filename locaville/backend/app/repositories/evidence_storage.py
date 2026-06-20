"""증빙 파일 저장소 — Supabase Storage 추상화.

evidence_service 가 사진 bytes 를 저장할 때 이 모듈을 통해 Supabase Object Storage
(S3 호환) 에 업로드한다. 환경변수 또는 SDK 가 없으면 ``is_supabase_enabled()`` 가
False 를 반환해, 호출자가 로컬 fs fallback 으로 갈 수 있게 한다.

환경변수:
    SUPABASE_URL        — 프로젝트 URL (예: https://xxxx.supabase.co)
    SUPABASE_KEY        — anon 또는 service_role API key
    BUCKET_EVIDENCE     — bucket 이름 (예: 'evidence')

Public bucket 가정 — public URL 을 직접 노출.
Private bucket 으로 가시려면 ``get_public_url`` 을 signed URL 로 교체.
"""
from __future__ import annotations

import mimetypes
import os
from typing import Any

try:
    from supabase import create_client, Client as SupabaseClient
except ImportError:  # pragma: no cover
    create_client = None
    SupabaseClient = None  # type: ignore[assignment]


_CLIENT_CACHE: SupabaseClient | None = None


def _env(name: str) -> str:
    """공백 trim 한 환경변수. dotenv 의 키 trailing space 도 안전 처리."""
    return (os.getenv(name, "") or os.getenv(name.strip(), "") or "").strip()


def get_bucket_name() -> str:
    return _env("BUCKET_EVIDENCE") or "evidence"


def is_supabase_enabled() -> bool:
    """현재 환경에서 Supabase Storage 를 쓸 수 있는가."""
    if create_client is None:
        return False
    return bool(_env("SUPABASE_URL") and _env("SUPABASE_KEY"))


def _get_client() -> SupabaseClient:
    """Supabase client 한 번만 만들어 캐시. 키 미설정이면 RuntimeError."""
    global _CLIENT_CACHE
    if _CLIENT_CACHE is not None:
        return _CLIENT_CACHE
    if create_client is None:
        raise RuntimeError("supabase-py SDK 가 설치되지 않았습니다.")
    url = _env("SUPABASE_URL")
    key = _env("SUPABASE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_KEY 환경변수가 설정되지 않았습니다.")
    _CLIENT_CACHE = create_client(url, key)
    return _CLIENT_CACHE


def _guess_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    """확장자 → MIME 추정. 미지 확장자면 fallback."""
    guess, _ = mimetypes.guess_type(filename)
    return guess or fallback


def upload_bytes(
    *,
    key: str,
    data: bytes,
    content_type: str | None = None,
    upsert: bool = True,
) -> dict[str, Any]:
    """bytes 를 ``BUCKET_EVIDENCE/{key}`` 위치에 업로드.

    Args:
        key: bucket 내 상대 path. 예: 'original/abc.jpg'
        data: 파일 본문
        content_type: MIME. None 이면 key 의 확장자로 추정.
        upsert: 같은 key 가 있으면 덮어쓸지.

    Returns:
        {'path': 저장된 key, 'public_url': URL, 'bucket': bucket 이름}
    Raises:
        RuntimeError: 키 미설정 / 업로드 실패.
    """
    client = _get_client()
    bucket = get_bucket_name()
    ct = content_type or _guess_content_type(key, "image/jpeg")
    storage = client.storage.from_(bucket)
    try:
        storage.upload(
            path=key,
            file=data,
            file_options={"content-type": ct, "upsert": "true" if upsert else "false"},
        )
    except Exception as exc:  # noqa: BLE001 — SDK 의 다양한 예외 통합
        raise RuntimeError(f"Supabase Storage upload 실패 ({bucket}/{key}): {exc}") from exc

    return {
        "path": key,
        "public_url": get_public_url(key),
        "bucket": bucket,
    }


def get_public_url(key: str) -> str:
    """public bucket 의 객체 URL. Private bucket 으로 바꾸려면 이 함수만 signed URL 반환으로 교체."""
    client = _get_client()
    bucket = get_bucket_name()
    return client.storage.from_(bucket).get_public_url(key)


def delete_object(key: str) -> bool:
    """bucket 의 객체 삭제. 운영/cleanup 용. 실패해도 예외 대신 False 반환."""
    if not is_supabase_enabled():
        return False
    try:
        client = _get_client()
        bucket = get_bucket_name()
        client.storage.from_(bucket).remove([key])
        return True
    except Exception:  # noqa: BLE001
        return False
