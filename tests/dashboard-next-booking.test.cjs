const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

test('next session excludes old, declined and cancelled bookings', () => {
  const file = ts.createSourceFile('dashboard.tsx', readFileSync('src/app/legacy/SiteAppLegacy.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let fn;
  const visit = node => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'getNextBooking') fn = node.getText(file); else ts.forEachChild(node, visit); };
  visit(file);
  assert.ok(fn);
  const context = { Date };
  vm.runInNewContext(ts.transpileModule(`${fn}\nthis.pick = getNextBooking;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const old = { status: 'confirmed', scheduledAt: '2000-01-01T10:00:00Z' };
  const cancelled = { status: 'cancelled', scheduledAt: '2099-01-01T10:00:00Z' };
  const future = { status: 'pending', scheduledAt: '2099-01-02T10:00:00Z' };
  assert.equal(context.pick([old, cancelled]), null);
  assert.equal(context.pick([future, old, cancelled]), future);
});
