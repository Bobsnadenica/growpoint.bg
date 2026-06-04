import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as viteBuild } from "vite";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const distDir = path.join(projectDir, "dist");
const distAssetsDir = path.join(distDir, "assets");
const rootAssetsDir = path.join(projectDir, "assets");
const rootAdvertisementDir = path.join(rootAssetsDir, "advertisement");
const deployIndexPath = path.join(projectDir, "index.html");
const seoDataPath = path.join(projectDir, "src/lib/seo-data.json");

async function cleanDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
  await mkdir(dirPath, { recursive: true });
}

async function copyIfExists(sourcePath, targetPath, options) {
  try {
    await cp(sourcePath, targetPath, options);
  } catch {}
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeAttribute(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  return `/${String(pathname).replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function publicPath(pathname) {
  const normalized = normalizePathname(pathname);
  return normalized === "/" ? "/" : `${normalized}/`;
}

function absoluteUrl(siteUrl, pathname) {
  return `${siteUrl.replace(/\/+$/, "")}${publicPath(pathname)}`;
}

function routeCanonicalPath(route) {
  return route.canonicalPath || route.path || "/";
}

function routeRobots(route) {
  return route.index === false ? "noindex,nofollow" : "index,follow,max-image-preview:large";
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function buildStructuredData(seoData, route) {
  const siteUrl = seoData.siteUrl.replace(/\/+$/, "");
  const canonicalUrl = absoluteUrl(siteUrl, routeCanonicalPath(route));
  const image = route.image || seoData.defaultImage;

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
        "@type": route.schemaType || "WebPage",
        "@id": `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: route.title || seoData.defaultTitle,
        description: route.description || seoData.defaultDescription,
        inLanguage: seoData.language,
        isPartOf: { "@id": `${siteUrl}/#website` },
        primaryImageOfPage: { "@id": `${canonicalUrl}#primaryimage` }
      },
      {
        "@type": "ImageObject",
        "@id": `${canonicalUrl}#primaryimage`,
        url: image
      }
    ]
  };
}

function replaceTag(html, pattern, tag) {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace("</head>", `    ${tag}\n  </head>`);
}

function setMeta(html, attribute, key, content) {
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, "i");
  return replaceTag(
    html,
    pattern,
    `<meta ${attribute}="${key}" content="${escapeAttribute(content)}">`
  );
}

function setLink(html, rel, href, extraAttributes = {}) {
  const extraSelector = Object.entries(extraAttributes)
    .map(([key, value]) => `[^>]*${key}=["']${value}["']`)
    .join("");
  const pattern = new RegExp(`<link\\s+[^>]*rel=["']${rel}["']${extraSelector}[^>]*>`, "i");
  const attributes = Object.entries(extraAttributes)
    .map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`)
    .join("");

  return replaceTag(
    html,
    pattern,
    `<link rel="${rel}"${attributes} href="${escapeAttribute(href)}">`
  );
}

function renderRouteHtml(baseHtml, seoData, route) {
  const siteUrl = seoData.siteUrl.replace(/\/+$/, "");
  const canonicalUrl = absoluteUrl(siteUrl, routeCanonicalPath(route));
  const title = route.title || seoData.defaultTitle;
  const description = route.description || seoData.defaultDescription;
  const image = route.image || seoData.defaultImage;
  let html = baseHtml;

  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeXml(title)}</title>`);
  html = setMeta(html, "name", "description", description);
  html = setMeta(html, "name", "robots", routeRobots(route));
  html = setMeta(html, "name", "application-name", seoData.siteName);
  html = setMeta(html, "property", "og:type", route.schemaType === "ProfilePage" ? "profile" : "website");
  html = setMeta(html, "property", "og:site_name", seoData.siteName);
  html = setMeta(html, "property", "og:locale", seoData.locale);
  html = setMeta(html, "property", "og:url", canonicalUrl);
  html = setMeta(html, "property", "og:title", title);
  html = setMeta(html, "property", "og:description", description);
  html = setMeta(html, "property", "og:image", image);
  html = setMeta(html, "name", "twitter:card", "summary_large_image");
  html = setMeta(html, "name", "twitter:url", canonicalUrl);
  html = setMeta(html, "name", "twitter:title", title);
  html = setMeta(html, "name", "twitter:description", description);
  html = setMeta(html, "name", "twitter:image", image);
  html = setLink(html, "canonical", canonicalUrl);
  html = setLink(html, "alternate", canonicalUrl, { hreflang: seoData.language });
  html = setLink(html, "alternate", canonicalUrl, { hreflang: "x-default" });

  const structuredDataTag = `<script type="application/ld+json" id="structured-data">${safeJson(buildStructuredData(seoData, route))}</script>`;
  html = replaceTag(
    html,
    /<script\s+[^>]*id=["']structured-data["'][^>]*>[\s\S]*?<\/script>/i,
    structuredDataTag
  );

  return html;
}

