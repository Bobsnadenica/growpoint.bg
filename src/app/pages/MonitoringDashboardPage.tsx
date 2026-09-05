import { useCallback, useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminMetrics } from "../../lib/types";

type Day = { date: string; count: number };
type Metrics = AdminMetrics & {
  snapshot?: { refreshMinutes: number; stale: boolean };
  completion: { total: number; clients: number; consultants: number; mentors: number; incomplete: number };
  expertTypes: { consultants: number; mentors: number };
  telemetry: { since: string | null; emailAccepted: number; emailFailed: number; emailSkipped: number; chatSent: number; adminMessages: number; apiErrors: number; perDay: { date: string; emailAccepted: number; chatSent: number }[] };
  accounts: { restricted: number; deleting: number };
  payments: { paid: number; free: number; unpaid: number };
  files: { total: number };
  invitations: { total: number; redeemed: number; pending: number };
  bookingActivity: Day[];
  emailService: { available: boolean; productionAccess?: boolean; sendingEnabled?: boolean; sentLast24Hours?: number | null; max24HourSend?: number | null };
};
const number = (n: number) => new Intl.NumberFormat("bg-BG").format(n);
const dateTime = (value: string) => new Date(value).toLocaleString("bg-BG");

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return <article className="monitor-stat"><span>{label}</span><strong>{typeof value === "number" ? number(value) : value}</strong>{detail && <small>{detail}</small>}</article>;
}

function Chart({ title, days }: { title: string; days: Day[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return <section className="monitor-chart panel"><div className="monitor-section-title"><h2>{title}</h2><span>{number(days.reduce((s, d) => s + d.count, 0))} за 30 дни</span></div>
    <div className="monitor-bars" role="img" aria-label={`${title}: ${days.map((d) => `${d.date}: ${d.count}`).join(", ")}`}>
      {days.map((d) => <div key={d.date} className="monitor-bar-slot" title={`${d.date}: ${d.count}`}><span style={{ height: `${Math.max(d.count ? 3 : 0, d.count / max * 100)}%` }} /></div>)}
    </div><div className="monitor-chart-axis"><span>{days[0]?.date}</span><span>{days[days.length - 1]?.date}</span></div>
    <details><summary>Дневни стойности</summary><div className="monitor-data-table"><table><thead><tr><th>Дата (UTC)</th><th>Брой</th></tr></thead><tbody>{days.map((d) => <tr key={d.date}><td>{d.date}</td><td>{number(d.count)}</td></tr>)}</tbody></table></div></details>
  </section>;
}

export default function MonitoringDashboardPage() {
  const { token, isAdmin, loading, user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token || !isAdmin) return;
    setBusy(true); setError("");
    try { setMetrics(await api.adminGetMetrics(token) as Metrics); }
    catch (value) { setError(value instanceof Error ? value.message : "Неуспешно зареждане."); }
    finally { setBusy(false); }
  }, [token, isAdmin]);
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 15 * 60000);
    return () => clearInterval(timer);
  }, [load]);
  if (loading) return <div className="container panel" role="status">Проверяваме достъпа…</div>;
  if (!user) return <Navigate to="/auth?redirect=/admin/dashboard" replace />;
  if (!isAdmin) return <div className="container panel panel--error" role="alert">Тази секция е достъпна само за администратори.</div>;
  return <MonitoringDashboardView metrics={metrics} error={error} busy={busy} onRefresh={() => void load()} />;
}

