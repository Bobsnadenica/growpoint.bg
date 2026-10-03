import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { accountDeletionDeadline, canCancelAccountDeletion, hasPendingAccountDeletion } from "../../lib/account-deletion";
import type { UserProfile } from "../../lib/types";
import "./ScheduledDeletionPanel.css";

export default function ScheduledDeletionPanel({
  token, profile, refreshing, exporting, exportError, exportMessage,
  onCancelled, onRefresh, onExport, onLogout
}: {
  token: string;
  profile: UserProfile;
  refreshing: boolean;
  exporting: boolean;
  exportError: string;
  exportMessage: string;
  onCancelled: () => void;
  onRefresh: () => void;
  onExport: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const [now, setNow] = useState(Date.now);
  const [action, setAction] = useState<"cancel" | "logout" | null>(null);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const operation = useRef(false);
  const activeToken = useRef(token);
  const deadline = accountDeletionDeadline(profile);
  const mayCancel = canCancelAccountDeletion(profile, now);
  const busy = Boolean(action || exporting || refreshing);

  useEffect(() => {
    activeToken.current = token;
    return () => { activeToken.current = ""; };
  }, [token]);

  useEffect(() => {
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 60_000);
    const timeout = deadline !== null && deadline > Date.now()
      ? window.setTimeout(update, Math.min(deadline - Date.now(), 2_147_483_647)) : null;
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(interval);
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("focus", update);
    };
  }, [deadline]);

  async function cancelDeletion() {
    if (operation.current || busy || needsRefresh || !canCancelAccountDeletion(profile)) return;
    operation.current = true;
    setAction("cancel"); setError("");
    try {
      const result = await api.cancelMyAccountDeletion(token);
      if (result.deletionScheduledAt !== null || result.deletionEffectiveAt !== null) {
        throw new Error("Не успяхме да потвърдим отмяната. Провери статуса на профила.");
      }
      if (activeToken.current === token) onCancelled();
    } catch (value) {
      if (activeToken.current === token) {
        setError(value instanceof Error ? value.message : "Неуспешна отмяна. Провери статуса и опитай пак.");
        setNeedsRefresh(true);
      }
    } finally {
      operation.current = false;
      if (activeToken.current === token) setAction(null);
    }
  }

  async function refreshStatus() {
    if (operation.current || busy) return;
    operation.current = true;
    setAction("cancel"); setError("");
    try {
      const current = await api.getMyProfile(token);
      if (activeToken.current !== token) return;
      if (!hasPendingAccountDeletion(current)) onCancelled();
      else { setNeedsRefresh(false); onRefresh(); }
    } catch (value) {
      if (activeToken.current === token) setError(value instanceof Error ? value.message : "Не успяхме да проверим статуса. Опитай пак.");
    } finally {
      operation.current = false;
      if (activeToken.current === token) setAction(null);
    }
  }

  async function leave() {
    if (operation.current || busy) return;
    operation.current = true;
    setAction("logout"); setError("");
    try { await onLogout(); }
    catch (value) {
      if (activeToken.current === token) setError(value instanceof Error ? value.message : "Не успяхме да излезем. Опитай пак.");
    } finally {
      operation.current = false;
      if (activeToken.current === token) setAction(null);
    }
  }

  return <section className="section">
    <div className="container">
      <article className="panel scheduled-deletion" aria-labelledby="scheduled-deletion-title" aria-busy={busy}>
        <p className="eyebrow">Поверителност</p>
        <h1 id="scheduled-deletion-title">Изтриването на профила е насрочено.</h1>
        <p>Публичният ти профил е скрит. Докато изтриването е насрочено, обичайните действия в акаунта са спрени.</p>
        <div className="scheduled-deletion__deadline">
          <strong>Срок за отмяна</strong>
          {deadline !== null ? <time dateTime={profile.deletionEffectiveAt || ""}>
            {new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", dateStyle: "long", timeStyle: "short" }).format(deadline)} · българско време
          </time> : <p>Провери статуса, за да заредиш точния срок.</p>}
        </div>
        <p>{mayCancel
          ? "Преди този срок можеш да отмениш изтриването. Това запазва акаунта ти; не създава нов профил и не променя членството ти."
          : "Срокът за отмяна е изтекъл или не може да бъде потвърден. Провери статуса; след започване на окончателното изтриване отмяна не е възможна."}</p>
        {error || exportError ? <p className="scheduled-deletion__error" role="alert">{error || exportError}</p> : null}
        {exportMessage ? <p role="status">{exportMessage}</p> : null}
        <div className="scheduled-deletion__actions">
          <button className="primary-button" type="button" onClick={() => void cancelDeletion()} disabled={busy || needsRefresh || !mayCancel}>
            {action === "cancel" ? "Проверяваме…" : "Отмени изтриването"}
          </button>
          <button className="ghost-button" type="button" onClick={() => void refreshStatus()} disabled={busy}>Провери статуса</button>
          <button className="ghost-button" type="button" onClick={() => void onExport()} disabled={busy}>
            {exporting ? "Подготвяме копието…" : "Свали моите данни"}
          </button>
          <button className="ghost-button" type="button" onClick={() => void leave()} disabled={busy}>
            {action === "logout" ? "Излизаме…" : "Изход"}
          </button>
        </div>
        <p className="form-note">При въпроси за данните си използвай <Link to="/contact">контактите за правни запитвания и данни</Link>.</p>
      </article>
    </div>
  </section>;
}