function sitemapXml(seoData) {
  const siteUrl = seoData.siteUrl.replace(/\/+$/, "");
  const seen = new Set();
  const urls = seoData.routes
    .filter((route) => route.index !== false && route.sitemap !== false)
    .map((route) => ({
      ...route,
      canonicalUrl: absoluteUrl(siteUrl, routeCanonicalPath(route))
    }))
    .filter((route) => {
      if (seen.has(route.canonicalUrl)) return false;
      seen.add(route.canonicalUrl);
      return true;
    });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      (route) => `  <url>
    <loc>${escapeXml(route.canonicalUrl)}</loc>${route.lastmod ? `
    <lastmod>${escapeXml(route.lastmod)}</lastmod>` : ""}${route.changefreq ? `
    <changefreq>${escapeXml(route.changefreq)}</changefreq>` : ""}${route.priority ? `
    <priority>${escapeXml(route.priority)}</priority>` : ""}
  </url>`
    )
    .join("\n")}\n</urlset>\n`;
}

function routeTargetDir(route) {
  const normalized = normalizePathname(route.path);
  if (normalized === "/") return projectDir;
  return path.join(projectDir, normalized.slice(1));
}

function generatedRouteRoots(seoData) {
  return Array.from(
    new Set(
      seoData.routes
        .filter((route) => route.renderStatic && normalizePathname(route.path) !== "/")
        .map((route) => normalizePathname(route.path).split("/")[1])
        .filter(Boolean)
    )
  );
}

async function writeSeoFiles(baseHtml, seoData) {
  for (const root of generatedRouteRoots(seoData)) {
    await rm(path.join(projectDir, root), { recursive: true, force: true });
  }
  await rm(path.join(projectDir, "404.html"), { force: true });

  for (const route of seoData.routes.filter((item) => item.renderStatic)) {
    const targetDir = routeTargetDir(route);
    await mkdir(targetDir, { recursive: true });
    await writeFile(path.join(targetDir, "index.html"), renderRouteHtml(baseHtml, seoData, route));
  }

  const notFoundRoute = {
    path: "/404",
    canonicalPath: "/",
    title: `Страницата не е намерена | ${seoData.siteName}`,
    description: "Тази страница не беше намерена. Върни се към CareerLane.",
    schemaType: "WebPage",
    index: false
  };
  await writeFile(path.join(projectDir, "404.html"), renderRouteHtml(baseHtml, seoData, notFoundRoute));
  await writeFile(path.join(projectDir, "sitemap.xml"), sitemapXml(seoData));
}

async function copyBuildOutput({ keepDist }) {
  const seoData = JSON.parse(await readFile(seoDataPath, "utf8"));
  const preservedAdvertisementDir = path.join(distDir, "__advertisement-preserve");

  if (existsSync(rootAdvertisementDir)) {
    await cp(rootAdvertisementDir, preservedAdvertisementDir, { recursive: true });
  }

  await cleanDir(rootAssetsDir);
  await cp(distAssetsDir, rootAssetsDir, { recursive: true });

  if (existsSync(preservedAdvertisementDir)) {
    await cp(preservedAdvertisementDir, rootAdvertisementDir, { recursive: true });
  }

  await cp(path.join(distDir, "index.html"), deployIndexPath);

  const filesToCopy = ["manifest.json", "sw.js", "favicon.svg", "robots.txt"];

  for (const file of filesToCopy) {
    await copyIfExists(path.join(distDir, file), path.join(projectDir, file));
  }

  await writeSeoFiles(await readFile(deployIndexPath, "utf8"), seoData);

  if (!keepDist) {
    await rm(distDir, { recursive: true, force: true });
  }
}

async function runBuild({ keepDist = false } = {}) {
  process.chdir(projectDir);
  await viteBuild();
  await copyBuildOutput({ keepDist });
}

const mode = process.argv[2];

if (mode === "prepare") {
  // Vite now reads from src/index.html, so local dev no longer rewrites deploy index.html.
} else if (mode === "build") {
  await runBuild();
} else if (mode === "preview") {
  await runBuild({ keepDist: true });
} else {
  throw new Error(`Unsupported mode: ${mode}`);
}
