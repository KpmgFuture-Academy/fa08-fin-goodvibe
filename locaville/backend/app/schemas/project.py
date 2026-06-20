from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class ProjectActivityItem(BaseModel):
    prj_id: str
    activity_id: str
    activity_name: str
    activity_rule: dict[str, object] | None = None
    description: str | None = None
    est_start_date: str | None = None
    est_end_date: str | None = None
    subsidy_amt: float | None = None
    subsidy_amt_display: float = 0
    source_flag: str = "db_registered"
    target_parcel_codes: list[str] = Field(default_factory=list)
    target_parcels: list[str] = Field(default_factory=list)
    target_parcel_names: str | None = None


class ProjectParcelOption(BaseModel):
    code: str
    code_name: str


class ProjectCodeOption(BaseModel):
    code: str
    code_name: str


class ProjectFarmJobOption(BaseModel):
    job_cd: str
    job_name: str | None = None


class ProjectJobItem(BaseModel):
    prj_id: str
    activity_id: str
    activity_name: str
    job_seq: int
    job_cd: str
    job_name: str | None = None
    exec_point_cd: str | None = None
    exec_point_name: str | None = None
    ref_job_cd: str | None = None
    ref_job_name: str | None = None
    est_start_date: str | None = None
    start_date_rule: str | None = None
    est_end_date: str | None = None
    end_date_rule: str | None = None
    mandatory_yn: str | None = None
    evidence_yn: str | None = None
    target_parcel_codes: list[str] = Field(default_factory=list)
    target_parcels: list[str] = Field(default_factory=list)
    target_parcel_names: str | None = None


class ProjectActivityUpdateRequest(BaseModel):
    activity_name: str
    activity_rule: dict[str, object] | None = None
    description: str | None = None
    est_start_date: date | None = None
    est_end_date: date | None = None
    subsidy_amt_display: float
    parcel_codes: list[str] = Field(default_factory=list)


class ProjectActivityCreateRequest(ProjectActivityUpdateRequest):
    activity_id: str


class ProjectJobUpdateRequest(BaseModel):
    job_seq: int | None = None
    job_cd: str
    exec_point_cd: str | None = None
    ref_job_cd: str | None = None
    est_start_date: date | None = None
    start_date_rule: str | None = None
    est_end_date: date | None = None
    end_date_rule: str | None = None
    mandatory_yn: bool = False
    evidence_yn: bool = False


class ProjectJobCreateRequest(ProjectJobUpdateRequest):
    pass


class ProjectItem(BaseModel):
    prj_id: str
    project_id: str
    prj_name: str
    exec_year: int | None = None
    biz_id: str
    biz_name: str
    post_date: str | None = None
    issuer: str | None = None
    rag_file_id: str | None = None
    activity_count: int = 0
    activities: list[ProjectActivityItem] = Field(default_factory=list)


class ProjectListResponse(BaseModel):
    items: list[ProjectItem]


class ProjectUpdateRequest(BaseModel):
    project_id: str | None = None
    auto_generate_project_id: bool = True
    prj_name: str
    biz_id: str
    exec_year: int | None = None
    post_date: date | None = None
    issuer: str | None = None
    rag_file_id: str | None = None


class ProjectDetailResponse(BaseModel):
    project: ProjectItem | None = None
    parcel_options: list[ProjectParcelOption] = Field(default_factory=list)
    jobs: list[ProjectJobItem] = Field(default_factory=list)
    job_options: list[ProjectFarmJobOption] = Field(default_factory=list)
    exec_point_options: list[ProjectCodeOption] = Field(default_factory=list)


class ProjectJobSetupResponse(BaseModel):
    ok: bool
    prj_id: str
    activity_id: str
    jobs: list[ProjectJobItem] = Field(default_factory=list)
    job_options: list[ProjectFarmJobOption] = Field(default_factory=list)
    exec_point_options: list[ProjectCodeOption] = Field(default_factory=list)
    repeat_count: int = 1
    repeat_job_cd: str | None = None
    repeat_job_name: str | None = None
    repeat_job_drafts: list["ProjectJobRepeatDraftItem"] = Field(default_factory=list)


