/**
 * 캘린더 셀의 부가 정보 — 음력 라벨 + 한국 공휴일.
 *
 * 음력은 `lunar-javascript` (KASI 한국천문연구원 데이터셋 기반) 사용.
 * 1일·15일·24절기만 노출 — 그 외 날에 음력 띄우면 노이즈.
 *
 * 공휴일은 양력 고정 + 음력(설/추석/부처님오신날) 두 부류.
 * 대체공휴일은 단순화 위해 미적용 (시연 단계).
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — lunar-javascript 는 자체 d.ts 없어 any 처리.
import { Solar } from "lunar-javascript"

export type CellExtras = {
  /** 셀 우상단에 작게 표시할 음력·절기 라벨 (예: "음 5.1", "보름", "입추"). */
  lunarLabel?: string
  /** 공휴일이면 이름 (예: "설날", "어린이날"). 양력 셀 숫자를 빨강으로 표시. */
  holiday?: string
}

// 양력 고정 공휴일 (월·일 → 이름)
const SOLAR_HOLIDAYS: Record<string, string> = {
  "1-1": "신정",
  "3-1": "삼일절",
  "5-5": "어린이날",
  "6-6": "현충일",
  "8-15": "광복절",
  "10-3": "개천절",
  "10-9": "한글날",
  "12-25": "성탄절",
}

// 음력 고정 공휴일 (월·일 → 이름). 설·추석은 ±1일도 같이 표시하는 경우가 많지만
// 시연 단계라 본 날만.
const LUNAR_HOLIDAYS: Record<string, string> = {
  "1-1": "설날",
  "4-8": "부처님오신날",
  "8-15": "추석",
}

// 24절기 — lunar-javascript 가 반환하는 한자(번체/간체) 를 한글로 매핑.
// 같은 절기라도 라이브러리 버전에 따라 표기가 달라질 수 있어 양쪽 다 등록.
const JIEQI_KO: Record<string, string> = {
  "立春": "입춘", "雨水": "우수", "驚蟄": "경칩", "惊蛰": "경칩",
  "春分": "춘분", "淸明": "청명", "清明": "청명", "穀雨": "곡우", "谷雨": "곡우",
  "立夏": "입하", "小滿": "소만", "小满": "소만", "芒種": "망종", "芒种": "망종",
  "夏至": "하지", "小暑": "소서", "大暑": "대서",
  "立秋": "입추", "處暑": "처서", "处暑": "처서", "白露": "백로",
  "秋分": "추분", "寒露": "한로", "霜降": "상강",
  "立冬": "입동", "小雪": "소설", "大雪": "대설", "冬至": "동지",
  "小寒": "소한", "大寒": "대한",
}

function jieqiToKorean(raw: string): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  return JIEQI_KO[trimmed] || ""  // 매핑에 없으면 노출 안 함 (한자 노출 차단)
}

/**
 * 양력 (year, month0~11, day) 로 셀의 음력·공휴일 정보를 한 번에 계산.
 */
export function getCellExtras(year: number, month: number, day: number): CellExtras {
  const out: CellExtras = {}
  // 양력 고정 공휴일
  const solarKey = `${month + 1}-${day}`
  if (SOLAR_HOLIDAYS[solarKey]) out.holiday = SOLAR_HOLIDAYS[solarKey]

  try {
    // 1-indexed month 로 변환
    const solar = Solar.fromYmd(year, month + 1, day)
    const lunar = solar.getLunar()
    const lDay: number = lunar.getDay()
    const lMonth: number = lunar.getMonth()

    // 음력 공휴일 우선 — 양력 공휴일과 같이 양력 셀에 표시.
    // lunar.getMonth() 가 음수(윤달) 면 절댓값.
    const lunarKey = `${Math.abs(lMonth)}-${lDay}`
    if (LUNAR_HOLIDAYS[lunarKey] && !out.holiday) {
      out.holiday = LUNAR_HOLIDAYS[lunarKey]
    }

    // 음력 라벨: 매월 1일·15일.
    if (lDay === 1) {
      out.lunarLabel = `음 ${Math.abs(lMonth)}.1`
    } else if (lDay === 15) {
      out.lunarLabel = "보름"
    } else {
      // 24절기 — 그날에 해당하면 한글로 변환해 노출.
      const jqRaw = (lunar.getJieQi?.() as string) || ""
      const jqKo = jieqiToKorean(jqRaw)
      if (jqKo) out.lunarLabel = jqKo
    }
  } catch {
    // 라이브러리 오류 안전 폴백.
  }
  return out
}

/**
 * 해당 셀의 요일과 공휴일 여부로 날짜 숫자 색을 결정.
 */
export function dayColor(weekday: number, holiday: string | undefined, inMonth: boolean): string {
  if (!inMonth) return "var(--lvb-muted-2)"
  if (holiday) return "var(--lvb-danger)"
  if (weekday === 0) return "var(--lvb-danger)"
  if (weekday === 6) return "#2c6b76"
  return "var(--lvb-ink)"
}
