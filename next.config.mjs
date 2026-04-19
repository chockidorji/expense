/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "google-auth-library"],
  },
  // ESLint is run manually via `pnpm lint`; don't block production builds on it.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
