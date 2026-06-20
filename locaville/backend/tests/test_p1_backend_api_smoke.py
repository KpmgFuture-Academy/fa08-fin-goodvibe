from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import admin, diary, evidence, todo


app.router.on_startup.clear()

SENSITIVE_PATTERNS = (
    "api_key",
    "db_password",
    "database_url",
    "password=",
    "supabase",
    "secret",
    "traceback",
)


def _assert_no_sensitive_or_traceback(response_text: str) -> None:
    lowered = response_text.lower()
    for pattern in SENSITIVE_PATTERNS:
        assert pattern not in lowered


@pytest.mark.parametrize(
    ("method", "endpoint"),
    [
        ("GET", "/health"),
        ("GET", "/admin/summary"),
        ("GET", "/admin/todo-status"),
        ("GET", "/todo/today"),
        ("GET", "/diary"),
        ("GET", "/evidence"),
    ],
)
def test_p1_backend_api_smoke(monkeypatch, method: str, endpoint: str) -> None:
    monkeypatch.setenv("STORAGE_MODE", "json")
    monkeypatch.setattr(
        admin,
        "get_admin_summary",
        lambda: {"totals": {}, "farmers": [], "recent_diaries": [], "recent_evidence": []},
    )
    monkeypatch.setattr(
        admin,
        "get_admin_todo_status",
        lambda **kwargs: {"items": [], "summary": {}, "filters": kwargs},
    )
    monkeypatch.setattr(todo, "list_today_todos", lambda **kwargs: [])
    monkeypatch.setattr(diary, "list_diary_records", lambda **kwargs: [])
    monkeypatch.setattr(diary, "list_diary_records_filtered", lambda **kwargs: [])
    monkeypatch.setattr(evidence, "list_evidence_records", lambda: [])
    monkeypatch.setattr(evidence, "list_evidence_records_filtered", lambda **kwargs: [])

    client = TestClient(app, raise_server_exceptions=False)
    response = client.request(method, endpoint)

    assert response.status_code in (200, 404, 422, 503)
    _assert_no_sensitive_or_traceback(response.text)

    if response.status_code == 200:
        assert response.headers.get("content-type", "").startswith("application/json")
        assert isinstance(response.json(), dict)
