import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type {
  AdminConsultantDetail,
  ConsultantProfileStatus
} from "../../lib/types";
import PageScene from "../layout/PageScene";

function statusLabel(status: AdminConsultantDetail["profileStatus"]) {
  if (status === "approved" || status === "active") return "Одобрен";
  if (status === "rejected") return "Отказан";
  return "Чакащ одобрение";
}

function statusBadgeClass(status: AdminConsultantDetail["profileStatus"]) {
  if (status === "approved" || status === "active") {
    return "status-badge status-badge--success";
  }
  if (status === "rejected") return "status-badge status-badge--cancelled";
  return "plan-pill";
}

function formatAuditDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("bg-BG", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function getInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?"
  );
}

export default function AdminConsultantPreviewPage() {
  const { consultantId = "" } = useParams();
  const { token, isAdmin, loading, user } = useAuth();
  const navigate = useNavigate();
  const [consultant, setConsultant] = useState<AdminConsultantDetail | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState<ConsultantProfileStatus | null>(null);

  const reload = useCallback(async () => {
    if (!token || !consultantId) return;
    setListLoading(true);
    setError("");
    try {
      const next = await api.adminGetConsultant(token, consultantId);
      setConsultant(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно зареждане.");
    } finally {
      setListLoading(false);
    }
  }, [token, consultantId]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    void reload();
  }, [isAdmin, reload, token]);

  if (loading) {
    return (
      <PageScene tone="dashboard" pageKey="admin">
        <section className="section">
          <div className="container">
            <div className="panel empty-state">Проверяваме достъпа...</div>
          </div>
        </section>
      </PageScene>
    );
  }

  if (!user) {
    return <Navigate to={`/auth?redirect=/admin/preview/${consultantId}`} replace />;
  }

  if (!isAdmin) {
    return (
      <PageScene tone="dashboard" pageKey="admin">
        <section className="section">
          <div className="container">
            <div className="panel panel--error">
              Тази секция е достъпна само за администратори.
            </div>
          </div>
        </section>
      </PageScene>
    );
  }

  async function setStatus(nextStatus: ConsultantProfileStatus) {
    if (!token || !consultant) return;
    const isOwnProfile = consultant.ownerUserId === user!.id;
    const labelMap: Record<ConsultantProfileStatus, string> = {
      approved: "одобриш",
      rejected: "откажеш",
      pending: "върнеш в чакащи"
    };
    const verb = labelMap[nextStatus];
    const confirmCopy =
      isOwnProfile && nextStatus === "approved"
        ? "Сигурен ли си, че искаш да одобриш СОБСТВЕНИЯ си профил? Действието ще бъде записано в одита като самостоятелно одобрение."
        : `Сигурен ли си, че искаш да ${verb} профила на ${consultant.name}?`;
    if (typeof window !== "undefined" && !window.confirm(confirmCopy)) {
      return;
    }
    setAction(nextStatus);
    setError("");
    try {
      await api.adminSetConsultantStatus(token, consultant.consultantId, nextStatus);
      await reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Действието не успя.");
    } finally {
      setAction(null);
    }
  }

  if (listLoading) {
    return (
      <PageScene tone="dashboard" pageKey="admin">
        <section className="section">
          <div className="container">
            <div className="panel empty-state">Зареждаме профила...</div>
          </div>
        </section>
      </PageScene>
    );
  }

  if (!consultant) {
    return (
      <PageScene tone="dashboard" pageKey="admin">
        <section className="section">
          <div className="container">
            <div className="panel panel--error">
              {error || "Профилът не беше намерен."}
            </div>
            <div className="dashboard-actions">
              <Link className="ghost-button" to="/admin">
                Назад към админ панела
              </Link>
            </div>
          </div>
        </section>
      </PageScene>
    );
  }

  const isApproved =
    consultant.profileStatus === "approved" || consultant.profileStatus === "active";
  const isRejected = consultant.profileStatus === "rejected";
  const isOwnProfile = consultant.ownerUserId === user.id;
  const busy = action !== null;
  const auditWho =
    consultant.statusUpdatedByEmail ||
    (consultant.statusSelfApproved ? "самостоятелно" : "администратор");

  return (
    <PageScene tone="dashboard" pageKey="admin">
      <section className="section">
        <div className="container">
          <div className="admin-preview-toolbar">
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigate("/admin")}
            >
              ← Назад към списъка
            </button>
            <span className={statusBadgeClass(consultant.profileStatus)}>
              {statusLabel(consultant.profileStatus)}
            </span>
            {isOwnProfile ? (
              <span className="status-badge admin-card__own-badge">Твой профил</span>
            ) : null}
            {consultant.statusSelfApproved && isApproved ? (
              <span className="status-badge admin-card__self-badge">
                Самостоятелно одобрен
              </span>
            ) : null}
          </div>

          <div role="alert" aria-live="assertive">
            {error ? <div className="panel panel--error">{error}</div> : null}
          </div>

          <article className="panel admin-preview">
            {consultant.heroUrl ? (
              <div className="admin-preview__hero">
                <img src={consultant.heroUrl} alt="" />
              </div>
            ) : null}

            <header className="admin-preview__head">
              <div className="admin-preview__avatar" aria-hidden="true">
                {consultant.avatarUrl ? (
                  <img src={consultant.avatarUrl} alt="" />
                ) : (
                  <span>{getInitials(consultant.name)}</span>
                )}
              </div>
              <div className="admin-preview__identity">
                <p className="eyebrow">
                  {consultant.profileType === "mentor" ? "Ментор" : "Консултант"}
                </p>
                <h1>{consultant.name}</h1>
                {consultant.headline ? (
                  <p className="admin-preview__headline">{consultant.headline}</p>
                ) : null}
                {consultant.ownerEmail ? (
                  <p className="admin-card__owner">
                    <span>Собственик:</span>{" "}
                    <a href={`mailto:${consultant.ownerEmail}`}>
                      {consultant.ownerEmail}
                    </a>
                  </p>
                ) : null}
              </div>
            </header>

            <dl className="admin-card__meta">
              <div>
                <dt>Slug</dt>
                <dd>{consultant.slug || "—"}</dd>
              </div>
              <div>
                <dt>Град</dt>
                <dd>{consultant.city || "—"}</dd>
              </div>
              <div>
                <dt>Опит</dt>
                <dd>
                  {consultant.experienceYears ? `${consultant.experienceYears} години` : "—"}
                </dd>
              </div>
              <div>
                <dt>Свободни часове</dt>
                <dd>{consultant.availability?.length || 0}</dd>
              </div>
              <div>
                <dt>Цена</dt>
                <dd>{consultant.priceBgn ? `${consultant.priceBgn} лв` : "—"}</dd>
              </div>
              <div>
                <dt>Сесия</dt>
                <dd>
                  {consultant.sessionLengthMinutes
                    ? `${consultant.sessionLengthMinutes} мин`
                    : "—"}
                </dd>
              </div>
            </dl>

            {consultant.bio ? (
              <section className="admin-preview__section">
                <h2>Биография</h2>
                <p>{consultant.bio}</p>
              </section>
            ) : null}

            {consultant.experienceSummary ? (
              <section className="admin-preview__section">
                <h2>Опит</h2>
                <p>{consultant.experienceSummary}</p>
                {consultant.experienceHighlights?.length ? (
                  <ul className="feature-list">
                    {consultant.experienceHighlights.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ) : null}

            {consultant.educationHighlights?.length ? (
              <section className="admin-preview__section">
                <h2>Образование и сертификати</h2>
                <div className="chip-row">
                  {consultant.educationHighlights.map((item) => (
                    <span className="chip chip--soft" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {consultant.specializations?.length ? (
              <section className="admin-preview__section">
                <h2>Специализации</h2>
                <div className="chip-row">
                  {consultant.specializations.map((item) => (
                    <span className="chip" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {consultant.consultationTopics?.length ? (
              <section className="admin-preview__section">
                <h2>Теми на консултацията</h2>
                <div className="chip-row">
                  {consultant.consultationTopics.map((item) => (
                    <span className="chip chip--soft" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {consultant.languages?.length || consultant.sessionModes?.length ? (
              <section className="admin-preview__section">
                <h2>Езици и формат</h2>
                <div className="chip-row">
                  {(consultant.languages || []).map((item) => (
                    <span className="chip chip--soft" key={`lang-${item}`}>
                      {item}
                    </span>
                  ))}
                  {(consultant.sessionModes || []).map((item) => (
                    <span className="chip chip--soft" key={`mode-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {consultant.workApproach ? (
              <section className="admin-preview__section">
                <h2>Подход на работа</h2>
                <p>{consultant.workApproach}</p>
              </section>
            ) : null}

            {consultant.statusUpdatedAt ? (
              <p
                className={`admin-card__audit ${
                  consultant.statusSelfApproved ? "admin-card__audit--self" : ""
                }`}
              >
                {isApproved ? "Одобрен" : isRejected ? "Отказан" : "Върнат в чакащи"} от{" "}
                {auditWho} на {formatAuditDate(consultant.statusUpdatedAt)}
              </p>
            ) : null}

            <div className="admin-card__actions">
              {!isApproved ? (
                <button
                  className="primary-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("approved")}
                >
                  {action === "approved" ? "Записваме..." : "Одобри"}
                </button>
              ) : null}
              {!isRejected ? (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("rejected")}
                >
                  {action === "rejected" ? "Записваме..." : "Откажи"}
                </button>
              ) : null}
              {isApproved || isRejected ? (
                <button
                  className="ghost-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setStatus("pending")}
                >
                  Върни в чакащи
                </button>
              ) : null}
              {isApproved && consultant.slug ? (
                <Link
                  className="ghost-button"
                  to={`/consultants/${consultant.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Виж публичния профил
                </Link>
              ) : null}
            </div>
          </article>
        </div>
      </section>
    </PageScene>
  );
}
