export type RagHeadingOption = {
  heading_id: string
  heading_name: string
  heading_summary?: string | null
  heading_schema?: Record<string, unknown> | null
  body_yn?: string | null
  active_yn?: string | null
}

export type RagFileItem = {
  file_id: string
  file_name: string
  format_type: string
  doc_name: string
  doc_cat: string
  doc_version: number
  publication_date?: string | null
  doc_number?: string | null
  doc_manager?: string | null
  embedding_yn?: string | null
  ref_heading_id?: string | null
  ref_appendix_id?: string | null
  body_exit_criteria?: Record<string, unknown> | null
  appendix_exit_criteria?: Record<string, unknown> | null
  schema_note?: string | null
  vector_count: number
  reg_dt?: string | null
  mod_dt?: string | null
}

export type RagFileListResponse = {
  items: RagFileItem[]
}

export type RagFileDetailResponse = {
  item?: RagFileItem | null
  heading_schema?: Record<string, unknown> | null
  appendix_schema?: Record<string, unknown> | null
  runtime_heading_schema?: Record<string, unknown> | null
  runtime_appendix_schema?: Record<string, unknown> | null
  templates: RagHeadingOption[]
}

export type RagPreparsePreviewBlock = {
  title?: string | null
  text: string
  section?: string | null
}

export type RagPreparseHeadingRow = {
  row_id: string
  depth: number
  rule_id?: string | null
  notation: string
  display_notation?: string | null
  occurrence_count: number
  matched_samples: string[]
  action: string
  pattern?: string | null
  rule_type?: string | null
  rule_options?: Record<string, unknown> | null
  location?: string | null
  name?: string | null
  is_new: boolean
}

export type RagPreparseResponse = {
  file_name: string
  format_type: string
  doc_name: string
  file_id: string
  doc_cat: string
  doc_version: number
  publication_date?: string | null
  doc_number?: string | null
  doc_manager?: string | null
  ref_heading_id: string
  ref_appendix_id?: string | null
  body_exit_criteria?: Record<string, unknown> | null
  appendix_exit_criteria?: Record<string, unknown> | null
  heading_schema: Record<string, unknown>
  appendix_schema?: Record<string, unknown> | null
  schema_note?: string | null
  heading_rows: RagPreparseHeadingRow[]
  appendix_heading_rows: RagPreparseHeadingRow[]
  preview_blocks: RagPreparsePreviewBlock[]
  templates: RagHeadingOption[]
}

export type RagRegisterResponse = {
  ok: boolean
  file_id: string
}

export type RagDeleteResponse = {
  ok: boolean
  file_id: string
  deleted_vector_count: number
  embedding_deleted: boolean
}

export type RagFileBasicInfoUpdatePayload = {
  doc_cat: string
  doc_version: number
  publication_date?: string | null
  doc_number?: string | null
  doc_manager?: string | null
}

export type RagFileBasicInfoUpdateResponse = {
  ok: boolean
  file_id: string
}

export type RagEmbeddingRecord = {
  chunk_id: string
  heading_path?: string | null
  chunk_loc?: string | null
  location?: string | null
  block_type?: string | null
  content: string
  content_preview: string
  content_length: number
  newline_count?: number | null
  line_count?: number | null
  source_order_start?: number | null
  source_order_end?: number | null
  metadata?: Record<string, unknown> | null
}

export type RagEmbeddingResponse = {
  ok: boolean
  file_id: string
  preview_only?: boolean
  embedding_model: string
  parsed_segment_count: number
  chunk_count: number
  inserted_count: number
  records: RagEmbeddingRecord[]
}

export type RagVectorRecordPageResponse = {
  file_id: string
  offset: number
  limit: number
  total_count: number
  has_more: boolean
  records: RagEmbeddingRecord[]
}
