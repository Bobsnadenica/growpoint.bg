import PageScene from "../layout/PageScene";
import { ConsultantPage as LegacyConsultantPage } from "../legacy/SiteAppLegacy";

export default function ConsultantProfilePage() {
  return (
    <PageScene tone="consultant" pageKey="consultant-profile">
      <LegacyConsultantPage />
    </PageScene>
  );
}
