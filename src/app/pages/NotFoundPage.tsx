import PageScene from "../layout/PageScene";
import { NotFoundPage as LegacyNotFoundPage } from "../legacy/SiteAppLegacy";

export default function NotFoundPage() {
  return (
    <PageScene tone="fallback" pageKey="not-found">
      <LegacyNotFoundPage />
    </PageScene>
  );
}
