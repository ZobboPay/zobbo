/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: { serverComponentsExternalPackages: ["pg"] },
  images: { unoptimized: true },
};

export default nextConfig;
