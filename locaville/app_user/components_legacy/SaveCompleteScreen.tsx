"use client";

/** 저장 완료 안내 화면. 일지·사진 저장 직후 표시되는 성공 화면 + 다음 액션 버튼. */

import { CheckCircle2, Mic, PenLine, Camera } from "lucide-react";

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

interface SavedRecord {
  date: string;
  work: string;
  field: string;
  amount: string;
  business: string;
  hasPhoto: boolean;
  memo?: string;
  linkedEvidenceIds?: string[];
  inputMethod: "voice" | "manual" | "photo";
}

interface SaveCompleteScreenProps {
  savedRecord: SavedRecord | null;
  inputMethod: "voice" | "manual" | "photo";
  navigate: (screen: Screen) => void;
}

function getInputMethodKey(record: SavedRecord | null, inputMethod: "voice" | "manual" | "photo") {
  // Save payload can come from different screens, so this safely normalizes the key.
  const raw = (record?.inputMethod || inputMethod || "").toLowerCase();
  if (raw.includes("voice") || raw.includes("chat")) return "voice";
  if (raw.includes("photo")) return "photo";
  return "manual";
}

function getInputMethodMessage(key: string) {
  if (key === "voice") return "음성 대화로 기록되었습니다.";
  if (key === "photo") return "사진 증빙 기반으로 기록되었습니다.";
  return "직접 입력으로 기록되었습니다.";
}

const METHOD_UI = {
  voice: { label: "음성", icon: <Mic className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
  manual: { label: "직접입력", icon: <PenLine className="w-4 h-4" />, color: "bg-emerald-100 text-emerald-700" },
  photo: { label: "사진", icon: <Camera className="w-4 h-4" />, color: "bg-violet-100 text-violet-700" },
} as const;

export default function SaveCompleteScreen({ savedRecord, inputMethod, navigate }: SaveCompleteScreenProps) {
  const record = savedRecord ?? {
    date: "2026-05-14",
    work: "기록",
    field: "-",
    amount: "-",
    business: "공익직불제 준수사항",
    hasPhoto: false,
    linkedEvidenceIds: [],
    inputMethod: "manual" as const,
  };
  const methodKey = getInputMethodKey(record, inputMethod) as keyof typeof METHOD_UI;
  const methodUi = METHOD_UI[methodKey];

  return (
    <div className="flex flex-col min-h-full pb-8 px-4">
      <div className="flex flex-col items-center pt-10 pb-6">
        <div className="bg-primary/10 rounded-full p-5 mb-4">
          <CheckCircle2 className="w-16 h-16 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground text-center">기록이 저장되었습니다</h1>
        <p className="text-base text-muted-foreground mt-2 text-center">{getInputMethodMessage(methodKey)}</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-foreground">저장한 내용</h3>
          <span className={`flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full ${methodUi.color}`}>
            {methodUi.icon}
            {methodUi.label}
          </span>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm text-muted-foreground">날짜: <span className="text-foreground font-bold">{record.date}</span></p>
          <p className="text-sm text-muted-foreground">작업: <span className="text-foreground font-bold">{record.work}</span></p>
          <p className="text-sm text-muted-foreground">위치: <span className="text-foreground font-bold">{record.field}</span></p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("home")}
          className="bg-primary text-primary-foreground text-base font-bold py-4 rounded-2xl"
        >
          홈으로
        </button>
        <button
          onClick={() => navigate("journal")}
          className="bg-card border border-border text-foreground text-base font-bold py-4 rounded-2xl"
        >
          목록 보기
        </button>
      </div>
    </div>
  );
}
