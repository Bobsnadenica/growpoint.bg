const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync(require.resolve("../src/app/components/SpotlightShowcase.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
}).outputText;
const profile = (extra = {}) => ({
  consultantId: "fixture-expert", packageTier: "spotlight", slug: "fixture expert",
  name: "Фиктивен Експерт · Пример", headline: "Примерен профил — кариера", bio: "Фиктивна биография.",
  avatarUrl: "https://media.example.invalid/portrait.jpg", heroUrl: "", specializations: ["Интервю", "CV"],
  ...extra
});

// Execute the actual JSX, child card and handlers with the repo's in-memory hook pattern.
function mount(initial) {
  const hooks = [];
  let cursor = 0, profiles = initial, tree;
  const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };
  const imports = {
    react: { useState(initial) {
      const index = cursor++;
      hooks[index] ||= { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => { hooks[index].value = value; }];
    } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-router-dom": { Link: "a" },
    "../../lib/url": { resolvePublicUrl: value => value }
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in imports, `Unexpected fixture import: ${name}`);
    return imports[name];
  } });
  const render = () => { cursor = 0; tree = exports.default({ profiles }); };
  const walk = value => !value || typeof value !== "object" ? [] : Array.isArray(value) ? value.flatMap(walk) : [value, ...walk(value.props?.children)];
  const words = value => value == null || typeof value === "boolean" ? "" : Array.isArray(value) ? value.map(words).join(" ") : typeof value === "object" ? words(value.props?.children) : String(value);
  const nodes = () => walk(tree);
  const text = (value = tree) => words(value);
  render();
  return {
    nodes, text,
    images: () => nodes().filter(node => node.type === "img"),
    update(next) { profiles = next; render(); },
    fail(className) {
      const image = nodes().find(node => node.type === "img" && node.props.className === className);
      assert.ok(image, className); image.props.onError(); render();
    }
  };
}

test("Spotlight portrait is visible without an optional cover", () => {
  const expert = profile();
  const fixture = mount([expert]);
  const images = fixture.images();
  assert.equal(images.length, 1);
  assert.equal(images[0].props.className, "spotlight-showcase__portrait");
  assert.equal(images[0].props.src, expert.avatarUrl);
  assert.equal(images[0].props.alt, expert.name);
  assert.equal(fixture.nodes().some(node => node.props?.className === "spotlight-showcase__initials"), false);
});

test("optional cover complements rather than replaces the portrait", () => {
  const expert = profile({ heroUrl: "https://media.example.invalid/cover.jpg" });
  const fixture = mount([expert]);
  assert.deepEqual(fixture.images().map(node => [node.props.className, node.props.src]), [
    ["spotlight-showcase__cover", expert.heroUrl], ["spotlight-showcase__portrait", expert.avatarUrl]
  ]);
  assert.equal(fixture.images()[0].props.alt, "");
  fixture.fail("spotlight-showcase__cover");
  assert.equal(fixture.images().length, 1);
  assert.equal(fixture.images()[0].props.src, expert.avatarUrl);
});

test("missing or failed images keep initials, example disclosure and usable profile link", () => {
  for (const missing of [true, false]) {
    const fixture = mount([profile(missing ? { avatarUrl: "", heroUrl: "" } : { heroUrl: "https://media.example.invalid/cover.jpg" })]);
    if (!missing) {
      fixture.fail("spotlight-showcase__portrait");
      fixture.fail("spotlight-showcase__cover");
    }
    assert.equal(fixture.images().length, 0);
    assert.equal(fixture.text(fixture.nodes().find(node => node.props?.className === "spotlight-showcase__initials")), "ФЕ");
    assert.match(fixture.text(), /Фиктивен Експерт · Пример/);
    assert.match(fixture.text(), /Примерен профил/);
    assert.equal(fixture.nodes().find(node => node.type === "a").props.to, "/consultants/fixture%20expert");
  }
});

test("fresh image URLs recover the same card after failures", () => {
  const expert = profile({ heroUrl: "https://media.example.invalid/cover.jpg" });
  const fixture = mount([expert]);
  fixture.fail("spotlight-showcase__portrait");
  fixture.fail("spotlight-showcase__cover");
  fixture.update([expert]);
  assert.equal(fixture.images().length, 0);
  const refreshed = profile({ avatarUrl: "https://media.example.invalid/portrait.jpg?version=2", heroUrl: "https://media.example.invalid/cover.jpg?version=2" });
  fixture.update([refreshed]);
  assert.deepEqual(fixture.images().map(node => node.props.src), [refreshed.heroUrl, refreshed.avatarUrl]);
});

test("empty or non-Spotlight lists omit the dedicated showcase", () => {
  for (const profiles of [[], [profile({ packageTier: "start" })], [profile({ packageTier: "grow" })]]) {
    const fixture = mount(profiles);
    assert.equal(fixture.nodes().length, 0);
    assert.equal(fixture.text(), "");
  }
});

test("actual unique profile topics and labels stay visible without invented ratings", () => {
  const fixture = mount([profile({ specializations: ["Интервю", "CV", "Интервю", "Кариера", "Четвърта тема"] })]);
  assert.deepEqual(fixture.nodes().filter(node => node.type === "li").map(node => fixture.text(node)), ["Интервю", "CV", "Кариера"]);
  assert.match(fixture.text(), /Spotlight · представен експерт/);
  assert.match(fixture.text(), /Разгледай профила/);
  assert.doesNotMatch(fixture.text(), /Четвърта тема|5\.0|мнения/);
  const withoutTopics = mount([profile({ specializations: undefined })]);
  assert.equal(withoutTopics.nodes().some(node => node.type === "ul"), false);
  assert.match(withoutTopics.text(), /Разгледай профила/);
});
