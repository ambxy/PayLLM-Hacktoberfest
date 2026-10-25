"use client";

import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { usePathname } from "next/navigation";
import { AuthGate, LogoutButton } from "./auth-gate";
import { Navigation } from "./navigation";
import { AgentPanel } from "./chat/agent-panel";
import { useEffect, useState } from "react";
import { isWorldAgentsPreview } from "./world-agents/preview";

export function BankShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAgentConnection =
    pathname === "/world-agents" || pathname === "/world-agents/connect";
  const [preview, setPreview] = useState<boolean>();
  useEffect(() => {
    setPreview(isWorldAgentsPreview());
  }, [pathname]);
  if (isAgentConnection && preview === undefined) return null;
  const designPreview = isAgentConnection && preview && isWorldAgentsPreview();
  const content = (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <BrandLogo size={36} tone="dark" />
          </span>
          Agent Bank
        </Link>
        <Navigation preview={Boolean(designPreview)} />
        <LogoutButton />
      </aside>
      <main id="main">{children}</main>
      {!designPreview && <AgentPanel />}
    </div>
  );
  return designPreview ? content : <AuthGate>{content}</AuthGate>;
}
