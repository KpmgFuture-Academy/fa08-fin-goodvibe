/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Allow HMR requests from 127.0.0.1 during development
  allowedDevOrigins: ['127.0.0.1'],
}

export default nextConfig
