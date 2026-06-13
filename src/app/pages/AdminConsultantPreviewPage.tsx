import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { AdminConsultantDetail } from "../../lib/types";
import PageScene from "../layout/PageScene";

const BGN_PER_EUR = 1.95583;
const PRICE_TIER_STEP_EUR = 50;

function membershipLabel(c: AdminConsultantDetail) {
  if (c.restricted) return "Ограничен";
  if (c.isPublic) return "Публичен";
  if (c.comped || c.packageSource === "granted" || c.packageSource === "purchased") {
    return "Активен (скрит)";
  }
  return "Неактивен";
}

function membershipBadgeClass(c: AdminConsultantDetail) {
  if (c.restricted) return "status-badge status-badge--cancelled";
  if (c.isPublic) return "status-badge status-badge--success";
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

function getPriceEur(consultant: AdminConsultantDetail) {
  const explicit = Number(consultant.priceEur);

  if (Number.isFinite(explicit) && explicit > 0) {
    return roundUpPriceTierEur(explicit);
  }

  const legacyBgn = Number((consultant as AdminConsultantDetail & { priceBgn?: number }).priceBgn);
  if (Number.isFinite(legacyBgn) && legacyBgn > 0) {
    return roundUpPriceTierEur(legacyBgn / BGN_PER_EUR);
  }

  return 0;
}

function roundUpPriceTierEur(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value / PRICE_TIER_STEP_EUR) * PRICE_TIER_STEP_EUR;
}

function formatEuroPrice(value: number) {
  return new Intl.NumberFormat("bg-BG", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0
  }).format(value);
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
  const [restrictBusy, setRestrictBusy] = useState(false);

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

  async function setRestricted(nextRestricted: boolean) {
    if (!token || !consultant || !consultant.ownerUserId) return;
    if (consultant.ownerUserId === user!.id) {
      setError("Не можеш да ограничиш собствения си акаунт.");
      return;
    }
    const confirmCopy = nextRestricted
      ? `Сигурен ли си, че искаш да ограничиш акаунта на ${consultant.name}? Профилът ще бъде скрит и входът ще бъде блокиран.`
      : `Да възстановиш ли достъпа на ${consultant.name}?`;
    if (typeof window !== "undefined" && !window.confirm(confirmCopy)) {
      return;
    }
    setRestrictBusy(true);
    setError("");
    try {
      await api.adminRestrictUser(token, consultant.ownerUserId, nextRestricted);
      await reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Действието не успя.");
    } finally {
      setRestrictBusy(false);
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

  const isOwnProfile = consultant.ownerUserId === user.id;

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
            <span className={membershipBadgeClass(consultant)}>
              {membershipLabel(consultant)}
            </span>
            {isOwnProfile ? (
              <span className="status-badge admin-card__own-badge">Твой профил</span>
            ) : null}
            {consultant.restricted ? (
              <span className="status-badge status-badge--cancelled">Ограничен</span>
            ) : consultant.comped ? (
              <span className="status-badge admin-card__self-badge">
                Поканен (безплатно)
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
                <dd>
                  {getPriceEur(consultant) ? formatEuroPrice(getPriceEur(consultant)) : "—"}
                </dd>
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

            <div className="admin-card__actions">
              {consultant.ownerUserId && !isOwnProfile ? (
                <button
                  className={`ghost-button ${consultant.restricted ? "" : "admin-card__danger-action"}`}
                  type="button"
                  disabled={restrictBusy}
                  onClick={() => setRestricted(!consultant.restricted)}
                >
                  {restrictBusy
                    ? "Записваме..."
                    : consultant.restricted
                      ? "Възстанови достъпа"
                      : "Ограничи акаунта"}
                </button>
              ) : null}
              {consultant.isPublic && !consultant.restricted && consultant.slug ? (
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
