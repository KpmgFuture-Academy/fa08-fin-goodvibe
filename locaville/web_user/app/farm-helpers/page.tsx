"use client"

/**
 * 기록 도우미 (`/farm-helpers`) — 이장님이 마을 주민 한 분에게 다른 분의 영농 기록을
 * 대신 도울 권한을 1:1 로 부여하는 화면.
 *
 * - 현재 진행 중(active+pending) 도움 관계 list
 * - "도우미 새로 지정" 모달 (helper 농가 select + recipient 농가 select + 종료일)
 * - 양방향 동의 chip (helper / recipient 각각 동의 여부 표시)
 * - 해제 버튼 (이장님 권한)
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import { HeartHandshake, Plus, X, ChevronDown } from "lucide-react"

import {
  BACKEND_CONNECTION_ERROR_MESSAGE,
  assignFarmHelper,
  getAdminSummary,
  listFarmHelpers,
  revokeFarmHelper,
  type FarmHelperPair,
} from "@/lib/admin-api"
import type { AdminSummary, FarmerDiarySummary } from "@/lib/admin-types"
import { PageHeader } from "@/components/ui/PageHeader"
import { Card, CardBody, CardHead } from "@/components/ui/Card"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"

type ResidentOption = {
  user_no: number
  user_name: string
  amo_regno: string
}

function todayPlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function formatDate(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`
}

export default function FarmHelpersPage() {
  const { currentUserVillageInfo } = useCurrentUserVillage()
  const villeId = (currentUserVillageInfo?.village?.ville_id || "").trim() || "VILLEJT001"
  const chiefUserNo = currentUserVillageInfo?.user?.user_no ?? undefined

  const [pairs, setPairs] = useState<FarmHelperPair[]>([])
  const [residents, setResidents] = useState<ResidentOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [assignOpen, setAssignOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const [list, summary] = await Promise.all([
        listFarmHelpers(villeId).catch(() => [] as FarmHelperPair[]),
        getAdminSummary().catch(() => null as AdminSummary | null),
      ])
      setPairs(list)
      const opts: ResidentOption[] = (summary?.diaries_by_farmer || [])
        .filter((f: FarmerDiarySummary) => !!f.user_no && !!f.user_name)
        .map((f: FarmerDiarySummary) => ({
          user_no: f.user_no as number,
          user_name: f.user_name || f.amo_name || f.farmer_name || `농가 ${f.user_no}`,
          amo_regno: f.amo_regno || f.farmer_id,
        }))
      // 중복 user_no 제거 (summary 가 같은 농가를 사업별로 여러 번 줄 수 있음)
      const dedup = new Map<number, ResidentOption>()
      for (const o of opts) if (!dedup.has(o.user_no)) dedup.set(o.user_no, o)
      setResidents(Array.from(dedup.values()))
    } catch (e) {
      setError(e instanceof Error ? e.message : BACKEND_CONNECTION_ERROR_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [villeId])

  useEffect(() => {
    void load()
  }, [load])

  async function handleRevoke(p: FarmHelperPair) {
    if (
      !window.confirm(
        `${p.helper_name || p.helper_user_no}님이 ${p.recipient_name || p.recipient_user_no}님을 돕는 관계를 해제할까요?`,
      )
    )
      return
    try {
      await revokeFarmHelper(p.helper_user_no, p.help_seq, chiefUserNo)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "해제에 실패했어요.")
    }
  }

  return (
    <div>
      <PageHeader
        title="기록 도우미"
        sub="마을 주민 한 분이 다른 분의 영농 기록을 대신 도와요. (1:1)"
        actions={
          <Btn
            variant="primary"
            size="lg"
            icon={<Plus size={18} />}
            onClick={() => setAssignOpen(true)}
            disabled={loading || residents.length < 2}
          >
            도우미 새로 지정
          </Btn>
        }
      />

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>오류: {error}</div>}

      <Card
        style={{
          borderRadius: 14,
          borderLeft: "4px solid var(--primary)",
          boxShadow: "0 2px 6px rgba(31, 42, 31, 0.04)",
        }}
      >
        <CardHead
          title="진행 중인 도움 관계"
          sub="동의 완료된 관계만 실제 대리 기록이 가능해요"
          note={`${pairs.length}건`}
        />
        <CardBody>
          {loading ? (
            <p className="muted" style={{ padding: 20, textAlign: "center", fontSize: 14, fontWeight: 600 }}>
              불러오는 중이에요…
            </p>
          ) : pairs.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <HeartHandshake size={42} style={{ color: "var(--muted)", margin: "0 auto 10px" }} />
              <p style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", margin: 0 }}>
                아직 지정된 도우미가 없어요
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, fontWeight: 600 }}>
                고령 농가가 직접 기록하기 어려우면 다른 주민을 도우미로 지정할 수 있어요.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pairs.map((p) => (
                <PairRow key={`${p.helper_user_no}-${p.help_seq}`} pair={p} onRevoke={() => void handleRevoke(p)} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <AssignHelperModal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        residents={residents}
        chiefUserNo={chiefUserNo}
        onAssigned={async () => {
          setAssignOpen(false)
          await load()
        }}
      />
    </div>
  )
}

function PairRow({ pair, onRevoke }: { pair: FarmHelperPair; onRevoke: () => void }) {
  const helperOk = !!pair.helper_approved_at
  const recipientOk = !!pair.recipient_approved_at
  const statusLabel = pair.is_active ? "활성" : "동의 대기"
  const statusColor = pair.is_active ? "var(--primary)" : "var(--warn)"

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: 10,
        background: "var(--card)",
        border: "1px solid var(--line-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span
          style={{
            background: "var(--bg-soft)",
            color: "var(--primary)",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          도우미
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>
          {pair.helper_name || `user ${pair.helper_user_no}`}
        </span>
        <ApproveChip ok={helperOk} label="동의" />

        <span style={{ color: "var(--muted)", margin: "0 4px", fontSize: 16 }}>→</span>

        <span
          style={{
            background: "var(--bg-soft)",
            color: "var(--warn)",
            padding: "6px 10px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 800,
          }}
        >
          농가
        </span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)" }}>
          {pair.recipient_name || `user ${pair.recipient_user_no}`}
        </span>
        <ApproveChip ok={recipientOk} label="동의" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 800,
            padding: "3px 8px",
            borderRadius: 999,
            color: "#fff",
            background: statusColor,
          }}
        >
          {statusLabel}
        </span>
        <span style={{ fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 }}>
          ~ {formatDate(pair.est_end_date)}
        </span>
      </div>

      <Btn variant="outline" size="sm" icon={<X size={14} />} onClick={onRevoke}>
        해제
      </Btn>
    </div>
  )
}

function ApproveChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 999,
        background: ok ? "var(--primary)" : "var(--bg-soft)",
        color: ok ? "#fff" : "var(--muted)",
        border: ok ? "none" : "1px solid var(--line)",
      }}
    >
      {ok ? `✓ ${label}` : `${label} 대기`}
    </span>
  )
}

function AssignHelperModal({
  open,
  onClose,
  residents,
  chiefUserNo,
  onAssigned,
}: {
  open: boolean
  onClose: () => void
  residents: ResidentOption[]
  chiefUserNo: number | undefined
  onAssigned: () => Promise<void> | void
}) {
  const [helperUserNo, setHelperUserNo] = useState<number | "">("")
  const [recipientUserNo, setRecipientUserNo] = useState<number | "">("")
  const [estEndDate, setEstEndDate] = useState<string>(todayPlus(30))
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState("")

  useEffect(() => {
    if (open) {
      setHelperUserNo("")
      setRecipientUserNo("")
      setEstEndDate(todayPlus(30))
      setErr("")
    }
  }, [open])

  const valid = useMemo(
    () => helperUserNo !== "" && recipientUserNo !== "" && helperUserNo !== recipientUserNo && !!estEndDate,
    [helperUserNo, recipientUserNo, estEndDate],
  )

  async function handleSubmit() {
    if (!valid || submitting) return
    setSubmitting(true)
    setErr("")
    try {
      await assignFarmHelper({
        helper_user_no: Number(helperUserNo),
        recipient_user_no: Number(recipientUserNo),
        est_end_date: estEndDate,
        chief_user_no: chiefUserNo,
      })
      await onAssigned()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "지정에 실패했어요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="도우미 새로 지정"
      footer={
        <>
          <Btn variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Btn>
          <Btn variant="primary" onClick={() => void handleSubmit()} disabled={!valid || submitting}>
            {submitting ? "지정 중…" : "지정하기"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", fontWeight: 600, margin: 0, lineHeight: 1.6 }}>
          도우미 한 분이 농가 한 분의 영농 기록을 대신 작성할 수 있게 권한을 부여합니다.
          두 분 모두 동의해야 실제로 기록이 가능합니다.
        </p>

        <FieldSelect
          label="도와주는 주민 (도우미)"
          value={helperUserNo}
          options={residents}
          onChange={setHelperUserNo}
          excludeUserNo={recipientUserNo === "" ? undefined : Number(recipientUserNo)}
        />

        <FieldSelect
          label="도움 받는 농가"
          value={recipientUserNo}
          options={residents}
          onChange={setRecipientUserNo}
          excludeUserNo={helperUserNo === "" ? undefined : Number(helperUserNo)}
        />

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>예정 종료일</label>
          <input
            type="date"
            value={estEndDate}
            min={todayPlus(0)}
            onChange={(e) => setEstEndDate(e.target.value)}
            style={{
              padding: "10px 12px",
              border: "1px solid var(--line)",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: "var(--ink)",
              background: "#fff",
            }}
          />
          <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600 }}>
            이 날 이후엔 자동으로 해제되지 않아요. 이장님이 직접 해제해 주세요.
          </span>
        </div>

        {err && (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--danger-soft, #fbeaea)",
              color: "var(--danger, #b44)",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {err}
          </div>
        )}
      </div>
    </Modal>
  )
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
  excludeUserNo,
}: {
  label: string
  value: number | ""
  options: ResidentOption[]
  onChange: (v: number | "") => void
  excludeUserNo?: number
}) {
  const filtered = excludeUserNo !== undefined ? options.filter((o) => o.user_no !== excludeUserNo) : options
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>{label}</label>
      <div style={{ position: "relative" }}>
        <select
          value={value === "" ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          style={{
            width: "100%",
            padding: "10px 36px 10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--ink)",
            background: "#fff",
            appearance: "none",
          }}
        >
          <option value="">— 주민 선택 —</option>
          {filtered.map((o) => (
            <option key={o.user_no} value={o.user_no}>
              {o.user_name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", pointerEvents: "none" }}
        />
      </div>
    </div>
  )
}
