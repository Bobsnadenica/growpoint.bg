// Service-worker bootstrap. Kept out of index.html so the Content-Security-
// Policy can keep script-src strictly 'self' (no 'unsafe-inline' for scripts).

function cleanLocalCareerLaneCaches() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.scope.includes("/dev/career/"))
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
            .filter((key) => key.startsWith("careerlane-"))
            .map((key) => caches.delete(key))
        )
      )
      .catch(() => {});
  }
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("sw.js", window.location.href));
  });
}

if (import.meta.env.DEV) {
  window.addEventListener("load", cleanLocalCareerLaneCaches);
}
