/** prj_id / project_id 만 참조하므로 컴포넌트 타입에 의존하지 않는 최소 구조 타입. */
interface ProjectIdLike {
  prj_id?: string;
  project_id?: string;
}

/**
 * Business 객체에서 backend 호출에 쓸 prj_id 후보를 뽑는 헬퍼.
 *
 * 예전엔 PRJ2026LC / PRJ2026PUB 같은 옛 ID alias 매핑이 있었지만, 사업 목록 자체를 backend
 * `/project` 에서 동적으로 받기로 한 이후 별도 alias 가 필요없어졌습니다.
 * 그래서 이 헬퍼는 단순히 prj_id / project_id 를 정리해서 돌려줍니다.
 */
export function resolveProjectIdForApi(business: ProjectIdLike) {
  const prjId = (business.prj_id || "").trim();
  const projectId = (business.project_id || "").trim();
  const primary = prjId || projectId;
  const keys = Array.from(new Set([prjId, projectId].filter(Boolean)));
  return {
    prj_id: primary,
    project_id: projectId || primary,
    keys,
  };
}
