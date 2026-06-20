import type {
  RagDeleteResponse,
  RagEmbeddingResponse,
  RagFileBasicInfoUpdatePayload,
  RagFileBasicInfoUpdateResponse,
  RagFileDetailResponse,
  RagFileListResponse,
  RagHeadingOption,
  RagPreparseResponse,
  RagRegisterResponse,
  RagVectorRecordPageResponse,
} from "@/lib/rag-types"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000"

export const RAG_ADMIN_CONNECTION_ERROR_MESSAGE =
  "백엔드에 연결할 수 없습니다. FastAPI 서버 실행 상태를 확인해 주세요."

function buildUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString()
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    })
  } catch {
    throw new Error(RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`API ${response.status}: ${text || response.statusText}`)
  }
  return (await response.json()) as T
}

export async function getRagFiles(): Promise<RagFileListResponse> {
  return requestJson<RagFileListResponse>(buildUrl("/rag"))
}

export async function getRagFileDetail(fileId: string): Promise<RagFileDetailResponse> {
  return requestJson<RagFileDetailResponse>(buildUrl(`/rag/${encodeURIComponent(fileId)}`))
}

export async function updateRagFileBasicInfo(
  fileId: string,
  payload: RagFileBasicInfoUpdatePayload,
): Promise<RagFileBasicInfoUpdateResponse> {
  return requestJson<RagFileBasicInfoUpdateResponse>(buildUrl(`/rag/${encodeURIComponent(fileId)}`), {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
}

export async function getRagVectorRecords(
  fileId: string,
  args?: { offset?: number; limit?: number },
): Promise<RagVectorRecordPageResponse> {
  const offset = Math.max(0, Number(args?.offset || 0))
  const limit = Math.min(50, Math.max(1, Number(args?.limit || 50)))
  return requestJson<RagVectorRecordPageResponse>(
    buildUrl(`/rag/${encodeURIComponent(fileId)}/vectors?offset=${offset}&limit=${limit}`),
  )
}

export async function getRagHeadings(): Promise<RagHeadingOption[]> {
  return requestJson<RagHeadingOption[]>(buildUrl("/rag/headings"))
}

export function getRagOriginalFileUrl(fileId: string): string {
  return buildUrl(`/rag/${encodeURIComponent(fileId)}/original`)
}

export async function preparseRagDocument(
  file: File,
  refHeadingId: string,
  refAppendixId?: string,
  args?: {
    bodyExitCriteria?: Record<string, unknown> | null
    appendixExitCriteria?: Record<string, unknown> | null
  },
): Promise<RagPreparseResponse> {
  const form = new FormData()
  form.append("file", file)
  form.append("ref_heading_id", refHeadingId)
  if (refAppendixId) form.append("ref_appendix_id", refAppendixId)
  if (args?.bodyExitCriteria) form.append("body_exit_criteria", JSON.stringify(args.bodyExitCriteria))
  if (args?.appendixExitCriteria) form.append("appendix_exit_criteria", JSON.stringify(args.appendixExitCriteria))
  let response: Response
  try {
    response = await fetch(buildUrl("/rag/pre-parse"), {
      method: "POST",
      body: form,
      cache: "no-store",
    })
  } catch {
    throw new Error(RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const json = (await response.json()) as { detail?: string }
      if (json?.detail) detail = json.detail
    } catch {
      // ignore
    }
    throw new Error(`API ${response.status}: ${detail}`)
  }
  return (await response.json()) as RagPreparseResponse
}

export async function registerRagDocument(args: {
  file: File
  file_id: string
  file_name: string
  format_type: string
  doc_name: string
  doc_cat: string
  doc_version: number
  publication_date?: string | null
  doc_number?: string | null
  doc_manager?: string | null
  ref_heading_id?: string | null
  ref_appendix_id?: string | null
  body_exit_criteria?: Record<string, unknown> | null
  appendix_exit_criteria?: Record<string, unknown> | null
  heading_schema: Record<string, unknown>
  appendix_schema?: Record<string, unknown> | null
  schema_note?: string | null
}): Promise<RagRegisterResponse> {
  const form = new FormData()
  form.append("file", args.file)
  form.append("file_id", args.file_id)
  form.append("file_name", args.file_name)
  form.append("format_type", args.format_type)
  form.append("doc_name", args.doc_name)
  form.append("doc_cat", args.doc_cat)
  form.append("doc_version", String(args.doc_version))
  if (args.publication_date) form.append("publication_date", args.publication_date)
  if (args.doc_number) form.append("doc_number", args.doc_number)
  if (args.doc_manager) form.append("doc_manager", args.doc_manager)
  if (args.ref_heading_id) form.append("ref_heading_id", args.ref_heading_id)
  if (args.ref_appendix_id) form.append("ref_appendix_id", args.ref_appendix_id)
  if (args.body_exit_criteria) form.append("body_exit_criteria", JSON.stringify(args.body_exit_criteria))
  if (args.appendix_exit_criteria) form.append("appendix_exit_criteria", JSON.stringify(args.appendix_exit_criteria))
  form.append("heading_schema", JSON.stringify(args.heading_schema))
  if (args.appendix_schema) form.append("appendix_schema", JSON.stringify(args.appendix_schema))
  if (args.schema_note) form.append("schema_note", args.schema_note)

  let response: Response
  try {
    response = await fetch(buildUrl("/rag/register"), {
      method: "POST",
      body: form,
      cache: "no-store",
    })
  } catch {
    throw new Error(RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const json = (await response.json()) as { detail?: string }
      if (json?.detail) detail = json.detail
    } catch {
      // ignore
    }
    throw new Error(`API ${response.status}: ${detail}`)
  }
  return (await response.json()) as RagRegisterResponse
}

export async function deleteRagDocument(fileId: string): Promise<RagDeleteResponse> {
  let response: Response
  try {
    response = await fetch(buildUrl(`/rag/${encodeURIComponent(fileId)}`), {
      method: "DELETE",
      cache: "no-store",
    })
  } catch {
    throw new Error(RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const json = (await response.json()) as { detail?: string }
      if (json?.detail) detail = json.detail
    } catch {
      // ignore
    }
    throw new Error(`API ${response.status}: ${detail}`)
  }
  return (await response.json()) as RagDeleteResponse
}

export async function runRagEmbedding(
  fileId: string,
  args?: { dbUpdate?: boolean },
): Promise<RagEmbeddingResponse> {
  const dbUpdate = args?.dbUpdate ?? true
  let response: Response
  try {
    response = await fetch(
      buildUrl(`/rag/${encodeURIComponent(fileId)}/embedding?db_update=${dbUpdate ? "true" : "false"}`),
      {
      method: "POST",
      cache: "no-store",
      },
    )
  } catch {
    throw new Error(RAG_ADMIN_CONNECTION_ERROR_MESSAGE)
  }
  if (!response.ok) {
    let detail = response.statusText
    try {
      const json = (await response.json()) as { detail?: string }
      if (json?.detail) detail = json.detail
    } catch {
      // ignore
    }
    throw new Error(`API ${response.status}: ${detail}`)
  }
  return (await response.json()) as RagEmbeddingResponse
}
