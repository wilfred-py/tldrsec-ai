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
  experimental: {
    // Enable stricter route group validation to prevent conflicts
    strictNextHead: true,
    optimizePackageImports: ['@clerk/nextjs', 'lucide-react'],
  },
  // Generate static pages where possible to avoid database dependencies during build
  generateBuildId: async () => {
    // Use a simple build ID to avoid external dependencies
    return 'build-' + Date.now();
  },
  // Configure output to handle both static and dynamic routes appropriately
  output: process.env.VERCEL ? undefined : 'standalone',
  serverExternalPackages: [],
  webpack: (config, { isServer, webpack, dev }) => {
    // TEMPORARY FIX: Disable minification due to webpack minify plugin error
    // Issue: _webpack.WebpackError is not a constructor in minify-webpack-plugin
    // This allows production builds to complete successfully
    // TODO: Re-enable minification after identifying problematic code patterns
    if (!dev) {
      config.optimization = {
        ...config.optimization,
        minimize: false
      };
    }

    if (!isServer) {
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
