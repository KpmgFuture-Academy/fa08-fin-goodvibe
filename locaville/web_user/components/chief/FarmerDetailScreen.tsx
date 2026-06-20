"use client";

/**
 * FarmerDetailScreen — 농가 상세(lvb-detail-hero / lvb-dcard / lvb-panel).
 */

import {
  AlertCircle, ArrowLeft, Camera, Check, FileText, HeartHandshake, Phone, Send,
} from "lucide-react";
import { STATE_LABEL, type Farmer } from "./chief-ui";

export interface ActItem { name: string; due: string; done: boolean; overdue: boolean; }
export interface ProjPanel { pid: string; biz: string; tag: { label: string; tone: string }; done: number; total: number; acts: ActItem[]; }
export interface EvidenceCell { id: string; status: "review" | "confirmed" | "retake"; label: string; when: string; img: string; src?: string; tag: { label: string; tone: string }; needsChiefVerification?: boolean; }
export interface LogItem { id: string; date: string; act: string; note?: string; photos: number; tag: { label: string; tone: string }; }
export interface GroupRef { id: string; name: string; isLeader: boolean; tag: { label: string; tone: string }; }

const STATE_TAG: Record<Farmer["state"], "good" | "neutral" | "warn" | "danger"> = {
  good: "good",
  mid: "neutral",
  behind: "warn",
  help: "danger",
};

