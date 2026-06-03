import PageScene from "../layout/PageScene";
import { DashboardPage as LegacyDashboardPage } from "../legacy/SiteAppLegacy";

export default function ProfilePage() {
  return (
    <PageScene tone="dashboard" pageKey="dashboard">
      <LegacyDashboardPage />
    </PageScene>
  );
}
