import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../../lib/use-modal-focus";

// UI preview only. No card data, network request, payment status or entitlement
// mutation is possible here. Replace only after the provider contract arrives.
export default function PaymentPlaceholder({ description, amount }: { description: string; amount?: string }) {
  const [open, setOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(open, dialog, () => setOpen(false));
  return <>
    <button className="ghost-button" type="button" onClick={() => { setAttempted(false); setOpen(true); }}>Плащане с карта</button>
    {open && createPortal(<div ref={dialog} tabIndex={-1} className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="modal-card payment-preview">
        <p className="eyebrow">Демонстрация · без реално плащане</p>
        <h2 id={titleId}>Завърши плащането</h2>
        <div className="payment-preview__summary">
          <span>Твоята поръчка</span><strong>{description}</strong>
          <span>Обща сума</span><strong className="payment-preview__amount">{amount || "Ще бъде уточнена преди плащане"}</strong>
        </div>
        {!attempted && <><div className="payment-preview__method">
          <strong>Дебитна или кредитна карта</strong>
          <p>Visa · Mastercard · bCard</p>
          <p className="form-note">Карти от всяка банка, включително бизнес карти, от посочените картови схеми.</p>
        </div>
        <p className="form-note">При активиране на услугата ще продължиш към защитена V-POS страница. Не въвеждай картови данни тук.</p></>}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Условия за плащане и възстановяване на суми (нов раздел)</a>
        {attempted && <div className="payment-preview__notice" role="status">
          <strong>Това все още е демонстрация (mockup).</strong>
          <p>Не е извършено плащане. Не са изтеглени средства и не е активиран пакет или достъп до среща.</p>
        </div>}
        <div className="modal-card__actions"><button className="primary-button" type="button" onClick={() => setAttempted(current => !current)}>{attempted ? "Обратно към прегледа" : "Плати с карта"}</button><button className="ghost-button" type="button" onClick={() => setOpen(false)}>Затвори</button></div>
      </section>
    </div>, document.body)}
  </>;
}
