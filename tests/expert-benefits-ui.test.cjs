const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
process.env.TZ = "Europe/Sofia";
const source = path => fs.readFileSync(require.resolve(`../${path}`), "utf8");
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const calls = [], exportsHelper = {};
vm.runInNewContext(compile(source("src/lib/expert-benefits.ts")), { exports: exportsHelper, Date, JSON, encodeURIComponent, require: () => ({ request: async (...args) => { calls.push(args); return {}; } }) });
const benefits = { monthlyFreeSession: { month: "2030-10", eligible: true, remaining: 1 }, spotlight: { eligible: true, quarter: "2030-Q4", eventRoomRemaining: 1 } };
const request = (extra = {}) => ({ requestId: "fixture-request", kind: "podcast", period: "2030-Q4", status: "pending", note: "Fixture", createdAt: "2030-10-01T00:00:00Z", updatedAt: "2030-10-01T00:00:00Z", ...extra });

test("benefit transport preserves fresh auth, exact methods/body and encoded ids", async () => {
  calls.length = 0;
  await exportsHelper.expertBenefitsApi.list("owner-token-new");
  await exportsHelper.expertBenefitsApi.create("owner-token-new", { kind: "event_room", period: "2031-Q1", note: "Fixture" });
  await exportsHelper.expertBenefitsApi.adminList("admin-token-new");
  await exportsHelper.expertBenefitsApi.adminUpdate("admin-token-new", "request/path", { consultantId: "fixture-owner", status: "cancelled" });
  assert.deepEqual(calls.map(args => [args[0], args[1].method || "GET", args[2]]), [["/consultants/me/benefit-requests", "GET", "owner-token-new"], ["/consultants/me/benefit-requests", "POST", "owner-token-new"], ["/admin/benefit-requests", "GET", "admin-token-new"], ["/admin/benefit-requests/request%2Fpath", "PATCH", "admin-token-new"]]);
  assert.deepEqual(JSON.parse(calls[1][1].body), { kind: "event_room", period: "2031-Q1", note: "Fixture" });
});

test("duplicate and quota UI follows current/next-quarter server history", () => {
  assert.equal(exportsHelper.nextBenefitQuarter("2030-Q4"), "2031-Q1");
  assert.equal(exportsHelper.nextBenefitQuarter("2030-Q2"), "2030-Q3");
  assert.equal(exportsHelper.nextBenefitQuarter("invalid"), "");
  assert.equal(exportsHelper.hasActiveBenefitRequest([request()], "podcast", "2031-Q1"), true);
  assert.equal(exportsHelper.hasActiveBenefitRequest([request({ status: "completed" })], "podcast", "2031-Q1"), false);
  assert.equal(exportsHelper.hasActiveBenefitRequest([request({ kind: "event_room", status: "completed" })], "event_room", "2030-Q4"), true);
  assert.equal(exportsHelper.hasActiveBenefitRequest([request({ kind: "event_room", status: "cancelled" })], "event_room", "2030-Q4"), false);
  assert.equal(exportsHelper.hasActiveBenefitRequest([request({ kind: "event_room" })], "event_room", "2031-Q1"), false);
});

test("admin scheduling rejects invalid local dates/DST gap; final states never reopen", () => {
  for (const value of ["2030-02-30T09:00", "2030-03-31T03:30", "2030-10-01T25:00", "invalid"]) assert.equal(exportsHelper.parseLocalBenefitSchedule(value), "");
  assert.equal(exportsHelper.toLocalScheduleInput(exportsHelper.parseLocalBenefitSchedule("2030-10-01T09:30")), "2030-10-01T09:30");
  assert.deepEqual(Array.from(exportsHelper.benefitStatusChoices(request())), ["pending", "scheduled", "cancelled"]);
  assert.deepEqual(Array.from(exportsHelper.benefitStatusChoices(request({ status: "scheduled", scheduledAt: "2099-01-01T00:00:00Z" }))), ["scheduled", "cancelled"]);
  assert.ok(exportsHelper.benefitStatusChoices(request({ status: "scheduled", scheduledAt: "2020-01-01T00:00:00Z" })).includes("completed"));
  for (const status of ["completed", "cancelled"]) assert.deepEqual(Array.from(exportsHelper.benefitStatusChoices(request({ status }))), [status]);
});

