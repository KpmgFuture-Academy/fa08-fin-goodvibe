"use client"

/**
 * 사업 추가 모달 — 이장님 역할에 맞춰 4 단계를 한 모달에 압축.
 *
 * 1) 참여할 사업 (radio) — DB 의 `project` 중 engage_yn='참여등록' 인 것만 노출.
 *    이장님이 직접 사업 자체를 만들 수는 없음 (정부 사업이므로 backend 가 공급).
 * 2) 배정할 단체 (radio) — 마을 단체 중 선택.
 * 3) 진행할 활동 (checkbox) — 사업·단체 선택 후 backend 의 활동 목록 fetch.
 * 4) 참여 농가 — 단체 멤버 default 전원 체크, 뺄 농가 체크 해제.
 *
 * 제출 흐름:
 *   registerEngageProjectGroup → 활동별 registerEngageProjectActivities
 *   → createEngageProjectTodos.
 */
import { useEffect, useMemo, useState } from "react"
import { Briefcase, Check, X } from "lucide-react"
import ModalPortal from "./ModalPortal"
import {
  createEngageProjectTodos,
  getEngageProjectActivities,
  getEngageProjects,
  registerEngageProjectActivities,
  registerEngageProjectGroup,
} from "@/lib/engage-project-api"
import type {
  EngageActivityItem,
  EngageMemberItem,
  EngageProjectItem,
} from "@/lib/engage-project-types"

export type AddProjectGroupOption = {
  group_no: number | string
  group_name: string
  group_type?: string
}

type Stage = "pick-project" | "pick-group" | "pick-activities" | "submitting" | "done"

