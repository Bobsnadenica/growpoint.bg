import PageScene from "../layout/PageScene";
import { AuthPage as LegacyAuthPage } from "../legacy/SiteAppLegacy";

export default function AuthPage() {
  return (
    <PageScene tone="auth" pageKey="auth">
      <LegacyAuthPage />
    </PageScene>
  );
}
