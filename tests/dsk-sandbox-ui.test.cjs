const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const source = path => readFileSync(require.resolve(`../${path}`), "utf8");
const FIRST = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const SECOND = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const BANK_URL = "https://uat.dskbank.bg/payment/merchants/test/payment_bg.html?mdOrder=cccccccc-cccc-4ccc-cccc-cccccccccccc";
const configuration = { enabled: true, amountMinor: 100, currency: "EUR" };
const order = (status = "created", extra = {}) => ({ checkoutId: FIRST, status, amountMinor: 100, currency: "EUR", ...extra });

// Run the real component's handlers/effects with in-memory hooks and API only.
function mount({ token = "fixture-admin", search = "", api = {} } = {}) {
  const hooks = [], effects = [], calls = [], navigation = [];
  let cursor = 0, dirty = true, tree, props = { token }, nextId = search.includes(FIRST) ? SECOND : FIRST;
  const location = { pathname: "/admin", search };
  const slot = value => { const index = cursor++; return [hooks[index] ||= value, index]; };
  const react = {
    useState(initial) {
      const [hook] = slot({ value: typeof initial === "function" ? initial() : initial });
      return [hook.value, value => { hook.value = typeof value === "function" ? value(hook.value) : value; dirty = true; }];
    },
    useRef(current) { return slot({ current })[0]; },
    useEffect(effect, deps) {
      const [hook] = slot({ deps: null });
      if (!hook.deps || !deps.every((value, index) => Object.is(value, hook.deps[index]))) {
        hook.cleanup?.(); hook.deps = deps; effects.push(() => { hook.cleanup = effect(); });
      }
    }
  };
  const fakeApi = {
    adminGetDskUatConfig: async value => { calls.push(["config", value]); return configuration; },
    adminCreateDskUatOrder: async (value, id) => { calls.push(["create", value, id]); return order("created", { checkoutId: id, checkoutUrl: BANK_URL }); },
    adminGetDskUatOrder: async (value, id) => { calls.push(["get", value, id]); return order("pending", { checkoutId: id }); },
    ...api
  };
  const jsx = (type, properties) => ({ type, props: properties });
  const exports = {};
  const context = {
    exports, URL, URLSearchParams, crypto: { randomUUID: () => { const value = nextId; nextId = SECOND; return value; } },
    require(name) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-router-dom") return { useLocation: () => location, useNavigate: () => path => {
        navigation.push(path); location.search = new URL(path, "https://example.invalid").search; dirty = true;
      } };
      if (name.endsWith("/api")) return { api: fakeApi };
      if (name.endsWith("/datetime")) return { formatDateTimeBg: value => value };
      throw new Error(`Unexpected fixture import: ${name}`);
    }
  };
  const compiled = ts.transpileModule(source("src/app/components/DskSandboxPanel.tsx"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  vm.runInNewContext(compiled, context);
  function render() { cursor = 0; dirty = false; tree = exports.default(props); effects.splice(0).forEach(effect => effect()); }
  function nodes(value = tree) {
    if (!value || typeof value !== "object") return [];
    if (Array.isArray(value)) return value.flatMap(nodes);
    return [value, ...nodes(value.props?.children)];
  }
  function text(value = tree) {
    if (value == null || typeof value === "boolean") return "";
    if (Array.isArray(value)) return value.map(text).join(" ");
    return typeof value === "object" ? text(value.props?.children) : String(value);
  }
  render();
  return {
    exports, calls, navigation, text, nodes,
    async flush() { for (let i = 0; i < 12; i++) { await new Promise(setImmediate); if (!dirty) break; render(); } },
    click(label) { const button = nodes().find(node => node.type === "button" && text(node) === label); assert.ok(button, label); button.props.onClick(); },
    changeToken(value) { props = { token: value }; render(); },
    unmount() { hooks.forEach(hook => hook.cleanup?.()); }
  };
}

test("sandbox fails closed when disabled or configuration cannot be read", async () => {
  for (const adminGetDskUatConfig of [async () => ({ ...configuration, enabled: false }), async () => undefined, async () => { throw new Error("unavailable"); }]) {
    const fixture = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatConfig } });
    await fixture.flush();
    assert.equal(fixture.text(), "");
    assert.equal(fixture.calls.length, 0);
  }
  const admin = source("src/app/pages/AdminPage.tsx");
  assert.ok(admin.indexOf("if (!isAdmin)") < admin.indexOf("<DskSandboxPanel"));
  assert.match(admin, /DskSandboxPanel key=\{user\.id\} token=\{token\}/);
  assert.match(admin, /encodeURIComponent\(location\.pathname \+ location\.search\)/);
});

