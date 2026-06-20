/**
 * Next.js 앱 RootLayout. 모든 페이지를 `Shell`(사이드바+헤더) 안쪽에 렌더.
 * 한국어 lang, 전역 CSS 로드.
 */
import "./globals.css"
import type { Metadata } from "next"
import type { ReactNode } from "react"
import Script from "next/script"
import { Shell } from "@/components/Shell"

export const metadata: Metadata = {
  title: "저탄마을 이장님 대시보드",
  description: "마을 농가의 영농일지와 증빙사진를 확인하는 이장님 대시보드",
  // public/ 에 별도 favicon 파일이 없으므로 inline SVG data URL 로 처리.
  // Next.js 가 /icon.svg, /icon-light-32x32.png 등을 자동으로 찾으려고 404 호출하는 것을 막음.
  icons: {
    icon: [
      {
        url:
          "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>" +
          "<rect width='32' height='32' rx='8' fill='%231c4a36'/>" +
          "<text x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' " +
          "fill='%23ffffff' font-family='sans-serif' font-size='16' font-weight='700'>저</text></svg>",
        type: "image/svg+xml",
      },
    ],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <Script
          id="normalize-loopback-host"
          strategy="beforeInteractive"
        >{`
          (function () {
            try {
              if (window.location.hostname !== "127.0.0.1") return;
              var url = new URL(window.location.href);
              url.hostname = "localhost";
              window.location.replace(url.toString());
            } catch (e) {}
          })();
        `}</Script>
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
