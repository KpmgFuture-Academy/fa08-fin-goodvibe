"""관리자 정보 조회/수정 서비스."""
from __future__ import annotations

from typing import Any

from locaville.dbcom import DBExecutionError, execute, fetch_one


class AdminProfileError(RuntimeError):
    """관리자 정보 처리 실패."""


def _get_bcrypt_module() -> Any:
    try:
        import bcrypt  # type: ignore
    except ImportError as exc:  # pragma: no cover - 환경 의존
        raise AdminProfileError("bcrypt 라이브러리가 설치되어 있지 않습니다.") from exc
    return bcrypt


def get_admin_profile(*, admin_no: int) -> dict[str, Any] | None:
    """admin_no 기준 관리자 정보를 조회합니다."""
    try:
        row = fetch_one(
            """
            SELECT admin_no, login_id, name, phone_no, email, status_cd
            FROM public.admin
            WHERE admin_no = %s
            LIMIT 1
            """,
            [admin_no],
        )
    except DBExecutionError as exc:
        raise AdminProfileError(f"관리자 정보 조회에 실패했습니다: {exc}") from exc

    if not row:
        return None

    return {
        "admin_no": row.get("admin_no"),
        "login_id": row.get("login_id") or "",
        "name": row.get("name") or "",
        "phone_no": row.get("phone_no") or "",
        "email": row.get("email") or "",
        "status_cd": row.get("status_cd") or "",
    }


def update_admin_profile(
    *,
    admin_no: int,
    phone_no: str | None = None,
    email: str | None = None,
    password: str | None = None,
) -> dict[str, Any] | None:
    """관리자 비밀번호/전화번호/이메일을 수정합니다."""
    current = get_admin_profile(admin_no=admin_no)
    if current is None:
        return None

    assignments: list[str] = []
    params: list[Any] = []

    if phone_no is not None:
        assignments.append("phone_no = %s")
        params.append(phone_no.strip() or None)

    if email is not None:
        assignments.append("email = %s")
        params.append(email.strip() or None)

    if password is not None and password != "":
        bcrypt = _get_bcrypt_module()
        hashed_password = bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(),
        ).decode("utf-8")
        assignments.append("passwd = %s")
        params.append(hashed_password)

    if not assignments:
        return current

    assignments.extend(
        [
            "mod_dt = CURRENT_TIMESTAMP",
            "mod_no = %s",
        ]
    )
    params.append(admin_no)
    params.append(admin_no)

    sql = f"""
        UPDATE public.admin
        SET {", ".join(assignments)}
        WHERE admin_no = %s
    """

    try:
        affected = execute(sql, params)
    except DBExecutionError as exc:
        raise AdminProfileError(f"관리자 정보 수정에 실패했습니다: {exc}") from exc

    if affected <= 0:
        return None

    return get_admin_profile(admin_no=admin_no)