export default function FarmerDetailScreen({
  farmer, groups, parcels, helperName, helpingName, projects, evidence, logs, onBack, onNudge, onConnectHelper, onOpenReview,
}: {
  farmer: Farmer;
  groups: GroupRef[];
  parcels: { name: string; crop: string }[];
  helperName?: string | null;
  helpingName?: string | null;
  projects: ProjPanel[];
  evidence: EvidenceCell[];
  logs: LogItem[];
  onBack: () => void;
  onNudge: () => void;
  onConnectHelper: () => void;
  onOpenReview: (evId: string) => void;
}) {
  return (
    <div>
      <button type="button" className="lvb-back" onClick={onBack}>
        <ArrowLeft size={18} />처리함으로
      </button>

      <div className="lvb-detail-hero">
        <div className="lvb-detail-hero-info">
          <div className="lvb-detail-name">
            {farmer.name}
            <span className={`lvb-tag lvb-tag-${STATE_TAG[farmer.state]}`}>
              {STATE_LABEL[farmer.state]}
            </span>
          </div>
          <div className="lvb-detail-contact">
            <Phone size={15} />
            {farmer.phone || "—"}
          </div>
          {farmer.note && (
            <div className="lvb-detail-note">
              <AlertCircle size={14} />
              {farmer.note}
            </div>
          )}
        </div>
        <div className="lvb-detail-hero-actions">
          <button type="button" className="lvb-btn lvb-btn-primary lvb-btn-lg" onClick={onNudge}>
            <Send size={22} />
            <span>문자로 알려주기</span>
          </button>
          {!helperName && (
            <button type="button" className="lvb-btn lvb-btn-outline lvb-btn-lg" onClick={onConnectHelper}>
              <HeartHandshake size={22} />
              <span>도우미 연결</span>
            </button>
          )}
        </div>
      </div>

      <div className="lvb-detail-cards">
        <div className="lvb-dcard">
          <div className="lvb-dcard-label">소속 단체</div>
          {groups.length > 0 ? (
            groups.map((g) => (
              <div key={g.id} className="lvb-dcard-grouprow">
                <b>{g.name}</b>
                {g.isLeader && <span className="lvb-leader-pill">대표</span>}
                <span className="lvb-projtag t-green">{g.tag.label}</span>
              </div>
            ))
          ) : (
            <div className="lvb-dcard-sub">소속 단체 없음</div>
          )}
        </div>

        <div className="lvb-dcard">
          <div className="lvb-dcard-label">필지 · 작물</div>
          <div className="lvb-dcard-parcels">
            {parcels.length > 0 ? (
              parcels.map((p, i) => (
                <span key={`${p.name}-${i}`} className="lvb-parcel-chip">
                  <b>{p.name}</b>
                  {p.crop}
                </span>
              ))
            ) : (
              <span className="lvb-dcard-sub">등록된 필지 없음</span>
            )}
          </div>
        </div>

        <div className="lvb-dcard">
          <div className="lvb-dcard-label">기록 도우미</div>
          {helperName ? (
            <div className="lvb-dcard-big lvb-dcard-helper">
              <HeartHandshake size={18} />
              {helperName} 님이 돕는 중
            </div>
          ) : helpingName ? (
            <div className="lvb-dcard-big lvb-dcard-helper">
              <HeartHandshake size={18} />
              {helpingName} 님을 돕고 있어요
            </div>
          ) : (
            <div className="lvb-dcard-sub">연결된 도우미 없음</div>
          )}
        </div>
      </div>

      {projects.length > 0 && (
        <div className={projects.length > 1 ? "lvb-detail-split" : ""} style={{ marginBottom: 16 }}>
          {projects.map((p) => (
            <section key={p.pid} className="lvb-panel">
              <div className="lvb-sec-head">
                <div className="lvb-sec-head-l">
                  <span className="lvb-sec-ic t-green"><FileText size={18} /></span>
                  <span className="lvb-sec-title">{p.biz}</span>
                  <span className="lvb-sec-sub">{p.done}/{p.total} 완료</span>
                </div>
                <span className="lvb-projtag t-green">{p.tag.label}</span>
              </div>
              <ul className="lvb-act-list">
                {p.acts.map((a) => (
                  <li key={a.name} className={`lvb-act${a.done ? " is-done" : a.overdue ? " is-over" : ""}`}>
                    <span className="lvb-act-mark">
                      {a.done ? <Check size={15} /> : <span className="lvb-act-dot" />}
                    </span>
                    <span className="lvb-act-name">{a.name}</span>
                    <span className="lvb-act-due">{a.done ? "완료" : a.due}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="lvb-panel" style={{ marginBottom: 16 }}>
        <div className="lvb-sec-head">
          <div className="lvb-sec-head-l">
            <span className="lvb-sec-ic t-green"><Camera size={18} /></span>
            <span className="lvb-sec-title">올린 증빙</span>
            <span className="lvb-sec-count">{evidence.length}</span>
          </div>
        </div>
        {evidence.length === 0 ? (
          <div className="lvb-empty">
            <span className="lvb-empty-ic"><Camera size={26} /></span>
            <div className="lvb-empty-title">아직 올린 사진이 없어요</div>
          </div>
        ) : (
          <div className="lvb-ev-grid">
            {evidence.map((e) => {
              const st = e.status === "confirmed"
                ? { t: "good" as const, l: "확인" }
                : e.status === "retake"
                  ? { t: "warn" as const, l: "재촬영" }
                  : { t: "neutral" as const, l: "검토 대기" };
              return (
                <button
                  key={e.id}
                  type="button"
                  className="lvb-ev-cell"
                  onClick={() => e.status === "review" && onOpenReview(e.id)}
                >
                  {e.src ? (
                    <img src={e.src} alt={e.label} className="lvb-evthumb" />
                  ) : (
                    <span className={`lvb-ph lvb-ph-${e.img === "ph-blur" ? "blur" : "field"}`}>
                      <span className="lvb-ph-cap">사진</span>
                    </span>
                  )}
                  <div className="lvb-ev-cap">
                    <span className={`lvb-tag lvb-tag-${st.t}`}>{st.l}</span>
                    <span>{e.when}</span>
                  </div>
                  {e.needsChiefVerification && (
                    <div className="lvb-ev-cap"><span className="lvb-tag lvb-tag-warn">AI 확신 낮음</span></div>
                  )}
                  <div className="lvb-ev-label">
                    <span className="lvb-projtag t-green">{e.tag.label}</span>
                    {e.label}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="lvb-panel">
        <div className="lvb-sec-head">
          <div className="lvb-sec-head-l">
            <span className="lvb-sec-ic t-green"><FileText size={18} /></span>
            <span className="lvb-sec-title">영농일지</span>
            <span className="lvb-sec-count">{logs.length}</span>
          </div>
        </div>
        <ul className="lvb-log-list">
          {logs.map((l) => (
            <li key={l.id} className="lvb-log">
              <div className="lvb-log-date">{l.date}</div>
              <div className="lvb-log-body">
                <div className="lvb-log-act">
                  {l.act}
                  <span className="lvb-projtag t-green">{l.tag.label}</span>
                </div>
                {l.note && <div className="lvb-log-note">&ldquo;{l.note}&rdquo;</div>}
              </div>
              <div className="lvb-log-photos">
                <Camera size={14} />
                {l.photos}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
