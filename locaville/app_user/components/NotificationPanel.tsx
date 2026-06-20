"use client";

/** NotificationPanel — 알림 바텀시트. + HelperModeTransition(도우미 모드 전환). */

import { useEffect, useState } from "react";
import { Bell, X, CheckCheck, Camera, Mail, AlertCircle, Heart, NotebookPen, Trash2, Tractor } from "lucide-react";

export interface NotificationItem {
  notice_no: number;
  content_cd: string;   // RETAKE / TODO_DUE / HLP_INV / MANUAL / ...
  title: string;
  content: string;
  when: string;
  read: boolean;
}

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  RETAKE: Camera, MANUAL: Mail, TODO_DUE: AlertCircle, HLP_INV: Heart, DIA_DEL: NotebookPen, EVID_DEL: Trash2,
};

interface NotificationPanelProps {
  open: boolean;
  items: NotificationItem[];
  onClose: () => void;
  onRead: (n: NotificationItem) => void;
  onReadAll: () => void;
  onAction: (contentCd: string) => void;
}

export default function NotificationPanel({ open, items, onClose, onRead, onReadAll, onAction }: NotificationPanelProps) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    if (!open) { setEnter(false); return; }
    const t = setTimeout(() => setEnter(true), 20);
    return () => clearTimeout(t);
  }, [open]);
  if (!open) return null;

  const sorted = [...items].sort((a, b) => (a.read === b.read ? 0 : a.read ? 1 : -1));
  const unread = items.filter((n) => !n.read).length;

  return (
    <div className="absolute inset-0 z-[85]">
      <div onClick={onClose} className="absolute inset-0 bg-[rgba(15,23,16,0.45)] backdrop-blur-sm transition-opacity duration-200" style={{ opacity: enter ? 1 : 0 }} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[78%] flex-col rounded-t-[22px] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_rgba(15,23,16,0.2)] transition-transform duration-300 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]"
        style={{ transform: enter ? "translateY(0)" : "translateY(100%)" }}>
        <div className="flex justify-center pb-1 pt-2.5"><div className="h-1 w-11 rounded-full bg-[var(--lv-line)]" /></div>
        <div className="flex items-center justify-between border-b border-[var(--lv-line-soft)] px-[18px] pb-3 pt-2.5">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-[color:var(--lv-ink)]" /><span className="text-[18px] font-extrabold text-[color:var(--lv-ink)]">알림</span>
            {unread > 0 && <span className="rounded-full bg-[var(--lv-danger)] px-2 py-0.5 text-[12px] font-bold text-white">{unread}</span>}
          </div>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button onClick={onReadAll} className="flex min-h-[44px] items-center gap-1 rounded-[10px] border border-[var(--lv-line)] bg-white px-3.5 text-[14px] font-extrabold text-[color:var(--lv-ink)]"><CheckCheck size={16} />모두 읽음</button>
            )}
            <button onClick={onClose} aria-label="닫기" className="flex h-11 w-11 items-center justify-center text-[color:var(--lv-ink-soft)]"><X size={22} /></button>
          </div>
        </div>
        <div className="overflow-y-auto pb-4 pt-2">
          {sorted.map((n, i) => {
            const Icon = ICONS[n.content_cd] || Bell;
            return (
              <button key={`${n.notice_no}-${i}`} onClick={() => { onRead(n); onClose(); onAction(n.content_cd); }}
                className={`flex w-full gap-3 border-b border-[var(--lv-line-soft)] px-[18px] py-3.5 text-left ${!n.read ? "bg-[var(--lv-bg-soft)]" : "bg-white"}`}>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${!n.read ? "bg-[var(--lv-primary)]" : "bg-[var(--lv-bg-soft)]"}`}>
                  <Icon size={20} className={!n.read ? "text-white" : "text-[color:var(--lv-ink-soft)]"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-[16px] leading-snug text-[color:var(--lv-ink)] [word-break:keep-all] ${n.read ? "font-bold" : "font-extrabold"}`}>{n.title}</p>
                    <span className="shrink-0 text-[12px] font-semibold text-[color:var(--lv-ink-soft)]">{n.when}</span>
                  </div>
                  <p className="mt-1 text-[15px] font-semibold leading-relaxed text-[color:var(--lv-ink-soft)] [word-break:keep-all]">{n.content}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** 도우미 모드 진입/복귀 인터스티셜. */
export function HelperModeTransition({ direction, name }: { direction: "enter" | "leave"; name: string }) {
  return (
    <div className="absolute inset-0 z-[95] flex flex-col items-center justify-center gap-6 overflow-hidden bg-[var(--lv-primary)]">
      <Tractor size={64} className="text-white" />
      <p className="whitespace-pre-line px-8 text-center text-[20px] font-extrabold leading-snug text-white">
        {direction === "enter" ? `${name}님 농가로\n도와드리러 가는 중…` : "내 농장으로\n돌아오는 중…"}
      </p>
    </div>
  );
}

/* Claude Code: items = notification-service. onAction(content_cd) 으로
   RETAKE→photoInput, TODO_DUE/MANUAL→voiceInput 등 라우팅. 도우미는 helper-mode-context. */
