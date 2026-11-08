"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { GetCommand, QueryCommand, ScanCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const PRICES = Object.freeze({start:999,grow:2999,spotlight:9999});
const POLICY = "expert-monthly-2026-11-08";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail = (message, statusCode = 409) => Object.assign(new Error(message), { statusCode });
const hash = value => createHash("sha256").update(value).digest("hex");
const subKey = owner => `system#dsk-subscription#${hash(owner)}`;
const orderKey = id => `system#dsk-payment#${id}`;
const activeAccount = row => row && !row.restricted && !row.identityDeleted && !row.identityDisabled && !row.deletionScheduledAt && !row.anonymizedAt;
const conflict = error => ["TransactionCanceledException", "ConditionalCheckFailedException"].includes(error.name);

// Calendar months anchored to the ORIGINAL UTC date, not 30 days or the
// preceding clamped month. The UI must display this billing timezone explicitly.
function monthBoundary(anchor, index) {
  const start = new Date(anchor);
  if (!Number.isFinite(start.getTime()) || !Number.isInteger(index) || index < 0 || index > 1200) throw fail("Невалиден период.", 400);
  const end = new Date(start);
  end.setUTCDate(1);
  end.setUTCMonth(start.getUTCMonth() + index);
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return end.toISOString();
}

