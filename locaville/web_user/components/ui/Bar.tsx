/** 진행률 막대 (0–100). value 는 자동으로 0–100 범위로 클램프됨. ARIA progressbar. */
export function Bar({ value, height = "md" }: { value: number; height?: "sm" | "md" | "lg" }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div className={`bar bar-${height}`} role="progressbar" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
