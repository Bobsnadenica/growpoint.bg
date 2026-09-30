import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { formatDateTimeBg } from "../../lib/datetime";
import type { DskUatConfig, DskUatOrder, DskUatStatus } from "../../lib/types";

const CHECKOUT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_COPY: Record<DskUatStatus, string> = {
  created: "Тестовата поръчка е създадена. Продължи към банковата тестова страница.",
  pending: "Тестовото плащане още не е потвърдено. Провери същата поръчка отново.",
  authorized: "Сумата е авторизирана в тестов режим. Плащането още не е завършено.",
  succeeded: "Банката потвърди успешно тестово плащане.",
  failed: "Тестът е неуспешен. Можеш да провериш статуса отново.",
  cancelled: "Тестовото плащане е отменено.",
  refunded: "Банката отчита възстановена тестова сума.",
  unknown: "Статусът още не е известен. Провери същата поръчка; не създавай нова."
};
const TERMINAL_STATUSES: DskUatStatus[] = ["succeeded", "failed", "cancelled", "refunded"];

export function readDskUatReturnId(search: string) {
  const values = new URLSearchParams(search).getAll("paymentTest");
  return values.length === 1 && CHECKOUT_ID.test(values[0]) ? values[0].toLowerCase() : null;
}

export function isDskUatCheckoutUrl(value: string) {
  try {
    const url = new URL(value);
    const keys = Array.from(url.searchParams.keys());
    return url.origin === "https://uat.dskbank.bg" && !url.username && !url.password && !url.hash &&
      /^\/payment\/(?:payment\/)?merchants\/[A-Za-z0-9_-]+\/payment_(?:bg|en)\.html$/.test(url.pathname) &&
      keys.length === 1 && keys[0] === "mdOrder" && CHECKOUT_ID.test(url.searchParams.get("mdOrder") || "");
  } catch {
    return false;
  }
}

export function validateDskUatOrder(order: DskUatOrder, checkoutId: string) {
  if (!order || order.checkoutId !== checkoutId || !CHECKOUT_ID.test(checkoutId) ||
      order.amountMinor !== 100 || order.currency !== "EUR" || !Object.prototype.hasOwnProperty.call(STATUS_COPY, order.status) ||
      (order.checkoutUrl && !isDskUatCheckoutUrl(order.checkoutUrl)) ||
      (order.status === "succeeded" && (order.actionCode !== "0" || !order.verifiedAt || !Number.isFinite(Date.parse(order.verifiedAt))))) {
    throw new Error("Непотвърден отговор за тестовото плащане.");
  }
  return order;
}

/** Synthetic admin UAT orders never alter real bookings, plans or messages. */
export default function DskSandboxPanel({ token }: { token: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [configuration, setConfiguration] = useState<{ token: string; value: DskUatConfig } | null>(null);
  const [order, setOrder] = useState<DskUatOrder | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  const checkoutIdRef = useRef<string | null>(null);
  const requestRevision = useRef(0);
  const returnedId = readDskUatReturnId(location.search);
  const enabled = configuration?.token === token && configuration.value?.enabled === true &&
    configuration.value.amountMinor === 100 && configuration.value.currency === "EUR";

  useEffect(() => {
    const revision = ++requestRevision.current;
    setConfiguration(null);
    setOrder(null);
    setError("");
    setBusy(false);
    busyRef.current = false;
    checkoutIdRef.current = null;
    if (token) {
      void api.adminGetDskUatConfig(token).then(value => {
        if (revision === requestRevision.current) setConfiguration({ token, value });
      }).catch(() => {
        // Fail closed: only a server-enabled sandbox may appear.
      });
    }
    return () => { requestRevision.current++; };
  }, [token]);

  useEffect(() => {
    if (!enabled || !returnedId || returnedId === checkoutIdRef.current) return;
    checkoutIdRef.current = returnedId;
    setOrder(null);
    void checkStatus();
  }, [enabled, returnedId, token]);

  async function checkStatus() {
    const checkoutId = checkoutIdRef.current;
    if (!enabled || !checkoutId || busyRef.current) return;
    const revision = requestRevision.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = validateDskUatOrder(await api.adminGetDskUatOrder(token, checkoutId), checkoutId);
      if (revision === requestRevision.current && checkoutIdRef.current === checkoutId) setOrder(result);
    } catch {
      if (revision === requestRevision.current) setError("Статусът не може да бъде потвърден. Провери същата поръчка отново.");
    } finally {
      if (revision === requestRevision.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  async function createCheckout(newOrder = false) {
    if (!enabled || busyRef.current || (newOrder && (!order || !TERMINAL_STATUSES.includes(order.status)))) return;
    const revision = requestRevision.current;
    const checkoutId = newOrder ? crypto.randomUUID() : checkoutIdRef.current || crypto.randomUUID();
    checkoutIdRef.current = checkoutId;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setOrder(null);
    // Keep the same idempotency key through a timeout, reload or return.
    navigate(`/admin?paymentTest=${checkoutId}`, { replace: true });
    try {
      const result = validateDskUatOrder(await api.adminCreateDskUatOrder(token, checkoutId), checkoutId);
      if (revision === requestRevision.current && checkoutIdRef.current === checkoutId) setOrder(result);
    } catch {
      if (revision === requestRevision.current) setError("Поръчката не може да бъде потвърдена. Провери статуса; повторният опит използва същата поръчка.");
    } finally {
      if (revision === requestRevision.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  if (!enabled) return null;

  const checkoutId = checkoutIdRef.current;
  const bankLink = order?.checkoutUrl && (order.status === "created" || order.status === "pending")
    ? order.checkoutUrl : null;
  const terminal = order && TERMINAL_STATUSES.includes(order.status);

  return (
    <section className="section section--tight" aria-labelledby="dsk-sandbox-title">
      <div className="container">
        <article className="panel form-stack">
          <header className="dashboard-form-head">
            <p className="eyebrow">DSK · Sandbox</p>
            <h2 id="dsk-sandbox-title">Тест на плащане с карта</h2>
          </header>
          <p className="form-note">Само тестов режим · 1,00 EUR. Не активира пакет или достъп до среща. GrowPoint не изпраща съобщения.</p>
          <p className="form-note">Картовите данни се въвеждат само в банковата тестова страница, не в GrowPoint.</p>
          <div role="status" aria-live="polite" aria-atomic="true">
            {busy ? "Проверяваме тестовата поръчка..." : order ? STATUS_COPY[order.status] : "Няма потвърден статус за тестова поръчка."}
          </div>
          {order?.verifiedAt && Number.isFinite(Date.parse(order.verifiedAt)) ? (
            <p className="form-note">Последна проверка: {formatDateTimeBg(order.verifiedAt)}</p>
          ) : null}
          {error ? <p className="form-note form-note--error" role="alert">{error}</p> : null}
          <div className="modal-card__actions">
            {!order ? <button className="primary-button" type="button" disabled={busy} onClick={() => void createCheckout()}>
              {checkoutId ? "Опитай със същата поръчка" : "Създай тестова поръчка"}
            </button> : null}
            {bankLink && !busy ? <a className="primary-button" href={bankLink} rel="noreferrer">Отвори банковата тестова страница</a> : null}
            {checkoutId ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void checkStatus()}>Провери статуса</button> : null}
            {terminal ? <button className="ghost-button" type="button" disabled={busy} onClick={() => void createCheckout(true)}>Нова тестова поръчка</button> : null}
          </div>
        </article>
      </div>
    </section>
  );
}