test("bank returns only read verified status; forged or duplicate return parameters cannot create orders", async () => {
  const fixture = mount({ search: `?paymentTest=${FIRST}&success=true&paymentStatus=paid` });
  await fixture.flush();
  assert.deepEqual(fixture.calls, [["config", "fixture-admin"], ["get", "fixture-admin", FIRST]]);
  assert.match(fixture.text(), /още не е потвърдено/);
  for (const search of ["?success=true", "?paymentTest=not-a-uuid", `?paymentTest=${FIRST}&paymentTest=${SECOND}`]) {
    assert.equal(fixture.exports.readDskUatReturnId(search), null);
  }
  assert.equal(fixture.exports.readDskUatReturnId(`?paymentTest=${FIRST.toUpperCase()}`), FIRST);
  assert.equal(fixture.calls.filter(call => call[0] === "create").length, 0);
});

test("create double-click and network retry use one UUID; reload recovers it with GET", async () => {
  const created = [];
  const fixture = mount({ api: { adminCreateDskUatOrder: async (_token, id) => {
    created.push(id); if (created.length === 1) throw new Error("timeout");
    return order("created", { checkoutId: id, checkoutUrl: BANK_URL });
  } } });
  await fixture.flush();
  fixture.click("Създай тестова поръчка");
  fixture.click("Създай тестова поръчка");
  await fixture.flush();
  assert.deepEqual(created, [FIRST]);
  assert.equal(fixture.navigation[0], `/admin?paymentTest=${FIRST}`);
  fixture.click("Опитай със същата поръчка");
  await fixture.flush();
  assert.deepEqual(created, [FIRST, FIRST]);
  assert.equal(fixture.calls.filter(call => call[0] === "get").length, 0);
  const reloaded = mount({ search: new URL(fixture.navigation[0], "https://example.invalid").search });
  await reloaded.flush();
  assert.equal(reloaded.calls.at(-1)[0], "get");
  assert.equal(reloaded.calls.at(-1)[2], FIRST);
});

test("all server statuses are honest; only terminal orders offer a new order and no polling occurs", async () => {
  for (const status of ["created", "pending", "authorized", "succeeded", "failed", "cancelled", "refunded", "unknown"]) {
    const result = order(status, status === "succeeded" ? { actionCode: "0", verifiedAt: "2026-10-01T00:00:00Z" } : {});
    const fixture = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatOrder: async () => result } });
    await fixture.flush();
    assert.ok(!fixture.nodes().some(node => node.props?.role === "alert"), status);
    assert.equal(fixture.nodes().some(node => node.type === "button" && fixture.text(node) === "Нова тестова поръчка"), ["succeeded", "failed", "cancelled", "refunded"].includes(status));
    assert.match(fixture.text(), /Не активира пакет или достъп до среща/);
    await fixture.flush();
    assert.equal(fixture.calls.length, 1, "configuration fetched once; no polling or automatic creation");
    if (status === "failed") {
      fixture.click("Нова тестова поръчка"); await fixture.flush();
      assert.equal(fixture.calls.at(-1)[0], "create");
      assert.notEqual(fixture.calls.at(-1)[2], FIRST);
    }
  }
});

test("success requires verified timestamp/action code and exact checkout/amount/currency", () => {
  const fixture = mount();
  const valid = order("succeeded", { actionCode: "0", verifiedAt: "2026-10-01T00:00:00Z" });
  assert.equal(fixture.exports.validateDskUatOrder(valid, FIRST), valid);
  for (const change of [{ actionCode: "5" }, { verifiedAt: undefined }, { verifiedAt: "invalid" }, { amountMinor: 101 }, { currency: "USD" }, { checkoutId: SECOND }, { status: "__proto__" }]) {
    assert.throws(() => fixture.exports.validateDskUatOrder({ ...valid, ...change }, FIRST));
  }
  fixture.unmount();
});

