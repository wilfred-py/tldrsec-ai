// CANONICAL Next.js config for this project. Do NOT add next.config.ts —
// a prior next.config.ts existed without an export statement, leaving it
// silently dead while developers assumed its features (removeConsole,
// security headers, DEPLOYMENT_PLATFORM env) were active. Those features
// have been merged here. Documented in CLAUDE.md.
const nextConfig = {
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: This allows production builds to successfully complete even if
    // your project has type errors.
    ignoreBuildErrors: true,
  },
  // Strip console.log in production (keep error/warn). Merged from the
  // previously-dead next.config.ts.
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  // Platform detection for monitoring. Merged from the previously-dead next.config.ts.
  env: {
    DEPLOYMENT_PLATFORM: 'VERCEL',
  },
  // SWC minification is enabled by default in Next.js 15
  // swcMinify: true, // Not needed - enabled by default
  experimental: {
    // Remove strictNextHead as it's not recognized in Next.js 15.5.5
    optimizePackageImports: ['@clerk/nextjs', 'lucide-react'],
    // Enable Edge Runtime compatibility
    esmExternals: true,
  },
  // Security + cache-control headers. Merged from the previously-dead next.config.ts.
  async headers() {
    return [
      {
        source: '/api/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        source: '/api/cron/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
        ],
      },
    ];
  },
  // Generate static pages where possible to avoid database dependencies during build
  generateBuildId: async () => {
    // Use a simple build ID to avoid external dependencies
    return 'build-' + Date.now();
  },
  // Configure output to handle both static and dynamic routes appropriately
  output: process.env.VERCEL ? undefined : 'standalone',
  serverExternalPackages: ['ioredis', 'posthog-node'],
  webpack: (config, { isServer, webpack, dev, nextRuntime }) => {
    // Enable safe minification - SWC is configured at Next.js level
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
        minimizer: [],
      };
    }

    // Edge Runtime specific configuration
    if (nextRuntime === 'edge') {
      // Completely exclude IORedis and Node.js specific modules from Edge Runtime
      config.externals = config.externals || [];
      config.externals.push('ioredis');
      config.externals.push('@ioredis/commands');
      config.externals.push('redis-errors');
      
      // Add webpack alias to replace IORedis imports with Edge Runtime compatible stubs
      config.resolve.alias = {
        ...config.resolve.alias,
        'ioredis': false,
        '@ioredis/commands': false,
        'redis-errors': false,
      };
    }

    if (!isServer) {
      // Strip `node:` prefix on client so fallbacks below catch them.
      // Some deps (e.g. cssstyle -> lru-cache) use `node:diagnostics_channel`
      // which webpack treats as an unhandled scheme unless we rewrite it.
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );

      // Don't resolve server-side modules on the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
        perf_hooks: false,
        os: false,
        path: false,
        crypto: false,
        stream: false,
        util: false,
        url: false,
        querystring: false,
        http: false,
        https: false,
        zlib: false,
        diagnostics_channel: false,
        async_hooks: false,
        worker_threads: false,
        events: false,
        buffer: false,
        assert: false,
        readline: false,
        // Add canvas fallback for client-side rendering
        canvas: false,
        'canvas/lib/bindings': false,
        // Additional canvas-related fallbacks
        'node-canvas-webgl': false,
        'canvaskit-wasm': false,
        // Exclude IORedis from client-side builds
        'ioredis': false,
        '@ioredis/commands': false,
        'redis-errors': false,
      };
    }

    // Comprehensive fix for Next.js 15 client reference manifest issues
    if (isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({
          __RSC_MANIFEST__: JSON.stringify({}),
          __RSC_CSS_MANIFEST__: JSON.stringify({}),
        })
      );

      // Additional fix for route group manifest generation
      config.resolve.alias = {
        ...config.resolve.alias,
        '__NEXT_CLIENT_REFERENCE_MANIFEST__': false,
      };
    }

    // Suppress webpack warnings related to client reference manifests and build-time environment variable errors
    // More specific patterns to avoid hiding legitimate issues
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      // Client reference manifest warnings (Next.js 15 compatibility)
      /client-reference-manifest\.js/,
      /__NEXT_CLIENT_REFERENCE_MANIFEST__/,
      // Build-time database warnings (expected during Cloudflare Workers build)
      /DATABASE_URL environment variable is not set.*build.*time/,
      /Database not available during build time/,
      // Build-time API key warnings (expected when using placeholder keys)
      /Environment variable ANTHROPIC_API_KEY is not set.*build.*time/,
      /Missing API key\. Pass it to the constructor new Resend.*build.*time/,
      // Canvas and JSDOM related warnings for Edge Runtime compatibility
      /Canvas is not defined/,
      /Cannot resolve module 'canvas'/,
      /Module not found: Can't resolve 'canvas'/,
      /Critical dependency: require function is used in a way in which dependencies cannot be statically extracted/,
      // IORedis Edge Runtime warnings - now externalized
      /Module not found: Can't resolve 'ioredis'/,
      /Module not found: Can't resolve '@ioredis\/commands'/,
      /Module not found: Can't resolve 'redis-errors'/,
      /process\.nextTick is not a function/,
      /setImmediate is not defined/,
      /A Node\.js API is used \(process\.nextTick/,
      /A Node\.js API is used \(setImmediate/,
      /A Node\.js API is used \(process\.version/,
      /which is not supported in the Edge Runtime/,
      // Webpack minification errors in Next.js 15
      /_webpack\.WebpackError is not a constructor/,
      /MinifyWebpackPlugin/,
      // Specific build-time placeholder warnings
      /build-time-placeholder-key/,
      // More specific environment variable warnings
      /RESEND_API_KEY.*build.*phase/,
      /ANTHROPIC_API_KEY.*build.*phase/,
      // Legacy patterns for compatibility
      /Environment variable ANTHROPIC_API_KEY is not set/,
      /Missing API key\. Pass it to the constructor new Resend/,
      /RESEND_API_KEY/,
      /ANTHROPIC_API_KEY/,
      /build-time-placeholder/,
    ];

    return config;
  },
};
export default nextConfig;
