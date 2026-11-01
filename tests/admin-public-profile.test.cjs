const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApi } = require('./helpers/api-harness.cjs');

test('admin self-profile can be shown and hidden without changing account role; clients cannot opt in', async () => {
  const user = { userId: 'owner', role: 'client', name: 'Owner', plan: 'free' };
  const writes = [];
  const api = loadApi({send: async command => {
    if (command.constructor.name === 'GetCommand') return { Item: user };
    if (command.constructor.name === 'QueryCommand') return { Items: [] };
    writes.push(command.input);
    return {};
  }}).test;
  const request = (enabled, admin = true) => ({ body: JSON.stringify({name: 'Owner', publicProfileEnabled: enabled}), requestContext: {authorizer: {jwt: {claims: {sub: 'owner', 'cognito:groups': admin ? ['admin'] : []}}}} });
  for (const enabled of [true, false]) {
    const response = await api.updateMyConsultant(request(enabled));
    assert.equal(response.statusCode, 200);
    const profile = JSON.parse(response.body);
    assert.equal(profile.visibilityMode, enabled ? 'shown' : 'hidden');
    assert.equal(profile.isPublic, enabled);
    assert.equal(profile.comped, true);
    assert.equal(user.role, 'client');
  }
  assert.equal((await api.updateMyConsultant(request(true, false))).statusCode, 403);
  assert.equal((await api.updateMyConsultant(request('yes'))).statusCode, 400);
  assert.ok(writes.length);
});
