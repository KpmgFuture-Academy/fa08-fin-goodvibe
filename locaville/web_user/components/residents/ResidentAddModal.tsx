"use client"

/**
 * 주민 추가/수정 모달.
 *
 * `mode="add"` 는 빈 form, `mode="edit"` 는 `initialResident` 의 값으로 시작.
 *
 * 사업/단체 dropdown 은 `useCurrentUserVillage().village.ville_id` 로 마을 단위
 * `/ville-project` 를 호출해 distinct `prj_name` / `group_name` 으로 채움.
 * (실패 시 `FALLBACK_PROJECTS` / `FALLBACK_GROUPS` 사용)
 *
 * "확인" 시 현재는 backend 로 저장되지 않고 부모의 로컬 state 만 갱신됩니다.
 * 실제 INSERT 흐름은 backend write endpoint 가 추가되면 연결.
 */
import { useEffect, useMemo, useRef, useState } from "react"

import AddressSearchPanel, { type AddressItem } from "@/components/residents/AddressSearchPanel"
import { useCurrentUserVillage } from "@/components/CurrentUserVillageContext"
import type { ParcelCrop, Resident } from "@/components/residents/ResidentListTable"
import { Btn } from "@/components/ui/Btn"
import { Modal } from "@/components/ui/Modal"
import { getProjectsByVille, type VilleProject } from "@/lib/ville-project-api"

// 마을에서 진행중인 사업/단체 fetch 가 실패하거나 비어있을 때 쓰는 fallback.
const FALLBACK_PROJECTS = ["저탄소 농업프로그램", "저탄소 농산물인증"]
const FALLBACK_GROUPS = ["aa작목반", "bb영농조합", "aa영농법인"]
// 작물 코드 dict — usage 사전이 부족해 기본값만. 화면에서는 자유입력으로도 받음.
const CROPS = ["벼", "콩", "마늘", "양파", "고추"] as const

export type ResidentModalPayload = Omit<Resident, "id" | "signupStatus" | "statusAction">
type Mode = "add" | "edit"

type FormState = {
  name: string
  phone: string
  project: string
  group: string
  address: string
  addressDetail: string
  parcelCropRows: ParcelCrop[]
}

function blankParcelCrop(): ParcelCrop {
  return { parcelName: "", crop: "" }
}

function createAddFormState(): FormState {
  return {
    name: "",
    phone: "",
    project: "",
    group: "",
    address: "",
    addressDetail: "",
    parcelCropRows: [blankParcelCrop()],
  }
}

function createEditFormState(resident: Resident | null): FormState {
  if (!resident) {
    return {
      name: "김장수",
      phone: "01022225555",
      project: "저탄소 농업프로그램",
      group: "aa작목반",
      address: "전남 고흥군 고흥읍",
      addressDetail: "고흥로 1836",
      parcelCropRows: [
        { parcelName: "앞논", crop: "벼" },
        { parcelName: "고개밭", crop: "콩" },
      ],
    }
  }

  const parcelCropRows =
    resident.parcelCrops?.length
      ? resident.parcelCrops
      : resident.parcels?.length
        ? resident.parcels.map((parcelName, index) => ({
            parcelName,
            crop: resident.crops?.[index] || resident.crop || "",
          }))
        : [blankParcelCrop()]

  return {
    name: resident.name || "",
    phone: resident.phone || "",
    project: resident.project || resident.projects?.[0] || "",
    group: resident.group || resident.groups?.[0] || "",
    address: resident.address || "전남 고흥군 고흥읍",
    addressDetail: resident.addressDetail || "고흥로 1836",
    parcelCropRows,
  }
}