class ProjectJobRepeatDraftItem(BaseModel):
    exec_point_cd: str | None = None
    ref_job_code_query: str | None = None
    ref_job_cd: str | None = None
    est_start_date: str | None = None
    start_date_rule: str | None = None
    est_end_date: str | None = None
    end_date_rule: str | None = None
    mandatory: bool = True
    evidence: bool = True


class ProjectBaseBusinessItem(BaseModel):
    biz_id: str
    biz_name: str
    biz_overview: str | None = None


class ProjectBaseBusinessListResponse(BaseModel):
    items: list[ProjectBaseBusinessItem] = Field(default_factory=list)


class ProjectCreateRequest(BaseModel):
    """사업 신규 등록 — 시연 단계 schema.

    최소 필수는 ``prj_name``. 시행령 초안 페이지가 자동으로 채워 보내는 추가 메타
    (host_org/exec_org/purpose/target_crops/target_regions/support_conditions/
    budget_total_krw/contact/end_date) 는 schema 에 받아두지만 DB 컬럼이 있는 것만
    실제로 INSERT 된다 — 나머지는 RAG 청크로 영구 보존.
    """

    prj_name: str
    project_id: str | None = None
    auto_generate_project_id: bool = True
    rag_file_id: str | None = None
    biz_id: str | None = None
    biz_name: str | None = None
    biz_overview: str | None = None
    exec_year: int | None = None
    start_date: date | None = None
    end_date: date | None = None
    host_org: str | None = None
    exec_org: str | None = None
    purpose: str | None = None
    target_crops: list[str] = Field(default_factory=list)
    target_regions: list[str] = Field(default_factory=list)
    support_conditions: list[str] = Field(default_factory=list)
    budget_total_krw: int | None = None
    contact: str | None = None


class ProjectCreateResponse(BaseModel):
    ok: bool
    prj_id: str
    biz_id: str


class ProjectFromRagBasicRequest(BaseModel):
    rag_file_id: str


class ProjectFromRagBasicSuggested(BaseModel):
    prj_name: str | None = None
    issuer: str | None = None
    exec_year: int | None = None
    post_date: str | None = None


class ProjectFromRagBasicResponse(BaseModel):
    ok: bool
    rag_file_id: str
    suggested: ProjectFromRagBasicSuggested


class ProjectFromRagActivitySuggestionItem(BaseModel):
    suggestion_id: str
    activity_name: str
    source_flag: str = "rag_suggested"
    source_type: str | None = None
    detail_text: str | None = None
    match_score: int | None = None
    exact_label_match_count: int | None = None
    activity_header_count: int | None = None


class ProjectFromRagActivityResponse(BaseModel):
    ok: bool
    prj_id: str
    rag_file_id: str
    items: list[ProjectFromRagActivitySuggestionItem] = Field(default_factory=list)


class ProjectFromRagActivityRuleRequest(BaseModel):
    activity_name: str
    description: str | None = None


class ProjectFromRagActivityRuleResponse(BaseModel):
    ok: bool
    prj_id: str
    activity_rule_suggestion: dict[str, object] | None = None


class ProjectUpdateResponse(BaseModel):
    ok: bool
    prj_id: str


class ProjectDeleteResponse(ProjectUpdateResponse):
    pass


class ProjectActivityUpdateResponse(BaseModel):
    ok: bool
    prj_id: str
    activity_id: str


class ProjectActivityCreateResponse(ProjectActivityUpdateResponse):
    pass


class ProjectActivityDeleteResponse(ProjectActivityUpdateResponse):
    pass


class ProjectJobUpdateResponse(ProjectActivityUpdateResponse):
    job_seq: int


class ProjectJobCreateResponse(ProjectJobUpdateResponse):
    pass


class ProjectJobDeleteResponse(ProjectJobUpdateResponse):
    pass
