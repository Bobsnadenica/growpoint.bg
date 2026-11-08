const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createBilling,monthBoundary,POLICY}=require("../backend/api/billing.cjs");
const {loadApi}=require("./helpers/api-harness.cjs");
test("billing uses calendar anniversaries and rejects invalid cycle numbers",()=>{
  assert.equal(monthBoundary("2028-01-31T10:00:00Z",1),"2028-02-29T10:00:00.000Z");
  assert.equal(monthBoundary("2028-01-31T10:00:00Z",2),"2028-03-31T10:00:00.000Z");
  for(const cycle of [-1,1.5,1201])assert.throws(()=>monthBoundary("2028-01-31",cycle));
});
test("public inputs cannot override prices, ownership or policy consent",async()=>{
  let calls=0;const service=createBilling({dynamo:{send:async()=>{calls++;return {};}},gateway:{},usersTable:"unit",consultantsTable:"experts"});
  const body={checkoutId:"11111111-1111-4111-8111-111111111111",tier:"grow",acceptRecurring:true,policyVersion:POLICY};
  for(const change of [{amountMinor:1},{ownerId:"other"},{tier:"__proto__"},{acceptRecurring:false},{policyVersion:"obsolete"}]) await assert.rejects(service.create("owner",{consultantId:"expert",ownerUserId:"owner"},{...body,...change}),e=>e.statusCode===400);
  assert.equal(calls,0);
  await assert.rejects(service.create("owner",{consultantId:"expert",ownerUserId:"owner"},body),e=>e.statusCode===503);
});
test("production charging requires rotated credentials, recurring confirmation and SES production access",async()=>{
  for(const environment of [{},{DSK_LIVE_ENABLED:"true"},{DSK_LIVE_ENABLED:"true",DSK_LIVE_CREDENTIALS_ROTATED:"true",DSK_RECURRING_CONFIRMED:"true",DSK_LIVE_USERNAME:"fixture-api",DSK_LIVE_PASSWORD:"fixture-value"}]) {
    const api=loadApi({environment,send:async()=>({ProductionAccessEnabled:false,SendingEnabled:true})});
    assert.equal(await api.test.liveBillingEnabled(),false);
  }
});