export function MonitoringDashboardView({ metrics, error, busy, onRefresh }: {
  metrics: Metrics | null; error: string; busy: boolean; onRefresh: () => void;
}) {
  const [period, setPeriod] = useState<"overview" | "activity">("overview");
  return <section className="monitor-page container">
    <header className="monitor-header"><div><p className="eyebrow">GrowPoint · вътрешен достъп</p><h1>Пулсът на платформата.</h1><p>Регистрации, активност и качество на профилите.</p></div><div className="monitor-actions"><Link className="ghost-button" to="/admin">Управление</Link><button className="primary-button" disabled={busy} onClick={onRefresh}>{busy ? "Обновяване…" : "Обнови"}</button></div></header>
    {error && <p className="panel panel--error" role="alert">{error}{metrics ? " Показани са последните успешно заредени данни." : ""}</p>}
    {!metrics ? <div className="panel" role="status">{busy ? "Зареждаме статистиката…" : "Обнови, за да заредиш статистиката."}</div> : <>
      <div className="monitor-meta"><span>Последно обновяване: {dateTime(metrics.generatedAt)}</span><span>Снимка на 15 минути при отворено табло · дни по UTC</span></div>
      {metrics.snapshot?.stale && <p className="panel" role="status">Обновяването е в ход. Показана е предишната снимка; опитай отново след малко.</p>}
      {!metrics.cognito.available && <p className="panel panel--error">Регистрациите в Cognito не са достъпни. Показаният брой е само за създадени профили в приложението.</p>}
      {metrics.cognito.available && metrics.cognito.capped && <p className="panel panel--error">Регистрациите са частични: достигнат е лимитът за прочит.</p>}
      <nav className="monitor-tabs" aria-label="Изглед на статистиката"><button className={period === "overview" ? "primary-button" : "ghost-button"} onClick={() => setPeriod("overview")}>Общ преглед</button><button className={period === "activity" ? "primary-button" : "ghost-button"} onClick={() => setPeriod("activity")}>Последни 30 дни</button></nav>
      {period === "overview" ? <>
        <div className="monitor-grid"><Stat label="Регистрирани акаунти" value={metrics.cognito.available ? metrics.cognito.total : metrics.users.total} detail={metrics.cognito.available ? "Източник: Cognito" : "Само активирани профили"} /><Stat label="Клиенти" value={metrics.users.clients} detail="Профили в приложението" /><Stat label="Консултанти" value={metrics.expertTypes.consultants} /><Stat label="Ментори" value={metrics.expertTypes.mentors} /><Stat label="Профили на 100%" value={metrics.completion.total} detail={`${metrics.users.total ? Math.round(metrics.completion.total / metrics.users.total * 100) : 0}% от профилите`} /><Stat label="Публични експерти" value={metrics.consultants.public} /><Stat label="Резервации" value={metrics.bookings.total} /><Stat label="Чат съобщения" value={metrics.messages} detail="Съхранена история + брояч след обновяването" /></div>
        <div className="monitor-columns"><section className="panel"><h2>Профили и регистрации</h2><dl className="monitor-list"><dt>Клиенти на 100%</dt><dd>{number(metrics.completion.clients)}</dd><dt>Консултанти на 100%</dt><dd>{number(metrics.completion.consultants)}</dd><dt>Ментори на 100%</dt><dd>{number(metrics.completion.mentors)}</dd><dt>Непълни профили</dt><dd>{number(metrics.completion.incomplete)}</dd><dt>Ограничени акаунти</dt><dd>{number(metrics.accounts.restricted)}</dd><dt>Насрочени за изтриване</dt><dd>{number(metrics.accounts.deleting)}</dd><dt>Документи</dt><dd>{number(metrics.files.total)}</dd>{metrics.cognito.available && <><dt>Непотвърден имейл</dt><dd>{number(metrics.cognito.unconfirmed)}</dd><dt>Регистрации за 7 дни</dt><dd>{number(metrics.cognito.newLast7)}</dd>{Object.entries(metrics.cognito.byProvider).map(([key, value]) => <div className="monitor-dl-row" key={key}><dt>{key}</dt><dd>{number(value)}</dd></div>)}</>}</dl></section>
        <section className="panel"><h2>Сесии и ангажираност</h2><dl className="monitor-list">{Object.entries({ "Чакащи резервации": metrics.bookings.pending, "Потвърдени": metrics.bookings.confirmed, "Отказани": metrics.bookings.declined, "Отменени": metrics.bookings.cancelled, "Предстоящи потвърдени": metrics.bookings.upcomingConfirmed, "Проведени (потвърдени от двете страни)": metrics.bookings.confirmedSessions, "Платени": metrics.payments.paid, "С точки": metrics.payments.free, "Неплатени": metrics.payments.unpaid, "Отзиви": metrics.reviews, "Покани (общо)": metrics.invitations.total, "Приети покани": metrics.invitations.redeemed, "Активни покани": metrics.invitations.pending }).map(([key, value]) => <div className="monitor-dl-row" key={key}><dt>{key}</dt><dd>{number(value)}</dd></div>)}</dl></section></div>
        <section className="panel"><div className="monitor-section-title"><h2>Имейли и системна активност</h2><span>{metrics.telemetry.since ? `Измерване от ${dateTime(metrics.telemetry.since)}` : "Измерването започва с първото събитие след внедряване"}</span></div><div className="monitor-grid"><Stat label="Имейли, приети от SES" value={metrics.telemetry.emailAccepted} /><Stat label="Неуспешни имейли" value={metrics.telemetry.emailFailed} /><Stat label="Пропуснати имейли" value={metrics.telemetry.emailSkipped} /><Stat label="API грешки" value={metrics.telemetry.apiErrors} /></div><p className="form-note">Броячите са за имейли от приложението; не включват кодове за вход от Cognito. Приет от SES не означава доставен. Исторически имейли преди началото на измерването не са налични.</p><p className="form-note">{!metrics.emailService.available ? "SES статус: недостъпен." : `SES: ${metrics.emailService.productionAccess ? "production" : "sandbox — само потвърдени получатели"}; изпращане ${metrics.emailService.sendingEnabled ? "включено" : "изключено"}. ${metrics.emailService.sentLast24Hours ?? "—"} приети съобщения за последните 24 часа за AWS акаунта.`}</p></section>
      </> : <div className="monitor-columns"><Chart title="Активирани профили" days={metrics.users.registrationsPerDay} /><Chart title="Посещения (сесии/ден)" days={metrics.visits.perDay} /><Chart title="Нови резервации" days={metrics.bookingActivity} /><Chart title="Изпратени чат съобщения" days={metrics.telemetry.perDay.map((d) => ({ date: d.date, count: d.chatSent }))} /><Chart title="Имейли, приети от SES" days={metrics.telemetry.perDay.map((d) => ({ date: d.date, count: d.emailAccepted }))} /></div>}
      <p className="monitor-footnote">Посещенията се отчитат веднъж на браузърна сесия за ден, не като уникални хора или всяко отваряне на страница. Админ страниците и локалната разработка не изпращат този брояч. Регистрациите са акаунти, а не проверени уникални хора. Експертите са преброени веднъж по собственик; примерни профили и вътрешни записи са изключени. Попълнеността използва същите полета като профилното табло. Историята на чата преди въвеждането на брояча може да е непълна.</p>
    </>}
  </section>;
}
