"use client";

/** 사업 목록 화면. backend `/ville-project?farmer_id=...` 로 농가가 참여 중인 사업을 동적으로 가져옴.
 *  예전엔 PRJ2026LC / PRJ2026PUB 두 사업을 하드코딩했지만, 새 시드/다른 농가에도 자동으로 작동. */

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { fetchFarmerProjects, type FarmerProject } from "@/lib/business-service";
import { useHelperMode } from "@/lib/helper-mode-context";

type Screen =
  | "home"
  | "voiceInput"
  | "manualInput"
  | "photoInput"
  | "saveComplete"
  | "journal"
  | "business"
  | "help"
  | "settings"
  | "journalDetail"
  | "businessDetail"
  | "splash"
  | "loginSelect"
  | "manualLogin";

interface BusinessScreenProps {
  navigate: (screen: Screen) => void;
  setSelectedBusiness: (b: Business | null) => void;
}

// 카드/상세에 쓰는 통합 모델. backend 응답을 그대로 받되 화면 호환을 위해 alias 도 둠.
export interface Business {
  prj_id: string;
  project_id: string;
  name: string;
  exec_year: number | null;
  biz_name: string;
  items: string[]; // 활동 이름 리스트
  activities: FarmerProject["activities"];
}

function toBusiness(p: FarmerProject): Business {
  return {
    prj_id: p.prj_id,
    project_id: p.project_id || p.prj_id,
    name: p.prj_name,
    exec_year: p.exec_year,
    biz_name: p.biz_name,
    items: (p.activities || []).map((a) => a.activity_name).filter(Boolean),
    activities: p.activities || [],
  };
}

export default function BusinessScreen({ navigate, setSelectedBusiness }: BusinessScreenProps) {
  const { effectiveFarmerId } = useHelperMode();
  const [items, setItems] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    void fetchFarmerProjects(effectiveFarmerId).then((rows) => {
      if (!mounted) return;
      setItems(rows.map(toBusiness));
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [effectiveFarmerId]);

  return (
    <div className="flex flex-col gap-5 pb-8" style={{ background: "#ffffff", minHeight: "100vh" }}>
      <div className="px-4 pt-5 pb-1">
        <h1 className="text-2xl font-bold text-foreground">사업</h1>
        <p className="text-sm font-bold text-muted-foreground mt-0.5">참여 중인 사업과 활동을 확인할 수 있어요.</p>
      </div>

      <div className="flex flex-col gap-3 mx-4">
        {loading ? (
          <div className="text-center text-muted-foreground py-8">불러오는 중...</div>
        ) : items.length === 0 ? (
          <div className="jt-mobile-card rounded-2xl p-6 text-center text-muted-foreground">
            아직 참여 중인 사업이 없습니다.
          </div>
        ) : (
          items.map((b) => (
            <button
              key={b.prj_id}
              onClick={() => {
                setSelectedBusiness(b);
                navigate("businessDetail");
              }}
              className="w-full jt-mobile-card rounded-2xl p-4 active:bg-muted text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-base font-bold text-foreground flex-1 pr-2">{b.name}</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </div>
              {b.biz_name && (
                <p className="text-xs text-muted-foreground mb-2">{b.biz_name}</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {b.items.slice(0, 4).map((label) => (
                  <span
                    key={label}
                    className="text-xs font-bold px-2.5 py-1 rounded-full bg-primary/10 text-primary"
                  >
                    {label}
                  </span>
                ))}
                {b.items.length > 4 && (
                  <span className="text-xs text-muted-foreground self-center">
                    +{b.items.length - 4}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
