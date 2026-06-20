"use client";

/** 헤더 종 아이콘 클릭 시 뜨는 slide-up 알림 panel.
 *
 * - 농가 본인 알림 (notification 테이블) 최근 30건 표시
 * - 안 읽음 우선 표시 + 클릭 시 read 처리 + action_url 라우팅
 * - "모두 읽음" 버튼
 */
import { useEffect, useState } from "react";
import { X, Bell, CheckCheck, Camera, Mail, AlertCircle, Trash2, NotebookPen } from "lucide-react";
import {
  fetchFarmerNotifications,
  markAllFarmerNotificationsRead,
  markFarmerNotificationRead,
  type FarmerNotification,
} from "@/lib/notification-service";

// content_cd 는 backend 의 notification.content_cd VARCHAR(8) 컬럼이라 짧은 코드 사용.
const CONTENT_ICON: Record<string, typeof Bell> = {
  RETAKE: Camera,
  MANUAL: Mail,
  INVITE: Mail,
  TODO_DUE: AlertCircle,
  DIA_DEL: NotebookPen,
  EVID_DEL: Trash2,
  HLP_INV: Mail,
  HLP_REV: Mail,
};

function relativeKo(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return "방금";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  const days = Math.floor(diff / 86400);
  if (days < 7) return `${days}일 전`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function NotificationPanel({
  farmerId,
  open,
  onClose,
  onChanged,
  onAction,
}: {
  farmerId: string;
  open: boolean;
  onClose: () => void;
  /** read 등 변화 발생 시 — 헤더 종 배지가 refetch 하도록 신호. */
  onChanged?: () => void;
  /** 알림 클릭 시 종류(content_cd)별 후속 작업을 부모가 처리.
   *  예: HLP_INV → 동의 모달, RETAKE → 사진 입력 prompt, DIA_DEL → 음성 입력 prompt. */
  onAction?: (content_cd: string, notification: FarmerNotification) => void;
}) {
  const [items, setItems] = useState<FarmerNotification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void fetchFarmerNotifications(farmerId, 30)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [farmerId, open]);

  async function handleClickItem(n: FarmerNotification) {
    if (!n.read_at) {
      await markFarmerNotificationRead(farmerId, n.notice_no);
      setItems((prev) =>
        prev.map((p) => (p.notice_no === n.notice_no ? { ...p, read_at: new Date().toISOString() } : p)),
      );
      onChanged?.();
    }
    // 종류별 후속 작업은 부모(LocavilleApp) 가 결정. panel 은 닫고 거기에 모달/네비를 위임.
    onClose();
    onAction?.(n.content_cd || "", n);
  }

  async function handleReadAll() {
    const updated = await markAllFarmerNotificationsRead(farmerId);
    if (updated > 0) {
      const nowIso = new Date().toISOString();
      setItems((prev) => prev.map((p) => (p.read_at ? p : { ...p, read_at: nowIso })));
      onChanged?.();
    }
  }

  if (!open) return null;

  const unreadFirst = [...items].sort((a, b) => {
    if (!a.read_at && b.read_at) return -1;
    if (a.read_at && !b.read_at) return 1;
    return (b.reg_at || "").localeCompare(a.reg_at || "");
  });

  const unreadCount = items.filter((n) => !n.read_at).length;

  return (
    <>
      {/* 부드러운 fade-in backdrop + slide-up panel — open 시 한 번 재생.
         backdrop-filter blur 로 뒤 화면 흐림 처리해 시각 깊이 ↑ */}
      <style>{`
        @keyframes lv-notif-fade-in {
          from { opacity: 0; backdrop-filter: blur(0px); -webkit-backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
        }
        @keyframes lv-notif-slide-up {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
      {/* dim backdrop */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="알림 닫기"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 16, 0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 60,
          animation: "lv-notif-fade-in 0.22s ease-out",
        }}
      />
      {/* slide-up panel — cubic-bezier spring-like easing 으로 살짝 튕기는 느낌. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "78vh",
          background: "#ffffff",
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          boxShadow: "0 -12px 36px rgba(15, 23, 16, 0.20)",
          zIndex: 61,
          display: "flex",
          flexDirection: "column",
          paddingBottom: "env(safe-area-inset-bottom)",
          animation: "lv-notif-slide-up 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
        }}
      >
        {/* handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div
            style={{
              width: 44,
              height: 4,
              borderRadius: 2,
              background: "var(--line, #d8d2c5)",
            }}
          />
        </div>

        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px 12px",
            borderBottom: "1px solid var(--line-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Bell className="w-5 h-5" style={{ color: "var(--ink)" }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: "var(--ink)" }}>알림</span>
            {unreadCount > 0 && (
              <span
                style={{
                  background: "var(--danger, #d04545)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 999,
                }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleReadAll()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  background: "#fff",
                  color: "var(--ink-soft)",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                <CheckCheck className="w-4 h-4" />
                모두 읽음
              </button>
            )}
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              style={{
                minWidth: 40,
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-soft)",
              }}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* list */}
        <div style={{ overflowY: "auto", padding: "8px 0 16px" }}>
          {loading ? (
            <p style={{ textAlign: "center", padding: 24, color: "var(--ink-soft)", fontWeight: 700 }}>
              알림을 불러오는 중이에요…
            </p>
          ) : unreadFirst.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 18px" }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", margin: 0 }}>
                받은 알림이 없어요
              </p>
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6, fontWeight: 600 }}>
                새 알림이 오면 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            unreadFirst.map((n) => {
              const Icon = CONTENT_ICON[n.content_cd] || Bell;
              const isUnread = !n.read_at;
              return (
                <button
                  key={n.notice_no}
                  type="button"
                  onClick={() => void handleClickItem(n)}
                  style={{
                    width: "100%",
                    display: "flex",
                    gap: 12,
                    padding: "14px 18px",
                    background: isUnread ? "var(--bg-soft, #f7f5ef)" : "#fff",
                    border: "none",
                    borderBottom: "1px solid var(--line-soft)",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      background: isUnread ? "var(--primary)" : "var(--bg-soft, #ebe6d8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon
                      className="w-5 h-5"
                      style={{ color: isUnread ? "#fff" : "var(--ink-soft)" }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: isUnread ? 800 : 700,
                          color: "var(--ink)",
                          margin: 0,
                          lineHeight: 1.35,
                        }}
                      >
                        {n.title}
                      </p>
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", fontWeight: 600, flexShrink: 0 }}>
                        {relativeKo(n.reg_at)}
                      </span>
                    </div>
                    {n.content && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--ink-soft)",
                          margin: "4px 0 0",
                          lineHeight: 1.5,
                          fontWeight: 600,
                        }}
                      >
                        {n.content}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
