import { type ReactNode, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { config } from "../../lib/config";
import ComingSoon from "./ComingSoon";

export default function MaintenanceGate({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const { isAdmin } = useAuth();
  const location = useLocation();
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const response = await fetch(`${config.basePath}maintenance.txt`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
        const value = (await response.text()).trim();
        if (!response.ok || !["0", "1"].includes(value)) throw new Error("Invalid maintenance flag");
        if (alive) setEnabled(value === "1");
      } catch {
        // Never flash the site while its visibility setting is unavailable.
        if (alive) setEnabled(previous => previous ?? true);
      }
    }
    void check();
    const onFocus = () => { void check(); };
    const interval = window.setInterval(() => { if (!document.hidden) void check(); }, 60000);
    window.addEventListener("focus", onFocus);
    return () => { alive = false; window.clearInterval(interval); window.removeEventListener("focus", onFocus); };
  }, []);
  const preview = new URLSearchParams(location.search).get("preview") === "soon";
  // Keep existing Cognito login and legal documents reachable; the admin
  // backend still independently enforces its JWT/group checks.
  const allowedRoute = /^\/(?:auth|admin|privacy|terms)(?:\/|$)/.test(location.pathname);
  if (!preview && (isAdmin || allowedRoute || enabled === false)) return <>{children}</>;
  if (enabled === null && !preview) return <div className="coming-soon-loading" role="status">Подготвяме нещо хубаво…</div>;
  return <ComingSoon />;
}
