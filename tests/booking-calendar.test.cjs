const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

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
