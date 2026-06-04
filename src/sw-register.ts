// Service-worker bootstrap. Kept out of index.html so the Content-Security-
// Policy can keep script-src strictly 'self' (no 'unsafe-inline' for scripts).

function cleanLocalGrowPointCaches() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) =>
              ["/dev/career/", "/career/"].some((scope) => registration.scope.includes(scope))
            )
            .map((registration) => registration.unregister())
        )
      )
      .catch(() => {});
  }

  if ("caches" in window) {
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("growpoint-") || key.startsWith("careerlane-"))
            .map((key) => caches.delete(key))
        )
      )
      .catch(() => {});
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    const basePath = import.meta.env.BASE_URL || "/";
    navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath });
  });
}

if (import.meta.env.DEV) {
  window.addEventListener("load", cleanLocalGrowPointCaches);
}
