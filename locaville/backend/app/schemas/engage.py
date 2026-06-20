from __future__ import annotations

from pydantic import BaseModel


class EngageGroupRegisterRequest(BaseModel):
    group_no: int


class EngageActivityParcelSelection(BaseModel):
    amo_regno: str
    parcel_nos: list[int]


class EngageActivityMembersRegisterRequest(BaseModel):
    activity_id: str
    selections: list[EngageActivityParcelSelection]