function mount({ component = "ExpertBenefitsPanel", api = {}, props: initial = {} } = {}) {
  let hooks = [], cursor = 0, effects = [], tree, dirty = true, props = { token: "fixture-token", ...initial };
  const apiCalls = [];
  const slot = initial => { const index = cursor++; if (!hooks[index]) hooks[index] = initial; return hooks[index]; };
  const memo = (callback, deps) => { const hook = slot({ deps: null }); if (!hook.deps || !deps.every((value, i) => Object.is(value, hook.deps[i]))) { hook.deps = deps; hook.value = callback(); } return hook.value; };
  const react = {
    useState(initial) { const hook = slot({ value: typeof initial === "function" ? initial() : initial }); return [hook.value, value => { hook.value = typeof value === "function" ? value(hook.value) : value; dirty = true; }]; },
    useRef(value) { return slot({ current: value }); },
    useCallback(callback, deps) { return memo(() => callback, deps); },
    useEffect(callback, deps) { const hook = slot({ deps: null }); if (!hook.deps || !deps.every((value, i) => Object.is(value, hook.deps[i]))) { hook.cleanup?.(); hook.deps = deps; effects.push(() => { hook.cleanup = callback(); }); } }
  };
  const fakeApi = {
    list: async token => { apiCalls.push(["list", token]); return { benefits, items: [] }; },
    create: async (token, body) => { apiCalls.push(["create", token, body]); return { benefits, request: request({ ...body }) }; },
    adminList: async token => { apiCalls.push(["adminList", token]); return { items: [] }; },
    adminUpdate: async (token, id, body) => { apiCalls.push(["adminUpdate", token, id, body]); return { request: request({ ...body }) }; },
    ...api
  };
  const jsx = (type, props) => ({ type, props }), exports = {};
  const imports = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "../../lib/expert-benefits": { ...exportsHelper, expertBenefitsApi: fakeApi }, "../../lib/datetime": { formatDateTimeBg: value => value }, "./ExpertBenefitsPanel.css": {} };
  vm.runInNewContext(compile(`${source("src/app/components/ExpertBenefitsPanel.tsx")}\nexport { AdminBenefitEditor };`), { exports, Date, Intl, AbortController, Error, require: name => { if (!(name in imports)) throw Error(name); return imports[name]; } });
  const render = () => { cursor = 0; dirty = false; tree = exports[component](props); effects.splice(0).forEach(effect => effect()); };
  const walk = value => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
  const words = value => value == null || typeof value === "boolean" ? "" : Array.isArray(value) ? value.map(words).join(" ") : typeof value === "object" ? words(value.props?.children) : String(value);
  render();
  return {
    apiCalls, text: () => words(tree), nodes: () => walk(tree),
    async flush() { for (let i = 0; i < 20; i++) { await new Promise(setImmediate); if (!dirty) break; render(); } },
    submit() { const form = walk(tree).find(node => node.type === "form"); assert.ok(form); return form.props.onSubmit({ preventDefault() {} }); },
    change(type, value) { walk(tree).find(node => node.type === type).props.onChange({ target: { value } }); render(); },
    click(label) { const node = walk(tree).find(node => node.type === "button" && words(node) === label); assert.ok(node, label); node.props.onClick(); },
    rotate(token) { props = { ...props, token }; render(); },
    unmount() { hooks.forEach(hook => hook.cleanup?.()); }
  };
}

test("expert reads never create requests and ineligible tier exposes no request form", async () => {
  const fixture = mount({ api: { list: async () => ({ benefits: { ...benefits, spotlight: { ...benefits.spotlight, eligible: false } }, items: [] }) } });
  await fixture.flush(); assert.equal(fixture.nodes().some(node => node.type === "form"), false); assert.match(fixture.text(), /активен пакет Spotlight/);
  assert.equal(fixture.apiCalls.filter(call => call[0] === "create").length, 0);
  fixture.unmount();
});

test("expert successful submission records server result once and prevents duplicate requests", async () => {
  const fixture = mount(); await fixture.flush(); fixture.change("textarea", "  Fixture note  ");
  await Promise.all([fixture.submit(), fixture.submit()]); await fixture.flush();
  assert.equal(fixture.apiCalls.filter(call => call[0] === "create").length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(fixture.apiCalls.find(call => call[0] === "create")[2])), { kind: "podcast", note: "Fixture note" });
  assert.match(fixture.text(), /Заявката е записана/);
  assert.equal(fixture.nodes().find(node => node.type === "button" && node.props.type === "submit").props.disabled, true);
  await fixture.submit(); assert.equal(fixture.apiCalls.filter(call => call[0] === "create").length, 1);
  fixture.unmount();
});