test("bank URL validation rejects other hosts, credentials, unsafe paths and missing bank order", () => {
  const fixture = mount();
  assert.equal(fixture.exports.isDskUatCheckoutUrl(BANK_URL), true);
  assert.equal(fixture.exports.isDskUatCheckoutUrl(BANK_URL.replace("/payment/merchants", "/payment/payment/merchants").replace("_bg", "_en")), true);
  for (const url of [BANK_URL.replace("https:", "http:"), BANK_URL.replace("uat.dskbank.bg", "uat.dskbank.bg.evil.invalid"), BANK_URL.replace("uat.dskbank.bg", "secret@uat.dskbank.bg"), BANK_URL.replace("uat.dskbank.bg", "uat.dskbank.bg:8443"), BANK_URL.replace("payment_bg.html", "redirect.html"), BANK_URL.split("?")[0], `${BANK_URL}&mdOrder=${FIRST}`, `${BANK_URL}&other=value`, BANK_URL.replace(/mdOrder=.*/, "mdOrder=not-a-uuid"), `${BANK_URL}#unsafe`, "javascript:alert(1)"]) {
    assert.equal(fixture.exports.isDskUatCheckoutUrl(url), false, url);
  }
  fixture.unmount();
});

test("observed shared bank form accepts only its UUID and explicit Bulgarian/English language", async () => {
  const url = BANK_URL.replace("test/payment_bg.html", "multiecom/payment.html") + "&language=bg";
  const fixture = mount({ api: { adminCreateDskUatOrder: async (_token, id) => order("created", { checkoutId: id, checkoutUrl: url }) } });
  await fixture.flush();
  for (const accepted of [url, url.replace("language=bg", "language=en"), url.replace(/\?mdOrder=([^&]+)&language=bg/, "?language=bg&mdOrder=$1")]) {
    assert.equal(fixture.exports.isDskUatCheckoutUrl(accepted), true);
    assert.equal(fixture.exports.validateDskUatOrder(order("created", { checkoutUrl: accepted }), FIRST).checkoutUrl, accepted);
  }
  for (const rejected of [
    url.replace("multiecom", "other-merchant"), url.replace("payment.html", "finish.html"),
    url.replace("/payment/merchants", "/payment/payment/merchants"), url.replace("https:", "http:"),
    url.replace("uat.dskbank.bg", "uat.dskbank.bg.evil.invalid"), url.replace("uat.dskbank.bg", "private@uat.dskbank.bg"),
    url.replace("uat.dskbank.bg", "uat.dskbank.bg:8443"), `${url}#unsafe`, `${url}&extra=value`,
    `${url}&mdOrder=${FIRST}`, `${url}&language=en`, url.replace("&language=bg", ""),
    url.replace("language=bg", "language=de"), url.replace(/mdOrder=[^&]+/, "mdOrder=not-a-uuid"),
    url.replace(/mdOrder=[^&]+&/, ""), url.replace("mdOrder", "orderId")
  ]) assert.equal(fixture.exports.isDskUatCheckoutUrl(rejected), false, "Unsafe shared bank form must be rejected");
  fixture.click("Създай тестова поръчка"); await fixture.flush();
  assert.equal(fixture.nodes().find(node => node.type === "a").props.href, url);
  assert.ok(!fixture.nodes().some(node => node.props?.role === "alert"));
  fixture.unmount();
  const returned = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatOrder: async () => order("created", { checkoutUrl: url }) } });
  await returned.flush();
  assert.equal(returned.nodes().find(node => node.type === "a").props.href, url);
  assert.equal(returned.calls.filter(call => call[0] === "create").length, 0);
  returned.unmount();
});

