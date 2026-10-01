const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
process.env.TZ = "Europe/Sofia";
const source = path => readFileSync(require.resolve(`../${path}`), "utf8");
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function load(path, imports = {}, extras = {}) {
  const exports = {};
  vm.runInNewContext(compile(source(path)), { exports, Date, Intl, console, ...extras, require: name => { if (!(name in imports)) throw Error(`Unexpected import ${name}`); return imports[name]; } });
  return exports;
}
const dates = load("src/app/legacy/availability.ts");
const helpers = load("src/app/legacy/availability-editor.ts", { "./availability": dates });
const slot = (date, time) => helpers.buildEditorSlot(date, time);
const FIRST = slot("2030-10-01", "09:00"), SECOND = slot("2030-10-01", "10:00");

test("owner dates reject calendar rollover, invalid time, malformed input and skipped DST hour", () => {
  for (const [date, time] of [["2030-02-30", "09:00"], ["2030-13-01", "09:00"], ["2030-10-01", "25:00"], ["2030-10-01", "09:60"], ["", "09:00"], ["2030-1-01", "09:00"], ["2030-03-31", "03:30"]]) assert.equal(slot(date, time), "");
  assert.equal(new Date(FIRST).getHours(), 9);
  assert.equal(dates.getAvailabilityDayKey(FIRST), "2030-10-01");
  assert.equal(new Date(slot("2030-10-01", "09:30")).getMinutes(), 30);
});

test("occupied intervals include partial overlaps but permit adjacent sessions", () => {
  assert.equal(helpers.overlapsOccupiedSlot(slot("2030-10-01", "09:30"), [FIRST], 60), true);
  assert.equal(helpers.overlapsOccupiedSlot(slot("2030-10-01", "08:30"), [FIRST], 60), true);
  assert.equal(helpers.overlapsOccupiedSlot(SECOND, [FIRST], 60), false);
  assert.equal(helpers.overlapsOccupiedSlot(slot("2030-10-01", "08:00"), [FIRST], 60), false);
});

test("merge preserves current data, rejects past/occupied/invalid and deduplicates equal instants", () => {
  const equivalent = new Date(FIRST).toISOString().replace(".000Z", "Z");
  const current = [equivalent];
  const result = helpers.mergeEditorSlots(current, [FIRST, SECOND, "invalid", "2020-01-01T00:00:00Z", slot("2030-10-01", "11:30")], [slot("2030-10-01", "11:00")], 60, new Date("2030-09-01").getTime());
  assert.deepEqual(Array.from(result.slots), [equivalent, SECOND]);
  assert.equal(result.added, 1); assert.equal(result.duplicates, 1); assert.equal(result.unavailable, 3);
  assert.deepEqual(current, [equivalent]);
  // Alternative starts may overlap each other; only an actual booking blocks them.
  assert.equal(helpers.mergeEditorSlots([FIRST], [slot("2030-10-01", "09:30")], [], 60).added, 1);
});

test("bulk addition rejects over-limit batches without truncating or modifying the draft", () => {
  const current = Array.from({ length: 400 }, (_, index) => new Date(new Date(FIRST).getTime() + index * 3600000).toISOString());
  const result = helpers.mergeEditorSlots(current, [slot("2031-01-01", "09:00")], []);
  assert.equal(result.overLimit, true); assert.equal(result.slots, current); assert.equal(result.added, 1);
  assert.match(source("backend/api/index.cjs"), /MAX_AVAILABILITY_SLOTS\s*=\s*400/);
});

test("save state compares actual future instants, not order/format or historic slots", () => {
  assert.equal(helpers.availabilityDraftChanged([FIRST, SECOND], [SECOND, FIRST.replace(".000Z", "Z"), "2020-01-01T00:00:00Z"]), false);
  assert.equal(helpers.availabilityDraftChanged([FIRST], [FIRST, SECOND]), true);
});

function mount(extra = {}) {
  let state = [], cursor = 0, tree, props = { availability: [FIRST], savedAvailability: [FIRST], occupiedSlots: [SECOND], sessionLengthMinutes: 60, saving: false, saveError: "", ...extra };
  const jsx = (type, props) => ({ type, props });
  const react = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial; return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useMemo(callback) { return callback(); }
  };
  const component = load("src/app/components/ConsultantAvailabilityEditor.tsx", { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "../legacy/availability": dates, "../legacy/availability-editor": helpers }, { window: { confirm: () => true } }).default;
  props.onChange = availability => { props = { ...props, availability }; };
  const render = () => { cursor = 0; tree = component(props); };
  const walk = value => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
  const words = value => value == null || typeof value === "boolean" ? "" : Array.isArray(value) ? value.map(words).join(" ") : typeof value === "object" ? words(value.props?.children) : String(value);
  const nodes = () => walk(tree), text = () => words(tree);
  const button = label => nodes().find(node => node.type === "button" && words(node).trim() === label);
  render();
  return {
    nodes, text, button, get props() { return props; },
    change(type, value) { nodes().find(node => node.type === "input" && node.props.type === type).props.onChange({ target: { value } }); render(); },
    click(label) { assert.ok(button(label), label); button(label).props.onClick(); render(); },
    update(extra) { props = { ...props, ...extra }; render(); }
  };
}

