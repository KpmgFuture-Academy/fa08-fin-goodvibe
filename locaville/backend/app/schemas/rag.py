from __future__ import annotations

from pydantic import BaseModel, Field


class RagHeadingOption(BaseModel):
    heading_id: str
    heading_name: str
    heading_summary: str | None = None
    heading_schema: dict | None = None
    body_yn: str | None = None
    active_yn: str | None = None


class RagFileItem(BaseModel):
    file_id: str
    file_name: str
    format_type: str
    doc_name: str
    doc_cat: str
    doc_version: float
    publication_date: str | None = None
    doc_number: str | None = None
    doc_manager: str | None = None
    embedding_yn: str | None = None
    ref_heading_id: str | None = None
    ref_appendix_id: str | None = None
    body_exit_criteria: dict | None = None
    appendix_exit_criteria: dict | None = None
    schema_note: str | None = None
    vector_count: int = 0
    reg_dt: str | None = None
    mod_dt: str | None = None


class RagFileListResponse(BaseModel):
    items: list[RagFileItem] = Field(default_factory=list)


class RagFileDetailResponse(BaseModel):
    item: RagFileItem | None = None
    heading_schema: dict | None = None
    appendix_schema: dict | None = None
    runtime_heading_schema: dict | None = None
    runtime_appendix_schema: dict | None = None
    templates: list[RagHeadingOption] = Field(default_factory=list)


class RagPreparsePreviewBlock(BaseModel):
    title: str | None = None
    text: str
    section: str | None = None


class RagPreparseHeadingRow(BaseModel):
    row_id: str
    depth: int
    rule_id: str | None = None
    notation: str
    display_notation: str | None = None
    occurrence_count: int = 0
    matched_samples: list[str] = Field(default_factory=list)
    action: str
    pattern: str | None = None
    rule_type: str | None = None
    rule_options: dict | None = None
    location: str | None = None
    name: str | None = None
    is_new: bool = False


class RagPreparseResponse(BaseModel):
    file_name: str
    format_type: str
    doc_name: str
    file_id: str
    doc_cat: str
    doc_version: float
    publication_date: str | None = None
    doc_number: str | None = None
    doc_manager: str | None = None
    ref_heading_id: str
    ref_appendix_id: str | None = None
    body_exit_criteria: dict | None = None
    appendix_exit_criteria: dict | None = None
    heading_schema: dict
    appendix_schema: dict | None = None
    schema_note: str | None = None
    heading_rows: list[RagPreparseHeadingRow] = Field(default_factory=list)
    appendix_heading_rows: list[RagPreparseHeadingRow] = Field(default_factory=list)
    preview_blocks: list[RagPreparsePreviewBlock] = Field(default_factory=list)
    templates: list[RagHeadingOption] = Field(default_factory=list)


class RagRegisterResponse(BaseModel):
    ok: bool
    file_id: str


class RagDeleteResponse(BaseModel):
    ok: bool
    file_id: str
    deleted_vector_count: int = 0
    embedding_deleted: bool = False


class RagFileBasicInfoUpdateRequest(BaseModel):
    doc_cat: str
    doc_version: float
    publication_date: str | None = None
    doc_number: str | None = None
    doc_manager: str | None = None


class RagFileBasicInfoUpdateResponse(BaseModel):
    ok: bool
    file_id: str


class RagEmbeddingRecord(BaseModel):
    chunk_id: str
    heading_path: str | None = None
    chunk_loc: str | None = None
    location: str | None = None
    block_type: str | None = None
    content: str
    content_preview: str
    content_length: int
    newline_count: int | None = None
    line_count: int | None = None
    source_order_start: int | None = None
    source_order_end: int | None = None
    metadata: dict | None = None


class RagEmbeddingResponse(BaseModel):
    ok: bool
    file_id: str
    preview_only: bool = False
    embedding_model: str
    parsed_segment_count: int
    chunk_count: int
    inserted_count: int
    records: list[RagEmbeddingRecord] = Field(default_factory=list)


class RagVectorRecordPageResponse(BaseModel):
    file_id: str
    offset: int = 0
    limit: int = 50
    total_count: int = 0
    has_more: bool = False
    records: list[RagEmbeddingRecord] = Field(default_factory=list)
