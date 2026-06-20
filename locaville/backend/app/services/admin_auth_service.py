"""관리자 로그인 인증 서비스."""
from __future__ import annotations

from typing import Any

from locaville.dbcom import DBExecutionError, fetch_one


class AdminLoginError(RuntimeError):
    """관리자 로그인 검증 실패."""


def _get_bcrypt_module() -> Any:
    try:
        import bcrypt  # type: ignore
    except ImportError as exc:  # pragma: no cover - 환경 의존
        raise RuntimeError("bcrypt 라이브러리가 설치되어 있지 않습니다.") from exc
    return bcrypt


def authenticate_admin(*, login_id: str, password: str) -> dict[str, Any]:
    """admin 테이블의 bcrypt 해시와 비교해 관리자 로그인을 검증합니다."""
    normalized_login_id = (login_id or "").strip()
    if not normalized_login_id or not password:
        raise AdminLoginError("로그인 ID와 비밀번호를 입력해 주세요.")

    try:
        row = fetch_one(
            """
            SELECT admin_no, login_id, name, passwd, status_cd
            FROM public.admin
            WHERE login_id = %s
            LIMIT 1
            """,
            [normalized_login_id],
        )
    except DBExecutionError as exc:
        raise RuntimeError(f"관리자 로그인 조회에 실패했습니다: {exc}") from exc

    if not row:
        raise AdminLoginError("로그인 ID 또는 비밀번호가 올바르지 않습니다.")

    hashed_password = row.get("passwd")
    if not isinstance(hashed_password, str) or len(hashed_password) != 60:
        raise AdminLoginError("저장된 관리자 비밀번호 형식이 올바르지 않습니다.")

    bcrypt = _get_bcrypt_module()
    try:
        password_ok = bcrypt.checkpw(
            password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except ValueError as exc:
        raise AdminLoginError("저장된 관리자 비밀번호 형식이 올바르지 않습니다.") from exc

    if not password_ok:
        raise AdminLoginError("로그인 ID 또는 비밀번호가 올바르지 않습니다.")

    return {
        "admin_no": row.get("admin_no"),
        "login_id": row.get("login_id") or normalized_login_id,
        "name": row.get("name") or normalized_login_id,
        "status_cd": row.get("status_cd") or "",
    }
