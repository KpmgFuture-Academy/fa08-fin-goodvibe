"use client"

import { Fragment, use, useCallback, useEffect, useMemo, useState } from "react"
import { Building2, MapPinned, RefreshCw, Users } from "lucide-react"
import { PageHeader } from "@/components/ui/PageHeader"
import { Btn } from "@/components/ui/Btn"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import {
  getVillageDetail,
  VILLAGE_CONNECTION_ERROR_MESSAGE,
} from "@/lib/village-api"
import type {
  VillageDetailVillage,
  VillageFamilyItem,
  VillageGroupItem,
} from "@/lib/village-types"

const infoLabelStyle = {
  fontSize: 13,
  fontWeight: 800,
  color: "var(--muted)",
  marginBottom: 6,
} as const

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "—"
  }
  return String(value)
}

function formatVillageAddress(village: VillageDetailVillage) {
  const zipCode = formatValue(village.zip_cd)
  const addr1 = formatValue(village.addr_1)
  const addr2 = village.addr_2 ? `, ${village.addr_2}` : ""
  const nx = formatValue(village.nx)
  const ny = formatValue(village.ny)
  return `(${zipCode}) ${addr1}${addr2} (기상 격자: NX ${nx} / NY ${ny})`
}

function formatVillageChief(village: VillageDetailVillage) {
  const chiefName = formatValue(village.chief_name)
  const phoneNo = formatValue(village.phone_no)
  return `${chiefName}, (전화) ${phoneNo}`
}

function formatFamilyAddress(family: VillageFamilyItem) {
  const zipCode = formatValue(family.zip_cd)
  const addr1 = family.addr_1 ? String(family.addr_1).trim() : ""
  const addr2 = family.addr_2 ? String(family.addr_2).trim() : ""
  const address = [addr1, addr2].filter(Boolean).join(" ")
  return `(${zipCode}) ${address || "—"}`
}