export default function ResidentAddModal({
  open,
  mode = "add",
  initialResident,
  onClose,
  onSubmit,
}: {
  open: boolean
  mode?: Mode
  initialResident?: Resident | null
  onClose: () => void
  onSubmit: (resident: ResidentModalPayload) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    mode === "edit" ? createEditFormState(initialResident || null) : createAddFormState(),
  )
  const [showAddressPanel, setShowAddressPanel] = useState(false)
  const [villeProjects, setVilleProjects] = useState<VilleProject[]>([])
  const addressDetailRef = useRef<HTMLInputElement>(null)

  // 마을의 현재 사업/단체 list — open 시 1회 fetch.
  const { currentUserVillageInfo } = useCurrentUserVillage()
  const villeId = currentUserVillageInfo?.village?.ville_id || null
  useEffect(() => {
    if (!open || !villeId) return
    let cancelled = false
    void getProjectsByVille(villeId)
      .then((items) => {
        if (!cancelled) setVilleProjects(items)
      })
      .catch(() => {
        if (!cancelled) setVilleProjects([])
      })
    return () => {
      cancelled = true
    }
  }, [open, villeId])

  // 사업 dropdown — backend list 우선, 없으면 fallback.
  const projectOptions = useMemo(() => {
    const distinct = Array.from(new Set(villeProjects.map((p) => p.prj_name).filter(Boolean)))
    return distinct.length > 0 ? distinct : FALLBACK_PROJECTS
  }, [villeProjects])

  // 선택한 사업의 단체만 노출. 사업 미선택 시 마을 전체 단체.
  const groupOptions = useMemo(() => {
    const selected = form.project
      ? villeProjects.filter((p) => p.prj_name === form.project)
      : villeProjects
    const distinct = Array.from(new Set(selected.map((p) => p.group_name || "").filter(Boolean)))
    return distinct.length > 0 ? distinct : FALLBACK_GROUPS
  }, [form.project, villeProjects])

  useEffect(() => {
    if (!open) return
    setForm(mode === "edit" ? createEditFormState(initialResident || null) : createAddFormState())
    setShowAddressPanel(false)
  }, [initialResident, mode, open])

  useEffect(() => {
    if (form.group && !groupOptions.includes(form.group)) {
      setForm((prev) => ({ ...prev, group: "" }))
    }
  }, [form.group, groupOptions])

  function resetAndClose() {
    setForm(mode === "edit" ? createEditFormState(initialResident || null) : createAddFormState())
    setShowAddressPanel(false)
    onClose()
  }

  function updateField(key: Exclude<keyof FormState, "parcelCropRows">, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleFindAddress() {
    setShowAddressPanel(true)
  }

  function handleSelectAddress(item: AddressItem) {
    setForm((prev) => ({ ...prev, address: item.roadAddress }))
    window.setTimeout(() => addressDetailRef.current?.focus(), 0)
  }

  function handleAddParcelCropRow() {
    setForm((prev) => ({ ...prev, parcelCropRows: [...prev.parcelCropRows, blankParcelCrop()] }))
  }

  function handleChangeParcelCropRow(index: number, key: keyof ParcelCrop, value: string) {
    setForm((prev) => ({
      ...prev,
      parcelCropRows: prev.parcelCropRows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [key]: value } : row,
      ),
    }))
  }

  function handleRemoveParcelCropRow(index: number) {
    setForm((prev) => {
      if (prev.parcelCropRows.length <= 1) return prev
      return {
        ...prev,
        parcelCropRows: prev.parcelCropRows.filter((_, rowIndex) => rowIndex !== index),
      }
    })
  }

  function handleConfirm() {
    const name = form.name.trim()
    const phone = form.phone.trim()
    if (!name || !phone) {
      alert("이름과 휴대폰번호를 입력해주세요.")
      return
    }

    const parcelCrops = form.parcelCropRows
      .map((row) => ({
        parcelName: row.parcelName.trim(),
        crop: row.crop.trim(),
      }))
      .filter((row) => row.parcelName)

    onSubmit({
      name,
      phone,
      project: form.project || "",
      group: form.group || "",
      recentRecord: "",
      address: form.address.trim(),
      addressDetail: form.addressDetail.trim(),
      parcelCrops,
      parcels: parcelCrops.map((row) => row.parcelName),
      crops: parcelCrops.map((row) => row.crop).filter(Boolean),
      crop: parcelCrops[0]?.crop || "",
    })
    resetAndClose()
  }

  return (
    <Modal
      open={open}
      title={mode === "edit" ? "주민수정" : "주민추가"}
      onClose={resetAndClose}
      width="940px"
      footer={
        <div className="resident-add-modal-footer">
          <Btn variant="outline" onClick={resetAndClose}>
            취소
          </Btn>
          <Btn variant="primary" onClick={handleConfirm}>
            확인
          </Btn>
        </div>
      }
    >
      <div className="resident-add-modal-layout">
        <div className="resident-add-form">
          <label className="resident-add-field">
            <span>이름</span>
            <input
              value={form.name}
              placeholder="김장수"
              onChange={(event) => updateField("name", event.target.value)}
            />
          </label>

          <label className="resident-add-field">
            <span>휴대폰번호</span>
            <input
              value={form.phone}
              placeholder="01022225555"
              onChange={(event) => updateField("phone", event.target.value)}
            />
          </label>

          <label className="resident-add-field">
            <span>참여사업</span>
            <select value={form.project} onChange={(event) => updateField("project", event.target.value)}>
              <option value="">선택</option>
              {projectOptions.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </select>
          </label>

          <label className="resident-add-field">
            <span>참여단체</span>
            <select value={form.group} onChange={(event) => updateField("group", event.target.value)}>
              <option value="">선택</option>
              {groupOptions.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>

          <div className="resident-add-field resident-add-address">
            <span>집주소</span>
            <div className="resident-add-stack">
              <div className="resident-add-inline">
                <input
                  value={form.address}
                  placeholder="주소 검색 또는 직접 입력"
                  onChange={(event) => updateField("address", event.target.value)}
                />
                <Btn variant="outline" onClick={handleFindAddress}>
                  찾기
                </Btn>
              </div>
              <input
                ref={addressDetailRef}
                value={form.addressDetail}
                placeholder="상세주소 입력"
                onChange={(event) => updateField("addressDetail", event.target.value)}
              />
            </div>
          </div>

          <div className="resident-add-field">
            <span>필지/작물</span>
            <div className="resident-add-stack">
              {form.parcelCropRows.map((row, index) => (
                <div key={index} className="resident-add-inline resident-parcel-row">
                  <input
                    value={row.parcelName}
                    placeholder="필지명"
                    onChange={(event) => handleChangeParcelCropRow(index, "parcelName", event.target.value)}
                  />
                  <select
                    value={row.crop}
                    onChange={(event) => handleChangeParcelCropRow(index, "crop", event.target.value)}
                  >
                    <option value="">작물 선택</option>
                    {CROPS.map((crop) => (
                      <option key={crop} value={crop}>
                        {crop}
                      </option>
                    ))}
                  </select>
                  {index === 0 ? (
                    <Btn variant="outline" onClick={handleAddParcelCropRow}>
                      추가
                    </Btn>
                  ) : (
                    <button
                      type="button"
                      className="resident-parcel-remove"
                      onClick={() => handleRemoveParcelCropRow(index)}
                      aria-label="필지/작물 삭제"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {showAddressPanel && (
          <AddressSearchPanel onClose={() => setShowAddressPanel(false)} onSelectAddress={handleSelectAddress} />
        )}
      </div>
    </Modal>
  )
}
