import type { NextConfig } from 'next';

// Extend the NextConfig type to include experimental options
interface ExtendedNextConfig extends NextConfig {
  experimental?: {
    optimizePackageImports?: string[];
    // Add other experimental options here if needed
  };
}

const nextConfig: ExtendedNextConfig = {
  // Experimental features for stability
  experimental: {
    // Optimize bundling
    optimizePackageImports: ['lucide-react'],
  },

  // Webpack configuration (only when not using Turbopack)
  webpack: (config, { dev, isServer, webpack }) => {
    // Canvas externals for PDF functionality
    config.externals.push({
      canvas: 'commonjs canvas',
    });

    // Only apply webpack optimizations when NOT using Turbopack
    if (dev && !process.env.TURBOPACK) {
      // Prevent file watcher issues on Windows
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };

      // Optimize chunk splitting for faster rebuilds
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
            },
          },
        },
      };
    }

    return config;
  },

  // Output optimization
  output: 'standalone',

  // Enable build cache for faster rebuilds
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },
};

export default nextConfig;
