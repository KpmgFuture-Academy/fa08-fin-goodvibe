/** 증빙 관련 TS 타입 정의 (EvidenceRecord + 업로드 입력 등). backend 응답 shape 와 일치. */

/** 영수증 OCR 추출 결과 (영수증으로 분류된 경우에만 채워짐). */
export type ReceiptOcr = {
  vendor?: string;
  amount?: number | null;
  date?: string;
  items?: string[];
};

/** 사진 품질 검사 결과 (OpenCV/numpy). */
export type ImageQuality = {
  engine?: string;
  checked?: boolean;
  passed?: boolean;
  blur_score?: number | null;
  brightness?: number | null;
  width?: number | null;
  height?: number | null;
  issues?: string[];
};

export type EvidenceRecord = {
  evidence_id: string;
  todo_id: string;
  group_no?: number;
  prj_id: string;
  project_id: string;
  activity_id: string;
  job_cd?: string;
  farmer_id: string;
  parcel_no: string;
  field_id: string;
  activity_type: string;
  evidence_type: string;
  confirmed_label: string;
  image_url: string;
  storage_path: string;
  original_image_path: string;
  captured_at: string;
  status: string;
  user_message: string;
  created_at: string;
  updated_at: string;
  // 업로드 시 자동 분석 결과 (backend 가 raw_json 에 보존 후 응답에 포함).
  //   classification: "receipt" | "field_photo" | "unknown"
  classification?: string;
  image_quality?: ImageQuality;
  receipt_ocr?: ReceiptOcr;
  // 영수증 OCR → 활동 추천 (rule-based). 매칭 없거나 영수증 아니면 모두 빈 값/0.
  //   suggested_activity_type  : "BIOCHAR" | "WASTE" | "FALL_TILLAGE" | "WATER_DN" | "SHALLOW" | ""
  //   suggested_activity_label : 화면용 한국어 (예: "바이오차 투입")
  //   suggested_evidence_type  : "BIOCHAR_INVOICE" 등, 없으면 ""
  //   suggested_reason         : 사용자에게 보여줄 추천 사유 한 문장
  //   suggested_confidence     : 0.0~1.0
  suggested_activity_type?: string;
  suggested_activity_label?: string;
  suggested_evidence_type?: string;
  suggested_reason?: string;
  suggested_confidence?: number;
  // 촬영 후 To-do 일치 판정 (gemini-2.5-flash). 사진류 + To-do 있을 때만 채워짐.
  //   todo_match               : "O"(맞음) | "UNCERTAIN"(애매) | "X"(불일치) | ""(미판정)
  //   needs_chief_verification : 확신 낮음/불일치 → 이장님이 꼭 확인 (제출은 막지 않음)
  todo_match?: "O" | "UNCERTAIN" | "X" | "";
  todo_match_confidence?: number;
  todo_match_reason?: string;
  needs_chief_verification?: boolean;
  // 촬영 위치 (브라우저 GPS) + 무료 역지오코딩 주소.
  gps_lat?: number | null;
  gps_long?: number | null;
  address?: string;
};

export type EvidenceUploadInput = {
  file: File;
  todo_id?: string;
  group_no?: number;
  prj_id?: string;
  project_id?: string;
  activity_id?: string;
  job_cd?: string;
  farmer_id?: string;
  parcel_no?: string;
  field_id?: string;
  activity_type: string;
  evidence_type: string;
  confirmed_label?: string;
  status?: string;
  user_message?: string;
  gps_lat?: number | null;
  gps_long?: number | null;
};

export type EvidenceUploadResult =
  | { status: "success"; record: EvidenceRecord; message: string }
  | { status: "failed"; message: string };

export type EvidenceMissingStatus = {
  activity_type: string;
  activity_code?: string;
  required_evidence_types: string[];
  submitted_evidence_types: string[];
  missing_evidence_types: string[];
  required_evidence_count: number;
  submitted_evidence_count: number;
  completion_status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "UNKNOWN_ACTIVITY";
  user_message: string;
};
