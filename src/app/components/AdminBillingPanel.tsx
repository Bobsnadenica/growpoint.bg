import {useEffect,useState} from "react";
import {billingApi,billingAmount,billingDate,PAYMENT_STATUS,type PaymentOrder} from "../../lib/billing";
export default function AdminBillingPanel({token}:{token:string}) {
  const [items,setItems]=useState<(PaymentOrder&{ownerId:string;bankReference:string})[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false);
  async function load(){const result=await billingApi.adminList(token);setItems(result.items);setEnabled(result.enabled);}
  useEffect(()=>{let active=true;billingApi.adminList(token).then(result=>{if(active){setItems(result.items);setEnabled(result.enabled);}}).catch(value=>{if(active)setError(value instanceof Error?value.message:"Неуспешно зареждане.");});return()=>{active=false;};},[token]);
  async function refresh(id?:string){setBusy(true);setError("");try{if(id)await billingApi.adminRefresh(token,id);await load();}catch(value){setError(value instanceof Error?value.message:"Неуспешна проверка.");}finally{setBusy(false);}}
  return <section className="panel"><p className="eyebrow">Експертни абонаменти</p><h2>Плащания и заявки за възстановяване</h2>
    <p>{enabled?"Реалните плащания са включени.":"Реалните плащания са изключени."} Показват се до 200 последни поръчки.</p>
    <p className="form-note">Възстановяване се отбелязва като приключило само след потвърждение от банката. Финансовите действия се изпълняват от оператора в банковия портал; бутонът тук само проверява статуса.</p>
    {error && <p role="alert">{error}</p>}<button className="ghost-button" disabled={busy} type="button" onClick={()=>void refresh()}>Обнови списъка</button>
    {items.length===0?<p>Няма платежни поръчки.</p>:items.map(row=><article className="panel billing-summary" key={row.checkoutId}><h3>{row.tier} · {billingAmount(row.amountMinor)}</h3><p>{PAYMENT_STATUS[row.status] || row.status} · {billingDate(row.createdAt)}</p><p className="form-note">Профил: {row.ownerId}</p><p className="form-note">Номер в банката: {row.bankReference}</p>
      {row.refundRequestedAt && <p>Заявка за възстановяване от {billingDate(row.refundRequestedAt)}.</p>}{row.attention && <p role="status">Нужда от преглед: {row.attention}</p>}
      <button className="ghost-button" type="button" disabled={busy} onClick={()=>void refresh(row.checkoutId)}>Провери в банката</button>
    </article>)}
  </section>;
}
