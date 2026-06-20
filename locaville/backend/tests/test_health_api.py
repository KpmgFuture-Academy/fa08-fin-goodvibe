from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import health


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(health.router)
    return TestClient(app)


def test_health_returns_ok_without_db_check(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_MODE", "json")

    response = _client().get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "jeotanmaeul-backend"
    assert body["storage_mode"] == "json"
    assert body["db"] == {"status": "disabled"}


def test_health_rdb_mode_uses_safe_db_checker(monkeypatch) -> None:
    monkeypatch.setenv("STORAGE_MODE", "rdb")
    monkeypatch.setattr(
        health,
        "check_db_connection",
        lambda: {"status": "ok", "engine": "mock"},
    )

    response = _client().get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["storage_mode"] == "rdb"
    assert body["db"] == {"status": "ok", "engine": "mock"}
