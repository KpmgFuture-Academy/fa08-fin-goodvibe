"use client"

/**
 * 농업인 단체관리 페이지 (`/farmer-groups`).
 *
 * 화면 구조 (팀장님 브랜치 참고, main 디자인 시스템으로 재작성):
 *   - 상단: PageHeader + StatCard 3개 (전체 단체 / 소속 농가 / 미배정 농가)
 *   - 좌측(2fr): 단체 목록 카드 — 클릭 시 펼침
 *   - 우측(1fr): 미배정 농가 카드
 *   - 하단 전체폭: 선택된 단체의 농가 명단 표
 *   - 모달: 최근 활동/참여 사업 (단체 단위)
 *
 * 토큰: docs/design-system 기준 (.card, .stat-card, .btn-*, --primary 등)
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, RefreshCw, Users, UserCheck, AlertCircle } from "lucide-react"

import { Badge } from "@/components/ui/Badge"
import { Btn } from "@/components/ui/Btn"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { EmptyState } from "@/components/ui/EmptyState"
import { Modal } from "@/components/ui/Modal"
import { PageHeader } from "@/components/ui/PageHeader"
import { StatCard } from "@/components/ui/StatCard"
import { getFarmerGroups } from "@/lib/farmer-groups-api"
import type { FarmerGroup, FarmerGroupsViewModel } from "@/lib/farmer-groups-types"

const emptyView: FarmerGroupsViewModel = {
  source: "empty",
  groups: [],
  unassignedFarmers: [],
  totals: { averageMembers: 0, totalGroups: 0, totalMembers: 0, totalUnassigned: 0 },
}

function groupBadge(group: FarmerGroup) {
  if (group.attentionCount > 0) return <Badge tone="warn" label="확인 필요" />
  return <Badge tone="ok" label="참여중" />
}

export default function FarmerGroupsPage() {
  const router = useRouter()
  const [view, setView] = useState<FarmerGroupsViewModel>(emptyView)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [modalGroup, setModalGroup] = useState<FarmerGroup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const next = await getFarmerGroups()
      setView(next)
      // 진입 시 URL hash (예: #100001) 가 있으면 그 단체를 우선 선택.
      const hash = typeof window !== "undefined" ? decodeURIComponent(window.location.hash.slice(1)) : ""
      setSelectedGroupId((current) => {
        if (hash && next.groups.some((g) => g.groupId === hash)) return hash
        if (current && next.groups.some((g) => g.groupId === current)) return current
        return next.groups[0]?.groupId ?? null
      })
    } catch (e) {
      setView(emptyView)
      setSelectedGroupId(null)
      setError(e instanceof Error ? e.message : "단체 정보를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  const selectedGroup = useMemo(
    () => view.groups.find((g) => g.groupId === selectedGroupId) ?? null,
    [selectedGroupId, view.groups],
  )

  return (
    <div>
      <PageHeader
        title="농업인 단체관리"
        sub="단체별 소속 농가와 대표자, 미배정 농가를 한 화면에서 관리합니다."
        actions={
          <>
            <Btn variant="ghost" onClick={() => router.push("/dashboard")}>
              대시보드
            </Btn>
            <Btn icon={<RefreshCw size={16} />} onClick={() => void loadGroups()} disabled={loading}>
              새로고침
            </Btn>
          </>
        }
      />

      {/* KPI — 단체 / 소속 / 미배정 */}
      <div className="stat-grid">
        <StatCard
          icon={<Users size={18} />}
          label="전체 단체"
          value={`${view.totals.totalGroups}개`}
          sub="관리 중인 단체"
        />
        <StatCard
          icon={<UserCheck size={18} />}
          label="소속 농가"
          value={`${view.totals.totalMembers}명`}
          sub="단체에 연결된 농가"
        />
        <StatCard
          icon={<AlertCircle size={18} />}
          label="미배정 농가"
          value={`${view.totals.totalUnassigned}명`}
          sub="단체 배정 확인 필요"
          warn={view.totals.totalUnassigned > 0}
        />
      </div>

      {error && <div className="alert alert-error">오류: {error}</div>}

      {/* 좌(단체 목록 2fr) + 우(미배정 1fr) 2열 */}
      <div className="split-2-1" style={{ marginBottom: 20 }}>
        <Card>
          <CardHead title="단체 목록" sub="작목반 단위 소속 현황" note={`${view.groups.length}개`} />
          <CardBody>
            {loading ? (
              <div className="loading">단체 정보를 불러오는 중...</div>
            ) : view.groups.length === 0 ? (
              <EmptyState
                icon={<Users size={32} />}
                title="표시할 단체가 없습니다"
                description="backend 에서 내려온 단체 소속 데이터가 아직 없어요."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {view.groups.map((group) => {
                  const active = selectedGroup?.groupId === group.groupId
                  return (
                    <div
                      key={group.groupId}
                      style={{
                        border: `1px solid ${active ? "var(--accent)" : "var(--line-soft)"}`,
                        borderRadius: 12,
                        background: active ? "var(--accent-soft)" : "var(--card)",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        aria-expanded={active}
                        onClick={() =>
                          setSelectedGroupId((cur) => (cur === group.groupId ? null : group.groupId))
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "14px 16px",
                          background: "transparent",
                          border: 0,
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>
                            {group.name}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                            대표 <strong style={{ color: "var(--ink-soft)" }}>{group.leaderName}</strong> ·{" "}
                            {group.memberCount}명 · 배정 {group.assignmentCount}건
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          {groupBadge(group)}
                          {active ? (
                            <ChevronUp size={18} style={{ color: "var(--muted)" }} />
                          ) : (
                            <ChevronDown size={18} style={{ color: "var(--muted)" }} />
                          )}
                        </div>
                      </button>

                      {active && (
                        <div
                          style={{
                            padding: "12px 16px",
                            borderTop: "1px solid var(--line-soft)",
                            display: "grid",
                            gridTemplateColumns: "repeat(3, 1fr)",
                            gap: 10,
                            fontSize: 13,
                          }}
                        >
                          <div>
                            <div style={{ color: "var(--muted)" }}>대표 연락처</div>
                            <div style={{ fontWeight: 700, color: "var(--ink)" }}>{group.leaderPhone}</div>
                          </div>
                          <div>
                            <div style={{ color: "var(--muted)" }}>참여 사업</div>
                            <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                              {group.projects.length}개
                            </div>
                          </div>
                          <div>
                            <div style={{ color: "var(--muted)" }}>최근 마감</div>
                            <div style={{ fontWeight: 700, color: "var(--ink)" }}>
                              {group.lastActivityDate}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHead
            title="미배정 농가"
            sub="단체 소속 미확정 농가"
            note={`${view.unassignedFarmers.length}명`}
          />
          <CardBody>
            {!loading && view.unassignedFarmers.length === 0 ? (
              <EmptyState
                icon={<UserCheck size={28} />}
                title="미배정 농가 없음"
                description="모든 농가가 단체에 배정되어 있어요."
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {view.unassignedFarmers.map((farmer) => (
                  <div
                    key={farmer.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 12px",
                      border: "1px solid var(--line-soft)",
                      borderRadius: 10,
                      background: "var(--bg-soft)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>
                        {farmer.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                        {farmer.phone} · 배정 {farmer.assignmentCount}건
                      </div>
                    </div>
                    <Badge tone="warn" label={farmer.status} />
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      {/* 선택된 단체의 농가 명단 (전체폭) */}
      <Card>
        <CardHead
          title={selectedGroup ? `${selectedGroup.name} 소속 농가` : "소속 농가"}
          sub={
            selectedGroup
              ? `대표 ${selectedGroup.leaderName} · ${selectedGroup.memberCount}명 · 확인 필요 ${selectedGroup.attentionCount}명`
              : "단체 목록에서 단체를 열면 농가 명단이 표시됩니다."
          }
          action={
            selectedGroup && (
              <Btn size="sm" variant="outline" onClick={() => setModalGroup(selectedGroup)}>
                최근 활동 / 참여 사업
              </Btn>
            )
          }
        />
        <CardBody>
          {!selectedGroup ? (
            <EmptyState
              icon={<Users size={32} />}
              title="열린 단체가 없습니다"
              description="위 단체 목록에서 단체를 열어 주세요."
            />
          ) : selectedGroup.members.length === 0 ? (
            <EmptyState title="소속 농가 없음" description="이 단체에 등록된 농가가 없습니다." />
          ) : (
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>농업인</th>
                    <th>연락처</th>
                    <th>배정 작업</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedGroup.members.map((member) => (
                    <tr key={member.farmerId}>
                      <td>
                        <div className="cell-name">{member.name}</div>
                        <div className="muted" style={{ fontSize: 13 }}>
                          {member.farmerId}
                        </div>
                      </td>
                      <td>{member.phone}</td>
                      <td>{member.assignmentCount}건</td>
                      <td>
                        <Badge
                          tone={member.status === "참여중" ? "ok" : "warn"}
                          label={member.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 단체 단위 최근 활동 / 참여 사업 모달 */}
      <Modal
        open={!!modalGroup}
        title={modalGroup ? `${modalGroup.name} — 최근 활동 / 참여 사업` : ""}
        onClose={() => setModalGroup(null)}
        width="720px"
      >
        {modalGroup && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <section>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
                최근 활동
              </h3>
              <div
                style={{
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--bg-soft)",
                  border: "1px solid var(--line-soft)",
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: "var(--ink-soft)",
                }}
              >
                {modalGroup.lastActivityDate !== "-"
                  ? `${modalGroup.lastActivityDate} 기준 `
                  : "현재 기준 "}
                {modalGroup.memberCount}명 소속 농가, {modalGroup.assignmentCount}건 배정 작업,{" "}
                {modalGroup.projects.length}개 참여 사업이 확인되었습니다.
              </div>
            </section>

            <section>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)", margin: "0 0 8px" }}>
                참여 사업
              </h3>
              {modalGroup.projects.length === 0 ? (
                <EmptyState
                  title="참여 사업 없음"
                  description="backend 기준 연결된 참여 사업이 없습니다."
                />
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {modalGroup.projects.map((project) => (
                    <div
                      key={project.projectId}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        border: "1px solid var(--line-soft)",
                        borderRadius: 10,
                        background: "var(--card)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>
                          {project.name}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                          {project.period}
                        </div>
                      </div>
                      <Badge tone="neutral" label={project.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </Modal>
    </div>
  )
}
