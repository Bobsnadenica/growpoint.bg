// Read-only launch gate; never disables TLS verification or changes DNS.
const hosts = ["growpoint.bg", "www.growpoint.bg"];
let failures = 0;
for (const host of hosts) {
  for (const protocol of ["https:", "http:"]) {
    const url = `${protocol}//${host}/`;
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10000) });
      const target = new URL(response.headers.get("location") || url, url);
      const secureRedirect = [301, 302, 303, 307, 308].includes(response.status)
        && target.protocol === "https:" && hosts.includes(target.hostname);
      const passed = protocol === "http:"
        ? secureRedirect
        : response.status === 200 || secureRedirect;
      if (!passed) failures++;
      console.log(`${passed ? "PASS" : "FAIL"} ${url} — HTTP ${response.status}${response.headers.has("location") ? ` → ${target.href}` : ""}`);
    } catch (error) {
      failures++;
      console.log(`FAIL ${url} — ${error.cause?.code || error.message}`);
    }
  }
}
console.log(`Launch domain checks: ${4 - failures}/4 passed. Certificates and HTTPS redirects must all pass before launch.`);
process.exitCode = failures ? 1 : 0;
