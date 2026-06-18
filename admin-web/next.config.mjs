/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/proxy/:path*',
        destination: 'http://100.59.0.187:4000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