test("fresh authentication fetches config/status again and late previous-account responses cannot leak", async () => {
  let oldResult;
  const gets = [];
  const fixture = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatOrder: (token, id) => {
    gets.push([token, id]);
    return token === "fixture-admin" ? new Promise(resolve => { oldResult = resolve; }) : Promise.resolve(order("failed"));
  } } });
  await fixture.flush();
  fixture.changeToken("fixture-new-admin");
  assert.equal(fixture.text(), "", "old sandbox immediately hidden while new access/config is checked");
  await fixture.flush();
  oldResult(order("succeeded", { actionCode: "0", verifiedAt: "2026-10-01T00:00:00Z" }));
  await fixture.flush();
  assert.match(fixture.text(), /Тестът е неуспешен/);
  assert.doesNotMatch(fixture.text(), /Банката потвърди успешно тестово плащане/);
  assert.deepEqual(gets, [["fixture-admin", FIRST], ["fixture-new-admin", FIRST]]);
  assert.equal(fixture.calls.filter(call => call[0] === "config").length, 2);
});

test("late previous-auth config cannot enable a sandbox after fresh access fails", async () => {
  let oldConfiguration;
  const fixture = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatConfig: token => {
    if (token === "fixture-admin") return new Promise(resolve => { oldConfiguration = resolve; });
    return Promise.reject(new Error("forbidden"));
  } } });
  await fixture.flush();
  fixture.changeToken("fixture-denied-admin");
  await fixture.flush();
  oldConfiguration(configuration); await fixture.flush();
  assert.equal(fixture.text(), "");
  assert.equal(fixture.calls.length, 0, "no checkout read or creation when fresh config fails");
});

test("unknown status without a bank link is manually checked, never automatically retried", async () => {
  let checks = 0;
  const fixture = mount({ search: `?paymentTest=${FIRST}`, api: { adminGetDskUatOrder: async () => {
    checks++;
    if (checks === 1) return order("unknown");
    if (checks === 2) throw new Error("unavailable");
    return order("succeeded", { actionCode: "0", verifiedAt: "2026-10-01T00:00:00Z" });
  } } });
  await fixture.flush();
  assert.match(fixture.text(), /не създавай нова/);
  assert.equal(fixture.nodes().filter(node => node.type === "a").length, 0);
  fixture.click("Провери статуса"); await fixture.flush();
  assert.equal(checks, 2);
  assert.ok(fixture.nodes().some(node => node.props?.role === "alert"));
  fixture.click("Провери статуса"); await fixture.flush();
  assert.equal(checks, 3);
  assert.match(fixture.text(), /Банката потвърди успешно/);
  assert.equal(fixture.calls.filter(call => call[0] === "create").length, 0);
});

test("sandbox API reads are authenticated and uncached; POST sends only stable idempotency ID", async () => {
  const file = ts.createSourceFile("api.ts", source("src/lib/api.ts"), ts.ScriptTarget.Latest, true);
  for (const name of ["adminGetDskUatConfig", "adminGetDskUatOrder", "adminCreateDskUatOrder"]) {
    let method;
    function visit(node) { if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) method = node; else ts.forEachChild(node, visit); }
    visit(file); assert.ok(method, name);
    const calls = [], context = { request: (...args) => { calls.push(args); return Promise.resolve({}); }, encodeURIComponent };
    const code = ts.transpileModule(`this.run = ({${method.getText(file)}}).${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, context);
    await context.run("fresh-fixture-token", FIRST);
    assert.equal(calls[0][2], "fresh-fixture-token");
    if (name === "adminCreateDskUatOrder") {
      assert.equal(calls[0][1].method, "POST");
      assert.deepEqual(JSON.parse(calls[0][1].body), { checkoutId: FIRST });
    } else assert.equal(calls[0][1].cache, "no-store");
  }
});

test("UAT component cannot mutate production payments, memberships or messaging", () => {
  const component = source("src/app/components/DskSandboxPanel.tsx");
  assert.doesNotMatch(component, /adminMarkBookingPaid|adminMessage|sendBooking|updateProfile|updateConsultant|localStorage|sessionStorage|setInterval|setTimeout|<input|<form/);
  assert.match(component, /DSK · Sandbox/);
});
