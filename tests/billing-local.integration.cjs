// Real DynamoDB Local transactions; fake bank only. Never uses AWS credentials
// or a configurable remote endpoint. Run with npm run test:billing:local.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {randomUUID}=require("node:crypto");
const {createRequire}=require("node:module");
const requireApi=createRequire(require.resolve("../backend/api/index.cjs"));
const {DynamoDBClient,CreateTableCommand,DeleteTableCommand}=requireApi("@aws-sdk/client-dynamodb");
const {DynamoDBDocumentClient,PutCommand,GetCommand}=requireApi("@aws-sdk/lib-dynamodb");
const {createBilling,monthBoundary,POLICY,subKey}=require("../backend/api/billing.cjs");
const port=Number(process.env.GP_BILLING_TEST_PORT || 8177);
if(!Number.isInteger(port) || port<1024 || port>65535)throw Error("Invalid local database port");
const raw=new DynamoDBClient({endpoint:`http://127.0.0.1:${port}`,region:"local",maxAttempts:1,credentials:{accessKeyId:"localKey",secretAccessKey:"localOnly"}});
const dynamo=DynamoDBDocumentClient.from(raw,{marshallOptions:{removeUndefinedValues:true}});
const iso="2027-01-31T10:15:00.000Z";
async function fixture(t) {
  const suffix=randomUUID().replaceAll("-","");
  const usersTable="bill_users_"+suffix, consultantsTable="bill_experts_"+suffix;
  for(const [TableName,key] of [[usersTable,"userId"],[consultantsTable,"consultantId"]]) await raw.send(new CreateTableCommand({TableName,BillingMode:"PAY_PER_REQUEST",KeySchema:[{AttributeName:key,KeyType:"HASH"}],AttributeDefinitions:[{AttributeName:key,AttributeType:"S"},...(key === "userId"?[{AttributeName:"billingIndexPK",AttributeType:"S"},{AttributeName:"billingIndexSK",AttributeType:"S"}]:[])],...(key === "userId"?{GlobalSecondaryIndexes:[{IndexName:"billing-index",KeySchema:[{AttributeName:"billingIndexPK",KeyType:"HASH"},{AttributeName:"billingIndexSK",KeyType:"RANGE"}],Projection:{ProjectionType:"ALL"}}]}:{})}));
  t.after(async()=>{for(const TableName of [usersTable,consultantsTable]) await raw.send(new DeleteTableCommand({TableName}));});
  const expert={consultantId:"expert",ownerUserId:"owner",name:"Synthetic expert",isPublic:false,profileStatus:"pending",updatedAt:iso};
  await dynamo.send(new PutCommand({TableName:usersTable,Item:{userId:"owner",role:"consultant"}}));
  await dynamo.send(new PutCommand({TableName:consultantsTable,Item:expert}));
  const bank=new Map(),calls={register:0,charge:0,notice:0};let clock=new Date(iso),enabled=true,chargeError=false,remaining=29000,noticeAccepted=true;
  const gateway={
    async register(input) { calls.register++;bank.set(input.orderNumber,{status:"created",gatewayOrderId:randomUUID(),bindingId:randomUUID()});return {gatewayOrderId:bank.get(input.orderNumber).gatewayOrderId,checkoutUrl:"https://epg.dskbank.bg/payment/merchants/multiecom/payment.html?mdOrder="+bank.get(input.orderNumber).gatewayOrderId}; },
    async getStatus(input) {const result=bank.get(input.orderNumber);if(!result) throw Error("Unregistered reference");return {...result};},
    async isRecurringBinding(){return true;},
    async disableBinding(){return true;},
    async chargeRecurring(input){calls.charge++;bank.set(input.orderNumber,{status:"succeeded",gatewayOrderId:randomUUID()});if(chargeError) throw Error("Ambiguous network outcome");return {...bank.get(input.orderNumber)};}
  };
  const service=createBilling({dynamo,usersTable,consultantsTable,gateway,now:()=>clock,allowCharges:()=>enabled,remainingTime:()=>remaining,notify:async()=>{calls.notice++;return noticeAccepted;},applyVisibility:x=>({...x,isPublic:true,profileStatus:"approved"})});
  const create=(body={})=>service.create("owner",expert,{checkoutId:randomUUID(),tier:"grow",acceptRecurring:true,policyVersion:POLICY,...body});
  const pay=async row=>{for(const value of bank.values()) value.status="succeeded";return service.reconcile("owner",row.checkoutId);};
  const profile=async()=> (await dynamo.send(new GetCommand({TableName:consultantsTable,Key:{consultantId:"expert"},ConsistentRead:true}))).Item;
  return {service,create,pay,expert,bank,calls,gateway,profile,usersTable,consultantsTable,setTime:value=>{clock=new Date(value);},setRemaining:value=>{remaining=value;},failNotices:()=>{noticeAccepted=false;},disable:()=>{enabled=false;},ambiguousCharge:()=>{chargeError=true;}};
}

