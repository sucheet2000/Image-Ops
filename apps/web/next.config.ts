import type { NextConfig } from 'next';
import bundleAnalyzer from '@next/bundle-analyzer';

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

function resolveApiOrigin(): string | null {
  const value = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!value) {
    return null;
  }
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  productionBrowserSourceMaps: false,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.cloudfront.net' }],
  },
  async headers() {
    const apiOrigin = resolveApiOrigin();
    const connectSrc = [
      "'self'",
      apiOrigin,
      'https://api.stripe.com',
      'https://accounts.google.com',
    ]
      .filter(Boolean)
      .join(' ');
    const cspHeader = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.amazonaws.com https://*.s3.amazonaws.com",
      `connect-src ${connectSrc}`,
      'frame-src https://js.stripe.com https://accounts.google.com',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; ');

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: cspHeader },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
