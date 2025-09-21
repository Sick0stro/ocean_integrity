import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Experimental features for stability
  experimental: {
    // Enable Turbopack for faster builds
    turbo: {
      // Optimize memory usage
      memoryLimit: 4096,
    },
    // Optimize bundling
    optimizePackageImports: ['lucide-react'],
  },

  // Build optimization
  swcMinify: true,

  // Webpack configuration
  webpack: (config, { dev, isServer }) => {
    // Canvas externals for PDF functionality
    config.externals.push({
      canvas: 'commonjs canvas',
    });

    // Optimize for development stability
    if (dev) {
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
