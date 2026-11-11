import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { billingApi, billingAmount, billingDate, bankCheckoutUrl, PAYMENT_STATUS, type BillingSummary, type PaymentOrder } from "../../lib/billing";
import type { ConsultantPackageTier, ConsultantProfile } from "../../lib/types";
import { useModalFocus } from "../../lib/use-modal-focus";
import { MERCHANT } from "../../lib/merchant";
type Plan={tier:ConsultantPackageTier;name:string;price:string;level:string;tagline:string;description:string;features:readonly string[]};

export default function ExpertBillingPanel({token,consultant,plans,onMembershipChange}:{token:string;consultant:ConsultantProfile|null;plans:readonly Plan[];onMembershipChange?:()=>Promise<void>}) {
  const [data,setData]=useState<BillingSummary|null>(null),[error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState<Plan|null>(null),[consent,setConsent]=useState(false),[submitted,setSubmitted]=useState(false);
  const dialog=useRef<HTMLDivElement>(null),epoch=useRef(0),title=useId();
  const storageKey=`growpoint.billing.checkout.${consultant?.consultantId || "none"}`;
  function clearResolvedCheckout(value:BillingSummary) {
    try {
      const saved=sessionStorage.getItem(storageKey);if(!saved)return;
      const cached=JSON.parse(saved) as {checkoutId:string};
      if(value.orders.some(row=>row.checkoutId===cached.checkoutId && ["succeeded","failed","cancelled","refunded","partially_refunded","disputed"].includes(row.status)))sessionStorage.removeItem(storageKey);
    } catch { /* A checkout still fails closed before POST if storage is blocked. */ }
  }
  const close=()=>{if(!busy)setSelected(null);};
  useModalFocus(Boolean(selected),dialog,close);
  useEffect(()=>{
    const current=++epoch.current,controller=new AbortController();setData(null);setError("");setBusy(false);setSelected(null);
    billingApi.get(token,controller.signal).then(async value=>{
      if(current!==epoch.current)return;
      setData(value);
      clearResolvedCheckout(value);
      const returned=new URL(window.location.href).searchParams.get("payment");
      if(returned && value.orders.some(row=>row.checkoutId===returned)) {
        await billingApi.refresh(token,returned);
        value=await billingApi.get(token,controller.signal);
        clearResolvedCheckout(value);
        await onMembershipChange?.();
        if(current===epoch.current){setData(value);setMessage("Банковият статус е проверен. Виж резултата в историята.");}
      }
    }).catch(value=>{if(current===epoch.current && !controller.signal.aborted)setError(value instanceof Error?value.message:"Неуспешна проверка на абонамента.");});
    return ()=>{controller.abort();epoch.current++;};
  },[token,consultant?.consultantId]);
  async function action(work:()=>Promise<unknown>,success:string) {
    const current=epoch.current;setBusy(true);setError("");setMessage("");
    try {await work();const value=await billingApi.get(token);clearResolvedCheckout(value);await onMembershipChange?.();if(current===epoch.current){setData(value);setMessage(success);}}
    catch(value){if(current===epoch.current)setError(value instanceof Error?value.message:"Заявката не е потвърдена. Обнови статуса преди нов опит.");}
    finally {if(current===epoch.current)setBusy(false);}
  }
  async function checkout() {
    if(!selected || !consent || !data?.enabled || submitted) return;
    const current=epoch.current;setSubmitted(true);setBusy(true);setError("");
    // Persist before registering. Reloads and interrupted responses must reuse
    // the same checkout ID rather than create another payment.
    try {
      const saved=sessionStorage.getItem(storageKey);
      const pending=saved ? JSON.parse(saved) as {checkoutId:string;tier:ConsultantPackageTier} : null;
      if(pending && pending.tier!==selected.tier)throw Error("Има започнато плащане за друг пакет. Обнови историята и провери статуса му.");
      const body=pending || {checkoutId:crypto.randomUUID(),tier:selected.tier};
      sessionStorage.setItem(storageKey,JSON.stringify(body));
      const order=await billingApi.create(token,{...body,acceptRecurring:true,policyVersion:data.policyVersion});
      if(current!==epoch.current)return;
      if(order.checkoutUrl){window.location.assign(bankCheckoutUrl(order.checkoutUrl));return;}
      setData(await billingApi.get(token));setSelected(null);
      setMessage("Провери статуса в историята. Не започвай второ плащане, докато първото не приключи.");
      if(["failed","cancelled"].includes(order.status))sessionStorage.removeItem(storageKey);
    } catch(value){if(current===epoch.current)setError(value instanceof Error?value.message:"Заявката не е потвърдена. Обнови историята преди нов опит.");}
    finally{if(current===epoch.current)setBusy(false);}
  }
  async function refreshOrder(row:PaymentOrder) {
    await billingApi.refresh(token,row.checkoutId);
    const value=await billingApi.get(token);
    const current=value.orders.find(x=>x.checkoutId===row.checkoutId);
    if(current && ["succeeded","failed","cancelled","refunded"].includes(current.status))sessionStorage.removeItem(storageKey);
  }
  const sub=data?.subscription;
  const manual=consultant?.comped || consultant?.packageSource === "granted";
  const active=manual ? consultant?.membershipActive === true : sub ? sub.status === "active" && Date.parse(sub.paidThroughAt || "")>Date.now() : consultant?.membershipActive === true;
  const currentTier=manual ? consultant?.packageTier : sub?.tier || consultant?.packageTier;
  const paidIntervalActive=sub?.status !== "revoked" && Date.parse(sub?.paidThroughAt || "")>Date.now();
  const refundingCurrent=Boolean(sub && data?.orders.some(row=>row.periodEndsAt===sub.paidThroughAt && row.refundRequestedAt));
  const safeCheckout=(row:PaymentOrder)=>{try{return row.checkoutUrl ? bankCheckoutUrl(row.checkoutUrl):null;}catch{return null;}};
  return <>
    {error && <p className="form-note" role="alert">{error}</p>}
    {message && <p className="form-note" role="status">{message}</p>}
    {!data && <p className="form-note">{error?"Плащането не е достъпно до успешна проверка на статуса.":"Проверка на абонамента…"}</p>}
    <button className="ghost-button" type="button" disabled={busy} onClick={()=>void action(async()=>{},"Историята е обновена.")}>Обнови историята</button>
    {sub && <div className="panel billing-summary">
      <h3>Твоят абонамент</h3>
      <p>Платен достъп до {billingDate(sub.paidThroughAt)}.</p>
      <p>{sub.autoRenew?`Месечно подновяване · следваща дата: ${billingDate(sub.nextChargeAt)}.`:"Автоматичното подновяване е спряно."}</p>
      <p className="form-note">Месечната дата се изчислява по UTC; часовете тук са показани за София.</p>
      {sub.inFlight && <p role="status">Има неприключило плащане. Отказът спира следващите подновявания; текущото плащане трябва да бъде проверено отделно.</p>}
      {sub.attention && <p className="form-note">Абонаментът изисква проверка. Виж историята или се свържи с contactus@growpoint.bg.</p>}
      {sub.autoRenew && <button className="ghost-button" disabled={busy} type="button" onClick={()=>{setConsent(false);void action(()=>billingApi.cancel(token),"Подновяването е спряно. Платеният период се запазва.");}}>Спри автоматичното подновяване</button>}
      {!sub.autoRenew && data.enabled && sub.status === "active" && paidIntervalActive && !sub.inFlight && !refundingCurrent && <div><label className="checkbox-row"><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} disabled={busy}/><span>Разрешавам отново месечно таксуване на {billingAmount(sub.amountMinor)}.</span></label><button className="ghost-button" type="button" disabled={!consent || busy} onClick={()=>void action(()=>billingApi.resume(token,data.policyVersion),"Месечното подновяване е възстановено без ново плащане за текущия период.")}>Включи подновяването</button></div>}
    </div>}
    <div className="package-plans">{plans.map(plan=>{
      const isCurrent=active && currentTier===plan.tier;
      return <article className={`package-plan package-plan--${plan.tier} ${isCurrent?"package-plan--current":""}`} key={plan.tier}>
        <header className="package-plan__head"><p className="eyebrow">{plan.level}</p><h3>{plan.name}</h3><p className="form-note">{plan.tagline}</p></header>
        <p>{plan.description}</p><ul className="package-plan__features">{plan.features.map(feature=><li key={feature}>{feature}</li>)}</ul>
        <div className="package-plan__footer"><strong>{data?`${billingAmount(data.prices[plan.tier])} / месец`:plan.price}</strong>
          {isCurrent?<span className="status-badge status-badge--success">Текущ пакет</span>:data?.enabled?<button className="primary-button" type="button" disabled={busy || Boolean(manual || sub?.autoRenew || sub?.inFlight || paidIntervalActive)} onClick={()=>{setSelected(plan);setConsent(false);setSubmitted(false);setError("");}}>Избери {plan.name}</button>:null}
        </div>
      </article>;
    })}</div>
    {data && !data.enabled && <p className="form-note">Онлайн покупката на план в момента е недостъпна. За съдействие пиши на <a href={`mailto:${MERCHANT.supportEmail}`}>{MERCHANT.supportEmail}</a>.</p>}
    {data && data.orders.length>0 && <div className="billing-history"><h3>История на плащанията</h3>{data.orders.map(row=><article className="panel" key={row.checkoutId}>
      <h4>{row.tier} · {billingAmount(row.amountMinor)}</h4><p>{PAYMENT_STATUS[row.status] || "Изисква проверка"} · {billingDate(row.createdAt)}</p>
      {row.periodEndsAt && <p>Платен период до {billingDate(row.periodEndsAt)}.</p>}
      {row.refundRequestedAt && <p role="status">Заявка за възстановяване: {billingDate(row.refundRequestedAt)}. {row.status === "refunded" ? "Възстановяването е потвърдено от банката." : "Окончателният резултат се потвърждава от банката."}</p>}
      {row.attention && <p className="form-note">Нужна е проверка от поддръжката.</p>}
      <div className="modal-card__actions">
        <button className="ghost-button" disabled={busy} type="button" onClick={()=>void action(()=>refreshOrder(row),"Статусът е проверен.")}>Провери статуса</button>
        {safeCheckout(row) && row.status==="created" && data.enabled && <a className="primary-button" href={safeCheckout(row) || undefined}>Продължи към банката</a>}
        {row.status==="succeeded" && !row.refundRequestedAt && <button className="ghost-button" disabled={busy} type="button" onClick={()=>{setConsent(false);void action(()=>billingApi.refund(token,row.checkoutId),"Заявката е записана за преглед. Това не означава приключило възстановяване.");}}>Заяви отказ / възстановяване</button>}
      </div>
    </article>)}</div>}
    {selected && data && createPortal(<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={title} ref={dialog} tabIndex={-1}>
      <section className="modal-card payment-preview"><h2 id={title}>GrowPoint {selected.name}</h2>
        <p><strong>{billingAmount(data.prices[selected.tier])} всеки календарен месец</strong>, с автоматично подновяване.</p>
        <ul className="page-list"><li>Платеният период започва след потвърдена такса.</li><li>Спираш подновяването от таблото; платеният период се запазва.</li><li>Пълно възстановяване при отказ до 14 дни от първата такса. Законовите ти права се запазват.</li></ul>
        <details><summary>Дати и потвърждаване на картата</summary><p>Месечната дата се изчислява по UTC; при кратък месец се използва последният му ден. Банката може първо да потвърди карта без такса, след което се събира първата месечна сума.</p><p>Картовите данни се въвеждат и запазват само при банката. За автоматично подновяване избери запазване на картата в банковата форма. Без потвърдена периодична карта подновяването няма да се включи.</p></details>
        <label className="checkbox-row"><input type="checkbox" checked={consent} disabled={busy || submitted} onChange={event=>setConsent(event.target.checked)}/><span>Приемам <a href="/terms" target="_blank" rel="noopener noreferrer">условията</a> и разрешавам таксуване на {billingAmount(data.prices[selected.tier])} месечно до отказ.</span></label>
        <p className="form-note">Търговец: {MERCHANT.name} · ЕИК {MERCHANT.eik}.</p>
        {error && <p role="alert">{error}</p>}
        <div className="modal-card__actions"><button className="primary-button" type="button" disabled={!consent || busy || submitted} onClick={()=>void checkout()}>{busy?"Подготвяме плащането…":`Плати ${billingAmount(data.prices[selected.tier])} / месец`}</button><button className="ghost-button" type="button" disabled={busy} onClick={close}>Затвори</button></div>
      </section>
    </div>,document.body)}
  </>;
}
