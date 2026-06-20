/** 루트 페이지 — 대시보드로 즉시 리디렉트. v0_chief 는 별도 랜딩 페이지를 두지 않음. */
import { redirect } from "next/navigation"

export default function HomePage() {
  redirect("/dashboard")
}
