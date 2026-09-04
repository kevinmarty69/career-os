import type { NextConfig } from 'next';

export function assertOpenSourceDeploymentMode(mode: string) {
  if (mode === 'self-hosted') return;
  throw new Error(
    'This repository implements self-hosting only; managed mode requires the separate cloud control plane.',
  );
}

assertOpenSourceDeploymentMode(
  process.env.CAREER_OS_DEPLOYMENT_MODE ?? 'self-hosted',
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/p/:path*',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
        ],
      },
    ];
  },
};

export default nextConfig;