function createBilling({ dynamo, usersTable, consultantsTable, gateway, now = () => new Date(), allowCharges = () => false, applyVisibility = x => x, notify = async () => false, verifyIdentity=async()=>{}, remainingTime=()=>Infinity }) {
  function indexed(row) {
    const result={...row};delete result.billingIndexPK;delete result.billingIndexSK;
    if(row.kind === "dsk-payment") Object.assign(result,{billingIndexPK:`OWNER#${hash(row.ownerId)}`,billingIndexSK:`${row.createdAt}#${row.checkoutId}`});
    if(row.kind === "dsk-notice" && row.pending && row.attempts<4) Object.assign(result,{billingIndexPK:"NOTICE",billingIndexSK:row.retryAfter || row.createdAt});
    if(row.kind === "dsk-subscription") {
      const paidUntil=Date.parse(row.paidThroughAt);
      const cleanupDue=row.bindingId && !row.autoRenew && !row.activeOrderId && (row.status === "revoked" || !(paidUntil>now().getTime()));
      if(row.activeOrderId || row.autoRenew || paidUntil>now().getTime() || cleanupDue) {
        const due=cleanupDue ? now().getTime() : row.activeOrderId ? now().getTime()+300000 : Math.min(Number.isFinite(paidUntil)?paidUntil:Infinity,now().getTime()+3600000);
        Object.assign(result,{billingIndexPK:"DUE",billingIndexSK:new Date(due).toISOString()});
      }
    }
    return result;
  }
  const read = async (table, key) => (await dynamo.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true }))).Item;
  const subscription = async owner => {
    const row=await read(usersTable,{userId:subKey(owner)});
    return row?.kind === "dsk-subscription" && row.ownerId === owner ? row : undefined;
  };
  async function order(owner, id) {
    if (!UUID.test(id || "")) throw fail("Невалиден номер на плащане.", 400);
    const row = await read(usersTable, { userId: orderKey(id.toLowerCase()) });
    if (!row || row.kind !== "dsk-payment" || row.ownerId !== owner) throw fail("Плащането не е намерено.", 404);
    return row;
  }
  function put(row, previous) {
    return { Put: { TableName: usersTable, Item: indexed(row),
      ConditionExpression: previous ? "#version = :version" : "attribute_not_exists(userId)",
      ...(previous ? { ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": previous.version } } : {}) } };
  }
  function accountCheck(owner) {
    return { ConditionCheck: { TableName: usersTable, Key: { userId: owner },
      ConditionExpression: "attribute_exists(userId) AND attribute_not_exists(deletionScheduledAt) AND (attribute_not_exists(identityDeleted) OR identityDeleted = :no) AND (attribute_not_exists(identityDisabled) OR identityDisabled = :no) AND (attribute_not_exists(restricted) OR restricted = :no)",
      ExpressionAttributeValues: { ":no": false } } };
  }
  function expertCheck(expert, extra = "", values = {}) {
    return { ConditionCheck: { TableName: consultantsTable, Key: { consultantId: expert.consultantId },
      ConditionExpression: "attribute_exists(consultantId) AND ownerUserId = :owner AND attribute_not_exists(deletionScheduledAt) AND attribute_not_exists(anonymizedAt) AND (attribute_not_exists(restricted) OR restricted = :no) AND (attribute_not_exists(identityDeleted) OR identityDeleted = :no) AND (attribute_not_exists(identityDisabled) OR identityDisabled = :no)" + extra,
      ExpressionAttributeValues: { ":owner": expert.ownerUserId, ":no": false, ...values } } };
  }
  const next = (row, fields) => ({ ...row, ...fields, version: row.version + 1, updatedAt: now().toISOString() });
  function notice(owner,event,reference,fields={}) {
    const row={userId:`system#dsk-notice#${hash(`${reference}:${event}`)}`,kind:"dsk-notice",ownerId:owner,event,reference,...fields,pending:true,attempts:0,version:0,createdAt:now().toISOString()};
    return put(row);
  }
  async function write(rows) { await dynamo.send(new TransactWriteCommand({ TransactItems: rows })); }
  async function expertFor(owner, consultantId) {
    const expert = await read(consultantsTable, { consultantId });
    if (!activeAccount(expert) || expert.ownerUserId !== owner) throw fail("Експертният профил не е достъпен.", 403);
    return expert;
  }
  async function list(owner) {
    const items = []; let cursor;
    do {
      const result = await dynamo.send(new QueryCommand({ TableName: usersTable, IndexName:"billing-index",ScanIndexForward:false,
        KeyConditionExpression:"billingIndexPK=:pk",ExpressionAttributeValues:{":pk":`OWNER#${hash(owner)}`},ExclusiveStartKey:cursor }));
      items.push(...result.Items || []); cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items.filter(row=>row.kind === "dsk-payment" && row.ownerId === owner).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  }
  function publicOrder(row) {
    return { checkoutId: row.checkoutId, tier: row.tier, amountMinor: row.amountMinor, currency: "EUR", status: row.status,
      createdAt: row.createdAt, periodStartsAt: row.periodStartsAt || null, periodEndsAt: row.periodEndsAt || null,
      refundRequestedAt: row.refundRequestedAt || null, attention: row.attention || null,
      ...(row.checkoutUrl && row.status === "created" ? { checkoutUrl: row.checkoutUrl } : {}) };
  }
  async function summary(owner) {
    const [sub, rows] = await Promise.all([subscription(owner), list(owner)]);
    // GSI reads are eventual. Overlay the current pending/latest paid records
    // using strongly consistent base-table reads, including newly created rows.
    if(sub) for(const id of new Set([sub.activeOrderId,sub.lastPaidOrderId,sub.lastOrderId].filter(Boolean))) {
      const fresh=await order(owner,id);const position=rows.findIndex(x=>x.checkoutId===id);
      if(position>=0) rows[position]=fresh;else rows.unshift(fresh);
    }
    return { policyVersion: POLICY, prices: PRICES, currency: "EUR", timezone: "UTC",
      subscription: sub ? { tier: sub.tier, amountMinor:sub.amountMinor,status: sub.status, autoRenew: sub.autoRenew, paidThroughAt: sub.paidThroughAt || null, nextChargeAt: sub.autoRenew ? sub.paidThroughAt || null : null,
        cancellationRequestedAt: sub.cancellationRequestedAt || null, inFlight: Boolean(sub.activeOrderId), attention: sub.attention || null } : null,
      orders: rows.map(publicOrder) };
  }
  async function create(owner, expert, body) {
    if (!body || Object.keys(body).some(k => !["checkoutId", "tier", "acceptRecurring", "policyVersion"].includes(k)) || !UUID.test(body.checkoutId || "") || !Object.hasOwn(PRICES, body.tier || "") || body.acceptRecurring !== true || body.policyVersion !== POLICY) throw fail("Потвърди актуалните условия за месечно подновяване.", 400);
    const id = body.checkoutId.toLowerCase();
    const oldOrder = await read(usersTable, { userId: orderKey(id) });
    if (oldOrder) {
      if (oldOrder.ownerId !== owner || oldOrder.tier !== body.tier || oldOrder.consultantId !== expert.consultantId) throw fail("Номерът вече се използва.");
      return publicOrder(oldOrder); // No second registration, including a timeout.
    }
    if (!await allowCharges()) throw fail("Реалните плащания още не са активирани.", 503);
    await verifyIdentity(owner);
    const previous = await subscription(owner);
    if (previous && (previous.activeOrderId || previous.autoRenew || (previous.status !== "revoked" && Date.parse(previous.paidThroughAt) > now().getTime()))) throw fail("Вече има активен абонамент или неприключило плащане.");
    if(previous?.status === "revoked" && previous.attention) throw fail("Първо е необходим преглед на оспореното или частично възстановено плащане.");
    if (!activeAccount(expert) || expert.ownerUserId !== owner) throw fail("Нямаш достъп до този профил.", 403);
    if (expert.comped || expert.packageSource === "granted") throw fail("Пакетът ти е предоставен от екипа; не е необходимо плащане.");
    const startedAt = now().toISOString(), subscriptionId = randomUUID();
    const sub = { userId: subKey(owner), kind: "dsk-subscription", ownerId: owner, consultantId: expert.consultantId, subscriptionId, tier: body.tier, amountMinor: PRICES[body.tier], currency: "EUR", status: "pending", autoRenew: true,
      activeOrderId: id, lastOrderId:id, version: (previous?.version ?? -1) + 1, createdAt: startedAt, updatedAt: startedAt,
      consent: { version: POLICY, acceptedAt: startedAt, amountMinor: PRICES[body.tier], currency: "EUR", interval: "calendar_month", timezone: "UTC" },
      clientId: `gp-${hash(subscriptionId).slice(0,30)}`, recurringExpiry: String(now().getUTCFullYear() + 5) + "1231" };
    const row = { userId: orderKey(id), kind: "dsk-payment", ownerId: owner, consultantId: expert.consultantId, subscriptionId, checkoutId: id, tier: sub.tier, amountMinor: sub.amountMinor, currency: "EUR", cycle: 0,
      status: "registering", version: 0, createdAt: startedAt, updatedAt: startedAt, orderNumber: `gp-${hash(`${subscriptionId}:0`).slice(0,30)}`, clientId: sub.clientId };
    try { await write([put(sub, previous), put(row), accountCheck(owner), expertCheck(expert,
      " AND (attribute_not_exists(comped) OR comped = :no) AND (attribute_not_exists(packageSource) OR packageSource <> :granted) AND (attribute_not_exists(packageExpiresAt) OR packageExpiresAt <= :now OR attribute_exists(packageRevokedAt))", { ":granted": "granted", ":now":startedAt }),
      {Update:{TableName:usersTable,Key:{userId:`system#dsk-rate#${hash(owner)}`},UpdateExpression:"SET lastCreatedAtMs=:now",ConditionExpression:"attribute_not_exists(lastCreatedAtMs) OR lastCreatedAtMs<=:cutoff",ExpressionAttributeValues:{":now":now().getTime(),":cutoff":now().getTime()-60000}}}]); }
    catch(error) {
      if (!conflict(error)) throw error;
      const repeated=await read(usersTable,{userId:orderKey(id)});
      if (repeated?.ownerId===owner && repeated.tier===body.tier && repeated.consultantId===expert.consultantId) return publicOrder(repeated);
      throw fail("Друга заявка промени профила или абонамента. Обнови статуса.");
    }
    let registration;
    try { registration = await gateway.register({ ...row, saveCardConsent: true, recurringExpiry: sub.recurringExpiry }); }
    catch (error) {
      const current = await order(owner, id), latestSub = await subscription(owner);
      const definite = error.ambiguous === false;
      const updated = next(current, { status: definite ? "failed" : "unknown", attention: definite ? "bank_rejected_registration" : "verification_required" });
      try {
        const changes = [put(updated, current)];
        if (latestSub?.subscriptionId === subscriptionId && latestSub.activeOrderId === id) changes.push(put(next(latestSub, { status: definite ? "failed" : "pending", autoRenew: false, ...(definite ? { activeOrderId: null } : {}), attention: updated.attention }), latestSub));
        await write(changes);
      } catch (e) { if (!conflict(e)) throw e; }
      return publicOrder(await order(owner,id));
    }
    const current = await order(owner,id);
    try { await write([put(next(current, { ...registration, status: "created" }), current)]); }
    catch (error) { if (!conflict(error)) throw error; }
    return publicOrder(await order(owner,id));
  }
  async function reconcile(owner, id) {
    const row = await order(owner,id);
    if(row.phase === "first_charge_ready") return chargeFirstReady(owner,id,row);
    // Each lookup is authenticated to the bank. Never accept browser/callback
    // amounts, status, binding ownership, or entitlement fields.
    const result = await gateway.getStatus({ ...row, gatewayOrderId: row.gatewayOrderId || undefined, clientId: row.clientId });
    if(row.cycle===0 && !row.phase && result.cardSetupVerified && result.bindingId) return completeSetup(owner,id,row,result);
    return applyResult(owner,id,row,result);
  }
  async function completeSetup(owner,id,row,result) {
    const sub=await subscription(owner);
    if(!sub || sub.subscriptionId!==row.subscriptionId) throw fail("Невалидна начална поръчка.");
    if(!sub.autoRenew || sub.cancellationRequestedAt) return applyResult(owner,id,row,{...result,status:"cancelled"});
    if(!await allowCharges()) return publicOrder(row); // no debit during a kill switch
    if(!await gateway.isRecurringBinding({clientId:sub.clientId,bindingId:result.bindingId})) throw fail("Банката не потвърди периодична карта.");
    await verifyIdentity(owner);const expert=await expertFor(owner,sub.consultantId);
    if(expert.comped || expert.packageSource === "granted") return applyResult(owner,id,row,{...result,status:"cancelled"});
    const ready=next(row,{phase:"first_charge_ready",status:"pending",setupVerifiedAt:now().toISOString(),setupOrderNumber:row.orderNumber,setupGatewayOrderId:result.gatewayOrderId,
      orderNumber:`gp-${hash(`${sub.subscriptionId}:first-fee`).slice(0,30)}`,gatewayOrderId:null,checkoutUrl:null});
    const nextSub=next(sub,{bindingId:result.bindingId});
    try {await write([put(ready,row),put(nextSub,sub),accountCheck(owner),expertCheck(expert," AND (attribute_not_exists(comped) OR comped=:no) AND (attribute_not_exists(packageSource) OR packageSource<>:granted)",{":granted":"granted"})]);}
    catch(error){if(conflict(error))return publicOrder(await order(owner,id));throw error;}
    return chargeFirstReady(owner,id,ready);
  }
  async function chargeFirstReady(owner,id,row) {
    const sub=await subscription(owner);
    if(!sub || sub.subscriptionId!==row.subscriptionId) throw fail("Началното плащане изисква преглед.");
    const expert=await read(consultantsTable,{consultantId:sub.consultantId});
    if(!sub.autoRenew || sub.cancellationRequestedAt || !activeAccount(expert) || expert.ownerUserId !== owner || expert.comped || expert.packageSource === "granted") {
      const cancelled=next(row,{phase:"setup_cancelled",status:"cancelled",orderNumber:row.setupOrderNumber,gatewayOrderId:row.setupGatewayOrderId});
      try {await write([put(cancelled,row),put(next(sub,{autoRenew:false,activeOrderId:null,status:"cancelled"}),sub)]);}catch(error){if(!conflict(error))throw error;}
      return publicOrder(await order(owner,id));
    }
    if(remainingTime()<19000 || !await allowCharges()) return publicOrder(row);
    await verifyIdentity(owner);
    const charging=next(row,{phase:"first_charge",status:"charging"});
    try {await write([put(charging,row),put(next(sub,{}),sub),accountCheck(owner),expertCheck(expert," AND (attribute_not_exists(comped) OR comped=:no) AND (attribute_not_exists(packageSource) OR packageSource<>:granted)",{":granted":"granted"})]);}
    catch(error){if(conflict(error))return publicOrder(await order(owner,id));throw error;}
    // A zero-charge RI setup never grants access. Only the separately verified
    // first fee does. Its durable phase and unique reference prevent double debit.
    let payment;
    try {payment=await gateway.chargeRecurring({...charging,bindingId:sub.bindingId});}
    catch(_){return publicOrder(await order(owner,id));}
    return applyResult(owner,id,charging,payment);
  }
  async function applyResult(owner,id,row,result) {
    const sub = await subscription(owner);
    const current = next(row, { status: result.status, gatewayOrderId: result.gatewayOrderId, verifiedAt: now().toISOString() });
    if (row.appliedAt && !["succeeded","refunded","partially_refunded","cancelled","disputed"].includes(result.status)) return publicOrder(row);
    if (["refunded","partially_refunded","disputed"].includes(row.status) && result.status === "succeeded") return publicOrder(row);
    if (!sub || sub.subscriptionId !== row.subscriptionId) {
      // Historical refunds remain reconcilable after a new subscription. They
      // must never revoke, extend, or cancel the replacement subscription.
      if(result.status === "succeeded" && !row.appliedAt) current.attention="refund_review_required";
      if(result.status === "refunded") current.attention=null;
      if(["partially_refunded","disputed"].includes(result.status)) current.attention="refund_review_required";
      try {await write([put(current,row)]);}catch(error){if(!conflict(error))throw error;}
      return publicOrder(await order(owner,id));
    }
    let nextSub = sub, expertUpdate;
    const [user, expert] = await Promise.all([read(usersTable,{userId:owner}), read(consultantsTable,{consultantId:row.consultantId})]);
    if (result.status === "succeeded" && !row.appliedAt) {
      if (!activeAccount(user) || !activeAccount(expert) || expert.ownerUserId !== owner || expert.comped || expert.packageSource === "granted" || (row.cycle === 0 && sub.cancellationRequestedAt)) {
        current.attention = "refund_review_required";
        nextSub = next(sub, { autoRenew:false, attention:current.attention });
      } else {
        const anchor = sub.anchorAt || now().toISOString();
        const starts = monthBoundary(anchor,row.cycle), ends = monthBoundary(anchor,row.cycle+1);
        let recurringBinding = false;
        if (result.bindingId && !sub.bindingId) recurringBinding = await gateway.isRecurringBinding({ clientId: sub.clientId, bindingId: result.bindingId });
        nextSub = next(sub, { status:"active", anchorAt:anchor, paidThroughAt:ends, cycle:row.cycle, activeOrderId:null, lastPaidOrderId:id,
          autoRenew:sub.autoRenew && Boolean(sub.bindingId || recurringBinding),
          ...(recurringBinding ? { bindingId:result.bindingId } : {}),
          ...(!sub.bindingId && !recurringBinding ? { attention:"recurring_card_required" } : { attention:null }) });
        Object.assign(current,{appliedAt:now().toISOString(),periodStartsAt:starts,periodEndsAt:ends});
        const visibility = applyVisibility({ ...expert, packageSource:"purchased", packageTier:row.tier, packageStartsAt:starts, packageExpiresAt:ends, packageRevokedAt:null });
        expertUpdate = { Update:{TableName:consultantsTable,Key:{consultantId:row.consultantId},
          UpdateExpression:"SET packageSource=:purchased, packageTier=:tier, packageStartsAt=:starts, packageExpiresAt=:ends, packageSubscriptionId=:subscription, packageLastOrderId=:order, updatedAt=:now, isPublic=:public, profileStatus=:profile REMOVE packageRevokedAt",
          ConditionExpression:"ownerUserId=:owner AND (attribute_not_exists(comped) OR comped=:no) AND (attribute_not_exists(packageSource) OR packageSource<>:granted) AND attribute_not_exists(deletionScheduledAt) AND attribute_not_exists(identityDeleted) AND (attribute_not_exists(identityDisabled) OR identityDisabled=:no) AND (attribute_not_exists(restricted) OR restricted=:no) AND " + (expert.updatedAt ? "updatedAt=:previousUpdatedAt" : "attribute_not_exists(updatedAt)"),
          ExpressionAttributeValues:{":purchased":"purchased",":tier":row.tier,":starts":starts,":ends":ends,":subscription":sub.subscriptionId,":order":id,":now":now().toISOString(),":owner":owner,":no":false,":granted":"granted",":public":visibility.isPublic === true,":profile":visibility.profileStatus || "pending",...(expert.updatedAt ? {":previousUpdatedAt":expert.updatedAt} : {})} } };
      }
    } else if (["failed","cancelled"].includes(result.status) && !row.appliedAt && sub.activeOrderId === id) {
      nextSub = next(sub,{status:row.cycle === 0 ? "failed":"past_due",autoRenew:false,activeOrderId:null,attention:"payment_failed"});
    } else if (["refunded","partially_refunded","disputed"].includes(result.status) || (result.status === "cancelled" && row.appliedAt)) {
      nextSub = next(sub,{autoRenew:false,attention:result.status === "refunded" ? null:result.status,...(sub.activeOrderId === id ? {activeOrderId:null}:{}),...(!row.appliedAt ? {status:"cancelled"}:{})});
      current.attention=result.status === "refunded" ? null : "refund_review_required";
      if (expert?.packageSource === "purchased" && expert.packageLastOrderId === id && !expert.comped) {
        expertUpdate = { Update:{TableName:consultantsTable,Key:{consultantId:row.consultantId},UpdateExpression:"SET packageRevokedAt=:now, isPublic=:no, updatedAt=:now",
          ConditionExpression:"packageSource=:purchased AND packageLastOrderId=:order AND (attribute_not_exists(comped) OR comped=:no)",ExpressionAttributeValues:{":now":now().toISOString(),":purchased":"purchased",":order":id,":no":false} } };
        nextSub.status = "revoked";
      }
    }
    // A slower paid lookup must not overwrite a newer refund/cancellation or
    // extend a period twice. Both order and subscription versions participate.
    const changes = [put(current,row)];
    // Also advance the due/reconciliation index when a read found no change.
    changes.push(put(nextSub === sub ? next(sub,{lastCheckedAt:now().toISOString()}):nextSub,sub));
    if (expertUpdate) { changes.push(expertUpdate); if (result.status === "succeeded") changes.push(accountCheck(owner)); }
    if (current.appliedAt && !row.appliedAt) changes.push(notice(owner,"payment_confirmed",id,{amountMinor:row.amountMinor,tier:row.tier,periodEndsAt:current.periodEndsAt}));
    if (current.attention === "refund_review_required" && row.attention !== current.attention) changes.push(notice(owner,"refund_review_required",id));
    if (result.status === "failed" && row.status !== "failed" && row.cycle>0) changes.push(notice(owner,"payment_failed",id));
    if (result.status === "refunded" && row.status !== "refunded") changes.push(notice(owner,"payment_refunded",id,{amountMinor:row.amountMinor}));
    try { await write(changes); }
    catch (error) { if (!conflict(error)) throw error; }
    return publicOrder(await order(owner,id));
  }
  async function cancel(owner) {
    for (let attempt=0;attempt<3;attempt++) {
      const sub = await subscription(owner);
      if (!sub || sub.cancellationRequestedAt) return summary(owner);
      try {
        await write([put(next(sub,{autoRenew:false,cancellationRequestedAt:now().toISOString()}),sub),notice(owner,"renewal_cancelled",`${sub.subscriptionId}:${sub.version}`,{periodEndsAt:sub.paidThroughAt || null})]);
        return summary(owner);
      } catch (error) { if (!conflict(error) || attempt===2) throw error; }
    }
  }
  async function resume(owner,body) {
    if(!body || Object.keys(body).some(key=>!["acceptRecurring","policyVersion"].includes(key)) || body.acceptRecurring!==true || body.policyVersion!==POLICY) throw fail("Потвърди месечното подновяване.",400);
    if(!await allowCharges()) throw fail("Подновяването още не е достъпно.",503);
    const sub=await subscription(owner);
    if(!sub || sub.status!=="active" || sub.activeOrderId || !sub.bindingId || Date.parse(sub.paidThroughAt)<=now().getTime()) throw fail("Избери нов пакет след края на текущия период.");
    const paid=await order(owner,sub.lastPaidOrderId);
    if(paid.refundRequestedAt || paid.status!=="succeeded") throw fail("Има неприключила проверка на плащането.");
    if(sub.autoRenew) return summary(owner);
    await verifyIdentity(owner);
    const expert=await expertFor(owner,sub.consultantId);
    if(!await gateway.isRecurringBinding({clientId:sub.clientId,bindingId:sub.bindingId})) throw fail("Картата изисква ново потвърждение в банката.");
    await write([put(next(sub,{autoRenew:true,cancellationRequestedAt:null,consent:{...sub.consent,version:POLICY,acceptedAt:now().toISOString()}}),sub),accountCheck(owner),expertCheck(expert," AND packageSource=:purchased AND packageSubscriptionId=:subscription AND attribute_not_exists(packageRevokedAt)",{":purchased":"purchased",":subscription":sub.subscriptionId}),notice(owner,"renewal_resumed",`${sub.subscriptionId}:${sub.version}`,{periodEndsAt:sub.paidThroughAt})]);
    return summary(owner);
  }
  async function requestRefund(owner,id) {
    const row = await order(owner,id);
    if (!row.appliedAt && !(row.verifiedAt && row.status === "succeeded")) throw fail("Плащането още не е потвърдено.");
    if (row.refundRequestedAt || row.status === "refunded") return publicOrder(row);
    // Record a request, not an invented completed refund. Statutory/erroneous
    // charges can still be reviewed outside the voluntary initial 14-day window.
    await write([put(next(row,{refundRequestedAt:now().toISOString(),attention:"refund_review_required"}),row),notice(owner,"refund_requested",id)]);
    if ((await subscription(owner))?.subscriptionId === row.subscriptionId) await cancel(owner);
    return publicOrder(await order(owner,id));
  }
  async function renew(owner) {
    const sub = await subscription(owner);
    if (!sub?.autoRenew || sub.status !== "active" || sub.activeOrderId || !sub.bindingId || Date.parse(sub.paidThroughAt)>now().getTime()) return;
    if (now().getTime()-Date.parse(sub.paidThroughAt)>86400000 || sub.recurringExpiry < now().toISOString().slice(0,10).replaceAll("-","")) {
      await write([put(next(sub,{autoRenew:false,status:"past_due",attention:"renewal_requires_customer"}),sub)]); return;
    }
    if (!await allowCharges()) return;
    const expert = await expertFor(owner,sub.consultantId);
    await verifyIdentity(owner);
    if (expert.comped || expert.packageSource !== "purchased" || expert.packageSubscriptionId !== sub.subscriptionId || expert.packageRevokedAt) { await cancel(owner);return; }
    const cycle = sub.cycle+1, checkoutId = randomUUID(), startedAt = now().toISOString();
    const row = {userId:orderKey(checkoutId),kind:"dsk-payment",ownerId:owner,consultantId:sub.consultantId,subscriptionId:sub.subscriptionId,clientId:sub.clientId,checkoutId,tier:sub.tier,amountMinor:sub.amountMinor,currency:"EUR",cycle,version:0,status:"charging",createdAt:startedAt,updatedAt:startedAt,orderNumber:`gp-${hash(`${sub.subscriptionId}:${cycle}`).slice(0,30)}`};
    try { await write([put(next(sub,{activeOrderId:checkoutId,lastOrderId:checkoutId}),sub),put(row),accountCheck(owner),expertCheck(expert," AND packageSource=:purchased AND packageSubscriptionId=:subscription AND attribute_not_exists(packageRevokedAt)",{":purchased":"purchased",":subscription":sub.subscriptionId})]); }
    catch (error) { if (conflict(error)) return; throw error; }
    // Claim is durable before the single debit attempt. A crash/timeout is
    // reconciled by reference; no worker ever repeats the charge request.
    let result;
    try { result=await gateway.chargeRecurring({...row,bindingId:sub.bindingId}); }
    catch (_) { return; /* Next sweep retries status reads only, never a debit. */ }
    try { await applyResult(owner,checkoutId,row,result); } catch (_) { /* Next sweep retries reads only. */ }
  }
  async function sweep({budgetMs=18000}={}) {
    const deadline=Date.now()+budgetMs;
    let cursor, checked=0;
    do {
      const result = await dynamo.send(new QueryCommand({TableName:usersTable,IndexName:"billing-index",Limit:5,KeyConditionExpression:"billingIndexPK=:pk AND billingIndexSK<=:now",ExpressionAttributeValues:{":pk":"DUE",":now":now().toISOString()},ExclusiveStartKey:cursor}));
      for (const sub of result.Items || []) {
        if (deadline-Date.now()<17000) return {checked,limited:true};
        const account=await read(usersTable,{userId:sub.ownerId});
        if(!activeAccount(account)) await cancel(sub.ownerId);
        const fresh=await subscription(sub.ownerId);
        if(fresh?.bindingId && !fresh.autoRenew && !fresh.activeOrderId && (!activeAccount(account) || fresh.status === "revoked" || !(Date.parse(fresh.paidThroughAt)>now().getTime())) && remainingTime()>=26000) {
          try {
            await gateway.disableBinding({clientId:fresh.clientId,bindingId:fresh.bindingId});
            const cleaned=next(fresh,{bindingRemovedAt:now().toISOString()});delete cleaned.bindingId;
            await write([put(cleaned,fresh)]);
          } catch(_) { /* Retry cleanup later; never reactivate card billing. */ }
          checked++;continue;
        }
        if (sub.activeOrderId || sub.lastPaidOrderId) { try { await reconcile(sub.ownerId,sub.activeOrderId || sub.lastPaidOrderId); } catch (_) {} }
        if (deadline-Date.now()>=17000) { try { await renew(sub.ownerId); } catch (_) {} }
        checked++;
      }
      cursor=result.LastEvaluatedKey;
    } while(cursor);
    return {checked};
  }
  async function deliverNotices(owner) {
    let result,cursor;
    do {
      result=await dynamo.send(new QueryCommand({TableName:usersTable,IndexName:"billing-index",Limit:10,KeyConditionExpression:"billingIndexPK=:pk AND billingIndexSK<=:now",...(owner?{FilterExpression:"ownerId=:owner"}:{}),ExpressionAttributeValues:{":pk":"NOTICE",":now":now().toISOString(),...(owner?{":owner":owner}:{})},ExclusiveStartKey:cursor}));
      cursor=result.LastEvaluatedKey;
    } while(!(result.Items || []).length && cursor);
    let sent=0;
    for(const row of result.Items || []) {
      if(row.retryAfter && row.retryAfter>now().toISOString()) continue;
      const claimed=next(row,{attempts:row.attempts+1,retryAfter:new Date(now().getTime()+300000).toISOString()});
      try { await write([put(claimed,row)]); } catch(error) { if(conflict(error)) continue;throw error; }
      // At least once notice delivery: a crash after send may duplicate a
      // receipt, but cannot duplicate a charge or a paid entitlement.
      let accepted=false;
      try { accepted=await notify(row.ownerId,row); } catch(_) {}
      await write([put(next(claimed,{pending:!accepted,...(accepted?{sentAt:now().toISOString()}:{})}),claimed)]);
      if(accepted) sent++;
      break; // bounded send duration; remaining records are kept for later
    }
    return {sent};
  }
  async function adminOrders() {
    const rows=[];let cursor;
    do {
      const result=await dynamo.send(new ScanCommand({TableName:usersTable,FilterExpression:"#kind=:kind",ExpressionAttributeNames:{"#kind":"kind"},ExpressionAttributeValues:{":kind":"dsk-payment"},ExclusiveStartKey:cursor}));
      rows.push(...result.Items || []);cursor=result.LastEvaluatedKey;
    } while(cursor);
    return rows.filter(row=>row.kind === "dsk-payment").sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,200).map(row=>({...publicOrder(row),ownerId:row.ownerId,bankReference:row.orderNumber}));
  }
  async function orderForAdmin(id) {
    if(!UUID.test(id || "")) throw fail("Невалиден номер.",400);
    const row=await read(usersTable,{userId:orderKey(id.toLowerCase())});
    if(row?.kind !== "dsk-payment") throw fail("Плащането не е намерено.",404);
    return row;
  }
  return {create,reconcile,cancel,resume,requestRefund,summary,renew,sweep,subscription,list,publicOrder,deliverNotices,adminOrders,orderForAdmin};
}

module.exports = { createBilling, monthBoundary, POLICY, PRICES, subKey, orderKey };
