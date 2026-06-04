import seoData from "./seo-data.json";

type SeoRoute = {
  path: string;
  canonicalPath?: string;
  title: string;
  description: string;
  schemaType?: string;
  index?: boolean;
};

type SeoResolvedRoute = {
  path: string;
  canonicalPath: string;
  canonicalUrl: string;
  title: string;
  description: string;
  schemaType: string;
  index: boolean;
  image: string;
};

type ConsultantSeoProfile = {
  slug?: string;
  name?: string;
  headline?: string;
  bio?: string;
  experienceSummary?: string;
  avatarUrl?: string;
  heroUrl?: string;
  profileType?: string;
  specializations?: string[];
};

const routes = seoData.routes as SeoRoute[];
const siteUrl = seoData.siteUrl.replace(/\/+$/, "");

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function publicPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return normalized === "/" ? "/" : `${normalized}/`;
}

function absoluteUrl(pathname: string) {
  return `${siteUrl}${publicPath(pathname)}`;
}

function routeForPath(pathname: string) {
  const normalized = normalizePathname(pathname);
  return routes.find((route) => normalizePathname(route.path) === normalized);
}

function isPrivatePath(pathname: string) {
  return /^\/(?:auth|account|dashboard|admin)(?:\/|$)/.test(normalizePathname(pathname));
}

export function resolveSeo(pathname: string): SeoResolvedRoute {
  const normalized = normalizePathname(pathname);
  const exactRoute = routeForPath(normalized);
  const fallbackRoute: SeoRoute =
    normalized.startsWith("/consultants/")
      ? {
          path: normalized,
          title: "Кариерен консултант или ментор | CareerLane",
          description:
            "Публичен профил на кариерен консултант или ментор в CareerLane.",
          schemaType: "ProfilePage",
          index: true
        }
      : {
          path: normalized,
          title: seoData.defaultTitle,
          description: seoData.defaultDescription,
          schemaType: "WebPage",
          index: !isPrivatePath(normalized)
        };
  const route = exactRoute || fallbackRoute;
  const canonicalPath = route.canonicalPath || route.path || "/";

  return {
    path: normalized,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    title: route.title || seoData.defaultTitle,
    description: route.description || seoData.defaultDescription,
    schemaType: route.schemaType || "WebPage",
    index: route.index !== false && !isPrivatePath(normalized),
    image: seoData.defaultImage
  };
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.setAttribute("content", content);
}

function upsertLink(rel: string, href: string, extraAttributes: Record<string, string> = {}) {
  const selector = [
    `link[rel="${rel}"]`,
    ...Object.entries(extraAttributes).map(([key, value]) => `[${key}="${value}"]`)
  ].join("");
  let element = document.head.querySelector<HTMLLinkElement>(selector);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    Object.entries(extraAttributes).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }

  element.setAttribute("href", href);
}

function buildStructuredData(route: SeoResolvedRoute) {
  const pageId = `${route.canonicalUrl}#webpage`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: seoData.organization.name,
        url: `${siteUrl}/`,
        email: seoData.organization.email
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        name: seoData.siteName,
        url: `${siteUrl}/`,
        inLanguage: seoData.language,
        publisher: { "@id": `${siteUrl}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: `${siteUrl}/users/?q={search_term_string}`,
          "query-input": "required name=search_term_string"
        }
      },
      {
        "@type": route.schemaType,
        "@id": pageId,
        url: route.canonicalUrl,
        name: route.title,
        description: route.description,
        inLanguage: seoData.language,
        isPartOf: { "@id": `${siteUrl}/#website` },
        primaryImageOfPage: { "@id": `${route.canonicalUrl}#primaryimage` }
      },
      {
        "@type": "ImageObject",
        "@id": `${route.canonicalUrl}#primaryimage`,
        url: route.image
      }
    ]
  };
}

function upsertStructuredData(route: SeoResolvedRoute) {
  let element = document.head.querySelector<HTMLScriptElement>("#structured-data");

  if (!element) {
    element = document.createElement("script");
    element.id = "structured-data";
    element.type = "application/ld+json";
    document.head.appendChild(element);
  }

  element.textContent = JSON.stringify(buildStructuredData(route));
}

export function applyRouteSeo(pathname: string) {
  const route = resolveSeo(pathname);
  const robots = route.index ? "index,follow,max-image-preview:large" : "noindex,nofollow";

  document.title = route.title;
  upsertMeta("name", "description", route.description);
  upsertMeta("name", "robots", robots);
  upsertMeta("name", "application-name", seoData.siteName);
  upsertMeta("property", "og:site_name", seoData.siteName);
  upsertMeta("property", "og:locale", seoData.locale);
  upsertMeta("property", "og:type", route.schemaType === "ProfilePage" ? "profile" : "website");
  upsertMeta("property", "og:url", route.canonicalUrl);
  upsertMeta("property", "og:title", route.title);
  upsertMeta("property", "og:description", route.description);
  upsertMeta("property", "og:image", route.image);
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:url", route.canonicalUrl);
  upsertMeta("name", "twitter:title", route.title);
  upsertMeta("name", "twitter:description", route.description);
  upsertMeta("name", "twitter:image", route.image);
  upsertLink("canonical", route.canonicalUrl);
  upsertLink("alternate", route.canonicalUrl, { hreflang: seoData.language });
  upsertLink("alternate", route.canonicalUrl, { hreflang: "x-default" });
  upsertStructuredData(route);
}

export function applyConsultantProfileSeo(consultant: ConsultantSeoProfile) {
  const slug = consultant.slug || "";
  const canonicalPath = slug ? `/consultants/${slug}` : "/users";
  const headline = consultant.headline?.trim();
  const summary = consultant.bio?.trim() || consultant.experienceSummary?.trim() || headline;
  const title = consultant.name
    ? `${consultant.name} - ${headline || "кариерен консултант"} | CareerLane`
    : "Кариерен консултант или ментор | CareerLane";
  const description = summary
    ? summary.slice(0, 170)
    : "Публичен профил на кариерен консултант или ментор в CareerLane.";
  const image = consultant.heroUrl || consultant.avatarUrl || seoData.defaultImage;
  const route: SeoResolvedRoute = {
    path: canonicalPath,
    canonicalPath,
    canonicalUrl: absoluteUrl(canonicalPath),
    title,
    description,
    schemaType: "ProfilePage",
    index: true,
    image
  };

  document.title = route.title;
  upsertMeta("name", "description", route.description);
  upsertMeta("name", "robots", "index,follow,max-image-preview:large");
  upsertMeta("property", "og:type", "profile");
  upsertMeta("property", "og:url", route.canonicalUrl);
  upsertMeta("property", "og:title", route.title);
  upsertMeta("property", "og:description", route.description);
  upsertMeta("property", "og:image", route.image);
  upsertMeta("name", "twitter:card", "summary_large_image");
  upsertMeta("name", "twitter:url", route.canonicalUrl);
  upsertMeta("name", "twitter:title", route.title);
  upsertMeta("name", "twitter:description", route.description);
  upsertMeta("name", "twitter:image", route.image);
  upsertLink("canonical", route.canonicalUrl);
  upsertLink("alternate", route.canonicalUrl, { hreflang: seoData.language });
  upsertLink("alternate", route.canonicalUrl, { hreflang: "x-default" });
  upsertStructuredData(route);
}
