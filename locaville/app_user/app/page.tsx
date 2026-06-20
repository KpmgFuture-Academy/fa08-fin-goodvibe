"use client";

import dynamic from "next/dynamic";

// 데이터 컨테이너를 client-only 로 — lib/ 서비스(localStorage/fetch) 의존이라 SSR 회피.
const LocavilleAppContainer = dynamic(() => import("@/components/LocavilleAppContainer"), {
  ssr: false,
});

export default function Home() {
  return <LocavilleAppContainer />;
}
