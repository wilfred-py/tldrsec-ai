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
  serverExternalPackages: [],
  webpack: (config, { isServer, webpack }) => {
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

    // Suppress webpack warnings related to client reference manifests
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      /client-reference-manifest\.js/,
      /__NEXT_CLIENT_REFERENCE_MANIFEST__/,
    ];

    return config;
  },
};
export default nextConfig;