test("monthly boundaries preserve the original day across February and leap years",()=>{
  assert.equal(monthBoundary(iso,1),"2027-02-28T10:15:00.000Z");
  assert.equal(monthBoundary(iso,2),"2027-03-31T10:15:00.000Z");
  assert.equal(monthBoundary("2028-01-31T10:15:00Z",1),"2028-02-29T10:15:00.000Z");
});
test("real transactions: concurrent identical checkouts register once and foreign reads are denied",async t=>{
  const f=await fixture(t),checkoutId=randomUUID();
  const rows=await Promise.all([f.create({checkoutId}),f.create({checkoutId})]);
  assert.equal(rows[0].checkoutId,rows[1].checkoutId);assert.equal(f.calls.register,1);
  await assert.rejects(f.service.reconcile("stranger",checkoutId),e=>e.statusCode===404);
  await assert.rejects(f.create({amountMinor:1}),e=>e.statusCode===400);
  await assert.rejects(f.create({acceptRecurring:false}),e=>e.statusCode===400);
});
test("two independent checkout IDs cannot create duplicate purchases for one expert",async t=>{
  const f=await fixture(t);
  const result=await Promise.allSettled([f.create(),f.create()]);
  assert.equal(result.filter(x=>x.status==="fulfilled").length,1);assert.equal(f.calls.register,1);
});
test("a verified capture grants one month atomically and repeated/concurrent reads never extend it",async t=>{
  const f=await fixture(t),row=await f.create();
  await f.pay(row);
  const before=await f.profile();
  assert.equal(before.packageSource,"purchased");assert.equal(before.packageTier,"grow");
  assert.equal(before.packageExpiresAt,"2027-02-28T10:15:00.000Z");
  f.setTime("2027-02-01T12:00:00Z");
  await Promise.all([f.service.reconcile("owner",row.checkoutId),f.service.reconcile("owner",row.checkoutId)]);
  assert.equal((await f.profile()).packageExpiresAt,before.packageExpiresAt);
  assert.equal((await f.service.summary("owner")).subscription.autoRenew,true);
});
test("cancellation keeps the paid interval and prevents a due renewal",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  const before=await f.profile();await f.service.cancel("owner");
  f.setTime(before.packageExpiresAt);await f.service.renew("owner");
  assert.equal(f.calls.charge,0);assert.equal((await f.profile()).packageExpiresAt,before.packageExpiresAt);
  assert.equal((await f.service.summary("owner")).subscription.autoRenew,false);
});
test("renewal workers racing each other charge one cycle exactly once",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  f.setTime("2027-02-28T10:15:01Z");
  await Promise.all([f.service.renew("owner"),f.service.renew("owner")]);
  assert.equal(f.calls.charge,1);
  assert.equal((await f.profile()).packageExpiresAt,"2027-03-31T10:15:00.000Z");
});
test("ambiguous renewal is recovered by reference without ever repeating the charge",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  f.ambiguousCharge();f.setTime("2027-02-28T10:15:01Z");await f.service.renew("owner");
  const sub=await f.service.subscription("owner");assert.ok(sub.activeOrderId);
  await f.service.renew("owner");assert.equal(f.calls.charge,1);
  await f.service.reconcile("owner",sub.activeOrderId);
  assert.equal((await f.profile()).packageExpiresAt,"2027-03-31T10:15:00.000Z");
  assert.equal(f.calls.charge,1);
});
test("an admin grant racing a paid checkout is preserved and produces a refund-review case",async t=>{
  const f=await fixture(t),row=await f.create();
  await dynamo.send(new PutCommand({TableName:f.consultantsTable,Item:{...f.expert,packageSource:"granted",packageTier:"spotlight"}}));
  const result=await f.pay(row);
  assert.equal(result.attention,"refund_review_required");
  assert.equal((await f.profile()).packageSource,"granted");
  assert.equal((await f.profile()).packageTier,"spotlight");
});
test("deletion or initial cancellation before capture never silently activates a paid profile",async t=>{
  for(const action of ["delete","cancel"]) {
    const f=await fixture(t),row=await f.create();
    if(action==="delete") await dynamo.send(new PutCommand({TableName:f.usersTable,Item:{userId:"owner",deletionScheduledAt:iso}}));
    else await f.service.cancel("owner");
    assert.equal((await f.pay(row)).attention,"refund_review_required");
    assert.equal((await f.profile()).packageSource,undefined);
  }
});
test("refund requests are recorded, do not claim a completed refund, and confirmed refunds revoke access",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  const requested=await f.service.requestRefund("owner",row.checkoutId);
  assert.equal(requested.status,"succeeded");assert.ok(requested.refundRequestedAt);
  for(const value of f.bank.values()) value.status="refunded";
  await f.service.reconcile("owner",row.checkoutId);
  assert.ok((await f.profile()).packageRevokedAt);
  assert.equal((await f.profile()).isPublic,false);
  for(const value of f.bank.values()) value.status="succeeded";
  assert.equal((await f.service.reconcile("owner",row.checkoutId)).status,"refunded");
});
test("disabled charging and stale missed cycles cannot debit a card",async t=>{
  const f=await fixture(t);f.disable();await assert.rejects(f.create(),e=>e.statusCode===503);assert.equal(f.calls.register,0);
  const g=await fixture(t),row=await g.create();await g.pay(row);g.setTime("2027-05-01T00:00:00Z");await g.service.renew("owner");
  assert.equal(g.calls.charge,0);assert.equal((await g.service.summary("owner")).subscription.autoRenew,false);
});
test("all three tiers snapshot server prices and reject checkout replay with another tier",async t=>{
  for(const [tier,amount] of [["start",999],["grow",2999],["spotlight",9999]]) {
    const f=await fixture(t),row=await f.create({tier});assert.equal(row.amountMinor,amount);
    await assert.rejects(f.create({checkoutId:row.checkoutId,tier:tier==="grow"?"start":"grow"}),e=>e.statusCode===409);
  }
});
test("ambiguous registration retains its lock and never registers another order on retry",async t=>{
  const f=await fixture(t);f.gateway.register=async()=>{f.calls.register++;throw Object.assign(Error("timeout"),{ambiguous:true});};
  const id=randomUUID(),first=await f.create({checkoutId:id});assert.equal(first.status,"unknown");
  assert.equal((await f.create({checkoutId:id})).status,"unknown");assert.equal(f.calls.register,1);
  f.setTime("2027-02-01T00:00:00Z");await assert.rejects(f.create(),e=>e.statusCode===409);assert.equal(f.calls.register,1);
});
test("a definitive registration refusal releases the checkout without fabricating paid access",async t=>{
  const f=await fixture(t),original=f.gateway.register;
  f.gateway.register=async()=>{throw Object.assign(Error("prohibited"),{ambiguous:false});};
  assert.equal((await f.create()).status,"failed");assert.equal((await f.service.subscription("owner")).activeOrderId,null);
  assert.equal((await f.profile()).packageSource,undefined);
  f.setTime("2027-01-31T10:17:00Z");f.gateway.register=original;
  assert.equal((await f.create()).status,"created");
});
test("paid card without a recurrent binding gets one paid period but no unattended renewal",async t=>{
  const f=await fixture(t),row=await f.create();f.gateway.isRecurringBinding=async()=>false;await f.pay(row);
  const result=await f.service.summary("owner");assert.equal(result.subscription.autoRenew,false);
  assert.equal(result.subscription.attention,"recurring_card_required");assert.equal((await f.profile()).packageSource,"purchased");
});
test("cancel/resume/cancel requires fresh consent and does not double-charge the current period",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);await f.service.cancel("owner");
  await assert.rejects(f.service.resume("owner",{acceptRecurring:false,policyVersion:POLICY}),e=>e.statusCode===400);
  await f.service.resume("owner",{acceptRecurring:true,policyVersion:POLICY});
  assert.equal((await f.service.summary("owner")).subscription.autoRenew,true);
  await f.service.cancel("owner");assert.equal((await f.service.summary("owner")).subscription.autoRenew,false);assert.equal(f.calls.charge,0);
});
test("cancelling an in-flight renewal reports it and prevents subsequent cycles",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);f.setTime("2027-02-28T10:15:01Z");
  let started,release;const signal=new Promise(resolve=>started=resolve),pause=new Promise(resolve=>release=resolve);
  const original=f.gateway.chargeRecurring;f.gateway.chargeRecurring=async input=>{started();await pause;return original(input);};
  const attempt=f.service.renew("owner");await signal;
  const cancellation=await f.service.cancel("owner");assert.equal(cancellation.subscription.inFlight,true);assert.equal(cancellation.subscription.autoRenew,false);
  release();await attempt;assert.equal(f.calls.charge,1);
  f.setTime("2027-03-31T10:15:01Z");await f.service.renew("owner");assert.equal(f.calls.charge,1);
});
test("sparse due index drives recovery and renewal without scanning ordinary accounts",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);f.setTime("2027-02-28T10:15:01Z");
  await f.service.sweep({budgetMs:26000});assert.equal(f.calls.charge,1);assert.equal((await f.profile()).packageExpiresAt,"2027-03-31T10:15:00.000Z");
});
test("a slow pre-refund lookup cannot resurrect revoked paid access",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  const initial=[...f.bank.values()][0];let started,release,count=0;
  const signal=new Promise(resolve=>started=resolve),pause=new Promise(resolve=>release=resolve);
  f.gateway.getStatus=async()=>{if(++count===1){started();await pause;return {...initial,status:"succeeded"};}return {...initial,status:"refunded"};};
  const stale=f.service.reconcile("owner",row.checkoutId);await signal;await f.service.reconcile("owner",row.checkoutId);release();await stale;
  assert.ok((await f.profile()).packageRevokedAt);assert.equal((await f.profile()).isPublic,false);
});
test("a verified zero-charge recurrent setup debits the first fee once before granting access",async t=>{
  const f=await fixture(t),row=await f.create();
  for(const value of f.bank.values())Object.assign(value,{status:"cancelled",cardSetupVerified:true});
  await Promise.all([f.service.reconcile("owner",row.checkoutId),f.service.reconcile("owner",row.checkoutId)]);
  assert.equal(f.calls.charge,1);assert.equal((await f.profile()).packageSource,"purchased");
  await f.service.reconcile("owner",row.checkoutId);assert.equal(f.calls.charge,1);
});
test("ambiguous first fee after zero-charge setup recovers without charging again",async t=>{
  const f=await fixture(t),row=await f.create();
  for(const value of f.bank.values())Object.assign(value,{status:"cancelled",cardSetupVerified:true});
  f.ambiguousCharge();await f.service.reconcile("owner",row.checkoutId);
  assert.equal(f.calls.charge,1);assert.equal((await f.profile()).packageSource,undefined);
  await f.service.reconcile("owner",row.checkoutId);
  assert.equal(f.calls.charge,1);assert.equal((await f.profile()).packageSource,"purchased");
});
test("cancelled zero-charge setup cannot take the first fee",async t=>{
  const f=await fixture(t),row=await f.create();
  for(const value of f.bank.values())Object.assign(value,{status:"cancelled",cardSetupVerified:true});
  await f.service.cancel("owner");await f.service.reconcile("owner",row.checkoutId);
  assert.equal(f.calls.charge,0);assert.equal((await f.profile()).packageSource,undefined);
});
test("expired cancelled subscriptions remove their bank binding without restarting charges",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);await f.service.cancel("owner");
  f.setTime("2027-03-01T00:00:00Z");await f.service.sweep({budgetMs:27000});
  assert.equal((await f.service.subscription("owner")).bindingId,undefined);assert.equal(f.calls.charge,0);
});
test("zero-charge setup defers its first fee when Lambda time is short and resumes once",async t=>{
  const f=await fixture(t),row=await f.create();
  for(const value of f.bank.values())Object.assign(value,{status:"cancelled",cardSetupVerified:true});
  f.setRemaining(18000);await f.service.reconcile("owner",row.checkoutId);
  assert.equal(f.calls.charge,0);assert.equal((await f.profile()).packageSource,undefined);
  f.setRemaining(29000);await f.service.reconcile("owner",row.checkoutId);
  assert.equal(f.calls.charge,1);assert.equal((await f.profile()).packageSource,"purchased");
});
test("historical refund reconciliation cannot cancel or revoke a replacement subscription",async t=>{
  const f=await fixture(t),first=await f.create();await f.pay(first);await f.service.cancel("owner");
  f.setTime("2027-03-01T00:00:00Z");const replacement=await f.create({tier:"spotlight"});await f.pay(replacement);
  const before=await f.service.subscription("owner");
  for(const [reference,value] of f.bank)if(reference!==[...f.bank.keys()].at(-1))value.status="refunded";
  assert.equal((await f.service.reconcile("owner",first.checkoutId)).status,"refunded");
  assert.equal((await f.service.subscription("owner")).subscriptionId,before.subscriptionId);
  assert.equal((await f.service.subscription("owner")).autoRenew,true);
  assert.equal((await f.profile()).packageRevokedAt,undefined);assert.equal((await f.profile()).packageTier,"spotlight");
});
test("receipt claims prevent simultaneous duplicate delivery and foreign-owner delivery",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);
  await f.service.deliverNotices("stranger");assert.equal(f.calls.notice,0);
  await Promise.all([f.service.deliverNotices("owner"),f.service.deliverNotices("owner")]);
  assert.equal(f.calls.notice,1);await f.service.deliverNotices("owner");assert.equal(f.calls.notice,1);
});
test("failed receipt delivery retries at most four times without repeating a bank charge",async t=>{
  const f=await fixture(t),row=await f.create();await f.pay(row);f.failNotices();
  for(let i=0;i<6;i++){f.setTime(new Date(Date.parse(iso)+i*360000).toISOString());await f.service.deliverNotices("owner");}
  assert.equal(f.calls.notice,4);assert.equal(f.calls.charge,0);
});
