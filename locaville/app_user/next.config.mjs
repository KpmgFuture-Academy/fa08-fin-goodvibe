/** @type {import('next').NextConfig} */
const nextConfig = {
  // 핸드폰 LAN 접속 시 Next.js 16 이 webpack-hmr 같은 dev 리소스를 cross-origin 으로
  // 차단하지 않게 등록. PC 의 Wi-Fi IP 가 바뀌면 새 IP 를 추가.
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.14.76",
    "192.168.0.15",
    "192.168.0.67",
    "172.30.1.71",
  ],
};

export default nextConfig;
