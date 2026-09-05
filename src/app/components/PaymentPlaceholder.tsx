import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

// UI preview only. No card data, network request, payment status or entitlement
// mutation is possible here. Replace only after the provider contract arrives.
export default function PaymentPlaceholder({ description, amount }: { description: string; amount?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") { event.preventDefault(); close.current?.focus(); }
    };
    window.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; window.removeEventListener("keydown", key); trigger.current?.focus(); };
  }, [open]);
  return <>
    <button ref={trigger} className="ghost-button" type="button" onClick={() => setOpen(true)}>Плащане с DKS · преглед</button>
    {open && createPortal(<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="modal-card payment-preview">
        <p className="eyebrow">Демонстрация · без реално плащане</p>
        <h2 id={titleId}>Плащане с DKS</h2>
        <p>{description}</p>
        {amount && <p className="payment-preview__amount">{amount}</p>}
        <p>Свързването с платежната система предстои. Не въвеждай данни за карта и не превеждай средства през този екран.</p>
        <p className="form-note">Този преглед не активира пакет, не плаща резервация и не отключва линк за среща.</p>
        <div className="modal-card__actions"><button className="primary-button" type="button" disabled>Плащането още не е активно</button><button ref={close} className="ghost-button" type="button" onClick={() => setOpen(false)}>Затвори</button></div>
      </section>
    </div>, document.body)}
  </>;
}
