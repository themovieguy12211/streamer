import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() { return [{ source: '/api/v1/:path*', destination: `${process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:4000/api/v1'}/:path*` }]; },
  async headers() {
    return [
      { source: '/e/:path*', headers: [{ key: 'X-Frame-Options', value: 'ALLOWALL' }, { key: 'Content-Security-Policy', value: "frame-ancestors *" }] },
    ];
  },
};
export default nextConfig;
