import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@libsql/client", "@libsql/client/web", "libsql"],
};

export default nextConfig;
