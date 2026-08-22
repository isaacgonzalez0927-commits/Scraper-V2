import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@libsql/client", "libsql"],
  async redirects() {
    return [{ source: "/nova", destination: "/serenity", permanent: false }];
  },
};

export default nextConfig;