test("editor gives duplicate feedback, supports custom minutes and removes without saving", () => {
  const fixture = mount(); fixture.change("date", "2030-10-01"); fixture.change("time", "09:00"); fixture.click("Добави час");
  assert.match(fixture.text(), /вече е добавен/); assert.equal(fixture.props.availability.length, 1);
  fixture.change("time", "08:30"); fixture.click("Добави час"); assert.equal(fixture.props.availability.length, 2);
  assert.match(fixture.text(), /незаписани промени/);
  fixture.click("08:30 Добавен ✓"); assert.deepEqual(Array.from(fixture.props.availability), [FIRST]);
});

test("occupied times cannot be toggled or cleared; cancellation restores only availability", () => {
  const fixture = mount({ availability: [FIRST, SECOND], savedAvailability: [FIRST, SECOND] });
  fixture.change("date", "2030-10-01");
  assert.equal(fixture.button("10:00 Заето").props.disabled, true);
  fixture.click("Изчисти незаетите"); assert.deepEqual(Array.from(fixture.props.availability), [SECOND]);
  fixture.click("Отмени промените"); assert.deepEqual(Array.from(fixture.props.availability), [FIRST, SECOND]);
});

test("busy/error states retain draft and disable edits; Enter in time does not submit parent form", () => {
  const fixture = mount({ saveError: "Conflict fixture" }); fixture.change("date", "2030-10-01");
  let prevented = false;
  fixture.change("time", "08:00");
  fixture.nodes().find(node => node.type === "input" && node.props.type === "time").props.onKeyDown({ key: "Enter", preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(fixture.props.availability.length, 2);
  fixture.update({ saving: true });
  assert.equal(fixture.nodes().find(node => node.type === "fieldset").props.disabled, true);
  assert.match(fixture.text(), /Conflict fixture.*Черновата е запазена/s);
  assert.equal(fixture.nodes().some(node => node.type === "form"), false);
});

test("consultant save blocks duplicate submits and refreshes occupied metadata without resetting draft on failure", async () => {
  const legacy = source("src/app/legacy/SiteAppLegacy.tsx");
  const handler = legacy.slice(legacy.indexOf("  async function saveConsultantProfile("), legacy.indexOf("  const membershipNote =", legacy.indexOf("  async function saveConsultantProfile(")));
  let writes = 0, draftUpdates = 0, saved = { name: "Fixture", slug: "fixture-expert", availability: [FIRST], bookedSlots: [] }, error, saving;
  let reject;
  const pending = new Promise((_, fail) => { reject = fail; });
  const context = {
    FormData: class { get() { return null; } }, File: class {}, token: "fixture-token", consultantProfile: saved, consultantAvailability: [FIRST, SECOND], consultantSaveBusy: { current: false },
    setConsultantSaving: value => { saving = value; }, setAvailabilitySaveError: value => { error = value; }, setError() {}, setMessage() {}, setProfile() {},
    setConsultantAvailability() { draftUpdates++; }, setConsultantProfile: updater => { saved = typeof updater === "function" ? updater(saved) : updater; },
    getUpcomingAvailabilitySlots: dates.getUpcomingAvailabilitySlots, slugifyValue: () => "fixture-expert", parseListValue: () => [],
    api: { updateMyConsultantProfile: async () => { writes++; return pending; }, getMyConsultantProfile: async () => ({ bookedSlots: [SECOND] }) }
  };
  vm.runInNewContext(compile(`${handler}\nexports.save = saveConsultantProfile;`), { ...context, exports: context, Error });
  const event = { preventDefault() {}, currentTarget: {} };
  const first = context.save(event), second = context.save(event);
  await new Promise(setImmediate); assert.equal(writes, 1); assert.equal(saving, true);
  reject(new Error("Reservation changed fixture")); await Promise.all([first, second]);
  assert.equal(saving, false); assert.equal(error, "Reservation changed fixture"); assert.equal(draftUpdates, 0);
  assert.equal(saved.availability, context.consultantProfile.availability);
  assert.deepEqual(Array.from(saved.bookedSlots), [SECOND]);
  assert.match(legacy, /\}, \[consultantProfile\?\.availability\]\)/);
  assert.match(legacy, /occupiedSlots=\{occupiedAvailability\}/);
});

test("owner editor is scoped, touch-sized, theme-token based and leaves public calendar unchanged", () => {
  const css = source("src/styles/global.css");
  assert.match(css, /\.availability-editor__hour\s*\{[^}]*min-height:\s*64px/);
  assert.match(css, /\.availability-editor__slot\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.consultant-hours-form \.profile-setup-panel--availability \.question-card/);
  assert.match(css, /:root\[data-theme="dark"\] \.availability-editor input/);
  assert.match(source("src/app/legacy/SiteAppLegacy.tsx"), /<AvailabilityCalendar\s+mode="book"/);
});
