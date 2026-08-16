import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@libsql/client", "libsql"],
};

export default nextConfig;
