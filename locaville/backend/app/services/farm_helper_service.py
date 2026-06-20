"""기록 도우미(`farm_helper`) 비즈니스 로직.

규칙:
  - **1:1 보장** — helper / recipient 둘 다 동시에 다른 active/pending 관계가 있으면 reject.
  - **assign 직후 양쪽에 notification INSERT** (INVITE) — helper 와 recipient 가 동의 필요.
  - **양방향 동의** 후에야 active (DB 측 강제 X, 조회 시 derive).
  - 이장님만 assign/revoke. 동의는 본인만.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any

from app.repositories import farm_helper_rdb as fh_repo
from app.repositories.notification_rdb import insert_notification


class HelperAssignmentError(RuntimeError):
    """1:1 규칙 위반 등 도우미 배정 실패 — 라우터가 400 으로 변환."""


class HelperNotFoundError(RuntimeError):
    """대상 도움 관계가 존재하지 않음 — 라우터가 404 로 변환."""


class HelperForbiddenError(RuntimeError):
    """본인이 아닌 사용자가 동의 시도 등 — 403."""


def assign_helper_pair(
    *,
    helper_user_no: int,
    recipient_user_no: int,
    est_end_date: _date,
    chief_user_no: int | None = None,
) -> dict[str, Any]:
    """이장님이 helper-recipient 도움 관계를 배정.

    - 자기 자신을 자기 자신의 helper 로 둘 수 없음
    - helper / recipient 양쪽 모두 다른 진행중 관계가 있으면 reject
    - INSERT 후 양쪽에 INVITE 알림 자동 발송
    """
    if helper_user_no == recipient_user_no:
        raise HelperAssignmentError("도우미와 농가는 서로 다른 사람이어야 해요.")

    existing_for_helper = fh_repo.get_active_or_pending_for_helper(helper_user_no)
    if existing_for_helper:
        raise HelperAssignmentError(
            f"이미 다른 농가({existing_for_helper.get('recipient_name') or existing_for_helper['recipient_user_no']})를 돕고 있어요. "
            "기존 관계를 먼저 해제해 주세요."
        )

    existing_for_recipient = fh_repo.get_active_or_pending_for_recipient(recipient_user_no)
    if existing_for_recipient:
        raise HelperAssignmentError(
            f"해당 농가는 이미 다른 도우미({existing_for_recipient.get('helper_name') or existing_for_recipient['helper_user_no']})가 있어요. "
            "기존 관계를 먼저 해제해 주세요."
        )

    help_seq = fh_repo.insert_assignment(
        helper_user_no=helper_user_no,
        recipient_user_no=recipient_user_no,
        est_end_date=est_end_date,
        reg_no=chief_user_no,
    )

    # 양쪽에 INVITE 알림 — 동의 요청. action_url 은 frontend 의 동의 화면.
    _try_notify_invite(
        user_no=helper_user_no,
        title="기록을 도와드릴까요?",
        content="이장님께서 다른 농가의 기록을 도와달라고 부탁하셨어요. 한번 확인해 주세요.",
        related_no=help_seq,
        reg_no=chief_user_no,
    )
    _try_notify_invite(
        user_no=recipient_user_no,
        title="기록을 도와드린대요",
        content="이장님께서 다른 분께 내 기록을 도와드리라고 부탁하셨어요. 한번 확인해 주세요.",
        related_no=help_seq,
        reg_no=chief_user_no,
    )

    return fh_repo.get_pair(helper_user_no, help_seq) or {
        "helper_user_no": helper_user_no,
        "help_seq": help_seq,
        "recipient_user_no": recipient_user_no,
    }


def approve_pair(*, helper_user_no: int, help_seq: int, user_no: int) -> dict[str, Any]:
    """본인(helper 또는 recipient)이 자신의 동의 row 를 update.

    user_no 가 helper/recipient 어느 쪽도 아니면 403.
    """
    pair = fh_repo.get_pair(helper_user_no, help_seq)
    if not pair:
        raise HelperNotFoundError("해당 도움 관계가 없습니다.")

    if user_no == pair["helper_user_no"]:
        fh_repo.approve_by_helper(helper_user_no=helper_user_no, help_seq=help_seq, mod_no=user_no)
    elif user_no == pair["recipient_user_no"]:
        fh_repo.approve_by_recipient(helper_user_no=helper_user_no, help_seq=help_seq, mod_no=user_no)
    else:
        raise HelperForbiddenError("본인의 동의만 처리할 수 있어요.")

    updated = fh_repo.get_pair(helper_user_no, help_seq)
    return updated or pair


def revoke_helper_pair(
    *,
    helper_user_no: int,
    help_seq: int,
    chief_user_no: int | None = None,
) -> dict[str, Any]:
    """이장님이 해제. 양쪽에 종료 알림."""
    pair = fh_repo.get_pair(helper_user_no, help_seq)
    if not pair:
        raise HelperNotFoundError("해당 도움 관계가 없습니다.")
    ok = fh_repo.revoke_pair(helper_user_no=helper_user_no, help_seq=help_seq, mod_no=chief_user_no)
    if ok:
        _try_notify_invite(
            user_no=pair["helper_user_no"],
            title="도움이 끝났어요",
            content="이장님께서 도움을 마무리하셨어요. 이제 다른 농가의 기록은 남길 수 없어요.",
            related_no=help_seq,
            reg_no=chief_user_no,
            content_cd="HLP_REV",
        )
        _try_notify_invite(
            user_no=pair["recipient_user_no"],
            title="도움이 끝났어요",
            content="이장님께서 도움을 마무리하셨어요. 이제 직접 기록을 남겨 주세요.",
            related_no=help_seq,
            reg_no=chief_user_no,
            content_cd="HLP_REV",
        )
    return fh_repo.get_pair(helper_user_no, help_seq) or pair


def get_current_helper_role(user_no: int) -> dict[str, Any]:
    """user_no 가 지금 helper / recipient / none 중 어떤 역할인지 + 상대방 정보.

    응답:
      { role: "helper"|"recipient"|"none",
        pair: {... farm_helper row ...} | null }
    """
    as_helper = fh_repo.get_active_or_pending_for_helper(user_no)
    if as_helper:
        return {"role": "helper", "pair": as_helper}
    as_recipient = fh_repo.get_active_or_pending_for_recipient(user_no)
    if as_recipient:
        return {"role": "recipient", "pair": as_recipient}
    return {"role": "none", "pair": None}


def _try_notify_invite(
    *,
    user_no: int,
    title: str,
    content: str,
    related_no: int | None,
    reg_no: int | None,
    content_cd: str = "HLP_INV",
) -> None:
    """notification INSERT, 실패는 swallow (도움 관계 작업 자체를 막지 않음)."""
    try:
        insert_notification(
            user_no=user_no,
            sender_cd="C",  # Chief
            content_cd=content_cd,
            title=title,
            content=content,
            action_url="/help-consent",  # frontend 동의 화면 (추후 구현)
            related_no=related_no,
            reg_no=reg_no,
        )
    except Exception:  # noqa: BLE001
        pass
