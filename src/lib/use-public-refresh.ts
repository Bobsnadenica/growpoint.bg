import { useEffect, useState } from "react";

// Refresh while a public directory/profile is actually being viewed. No
// background-tab traffic or always-on realtime infrastructure is needed.
export function usePublicRefresh() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) setRevision((v) => v + 1); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return revision;
}