function MemberList({ family }: { family: VillageFamilyItem }) {
  if (!family.members.length) {
    return <span className="muted">소속 농민 없음</span>
  }

  const leaderMember =
    family.members.find((member) => Number(member.user_no) === Number(family.chief_no)) || null
  const orderedMembers = [
    ...(leaderMember ? [leaderMember] : []),
    ...family.members.filter((member) => Number(member.user_no) !== Number(family.chief_no)),
  ]

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {orderedMembers.map((member) => (
        <div
          key={`${family.amo_regno}-${member.user_no}`}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--line-soft)",
            background: "#fff",
          }}
        >
          <div style={{ fontWeight: 700, color: "var(--ink)" }}>
            {member.user_name || "이름 없음"}
            {Number(member.user_no) === Number(family.chief_no) ? " (대표자)" : ""}
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 4 }}>
            사용자번호 {member.user_no} / 농민등록번호 {formatValue(member.farmer_regno)}
          </div>
          <div style={{ fontSize: 14, color: "var(--muted)", marginTop: 2 }}>
            연락처 {formatValue(member.phone_no)} / 상태 {formatValue(member.status_cd)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function VillageDetailPage({
  params,
}: {
  params: Promise<{ ville_id: string }>
}) {
  const { ville_id } = use(params)
  const [village, setVillage] = useState<VillageDetailVillage | null>(null)
  const [groups, setGroups] = useState<VillageGroupItem[]>([])
  const [families, setFamilies] = useState<VillageFamilyItem[]>([])
  const [selectedFamilyRegno, setSelectedFamilyRegno] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getVillageDetail(ville_id)
      setVillage(data.village || null)
      setGroups(data.groups || [])
      setFamilies(data.families || [])
      setSelectedFamilyRegno("")
    } catch (e) {
      setError(e instanceof Error ? e.message : VILLAGE_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [ville_id])

  useEffect(() => {
    void load()
  }, [load])

  const memberCount = useMemo(
    () => families.reduce((sum, family) => sum + (family.farmer_count || 0), 0),
    [families],
  )

  return (
    <div>
      <PageHeader
        title={village?.ville_name || "마을 상세"}
        sub={`${ville_id} 마을의 기본 정보, 단체, 농가/농민 구성을 확인합니다.`}
        backHref="/village"
        actions={
          <Btn icon={<RefreshCw size={16} />} onClick={() => void load()} disabled={loading}>
            새로고침
          </Btn>
        }
      />

      {error && <div className="alert alert-error">오류: {error}</div>}

      {loading ? (
        <Card>
          <div className="loading">불러오는 중...</div>
        </Card>
      ) : !village ? (
        <Card>
          <div className="tbl-empty muted" style={{ padding: 48 }}>
            해당 마을 정보를 찾을 수 없습니다.
          </div>
        </Card>
      ) : (
        <>
          <Card>
            <CardHead title="마을 기본 정보" />
            <CardBody>
              <div
                style={{
                  display: "grid",
                  gap: 20,
                  padding: 20,
                  border: "1px solid var(--line-soft)",
                  borderRadius: 16,
                  background: "var(--bg-soft)",
                }}
              >
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink)" }}>
                    {formatValue(village.ville_name)} ({formatValue(village.ville_id)})
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px minmax(0, 1fr)",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>주소</div>
                  <div style={{ fontSize: 18, lineHeight: 1.7, color: "var(--ink)" }}>
                    {formatVillageAddress(village)}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "90px minmax(0, 1fr)",
                    gap: 12,
                    alignItems: "start",
                  }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--muted)" }}>대표</div>
                  <div style={{ fontSize: 18, lineHeight: 1.7, color: "var(--ink)" }}>
                    {formatVillageChief(village)}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHead
              title="마을 단체 목록"
              sub="ville_group"
              note={`${groups.length}개 단체`}
              action={<Building2 size={18} color="var(--accent)" />}
            />
            <CardBody>
              {groups.length === 0 ? (
                <div className="tbl-empty muted">등록된 마을 단체가 없습니다.</div>
              ) : (
                <div className="table-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>단체번호</th>
                        <th>단체명</th>
                        <th>단체유형</th>
                        <th>단체등록번호</th>
                        <th>대표명</th>
                        <th>연락처</th>
                        <th>주소</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <tr key={group.group_no}>
                          <td className="cell-mono">{group.group_no}</td>
                          <td>{formatValue(group.group_name)}</td>
                          <td>{formatValue(group.group_type_cd)}</td>
                          <td className="cell-mono">{formatValue(group.group_regno)}</td>
                          <td>{formatValue(group.chief_name)}</td>
                          <td>{formatValue(group.phone_no)}</td>
                          <td>{formatValue(group.addr_1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHead
              title="농가 목록 및 소속 농민"
              sub="amo_family, farmer"
              note={`농가 ${families.length}개 / 소속 농민 ${memberCount}명`}
              action={<Users size={18} color="var(--accent)" />}
            />
            <CardBody>
              {families.length === 0 ? (
                <div className="tbl-empty muted">등록된 농가가 없습니다.</div>
              ) : (
                <div style={{ display: "grid", gap: 18 }}>
                  <div className="table-wrap">
                    <table className="tbl tbl-clickable">
                      <thead>
                        <tr>
                          <th>농업경영체명</th>
                          <th>대표자</th>
                          <th>구성원수</th>
                          <th>구성원</th>
                          <th style={{ textAlign: "right" }}>상세</th>
                        </tr>
                      </thead>
                      <tbody>
                        {families.map((family) => {
                          const isOpen = selectedFamilyRegno === family.amo_regno
                          const leaderMember =
                            family.members.find(
                              (member) => Number(member.user_no) === Number(family.chief_no),
                            ) || null
                          const membersExcludingChief = family.members.filter(
                            (member) => Number(member.user_no) !== Number(family.chief_no),
                          )
                          const memberNames = [
                            leaderMember?.user_name || family.chief_name || "",
                            ...membersExcludingChief.map((member) => member.user_name || "").filter(Boolean),
                          ].filter(Boolean)
                          return (
                            <Fragment key={family.amo_regno}>
                              <tr
                                onClick={() =>
                                  setSelectedFamilyRegno((prev) =>
                                    prev === family.amo_regno ? "" : family.amo_regno,
                                  )
                                }
                                style={isOpen ? { background: "var(--bg-soft)" } : undefined}
                              >
                                <td className="cell-name">{formatValue(family.amo_name)}</td>
                                <td>{formatValue(family.chief_name)}</td>
                                <td>{memberNames.length}명</td>
                                <td>
                                  {memberNames.length > 0 ? (
                                    memberNames.join(", ")
                                  ) : (
                                    <span className="muted">—</span>
                                  )}
                                </td>
                                <td style={{ textAlign: "right" }}>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setSelectedFamilyRegno((prev) =>
                                        prev === family.amo_regno ? "" : family.amo_regno,
                                      )
                                    }}
                                    style={{
                                      border: 0,
                                      background: "transparent",
                                      padding: 0,
                                      color: "var(--accent-dark)",
                                      font: "inherit",
                                      fontWeight: 700,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {isOpen ? "▼ 닫기" : "▶ 펼치기"}
                                  </button>
                                </td>
                              </tr>
                              {isOpen ? (
                                <tr>
                                  <td colSpan={5} style={{ padding: 0, background: "#fff" }}>
                                    <section
                                      style={{
                                        borderTop: "1px solid var(--line-soft)",
                                        background: "#fff",
                                      }}
                                    >
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                          gap: 14,
                                          padding: "14px 18px",
                                          background: "#fff",
                                        }}
                                      >
                                        <div>
                                          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>
                                            농업경영체 번호
                                          </div>
                                          <div style={{ fontSize: 16, fontWeight: 400, color: "var(--ink)", marginTop: 6 }}>
                                            {formatValue(family.amo_regno)}
                                          </div>
                                        </div>
                                        <div
                                          style={{ minWidth: 0 }}
                                        >
                                          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>
                                            법인등록번호
                                          </div>
                                          <div style={{ fontSize: 16, fontWeight: 400, color: "var(--ink)", marginTop: 6 }}>
                                            {formatValue(family.co_regno)}
                                          </div>
                                        </div>
                                        <div>
                                          <div style={{ fontSize: 15, fontWeight: 800, color: "var(--muted)" }}>
                                            사업자등록번호
                                          </div>
                                          <div style={{ fontSize: 16, fontWeight: 400, color: "var(--ink)", marginTop: 6 }}>
                                            {formatValue(family.tax_regno)}
                                          </div>
                                        </div>
                                      </div>

                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                                          gap: 18,
                                          padding: 18,
                                        }}
                                      >
                                        <div style={{ display: "grid", gap: 10 }}>
                                          <div>
                                            <div style={infoLabelStyle}>주소</div>
                                            <div>{formatFamilyAddress(family)}</div>
                                          </div>
                                          <div>
                                            <div style={infoLabelStyle}>연락처</div>
                                            <div>{formatValue(family.phone_no)}</div>
                                          </div>
                                        </div>
                                        <div>
                                          <div style={{ ...infoLabelStyle, marginBottom: 10 }}>
                                            소속농민({memberNames.length}명)
                                          </div>
                                          <MemberList family={family} />
                                        </div>
                                      </div>
                                    </section>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
