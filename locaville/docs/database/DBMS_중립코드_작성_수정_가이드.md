# DBMS 중립 코드 작성/수정 가이드

> 현재 운영 DBMS: **PostgreSQL**. 옛 MySQL 호환을 위해 `library/locaville/dbcom.py` 가 분기.

---

## 1. 원칙

1. **모든 DB 호출은 `locaville.dbcom` 을 거친다.**
   - repositories 가 직접 `psycopg.connect` 호출 X.
   - `from locaville.dbcom import execute, fetch_one, fetch_all, transaction, DBExecutionError`
2. **SQL 은 표준 ANSI 위주.** DBMS specific 한 함수는 사용 시 dbcom 안에서 alias 처리.
3. **파라미터는 `%s` 자리표시자.** psycopg / PyMySQL 양쪽 호환.
4. **컬럼명은 backend service / repository 단계에서만 알고 있도록.** frontend 는 view + API 응답으로만 접근.

---

## 2. dbcom 의 4가지 API

```python
from locaville.dbcom import execute, fetch_one, fetch_all, transaction, DBExecutionError

# 단발 실행 (INSERT/UPDATE/DELETE 또는 SELECT one)
execute(
    "INSERT INTO journal (user_no, job_date, exec_no, ...) VALUES (%s, %s, %s, ...)",
    [user_no, job_date_str, exec_no, ...],
)

# 1 row 가져오기
row = fetch_one(
    "SELECT user_no FROM user_master WHERE login_id = %s",
    [login_id],
)

# 여러 row
rows = fetch_all(
    "SELECT * FROM vw_jeotan_journal_evidence WHERE amo_regno = %s ORDER BY job_date DESC LIMIT %s",
    [amo_regno, 30],
)

# 트랜잭션 (여러 INSERT/UPDATE 묶기)
with transaction() as conn:
    execute(sql1, params1, connection=conn, commit=False)
    execute(sql2, params2, connection=conn, commit=False)
    # context manager 종료 시 commit (예외 시 rollback)
```

---

## 3. 자주 만나는 호환 이슈

### A. AUTO_INCREMENT vs SERIAL

옛 MySQL: `id INT AUTO_INCREMENT PRIMARY KEY`
PostgreSQL: `id SERIAL PRIMARY KEY` 또는 `id BIGINT GENERATED ALWAYS AS IDENTITY`

**해결**: 신 스키마는 복합 PK 위주라 단일 increment 거의 안 씀. `journal.exec_no` 같은 채번은 backend 가 `MAX(exec_no)+1` 로 직접 계산.

### B. NULL 비교

`WHERE col = NULL` 은 양쪽 다 false. 항상 `IS NULL` / `IS NOT NULL`.

### C. 빈 string vs NULL

PostgreSQL 의 `INT` 컬럼에 빈 string `""` 전달 시 **`invalid input syntax for type integer`**.
Form 필드 (FastAPI `Form()`) 가 optional int 일 때 빈 값이면 field 자체를 안 보내야 함.

```python
# backend router
group_no: int | None = Form(default=None)  # Optional

# frontend
if (input.group_no != null) formData.set("group_no", String(input.group_no))
// 빈 string 전송 금지
```

### D. UPSERT

MySQL: `INSERT ... ON DUPLICATE KEY UPDATE ...`
PostgreSQL: `INSERT ... ON CONFLICT (...) DO UPDATE SET ...`

**해결**: 신 코드는 PostgreSQL ON CONFLICT 패턴 사용 (advice_rdb.upsert_today_advice 등). dbcom 분기 안 함.

```python
sql = """
    INSERT INTO farmer_advice (amo_regno, advice_date, scenario, content, ...)
    VALUES (%s, %s, %s, %s, ...)
    ON CONFLICT (amo_regno, advice_date)
    DO UPDATE SET
        scenario = EXCLUDED.scenario,
        content = EXCLUDED.content,
        updated_at = NOW()
"""
```

---

## 4. 새 repository 작성 패턴

```python
"""xxxx_rdb.py — 신 스키마 기반 XXXX repository."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from locaville.dbcom import DBExecutionError, execute, fetch_all, fetch_one, transaction


class XxxxConflictError(Exception):
    """동시성 충돌 / unique 위반 등 사용자에게 노출할 에러."""
    pass


def list_xxx_by_farmer(amo_regno: str, limit: int = 30) -> list[dict[str, Any]]:
    sql = "SELECT * FROM vw_jeotan_xxxx WHERE amo_regno = %s ORDER BY reg_dt DESC LIMIT %s"
    return fetch_all(sql, [amo_regno, limit])


def create_xxxx(payload: dict[str, Any]) -> dict[str, Any]:
    # 1) 정규화
    user_no = int(payload["user_no"])
    job_date_str = payload["job_date"]

    # 2) 채번 (필요 시)
    next_seq = _next_seq(user_no, job_date_str)

    # 3) INSERT (트랜잭션)
    try:
        with transaction() as conn:
            execute(sql_main, params_main, connection=conn, commit=False)
            execute(sql_sub, params_sub, connection=conn, commit=False)
    except DBExecutionError as exc:
        cause = str(exc)[:240].replace("\n", " ")
        raise XxxxConflictError(
            f"Failed to save xxxx (user_no={user_no}, job_date={job_date_str}) — {cause}"
        ) from exc

    # 4) view 로 재조회
    return get_by_id(_compose_id(user_no, job_date_str, next_seq))
```

핵심:
- DBExecutionError 의 cause 를 detail 에 포함시켜 frontend 에서 진단 가능하게.
- view 로 응답 데이터 조회 (JOIN 결과 그대로).
- 트랜잭션 안에서 `commit=False` 명시.

---

## 5. 스키마 변경 절차

1. `docs/spec/{feature}-table-spec.md` 에 변경 명세 작성 (DBA 검토용).
2. DBA 가 PostgreSQL 적용.
3. 신 컬럼 사용 코드 작성. 기존 호출처에는 영향 없게.
4. `docs/dev/dev-status-YYYY-MM-DD.md` 에 한 줄 기록.
5. 시드 데이터 (`POST /demo/seed`) 필요 시 demo_service 갱신.

**금지**:
- backend 에서 즉석 `ALTER TABLE` 실행 X.
- 기존 컬럼 rename (예: `usage` → `parcel_usage`) 후 옛 컬럼명 SELECT 시 fail. **양쪽 alias 처리 (`SELECT parcel_usage AS usage`) 또는 코드 전체 일괄 변경.**

---

## 6. 디버깅 팁

- **DBExecutionError 의 cause** 가 가장 중요. 이미 `diary_rdb._save_journal_record` 에 cause 포함 패턴 있음. 새 코드도 같은 패턴.
- **빈 string vs None** 의심 시 — FastAPI Form 의 타입을 `str` 으로 받고 backend 에서 직접 `int(x) if x else None` 로 변환.
- **`vw_jeotan_*` view** 가 정의 안 됐거나 컬럼 누락 시 — DBA 에게 view 갱신 요청.
- **`locaville.dbcom import` 실패** — `pip install -e locaville/library` 했는지 확인 (`pip show locaville`).

---

## 7. 비대상 / 안 하는 것

- ORM (SQLAlchemy 등) 도입 X — 현재 raw SQL + dbcom 패턴 유지.
- 마이그레이션 도구 (Alembic 등) 도입 X — DBA 가 직접 적용.
- DB triggers / stored procedures X — 비즈니스 로직은 backend service 에.
