import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { request } from "../../lib/api";
import { config } from "../../lib/config";

type Summary = { total: number; clients: number; mentors: number };
export default function AdminPreregistrationsPanel({ token }: { token: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const autoDownloaded = useRef(false);
  const refresh = useCallback(async () => {
    setError("");
    try { setSummary(await request<Summary>("/admin/preregistrations", {}, token)); }
    catch (value) { setError(value instanceof Error ? value.message : "Неуспешно зареждане."); }
  }, [token]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function download() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`${config.apiBaseUrl}/admin/preregistrations.csv`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Неуспешен експорт. Провери сесията си и опитай отново.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = "growpoint-preregistrations.csv";
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (value) { setError(value instanceof Error ? value.message : "Неуспешен експорт."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (new URLSearchParams(location.search).get("download") === "preregistrations" && !autoDownloaded.current) {
      autoDownloaded.current = true;
      void download();
    }
  }, [location.search, token]);
  return <section id="preregistrations" className="section section--tight"><div className="container"><article className="panel">
    <p className="eyebrow">Преди старта</p><h2>Предварителни регистрации</h2>
    <p>{summary ? `${summary.total} общо · ${summary.clients} потребители · ${summary.mentors} ментори` : "Зареждаме списъка…"}</p>
    <p className="form-note">Частен списък. CSV файлът се отваря в Excel, Numbers и Google Sheets. Заявките не създават акаунти и се пазят до 180 дни.</p>
    <div className="dashboard-inline-actions"><button type="button" className="primary-button" disabled={busy || !summary} onClick={() => void download()}>{busy ? "Подготвяме…" : "Изтегли CSV за Excel"}</button><button type="button" className="ghost-button" disabled={busy} onClick={() => void refresh()}>Обнови</button></div>
    <p className="form-note"><Link to="/admin?download=preregistrations#preregistrations">Директен линк за CSV</Link> · Изисква админ вход.</p>
    {error && <p role="alert">{error}</p>}
  </article></div></section>;
}
