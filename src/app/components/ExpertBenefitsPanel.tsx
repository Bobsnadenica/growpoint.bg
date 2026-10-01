import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  BENEFIT_LABELS, BENEFIT_STATUS_LABELS, benefitStatusChoices, expertBenefitsApi,
  hasActiveBenefitRequest, nextBenefitQuarter, parseLocalBenefitSchedule, toLocalScheduleInput,
  type AdminBenefitRequest, type BenefitKind, type BenefitRequest, type BenefitStatus
} from "../../lib/expert-benefits";
import { formatDateTimeBg } from "../../lib/datetime";
import "./ExpertBenefitsPanel.css";

function useBenefitData<T>(token: string, read: (token: string, signal?: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  const currentToken = useRef(token);
  currentToken.current = token;
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(""); setData(null);
    try {
      const result = await read(token, controller.signal);
      if (!controller.signal.aborted) setData(result);
      return !controller.signal.aborted;
    } catch (value) {
      if (!controller.signal.aborted) setError(value instanceof Error ? value.message : "Неуспешно зареждане. Опитай пак.");
      return false;
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [read, token]);
  useEffect(() => {
    currentToken.current = token;
    if (token) void load(); else { setData(null); setLoading(false); }
    return () => { currentToken.current = ""; pending.current?.abort(); };
  }, [load, token]);
  return { data, setData, loading, error, load, currentToken };
}

function BenefitHistoryItem({ item }: { item: BenefitRequest }) {
  return <article className="expert-benefits__history-item">
    <div className="expert-benefits__item-heading"><strong>{BENEFIT_LABELS[item.kind]} · {item.period}</strong><span>{BENEFIT_STATUS_LABELS[item.status] || item.status}</span></div>
    {item.scheduledAt && <p>Насрочена: {formatDateTimeBg(item.scheduledAt)}</p>}
    {item.note && <p>{item.note}</p>}
    {item.adminNote && <p>От екипа: {item.adminNote}</p>}
  </article>;
}

export function ExpertBenefitsPanel({ token }: { token: string }) {
  const { data, setData, loading, error, load, currentToken } = useBenefitData(token, expertBenefitsApi.list);
  const [kind, setKind] = useState<BenefitKind>("podcast");
  const [period, setPeriod] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState("");
  const [message, setMessage] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const busy = useRef<object | null>(null);
  useEffect(() => {
    busy.current = null; setSaving(false); setFailure(""); setMessage(""); setNeedsRefresh(false);
    setKind("podcast"); setPeriod(""); setNote("");
  }, [token]);
  const quarter = data?.benefits.spotlight.quarter || "";
  const selectedPeriod = [quarter, nextBenefitQuarter(quarter)].includes(period) ? period : quarter;
  const duplicate = data ? hasActiveBenefitRequest(data.items, kind, selectedPeriod) : false;
  const roomUnavailable = kind === "event_room" && selectedPeriod === quarter && data?.benefits.spotlight.eventRoomRemaining === 0;

  async function refresh() {
    if (busy.current) return;
    if (await load()) { setNeedsRefresh(false); setFailure(""); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !data?.benefits.spotlight.eligible || duplicate || roomUnavailable || needsRefresh) return;
    const operation = {};
    busy.current = operation; setSaving(true); setFailure(""); setMessage("");
    try {
      const result = await expertBenefitsApi.create(token, { kind, ...(kind === "event_room" ? { period: selectedPeriod } : {}), note: note.trim() });
      if (currentToken.current !== token) return;
      setData(current => current ? { benefits: result.benefits, items: [...current.items.filter(item => item.requestId !== result.request.requestId), result.request] } : current);
      setNote(""); setMessage("Заявката е записана. Следи статуса тук.");
    } catch (value) {
      if (currentToken.current === token) { setFailure(value instanceof Error ? value.message : "Неуспешна заявка."); setNeedsRefresh(true); }
    } finally {
      if (busy.current === operation) {
        busy.current = null;
        if (currentToken.current === token) setSaving(false);
      }
    }
  }

  return <section className="panel expert-benefits" aria-label="Привилегии на експерта">
    <header className="expert-benefits__header"><h2>Привилегии на пакета</h2><button type="button" className="ghost-button" onClick={() => void refresh()} disabled={loading || saving}>Обнови</button></header>
    {loading && <p role="status">Зареждаме привилегиите…</p>}
    {error && <p className="expert-benefits__error" role="alert">{error}</p>}
    {data && <>
      <div className="expert-benefits__monthly"><strong>Месечна безплатна сесия · {data.benefits.monthlyFreeSession.month}</strong><p>{!data.benefits.monthlyFreeSession.eligible ? "Нужен е активен експертен пакет." : data.benefits.monthlyFreeSession.remaining ? "Сесията за този месец още не е резервирана." : "Сесията за този месец вече е резервирана."}</p><p className="form-note">Първият клиент, избрал месечната безплатна сесия, я резервира през публичния ти календар. Добави свободни часове. Месецът се определя по Europe/Sofia.</p></div>
      {data.benefits.spotlight.eligible ? <>
        <h3>Spotlight заявки</h3><p className="form-note">Заяви подкаст, кампания или зала. Екипът уточнява възможността и датата тук. Заявката не гарантира място или дата.</p>
        <form className="expert-benefits__form" onSubmit={submit} aria-busy={saving}>
          <fieldset disabled={saving || needsRefresh}>
            <legend className="expert-benefits__visually-hidden">Нова Spotlight заявка</legend>
            <label>Привилегия<select value={kind} onChange={event => setKind(event.target.value as BenefitKind)}>{Object.entries(BENEFIT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {kind === "event_room" && <label>Тримесечие<select value={selectedPeriod} onChange={event => setPeriod(event.target.value)}>{[quarter, nextBenefitQuarter(quarter)].filter(Boolean).map(value => <option value={value} key={value}>{value}</option>)}</select></label>}
            <label>Бележка <span>(по избор)</span><textarea rows={3} maxLength={600} value={note} onChange={event => setNote(event.target.value)} placeholder="Тема и предпочитания — без лични данни на други хора." /></label>
            {(duplicate || roomUnavailable) && <p className="form-note">Вече има заявка за тази привилегия/период. Виж историята по-долу.</p>}
            <button type="submit" className="primary-button" disabled={duplicate || roomUnavailable || saving || needsRefresh}>{saving ? "Записваме…" : "Изпрати заявка"}</button>
          </fieldset>
        </form>
      </> : <p className="form-note">Заявките за подкаст, кампания и зала са за активен пакет Spotlight.</p>}
      {!!data.items.length && <details className="expert-benefits__history"><summary>История на заявките · {data.items.length}</summary>{[...data.items].reverse().map(item => <BenefitHistoryItem key={item.requestId} item={item} />)}</details>}
    </>}
    {failure && <p className="expert-benefits__error" role="alert">{failure} Обнови списъка, преди да опиташ пак — заявката може вече да е записана.</p>}
    {message && <p role="status">{message}</p>}
  </section>;
}

function AdminBenefitEditor({ item, token, disabled, onBusy, onSaved }: { item: AdminBenefitRequest; token: string; disabled: boolean; onBusy: (busy: boolean) => void; onSaved: (item: BenefitRequest) => void }) {
  const [status, setStatus] = useState(item.status);
  const [scheduledAt, setScheduledAt] = useState(toLocalScheduleInput(item.scheduledAt));
  const [adminNote, setAdminNote] = useState(item.adminNote || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const busy = useRef(false);
  const choices = benefitStatusChoices(item);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || disabled || needsRefresh) return;
    const parsed = parseLocalBenefitSchedule(scheduledAt);
    if (status === "scheduled" && (!parsed || Date.parse(parsed) <= Date.now())) { setError("Избери валидна бъдеща дата и час."); return; }
    busy.current = true; setSaving(true); onBusy(true); setError("");
    try {
      const result = await expertBenefitsApi.adminUpdate(token, item.requestId, { consultantId: item.consultantId, status, ...(status === "scheduled" ? { scheduledAt: parsed } : {}), adminNote: adminNote.trim() });
      onSaved(result.request);
    } catch (value) { setError(`${value instanceof Error ? value.message : "Неуспешно записване."} Обнови списъка, преди да опиташ пак.`); setNeedsRefresh(true); }
    finally { busy.current = false; setSaving(false); onBusy(false); }
  }
  return <details className="expert-benefits__admin-item"><summary><span>{item.consultantName || "Експерт"} · {BENEFIT_LABELS[item.kind]} · {item.period}</span><span>{BENEFIT_STATUS_LABELS[item.status] || item.status}</span></summary>
    {item.note && <p>{item.note}</p>}
    <form className="expert-benefits__form" onSubmit={submit} aria-busy={saving}>
      <fieldset disabled={saving || disabled || needsRefresh}><legend className="expert-benefits__visually-hidden">Редактиране на заявката</legend>
        <label>Статус<select value={status} onChange={event => setStatus(event.target.value as BenefitStatus)}>{choices.map(value => <option value={value} key={value}>{BENEFIT_STATUS_LABELS[value]}</option>)}</select></label>
        {status === "scheduled" && <label>Дата и час<input type="datetime-local" value={scheduledAt} required onChange={event => setScheduledAt(event.target.value)} /><small>Местно време: {Intl.DateTimeFormat().resolvedOptions().timeZone}.{item.kind === "event_room" ? ` За залата датата трябва да е в ${item.period} (Europe/Sofia).` : ""}</small></label>}
        <label>Бележка от екипа<textarea rows={3} maxLength={600} value={adminNote} onChange={event => setAdminNote(event.target.value)} /></label>
        <button type="submit" className="ghost-button" disabled={saving}>{saving ? "Записваме…" : "Запази заявката"}</button>
      </fieldset>
    </form>
    {error && <p className="expert-benefits__error" role="alert">{error}</p>}
  </details>;
}

export function AdminBenefitsPanel({ token }: { token: string }) {
  const { data, setData, loading, error, load, currentToken } = useBenefitData(token, expertBenefitsApi.adminList);
  const [filter, setFilter] = useState("active");
  const [message, setMessage] = useState("");
  const [savingRequest, setSavingRequest] = useState("");
  const items = data?.items.filter(item => filter === "all" || (filter === "active" ? item.status === "pending" || item.status === "scheduled" : item.status === filter)) || [];
  return <section className="panel expert-benefits" aria-label="Администриране на Spotlight заявки">
    <header className="expert-benefits__header"><h2>Spotlight заявки</h2><button type="button" className="ghost-button" disabled={loading || !!savingRequest} onClick={() => void load()}>Обнови</button></header>
    <p className="form-note">Насрочвай след уточняване с експерта. Няма автоматични имейли. Изпълнението се потвърждава след насрочената дата.</p>
    {loading && <p role="status">Зареждаме заявките…</p>}
    {error && <p className="expert-benefits__error" role="alert">{error}</p>}
    {data && <><label className="expert-benefits__filter">Показвай<select value={filter} disabled={!!savingRequest} onChange={event => setFilter(event.target.value)}><option value="active">Активни</option><option value="all">Всички</option>{Object.entries(BENEFIT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{items.length ? items.map(item => <AdminBenefitEditor key={`${item.requestId}:${item.updatedAt}`} item={item} token={token} disabled={Boolean(savingRequest && savingRequest !== item.requestId)} onBusy={busy => { if (currentToken.current === token) setSavingRequest(busy ? item.requestId : ""); }} onSaved={updated => { if (currentToken.current !== token) return; setData(current => current ? { items: current.items.map(old => old.requestId === updated.requestId && old.consultantId === item.consultantId ? { ...old, ...updated } : old) } : current); setMessage("Заявката е записана."); }} />) : <p>Няма заявки за избрания филтър.</p>}</>}
    {message && <p role="status">{message}</p>}
  </section>;
}
