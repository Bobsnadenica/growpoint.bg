const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, imports = {}) {
  const exports = {};
  const source = readFileSync(path, "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, Map, console, require: name => imports[name] });
  return exports;
}

test("public booking offers every upcoming slot, not just the first day", () => {
  const dates = load("src/app/legacy/availability.ts");
  const source = readFileSync("src/app/legacy/SiteAppLegacy.tsx", "utf8");
  const expression = source.match(/const visibleAvailability = ([^;]+);/)?.[1];
  assert.ok(expression);
  const slots = Array.from({ length: 30 }, (_, index) => new Date(Date.now() + (index + 1) * 3600000).toISOString());
  const visible = vm.runInNewContext(expression, { consultant: { availability: slots }, getUpcomingAvailabilitySlots: dates.getUpcomingAvailabilitySlots, Number });
  assert.equal(visible.length, 30);
  assert.equal(visible[29], slots[29]);
});

test("changing the booking day or month clears the previously selected slot", () => {
  const dates = load("src/app/legacy/availability.ts");
  const now = new Date(); const first = new Date(now.getFullYear(), now.getMonth() + 1, 3, 10);
  const second = new Date(first); second.setDate(second.getDate() + 1);
  let cursor = 0, state = [], selection = first.toISOString(), tree;
  const react = { useMemo: fn => fn(), useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === "function" ? initial() : initial; return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }]; } };
  const jsx = (type, props) => ({ type, props });
  const component = load("src/app/legacy/AvailabilityCalendar.tsx", { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "./availability": dates }).default;
  const render = () => { cursor = 0; tree = component({ mode: "book", availability: [first.toISOString(), second.toISOString()], selectedSlot: selection, onSelectSlot: value => { selection = value; } }); };
  const walk = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(walk) : [node, ...walk(node.props?.children)];
  render();
  const days = walk(tree).filter(node => node.type === "button" && node.props.className?.includes("cal__day--has-slots"));
  assert.equal(days.length, 2);
  days[1].props.onClick(); render(); assert.equal(selection, "");
  selection = second.toISOString(); render();
  walk(tree).find(node => node.props?.["aria-label"] === "Следващ месец").props.onClick(); render();
  assert.equal(selection, "");
  assert.equal(walk(tree).some(node => node.props?.className === "cal__hours"), false);
});

test("public booking calendar exposes hour buttons without a nested height limit", () => {
  const css = readFileSync("src/styles/global.css", "utf8");
  const rules = [...css.matchAll(/^\.booking-panel \.availability-calendar\s*\{([^}]+)\}/gm)];
  assert.equal(rules.length, 1);
  assert.match(rules[0][1], /max-height:\s*none;/);
  assert.match(rules[0][1], /overflow:\s*visible;/);
  assert.doesNotMatch(rules[0][1], /max-height:\s*\d|overflow-y:\s*auto/);
  // The consultant editor retains its separate pick-mode styling.
  assert.match(css, /\.availability-calendar--pick\s*\{\s*max-height:\s*none;\s*overflow:\s*visible;/);
});

test("narrow public booking tracks shrink without clipping the seventh day or payment choices", () => {
  const css = readFileSync("src/styles/global.css", "utf8");
  assert.match(css, /\.profile-aside-stack \.booking-panel\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /\.booking-panel \.cal__weekdays\s*\{[^}]*repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.booking-panel \.cal__cell\s*\{[^}]*min-height:\s*44px;\s*aspect-ratio:\s*auto/);
});
