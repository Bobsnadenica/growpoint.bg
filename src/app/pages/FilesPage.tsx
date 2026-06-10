import PageScene from "../layout/PageScene";
import { FilesPageBody } from "../legacy/SiteAppLegacy";

export default function FilesPage() {
  return (
    <PageScene tone="dashboard" pageKey="files">
      <FilesPageBody />
    </PageScene>
  );
}
