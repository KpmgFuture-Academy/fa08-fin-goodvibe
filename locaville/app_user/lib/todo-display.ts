/**
 * 농가 화면 (HomeScreen / JournalScreen) 공용 — todo 를 사람 친화 문장으로 변환.
 *
 * backend 의 `todo_title` 은 "활동명 - 작업명" 처럼 시스템 친화 표기라 폰 화면에서 길고
 * 어색하게 줄바꿈됨. 화면용으론 작업명과 액션 안내를 분리해 의미 단위 두 줄로 렌더.
 *
 *   사진 증빙 필요 → primary: "중간물떼기", sub: "사진 한 장 찍어주세요"
 *   사진 불필요    → primary: "교육 이수",   sub: "해주세요"
 */
import type { TodoItemApi } from "./todo-service";

export type TodoActionMessage = {
  primary: string;
  sub: string;
};

export function buildTodoActionMessage(todo: TodoItemApi): TodoActionMessage {
  const action = (todo.job_name || todo.activity_name || "작업").trim();
  const needPhoto = (todo.required_evidence_types?.length ?? 0) > 0;
  return {
    primary: action,
    sub: needPhoto ? "사진 한 장 찍어주세요" : "해주세요",
  };
}
