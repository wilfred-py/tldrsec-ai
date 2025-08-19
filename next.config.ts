import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Edge Runtime compatibility for Railway deployment
  experimental: {
    // Enable Edge Runtime for API routes
    runtime: 'edge',
  },
  
  // Production optimization for Railway
  compiler: {
    // Remove console.log in production builds
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  
  // Environment-specific configuration
  env: {
    // Platform detection for monitoring
    DEPLOYMENT_PLATFORM: process.env.RAILWAY_ENVIRONMENT ? 'RAILWAY' : 'VERCEL',
  },
  
  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/api/cron/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ];
  },
};
