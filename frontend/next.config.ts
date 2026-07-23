import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    // Proxy API calls through the Next server so the browser sees one origin:
    // no CORS setup, and the httpOnly auth cookie flows automatically.
    // NOTE: rewrites are baked in at build time — in Docker this is a build arg.
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:4000'}/:path*`,
      },
    ];
  },
};

export default nextConfig;
