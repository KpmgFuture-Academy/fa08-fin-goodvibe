"use client"

/**
 * 주민 추가 모달 — 원본 chief 디자인(lvb-modal + lvb-form-field + lvb-group-pick).
 *
 * 입력: 이름(필수) / 전화번호(필수) / 집주소·상세주소 / 필지·작물(여러 개) / 소속 단체(radio).
 * 제출 시 onAdd 콜백으로 정규화된 payload 전달. (백엔드 create_resident 가 주소·필지를 그대로 INSERT.)
 */
import { useState } from "react"
import { UserPlus, X, Plus } from "lucide-react"
import ModalPortal from "./ModalPortal"

export type ParcelCropInput = { parcelName: string; crop: string }

export type AddResidentPayload = {
  name: string
  phone: string
  address: string
  addressDetail: string
  parcelCrops: ParcelCropInput[]
  groupNo: number | null
}

export type GroupPickOption = {
  group_no: number | string
  group_name: string
  tag?: { label: string; tone: string }
}

// backend _CROP_TO_USAGE 와 정합 — 선택 작물이 parcel_usage(논/밭/과수원)로 매핑된다.
const CROPS = ["벼", "콩", "고추", "양파", "마늘", "과수원"] as const

const blankParcel = (): ParcelCropInput => ({ parcelName: "", crop: "" })

export default function AddResidentModal({
  open,
  groups,
  onClose,
  onAdd,
}: {
  open: boolean
  groups: GroupPickOption[]
  onClose: () => void
  onAdd: (payload: AddResidentPayload) => void
}) {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [addressDetail, setAddressDetail] = useState("")
  const [parcels, setParcels] = useState<ParcelCropInput[]>([blankParcel()])
  const [groupNo, setGroupNo] = useState<string>("")

  const ok = name.trim().length > 0 && phone.trim().length > 0

  const reset = () => {
    setName("")
    setPhone("")
    setAddress("")
    setAddressDetail("")
    setParcels([blankParcel()])
    setGroupNo("")
  }
  const close = () => {
    reset()
    onClose()
  }

  const updateParcel = (i: number, key: keyof ParcelCropInput, value: string) =>
    setParcels((prev) => prev.map((row, idx) => (idx === i ? { ...row, [key]: value } : row)))
  const addParcel = () => setParcels((prev) => [...prev, blankParcel()])
  const removeParcel = (i: number) =>
    setParcels((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)))

  const submit = () => {
    onAdd({
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      addressDetail: addressDetail.trim(),
      parcelCrops: parcels
        .map((row) => ({ parcelName: row.parcelName.trim(), crop: row.crop.trim() }))
        .filter((row) => row.parcelName || row.crop),
      groupNo: groupNo ? Number(groupNo) : null,
    })
    reset()
  }

  return (
    <ModalPortal open={open}>
    <div className="lvb-modal-scrim" onClick={close}>
      <div
        className="lvb-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="lvb-modal-head">
          <div>
            <div className="lvb-modal-title">주민 추가</div>
            <div className="lvb-modal-sub">새 농가를 마을 명단에 등록해요</div>
          </div>
          <button
            type="button"
            className="lvb-iconbtn"
            onClick={close}
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>

        <div className="lvb-modal-body">
          <div className="lvb-form-row">
            <label className="lvb-form-field">
              <span>
                이름 <b className="lvb-req" aria-hidden="true">*</b>
                <span className="lvb-sr">필수</span>
              </span>
              <input
                className="lvb-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예) 김복례"
                aria-required="true"
              />
            </label>
            <label className="lvb-form-field">
              <span>
                전화번호 <b className="lvb-req" aria-hidden="true">*</b>
                <span className="lvb-sr">필수</span>
              </span>
              <input
                className="lvb-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                inputMode="tel"
                aria-required="true"
              />
            </label>
          </div>

          {/* 집주소 */}
          <label className="lvb-form-field">
            <span>집주소</span>
            <input
              className="lvb-input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="예) 전라남도 고흥군 풍양면 저탄마을길 21"
            />
          </label>
          <label className="lvb-form-field">
            <span>상세주소 <span className="lvb-field-hint">(동·호수 등)</span></span>
            <input
              className="lvb-input"
              value={addressDetail}
              onChange={(e) => setAddressDetail(e.target.value)}
              placeholder="예) 2층"
            />
          </label>

          {/* 필지 / 작물 (여러 개) */}
          <div className="lvb-form-field">
            <span>필지 / 작물 <span className="lvb-field-hint">(필요한 만큼 추가하세요)</span></span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {parcels.map((row, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    className="lvb-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={row.parcelName}
                    onChange={(e) => updateParcel(i, "parcelName", e.target.value)}
                    placeholder="필지 이름 (예: 작은논)"
                  />
                  <select
                    className="lvb-input"
                    style={{ width: 120, flexShrink: 0 }}
                    value={row.crop}
                    onChange={(e) => updateParcel(i, "crop", e.target.value)}
                    aria-label="작물 선택"
                  >
                    <option value="">작물</option>
                    {CROPS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                  {i === 0 ? (
                    <button
                      type="button"
                      className="lvb-btn lvb-btn-outline lvb-btn-sm"
                      onClick={addParcel}
                      aria-label="필지 추가"
                    >
                      <Plus size={16} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="lvb-iconbtn"
                      onClick={() => removeParcel(i)}
                      aria-label="필지 삭제"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="lvb-form-field">
            <span id="add-group-q">
              소속 단체{" "}
              <span className="lvb-field-hint">(나중에 바꿀 수 있어요)</span>
            </span>
            <div
              className="lvb-group-pick"
              role="radiogroup"
              aria-labelledby="add-group-q"
            >
              {groups.length === 0 ? (
                <div className="lvb-dcard-sub">등록된 단체가 없어요</div>
              ) : (
                groups.map((g) => {
                  const key = String(g.group_no)
                  const on = groupNo === key
                  return (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      className={`lvb-group-pick-opt${on ? " is-on" : ""}`}
                      onClick={() => setGroupNo(on ? "" : key)}
                    >
                      <span className="lvb-radio" aria-hidden="true" />
                      <span className="lvb-group-pick-txt">
                        <b>{g.group_name || "이름 없는 단체"}</b>
                        {g.tag && (
                          <span className={`lvb-projtag t-${g.tag.tone === "blue" ? "blue" : g.tag.tone === "plum" ? "plum" : "green"}`}>
                            {g.tag.label}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="lvb-modal-foot">
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
            disabled={!ok}
            onClick={submit}
          >
            <UserPlus size={22} />
            <span>명단에 추가</span>
          </button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}