export default function AddProjectModal({
  open,
  groups,
  onClose,
  onAdded,
}: {
  open: boolean
  groups: AddProjectGroupOption[]
  onClose: () => void
  onAdded: (msg: string) => void
}) {
  const [stage, setStage] = useState<Stage>("pick-project")
  const [projects, setProjects] = useState<EngageProjectItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const [pickedPrjId, setPickedPrjId] = useState<string>("")
  const [pickedGroupNo, setPickedGroupNo] = useState<string>("")
  const [activities, setActivities] = useState<EngageActivityItem[]>([])
  const [members, setMembers] = useState<EngageMemberItem[]>([])
  const [pickedActivities, setPickedActivities] = useState<Set<string>>(new Set())
  const [excludedMembers, setExcludedMembers] = useState<Set<string>>(new Set())

  const reset = () => {
    setStage("pick-project")
    setPickedPrjId("")
    setPickedGroupNo("")
    setActivities([])
    setMembers([])
    setPickedActivities(new Set())
    setExcludedMembers(new Set())
    setError("")
  }

  // 진입 시 참여 가능 사업 fetch.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    getEngageProjects()
      .then((r) => {
        if (!alive) return
        setProjects((r.items || []).filter((p) => p.engage_yn === "참여등록"))
        setError("")
      })
      .catch((err) =>
        alive && setError(err instanceof Error ? err.message : "사업 목록을 불러오지 못했어요."),
      )
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [open])

  const pickedProject = useMemo(
    () => projects.find((p) => p.prj_id === pickedPrjId),
    [projects, pickedPrjId],
  )
  const pickedGroup = useMemo(
    () => groups.find((g) => String(g.group_no) === pickedGroupNo),
    [groups, pickedGroupNo],
  )

  const close = () => {
    reset()
    onClose()
  }

  // 단계 진행 ─ 사업 선택 후 단체 선택, 단체 선택 후 활동 fetch.
  const goToGroupPick = () => {
    if (!pickedPrjId) return
    setStage("pick-group")
  }

  const goToActivityPick = async () => {
    if (!pickedPrjId || !pickedGroupNo) return
    setLoading(true)
    setError("")
    try {
      // 사업에 단체 등록 — 그래야 활동 fetch 시 그 단체 기준으로 멤버가 보임.
      await registerEngageProjectGroup(pickedPrjId, Number(pickedGroupNo))
      const view = await getEngageProjectActivities(pickedPrjId)
      setActivities(view.activities || [])
      setMembers(view.members || [])
      // 기본 — 모든 활동 선택, 모든 멤버 포함.
      setPickedActivities(new Set((view.activities || []).map((a) => a.activity_id)))
      setExcludedMembers(new Set())
      setStage("pick-activities")
    } catch (err) {
      setError(err instanceof Error ? err.message : "사업·단체를 연결하는 중 오류가 났어요.")
    } finally {
      setLoading(false)
    }
  }

  // 최종 제출 — 선택된 활동마다 멤버 등록 → todo 생성.
  const submit = async () => {
    if (!pickedPrjId || pickedActivities.size === 0) return
    setStage("submitting")
    setError("")
    try {
      const selections = members
        .filter((m) => !excludedMembers.has(m.amo_regno))
        .map((m) => ({
          amo_regno: m.amo_regno,
          parcel_nos: (m.parcels || []).map((p) => p.parcel_no),
        }))
      for (const activityId of pickedActivities) {
        await registerEngageProjectActivities(pickedPrjId, {
          activity_id: activityId,
          selections,
        })
      }
      await createEngageProjectTodos(pickedPrjId)
      setStage("done")
      onAdded(
        `${pickedProject?.biz_name || "사업"}이 마을에 배정됐어요 · ${pickedActivities.size}개 활동, 참여 ${selections.length}명`,
      )
      reset()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "사업 등록 중 오류가 났어요.")
      setStage("pick-activities")
    }
  }

  const toggleActivity = (id: string) =>
    setPickedActivities((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const toggleExclude = (amoRegno: string) =>
    setExcludedMembers((s) => {
      const n = new Set(s)
      if (n.has(amoRegno)) n.delete(amoRegno)
      else n.add(amoRegno)
      return n
    })

  const includedCount = members.length - excludedMembers.size

  return (
    <ModalPortal open={open}>
      <div className="lvb-modal-scrim" onClick={close}>
        <div
          className="lvb-modal lvb-modal-wide"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="lvb-modal-head">
            <div>
              <div className="lvb-modal-title">사업 추가</div>
              <div className="lvb-modal-sub">
                {stage === "pick-project" && "참여할 정부 사업을 골라요"}
                {stage === "pick-group" && "사업을 배정할 마을 단체를 골라요"}
                {stage === "pick-activities" && "진행할 활동과 참여 농가를 정해요"}
                {stage === "submitting" && "사업을 등록하는 중이에요…"}
              </div>
            </div>
            <button type="button" className="lvb-iconbtn" onClick={close} aria-label="닫기">
              <X size={20} />
            </button>
          </div>

          <div className="lvb-modal-body">
            {error && (
              <div
                style={{
                  background: "var(--lvb-danger-soft)",
                  color: "var(--lvb-danger)",
                  borderRadius: 12,
                  padding: "10px 14px",
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 14,
                }}
              >
                {error}
              </div>
            )}

            {/* STEP 1 — 사업 선택 */}
            {stage === "pick-project" && (
              <>
                <div className="lvb-engage-hint">
                  마을이 새로 참여할 정부 사업을 골라요. 이미 참여 중인 사업은 목록에 없어요.
                </div>
                {loading ? (
                  <div className="lvb-helper-empty">사업 목록을 불러오는 중…</div>
                ) : projects.length === 0 ? (
                  <div className="lvb-empty">
                    <span className="lvb-empty-ic">
                      <Briefcase size={26} />
                    </span>
                    <div className="lvb-empty-title">참여 가능한 사업이 없어요</div>
                    <div className="lvb-empty-sub">
                      이미 모든 사업에 참여 중이거나 공고된 사업이 없어요.
                    </div>
                  </div>
                ) : (
                  <ul className="lvb-pick-list" role="radiogroup">
                    {projects.map((p) => {
                      const on = pickedPrjId === p.prj_id
                      return (
                        <li key={p.prj_id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={on}
                            className={`lvb-pick${on ? " is-on" : ""}`}
                            onClick={() => setPickedPrjId(p.prj_id)}
                          >
                            <span className="lvb-check-box" aria-hidden="true">
                              {on && <Check size={16} />}
                            </span>
                            <div>
                              <div className="lvb-pick-name">
                                {p.biz_name || p.prj_name || p.prj_id}
                              </div>
                              <div className="lvb-pick-sub">
                                {p.prj_name && p.biz_name ? `${p.prj_name} · ` : ""}
                                {p.issuer || "주관사 미정"}
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}

            {/* STEP 2 — 단체 선택 */}
            {stage === "pick-group" && (
              <>
                <div className="lvb-engage-hint">
                  <b>{pickedProject?.biz_name || pickedProject?.prj_name}</b> 사업을 배정할
                  단체를 골라요. 단체장에게 알림이 가요.
                </div>
                <ul className="lvb-pick-list" role="radiogroup">
                  {groups.map((g) => {
                    const key = String(g.group_no)
                    const on = pickedGroupNo === key
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={on}
                          className={`lvb-pick${on ? " is-on" : ""}`}
                          onClick={() => setPickedGroupNo(on ? "" : key)}
                        >
                          <span className="lvb-check-box" aria-hidden="true">
                            {on && <Check size={16} />}
                          </span>
                          <div>
                            <div className="lvb-pick-name">{g.group_name}</div>
                            {g.group_type && (
                              <div className="lvb-pick-sub">{g.group_type}</div>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* STEP 3 — 활동 + 농가 제외 */}
            {stage === "pick-activities" && (
              <>
                <div className="lvb-engage-hint">
                  <b>{pickedGroup?.group_name}</b>이 진행할 활동을 고르고, 참여하지 않을 농가는
                  체크를 해제해요.
                </div>
                <div className="lvb-field-label">진행할 활동</div>
                {activities.length === 0 ? (
                  <div className="lvb-helper-empty">이 사업에는 등록된 활동이 없어요.</div>
                ) : (
                  <ul className="lvb-pick-list" role="group" aria-label="활동 선택">
                    {activities.map((a) => {
                      const on = pickedActivities.has(a.activity_id)
                      return (
                        <li key={a.activity_id}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            className={`lvb-pick${on ? " is-on" : ""}`}
                            onClick={() => toggleActivity(a.activity_id)}
                          >
                            <span className="lvb-check-box" aria-hidden="true">
                              {on && <Check size={16} />}
                            </span>
                            <div>
                              <div className="lvb-pick-name">
                                {a.activity_name || a.activity_id}
                              </div>
                              {a.est_end_date && (
                                <div className="lvb-pick-sub">
                                  마감 {a.est_end_date.slice(0, 10)}
                                </div>
                              )}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                <div className="lvb-field-label" style={{ marginTop: 18 }}>
                  참여 농가 ({includedCount} / {members.length}명)
                </div>
                {members.length === 0 ? (
                  <div className="lvb-helper-empty">단체에 등록된 농가가 없어요.</div>
                ) : (
                  <ul className="lvb-pick-list" role="group" aria-label="참여 농가 선택">
                    {members.map((m) => {
                      const excluded = excludedMembers.has(m.amo_regno)
                      const included = !excluded
                      return (
                        <li key={m.amo_regno}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={included}
                            className={`lvb-pick${included ? " is-on" : ""}`}
                            onClick={() => toggleExclude(m.amo_regno)}
                          >
                            <span className="lvb-check-box" aria-hidden="true">
                              {included && <Check size={16} />}
                            </span>
                            <div>
                              <div className="lvb-pick-name">
                                {m.amo_name || m.amo_regno}
                              </div>
                              <div className="lvb-pick-sub">
                                {(m.parcels || []).length > 0
                                  ? `필지 ${(m.parcels || []).length}곳`
                                  : "필지 미등록"}
                              </div>
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </>
            )}

            {stage === "submitting" && (
              <div className="lvb-empty">
                <span className="lvb-empty-ic">
                  <Briefcase size={26} />
                </span>
                <div className="lvb-empty-title">사업을 등록하는 중이에요…</div>
                <div className="lvb-empty-sub">
                  단체·활동·할 일이 만들어지고 있어요. 잠시만 기다려 주세요.
                </div>
              </div>
            )}
          </div>

          <div className="lvb-modal-foot">
            {stage === "pick-project" && (
              <>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-ghost lvb-btn-lg"
                  onClick={close}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-primary lvb-btn-lg"
                  disabled={!pickedPrjId}
                  onClick={goToGroupPick}
                >
                  <span>다음 — 단체 선택</span>
                </button>
              </>
            )}
            {stage === "pick-group" && (
              <>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-ghost lvb-btn-lg"
                  onClick={() => setStage("pick-project")}
                >
                  뒤로
                </button>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-primary lvb-btn-lg"
                  disabled={!pickedGroupNo || loading}
                  onClick={goToActivityPick}
                >
                  <span>{loading ? "단체 등록 중…" : "다음 — 활동·농가"}</span>
                </button>
              </>
            )}
            {stage === "pick-activities" && (
              <>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-ghost lvb-btn-lg"
                  onClick={() => setStage("pick-group")}
                >
                  뒤로
                </button>
                <button
                  type="button"
                  className="lvb-btn lvb-btn-primary lvb-btn-lg"
                  disabled={pickedActivities.size === 0 || includedCount === 0}
                  onClick={submit}
                >
                  <Briefcase size={22} />
                  <span>사업 등록하기</span>
                </button>
              </>
            )}
            {stage === "submitting" && (
              <button
                type="button"
                className="lvb-btn lvb-btn-ghost lvb-btn-lg"
                disabled
              >
                등록 중…
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  )
}