test("uncertain write preserves note and requires successful reload before another attempt", async () => {
  let writes = 0;
  const fixture = mount({ api: { create: async () => { writes++; throw Error("Fixture timeout"); } } });
  await fixture.flush(); fixture.change("textarea", "Retain fixture note"); await fixture.submit(); await fixture.flush();
  assert.match(fixture.text(), /Обнови списъка/); assert.equal(fixture.nodes().find(node => node.type === "textarea").props.value, "Retain fixture note");
  assert.equal(fixture.nodes().find(node => node.type === "fieldset").props.disabled, true);
  await fixture.submit(); assert.equal(writes, 1);
  fixture.click("Обнови"); await fixture.flush(); assert.equal(fixture.nodes().find(node => node.type === "fieldset").props.disabled, false);
  fixture.unmount();
});

test("token rotation reloads fresh auth and ignores delayed previous-account mutation", async () => {
  let finish;
  const fixture = mount({ api: { create: async () => new Promise(resolve => { finish = resolve; }) } });
  await fixture.flush(); const write = fixture.submit(); fixture.rotate("new-fixture-token"); await fixture.flush();
  finish({ benefits, request: request() }); await write; await fixture.flush();
  assert.deepEqual(fixture.apiCalls.filter(call => call[0] === "list"), [["list", "fixture-token"], ["list", "new-fixture-token"]]);
  assert.doesNotMatch(fixture.text(), /Заявката е записана/);
  fixture.unmount();
});

test("failed initial read fails closed and manual reload restores UI", async () => {
  let fail = true;
  const fixture = mount({ api: { list: async () => { if (fail) throw Error("Fixture unavailable"); return { benefits, items: [] }; } } });
  await fixture.flush(); assert.match(fixture.text(), /Fixture unavailable/); assert.equal(fixture.nodes().some(node => node.type === "form"), false);
  fail = false; fixture.click("Обнови"); await fixture.flush(); assert.equal(fixture.nodes().some(node => node.type === "form"), true);
  fixture.unmount();
});

test("admin scheduling validates future date, retains consultant identity, and locks uncertain retries", async () => {
  let saved, busy = [];
  const fixture = mount({ component: "AdminBenefitEditor", props: { item: request({ consultantId: "fixture-owner", consultantName: "Fixture expert" }), disabled: false, onBusy: value => busy.push(value), onSaved: value => { saved = value; } } });
  fixture.change("select", "scheduled"); fixture.change("input", "2020-01-01T09:00"); await fixture.submit(); await fixture.flush();
  assert.match(fixture.text(), /валидна бъдеща/); assert.equal(fixture.apiCalls.length, 0);
  fixture.change("input", "2030-10-01T09:30"); await fixture.submit(); await fixture.flush();
  assert.equal(saved.status, "scheduled"); assert.equal(fixture.apiCalls[0][3].consultantId, "fixture-owner"); assert.equal(new Date(fixture.apiCalls[0][3].scheduledAt).getHours(), 9); assert.deepEqual(busy, [true, false]);
  const failure = mount({ component: "AdminBenefitEditor", props: { item: request({ consultantId: "fixture-owner" }), disabled: false, onBusy() {}, onSaved() {} }, api: { adminUpdate: async () => { throw Error("Fixture conflict"); } } });
  await failure.submit(); await failure.flush(); assert.match(failure.text(), /Обнови списъка/); assert.equal(failure.nodes().find(node => node.type === "fieldset").props.disabled, true);
});

test("benefits style is touch-sized, scoped and supports native dark date inputs", () => {
  const css = source("src/app/components/ExpertBenefitsPanel.css");
  assert.match(css, /\.expert-benefits button\s*\{[^}]*min-height:\s*48px/);
  assert.match(css, /:root\[data-theme="dark"\] \.expert-benefits input/);
  const component = source("src/app/components/ExpertBenefitsPanel.tsx");
  assert.match(component, /Заявката не гарантира място или дата/);
  assert.doesNotMatch(component, /setInterval|setTimeout|sendEmail|mailto:/);
});
