import PageScene from "../layout/PageScene";
import { HomePage as LegacyHomePage } from "../legacy/SiteAppLegacy";

export default function HomePage() {
  return (
    <PageScene tone="home" pageKey="home">
      <LegacyHomePage />
    </PageScene>
  );
}
