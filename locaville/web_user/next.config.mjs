/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Next.js 16+ 의 cross-origin 보호 — LAN IP 에서 폰으로 접속 시
  // webpack-hmr / _next/static 요청이 차단되지 않도록 명시 허용.
  allowedDevOrigins: ["192.168.14.76"],
}

export default nextConfig
