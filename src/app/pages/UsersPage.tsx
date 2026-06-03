import PageScene from "../layout/PageScene";
import { UsersPage as LegacyUsersPage } from "../legacy/SiteAppLegacy";

export default function UsersPage() {
  return (
    <PageScene tone="directory" pageKey="users">
      <LegacyUsersPage />
    </PageScene>
  );
}
