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

    // Workaround for missing client reference manifest files in Next.js 15
    if (isServer) {
      config.plugins.push(
        new webpack.DefinePlugin({
          __RSC_MANIFEST__: JSON.stringify({}),
        })
      );
    }

    return config;
  },
};
export default nextConfig;
