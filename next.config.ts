import type { NextConfig } from "next";
const config: NextConfig = {
  agentRules: false,
  logging: { incomingRequests: { ignore: [/\/api\/world-agents\/callback/] } },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/world-agents/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  serverExternalPackages: ["better-sqlite3"],
};
export default config;
