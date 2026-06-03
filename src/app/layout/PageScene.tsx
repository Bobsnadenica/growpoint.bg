import type { PropsWithChildren } from "react";

export type PageSceneTone =
  | "home"
  | "directory"
  | "consultant"
  | "company"
  | "support"
  | "auth"
  | "dashboard"
  | "fallback";

type PageSceneProps = PropsWithChildren<{
  tone: PageSceneTone;
  pageKey: string;
}>;

export default function PageScene({ tone, pageKey, children }: PageSceneProps) {
  return (
    <div className={`page-scene page-scene--${tone}`} data-page={pageKey}>
      {children}
    </div>
  );
}
