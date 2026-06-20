// todo_id 생성 규칙의 유일한 출처(single source of truth)입니다.
// backend의 app/utils/todo_id.py와 완전히 동일한 규칙을 사용합니다.
// 형식: {group_no}-{prj_id}-{activity_id}-{job_cd}
// 구분자는 반드시 `-` 를 사용합니다.

interface TodoIdParts {
  group_no?: number | string | null;
  prj_id?: string | null;
  activity_id?: string | null;
  job_cd?: string | null;
}

/**
 * todo_id를 표준 형식으로 생성합니다.
 *
 * 규칙:
 * - 형식: {group_no}-{prj_id}-{activity_id}-{job_cd}
 * - null/undefined/빈 값은 빈 문자열("")로 처리합니다.
 * - 구분자는 `-` 고정입니다. 변경 금지.
 * - 새 랜덤 ID를 생성하지 않습니다.
 *
 * 기존 저장된 record와의 호환:
 * - 기존에 저장된 todo_id도 이 함수와 동일한 형식이므로 호환됩니다.
 */
export function buildTodoId({ group_no, prj_id, activity_id, job_cd }: TodoIdParts): string {
  const safeGroup = group_no != null ? String(group_no) : "";
  const safePrj = (prj_id ?? "").trim();
  const safeActivity = (activity_id ?? "").trim();
  const safeJob = (job_cd ?? "").trim();
  return `${safeGroup}-${safePrj}-${safeActivity}-${safeJob}`;
}

/**
 * selectedTodo 또는 저장 record에서 todo_id를 안전하게 가져옵니다.
 * todo_id가 이미 있으면 그대로 반환하고, 없으면 구성요소로 생성합니다.
 */
export function resolveTodoId(parts: TodoIdParts & { todo_id?: string | null }): string {
  // 기존 todo_id가 있으면 그대로 사용합니다. 호환성 최우선.
  if (parts.todo_id) return parts.todo_id;
  return buildTodoId(parts);
}
