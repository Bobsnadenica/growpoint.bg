import { request } from "./api";
import type { ConsultantPackageTier } from "./types";
export interface PaymentOrder { checkoutId:string; tier:ConsultantPackageTier; amountMinor:number; currency:"EUR"; status:string; createdAt:string; periodStartsAt:string|null; periodEndsAt:string|null; checkoutUrl?:string; refundRequestedAt:string|null; attention:string|null }
export interface BillingSummary { enabled:boolean; policyVersion:string; prices:Record<ConsultantPackageTier,number>; currency:"EUR"; timezone:"UTC"; subscription:null|{tier:ConsultantPackageTier;amountMinor:number;status:string;autoRenew:boolean;paidThroughAt:string|null;nextChargeAt:string|null;cancellationRequestedAt:string|null;inFlight:boolean;attention:string|null}; orders:PaymentOrder[] }
export const billingApi={
  config:()=>request<{enabled:boolean}>("/billing/config"),
  get:(token:string,signal?:AbortSignal)=>request<BillingSummary>("/me/billing",{signal,cache:"no-store"},token),
  create:(token:string,body:{checkoutId:string;tier:ConsultantPackageTier;acceptRecurring:true;policyVersion:string})=>request<PaymentOrder>("/me/billing/checkout",{method:"POST",body:JSON.stringify(body)},token),
  cancel:(token:string)=>request<BillingSummary>("/me/billing/cancel",{method:"POST",body:"{}"},token),
  resume:(token:string,policyVersion:string)=>request<BillingSummary>("/me/billing/resume",{method:"POST",body:JSON.stringify({acceptRecurring:true,policyVersion})},token),
  refresh:(token:string,id:string)=>request<PaymentOrder>(`/me/billing/orders/${encodeURIComponent(id)}/refresh`,{method:"POST",body:"{}"},token),
  refund:(token:string,id:string)=>request<PaymentOrder>(`/me/billing/orders/${encodeURIComponent(id)}/refund`,{method:"POST",body:"{}"},token),
  adminList:(token:string)=>request<{items:(PaymentOrder&{ownerId:string;bankReference:string})[];enabled:boolean}>("/admin/billing",{cache:"no-store"},token),
  adminRefresh:(token:string,id:string)=>request<PaymentOrder>(`/admin/billing/orders/${encodeURIComponent(id)}/refresh`,{method:"POST",body:"{}"},token)
};
export const billingDate=(value:string|null)=>value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("bg-BG",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Sofia"}).format(new Date(value))+" (София)" : "—";
export const billingAmount=(minor:number)=>new Intl.NumberFormat("bg-BG",{style:"currency",currency:"EUR"}).format(minor/100);
export const PAYMENT_STATUS:Record<string,string>={registering:"Регистрира се",created:"Очаква плащане",charging:"Обработва се",pending:"Обработва се",unknown:"Изисква проверка",authorized:"Очаква окончателно плащане",succeeded:"Потвърдено",failed:"Неуспешно",cancelled:"Отменено",refunded:"Възстановено",partially_refunded:"Частично възстановено",disputed:"Оспорено"};
export function bankCheckoutUrl(value:string):string {
  const url=new URL(value);
  if(url.origin!=="https://epg.dskbank.bg" || url.username || url.password || url.hash || !url.pathname.startsWith("/payment/")) throw Error("Невалидна банкова връзка. Свържи се с поддръжката.");
  return url.href;
}
