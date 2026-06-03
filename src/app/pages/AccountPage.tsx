import PageScene from "../layout/PageScene";
import { AccountPage as LegacyAccountPage } from "../legacy/SiteAppLegacy";

export default function AccountPage() {
  return (
    <PageScene tone="dashboard" pageKey="account">
      <LegacyAccountPage />
    </PageScene>
  );
}
