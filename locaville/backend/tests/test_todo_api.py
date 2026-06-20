from __future__ import annotations

from datetime import date

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import todo


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(todo.router)
    return TestClient(app)


def test_get_todos_returns_items_from_service(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_list_todos(**kwargs):
        calls.append(kwargs)
        return []

    monkeypatch.setattr(todo, "list_todos", fake_list_todos)

    response = _client().get(
        "/todo",
        params={
            "farmer_id": "FARMER_TEST",
            "group_no": "1",
            "prj_id": "PRJ_TEST",
            "activity_id": "ACT_TEST",
            "date": "2026-06-04",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"items": []}
    assert calls == [
        {
            "farmer_id": "FARMER_TEST",
            "group_no": 1,
            "prj_id": "PRJ_TEST",
            "activity_id": "ACT_TEST",
            "target_date": date(2026, 6, 4),
        }
    ]


def test_get_today_todos_uses_today_service(monkeypatch) -> None:
    calls: list[dict[str, object]] = []

    def fake_list_today_todos(**kwargs):
        calls.append(kwargs)
        return []

    monkeypatch.setattr(todo, "list_today_todos", fake_list_today_todos)

    response = _client().get("/todo/today", params={"farmer_id": "FARMER_TEST"})

    assert response.status_code == 200
    assert response.json() == {"items": []}
    assert calls == [
        {
            "farmer_id": "FARMER_TEST",
            "group_no": None,
            "prj_id": None,
            "activity_id": None,
            "target_date": None,
        }
    ]
