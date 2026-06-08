import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type {
  AdminConsultantSummary,
  AdminMetrics,
  ConsultantProfileStatus
} from "../../lib/types";
import PageScene from "../layout/PageScene";

type Filter = "pending" | "featured" | "approved" | "rejected" | "all";

function statusLabel(status: AdminConsultantSummary["profileStatus"]) {
  if (status === "approved" || status === "active") return "Одобрен";
  if (status === "rejected") return "Отказан";
  return "Чакащ одобрение";
}

function statusBadgeClass(status: AdminConsultantSummary["profileStatus"]) {
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

export default function AdminPage() {
  const { token, isAdmin, loading, user } = useAuth();
  const [items, setItems] = useState<AdminConsultantSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [featuredActionId, setFeaturedActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);
  const [adminMessageText, setAdminMessageText] = useState("");
  const [adminMessageBusy, setAdminMessageBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setError("");
    try {
      const next = await api.adminListConsultants(token);
      setItems(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно зареждане.");
    } finally {
      setListLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    void reload();
  }, [isAdmin, reload, token]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    let active = true;
    api
      .adminGetMetrics(token)
      .then((data) => {
        if (active) setMetrics(data);
      })
      .catch(() => {
        // Metrics are non-critical; the moderation list still works without them.
      });
    return () => {
      active = false;
    };
  }, [isAdmin, token]);

  const counts = useMemo(() => {
    return {
      pending: items.filter((item) => item.profileStatus === "pending").length,
      approved: items.filter(
        (item) => item.profileStatus === "approved" || item.profileStatus === "active"
      ).length,
      featured: items.filter((item) => item.featured).length,
      rejected: items.filter((item) => item.profileStatus === "rejected").length,
      all: items.length
    };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "approved") {
      return items.filter(
        (item) => item.profileStatus === "approved" || item.profileStatus === "active"
      );
    }
    if (filter === "featured") {
      return items.filter((item) => item.featured);
    }
    return items.filter((item) => item.profileStatus === filter);
  }, [items, filter]);

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
    return <Navigate to="/auth?redirect=/admin" replace />;
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

  async function setStatus(
    item: AdminConsultantSummary,
    nextStatus: ConsultantProfileStatus
  ) {
    if (!token) return;
    const isOwnProfile = item.ownerUserId === user!.id;

    if (typeof window !== "undefined") {
      const labelMap: Record<ConsultantProfileStatus, string> = {
        approved: "одобриш",
        rejected: "откажеш",
        pending: "върнеш в чакащи"
      };
      const action = labelMap[nextStatus];
      const confirmCopy = isOwnProfile && nextStatus === "approved"
        ? `Сигурен ли си, че искаш да одобриш СОБСТВЕНИЯ си профил? Действието ще бъде записано в одита като самостоятелно одобрение.`
        : `Сигурен ли си, че искаш да ${action} профила на ${item.name}?`;
      if (!window.confirm(confirmCopy)) {
        return;
      }
    }

    setPendingActionId(item.consultantId);
    setError("");
    setSuccessMessage("");
    try {
      await api.adminSetConsultantStatus(token, item.consultantId, nextStatus);
      await reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Действието не успя.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function setFeatured(item: AdminConsultantSummary, nextFeatured: boolean) {
    if (!token) return;

    const isApproved =
      item.profileStatus === "approved" || item.profileStatus === "active";

    if (nextFeatured && (!isApproved || !item.isPublic)) {
      setError("Първо одобри профила и го направи публичен, преди да го добавиш към подбраните.");
      return;
    }

    setFeaturedActionId(item.consultantId);
    setError("");
    setSuccessMessage("");

    try {
      await api.adminSetConsultantFeatured(token, item.consultantId, nextFeatured);
      setItems((currentItems) =>
        currentItems.map((current) =>
          current.consultantId === item.consultantId
            ? { ...current, featured: nextFeatured }
            : current
        )
      );
      setSuccessMessage(
        nextFeatured
          ? `${item.name} е добавен към подбраните профили на началната страница.`
          : `${item.name} е премахнат от подбраните профили.`
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно обновяване на подбран профил.");
    } finally {
      setFeaturedActionId(null);
    }
  }

  async function sendAdminMessage(
    event: FormEvent<HTMLFormElement>,
    item: AdminConsultantSummary
  ) {
    event.preventDefault();
    if (!token || !item.ownerUserId || adminMessageBusy) return;

    const message = adminMessageText.trim();
    if (message.length < 2) {
      setError("Напиши кратко съобщение до потребителя.");
      return;
    }

    setAdminMessageBusy(true);
    setError("");
    setSuccessMessage("");
    try {
      await api.adminMessageUser(token, item.ownerUserId, {
        subject: "Съобщение от GrowPoint",
        message
      });
      setAdminMessageText("");
      setMessageTargetId(null);
      setSuccessMessage(`Съобщението до ${item.ownerEmail || item.name} е изпратено.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно изпращане на съобщение.");
    } finally {
      setAdminMessageBusy(false);
    }
  }

  const filterChips: { key: Filter; label: string; count: number }[] = [
    { key: "pending", label: "Чакащи", count: counts.pending },
    { key: "featured", label: "Подбрани", count: counts.featured },
    { key: "approved", label: "Одобрени", count: counts.approved },
    { key: "rejected", label: "Отказани", count: counts.rejected },
    { key: "all", label: "Всички", count: counts.all }
  ];

  const emptyCopy: Record<Filter, { title: string; hint: string }> = {
    pending: {
      title: "Няма чакащи заявки.",
      hint: "Всички профили са прегледани. Връщай се периодично, за да обработваш нови подавания."
    },
    approved: {
      title: "Все още няма одобрени профили.",
      hint: "Одобрените профили се показват тук с информация кой и кога ги е приел."
    },
    featured: {
      title: "Няма подбрани профили за началната страница.",
      hint: "Одобри публичен профил и използвай бутона за подбиране, за да го покажеш в началната секция."
    },
    rejected: {
      title: "Няма отказани профили.",
      hint: "Отказаните профили остават достъпни за повторен преглед."
    },
    all: {
      title: "Няма консултантски профили в системата.",
      hint: "След като консултанти и ментори се регистрират, ще се появят тук."
    }
  };

  return (
    <PageScene tone="dashboard" pageKey="admin">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">Админ</p>
            <h1>Одобряване на консултантски профили</h1>
            <p className="hero__lede">
              Преглеждаш заявките от консултанти и ментори преди да станат публични в
              каталога. Можеш да одобряваш и собствения си профил — действието се
              записва в одита.
            </p>
          </div>
        </div>
      </section>

      {metrics
        ? (() => {
            const reg14 = metrics.users.registrationsPerDay.slice(-14);
            const regMax = Math.max(1, ...reg14.map((day) => day.count));
            return (
              <section className="section section--tight">
                <div className="container">
                  <div className="dashboard-form-head">
                    <p className="eyebrow">Мониторинг</p>
                    <h2>Преглед на платформата</h2>
                  </div>
                  <div className="metric-grid">
                    <article className="metric-card">
                      <span>Регистрирани потребители</span>
                      <strong>{metrics.users.total}</strong>
                      <em>
                        {metrics.users.clients} клиенти · {metrics.users.consultants} консултанти
                      </em>
                    </article>
                    <article className="metric-card">
                      <span>Нови за 7 дни</span>
                      <strong>{metrics.users.registrationsLast7}</strong>
                      <em>регистрации</em>
                    </article>
                    <article className="metric-card">
                      <span>Публични профили</span>
                      <strong>{metrics.consultants.public}</strong>
                      <em>от {metrics.consultants.total} консултантски</em>
                    </article>
                    <article className="metric-card">
                      <span>Резервации</span>
                      <strong>{metrics.bookings.total}</strong>
                      <em>{metrics.bookings.confirmed} потвърдени</em>
                    </article>
                    <article className="metric-card">
                      <span>Съобщения</span>
                      <strong>{metrics.messages}</strong>
                      <em>между потребители</em>
                    </article>
                    <article className="metric-card">
                      <span>Отзиви</span>
                      <strong>{metrics.reviews}</strong>
                      <em>{metrics.bookings.confirmedSessions} проведени сесии</em>
                    </article>
                  </div>

                  <div className="metric-breakdown">
                    <article className="metric-card metric-card--wide">
                      <span>Регистрации по дни (последни 14)</span>
                      <div className="metric-chart" role="img" aria-label="Регистрации по дни">
                        {reg14.map((day) => (
                          <div
                            key={day.date}
                            className="metric-chart__bar"
                            title={`${day.date}: ${day.count}`}
                            style={{ height: `${Math.max(6, (day.count / regMax) * 100)}%` }}
                          >
                            <b>{day.count || ""}</b>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="metric-card">
                      <span>Консултанти по статус</span>
                      <dl className="metric-rows">
                        <div>
                          <dt>Чакащи</dt>
                          <dd>{metrics.consultants.pending}</dd>
                        </div>
                        <div>
                          <dt>Одобрени</dt>
                          <dd>{metrics.consultants.approved}</dd>
                        </div>
                        <div>
                          <dt>Отказани</dt>
                          <dd>{metrics.consultants.rejected}</dd>
                        </div>
                      </dl>
                    </article>
                    <article className="metric-card">
                      <span>Резервации по статус</span>
                      <dl className="metric-rows">
                        <div>
                          <dt>Чакащи</dt>
                          <dd>{metrics.bookings.pending}</dd>
                        </div>
                        <div>
                          <dt>Потвърдени</dt>
                          <dd>{metrics.bookings.confirmed}</dd>
                        </div>
                        <div>
                          <dt>Отказани</dt>
                          <dd>{metrics.bookings.declined}</dd>
                        </div>
                        <div>
                          <dt>Отменени</dt>
                          <dd>{metrics.bookings.cancelled}</dd>
                        </div>
                      </dl>
                    </article>
                  </div>
                  <p className="form-note">
                    Посещенията на сайта не се проследяват тук — за това е нужен аналитичен
                    инструмент (напр. Plausible или Google Analytics).
                  </p>
                </div>
              </section>
            );
          })()
        : null}

      <section className="section section--tight">
        <div className="container">
          <dl className="admin-stats">
            <div>
              <dt>Чакащи</dt>
              <dd>{counts.pending}</dd>
            </div>
            <div>
              <dt>Одобрени</dt>
              <dd>{counts.approved}</dd>
            </div>
            <div>
              <dt>Подбрани</dt>
              <dd>{counts.featured}</dd>
            </div>
            <div>
              <dt>Отказани</dt>
              <dd>{counts.rejected}</dd>
            </div>
          </dl>

          <div className="search-shortcuts admin-filter">
            <div className="search-shortcuts__list">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className={`shortcut-chip ${filter === chip.key ? "shortcut-chip--active" : ""}`}
                  onClick={() => setFilter(chip.key)}
                >
                  {chip.label} ({chip.count})
                </button>
              ))}
            </div>
          </div>

          <div role="alert" aria-live="assertive">
            {error ? <div className="panel panel--error">{error}</div> : null}
          </div>
          <div role="status" aria-live="polite">
            {successMessage ? <div className="panel panel--success">{successMessage}</div> : null}
          </div>

          {listLoading ? (
            <div className="panel empty-state">Зареждаме заявките...</div>
          ) : visible.length === 0 ? (
            <div className="panel empty-state">
              <strong>{emptyCopy[filter].title}</strong>
              <p>{emptyCopy[filter].hint}</p>
            </div>
          ) : (
            <div className="admin-list">
              {visible.map((item) => {
                const isApproved =
                  item.profileStatus === "approved" || item.profileStatus === "active";
                const isRejected = item.profileStatus === "rejected";
                const busy = pendingActionId === item.consultantId;
                const featuredBusy = featuredActionId === item.consultantId;
                const isOwnProfile = item.ownerUserId === user.id;
                const isExpanded = expandedId === item.consultantId;
                const auditWho =
                  item.statusUpdatedByEmail || (item.statusSelfApproved ? "самостоятелно" : "администратор");
                const auditAction = isApproved
                  ? "Одобрен"
                  : isRejected
                    ? "Отказан"
                    : "Върнат в чакащи";
                const audit = item.statusUpdatedAt
                  ? `${auditAction} от ${auditWho} на ${formatAuditDate(item.statusUpdatedAt)}`
                  : "";

                return (
                  <article className="panel admin-card" key={item.consultantId}>
                    <div className="admin-card__head">
                      <div className="admin-card__identity">
                        <div className="admin-card__avatar" aria-hidden="true">
                          {item.avatarUrl ? (
                            <img src={item.avatarUrl} alt="" />
                          ) : (
                            <span>{getInitials(item.name)}</span>
                          )}
                        </div>
                        <div className="admin-card__identity-body">
                          <div className="admin-card__top-row">
                            <span className="plan-pill">
                              {item.profileType === "mentor" ? "Ментор" : "Консултант"}
                            </span>
                            {isOwnProfile ? (
                              <span className="status-badge admin-card__own-badge">
                                Твой профил
                              </span>
                            ) : null}
                            {item.statusSelfApproved && isApproved ? (
                              <span className="status-badge admin-card__self-badge">
                                Самостоятелно одобрен
                              </span>
                            ) : null}
                            {item.featured ? (
                              <span className="status-badge admin-card__featured-badge">
                                Подбран за начална
                              </span>
                            ) : null}
                          </div>
                          <h3>{item.name}</h3>
                          <p>{item.headline || "Без описание"}</p>
                          {item.ownerEmail ? (
                            <p className="admin-card__owner">
                              <span>Собственик:</span>{" "}
                              <a href={`mailto:${item.ownerEmail}`}>{item.ownerEmail}</a>
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className={statusBadgeClass(item.profileStatus)}>
                        {statusLabel(item.profileStatus)}
                      </span>
                    </div>

                    <dl className="admin-card__meta">
                      <div>
                        <dt>Slug</dt>
                        <dd>{item.slug || "—"}</dd>
                      </div>
                      <div>
                        <dt>Град</dt>
                        <dd>{item.city || "—"}</dd>
                      </div>
                      <div>
                        <dt>Опит</dt>
                        <dd>{item.experienceYears ? `${item.experienceYears} години` : "—"}</dd>
                      </div>
                      <div>
                        <dt>Слотове</dt>
                        <dd>{item.availabilityCount}</dd>
                      </div>
                      <div>
                        <dt>Публичен</dt>
                        <dd>{item.isPublic ? "Да" : "Не"}</dd>
                      </div>
                      <div>
                        <dt>Начална</dt>
                        <dd>{item.featured ? "Подбран" : "Не"}</dd>
                      </div>
                    </dl>

                    {(item.specializations.length || item.languages.length || item.sessionModes.length) ? (
                      <div className="admin-card__chips">
                        {item.specializations.slice(0, 4).map((spec) => (
                          <span className="chip chip--soft" key={`spec-${spec}`}>
                            {spec}
                          </span>
                        ))}
                        {item.languages.slice(0, 3).map((lang) => (
                          <span className="chip" key={`lang-${lang}`}>
                            {lang}
                          </span>
                        ))}
                        {item.sessionModes.slice(0, 2).map((mode) => (
                          <span className="chip chip--soft" key={`mode-${mode}`}>
                            {mode}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {item.bio ? (
                      <div className="admin-card__bio">
                        <p className={isExpanded ? "admin-card__bio-text admin-card__bio-text--open" : "admin-card__bio-text"}>
                          {item.bio}
                        </p>
                        {item.bio.length > 220 ? (
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setExpandedId(isExpanded ? null : item.consultantId)}
                          >
                            {isExpanded ? "Скрий биографията" : "Прочети цялата биография"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}

                    {audit ? (
                      <p className={`admin-card__audit ${item.statusSelfApproved ? "admin-card__audit--self" : ""}`}>
                        {audit}
                      </p>
                    ) : null}

                    <div className="admin-card__actions">
                      <Link
                        className="primary-button"
                        to={`/admin/preview/${item.consultantId}`}
                      >
                        Виж и провери
                      </Link>
                      {item.ownerUserId ? (
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setError("");
                            setSuccessMessage("");
                            setAdminMessageText("");
                            setMessageTargetId((current) =>
                              current === item.ownerUserId ? null : item.ownerUserId
                            );
                          }}
                        >
                          {messageTargetId === item.ownerUserId
                            ? "Скрий съобщение"
                            : "Съобщение"}
                        </button>
                      ) : null}
                      <button
                        className={`ghost-button admin-card__featured-action ${item.featured ? "admin-card__featured-action--active" : ""}`}
                        type="button"
                        disabled={featuredBusy || (!item.featured && (!isApproved || !item.isPublic))}
                        title={
                          !item.featured && (!isApproved || !item.isPublic)
                            ? "Профилът трябва първо да е одобрен и публичен."
                            : undefined
                        }
                        onClick={() => setFeatured(item, !item.featured)}
                      >
                        {featuredBusy
                          ? "Записваме..."
                          : item.featured
                            ? "Махни от подбрани"
                            : "Подбери за начална"}
                      </button>
                      {!isApproved ? (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(item, "approved")}
                        >
                          {busy ? "Записваме..." : "Одобри"}
                        </button>
                      ) : null}
                      {!isRejected ? (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(item, "rejected")}
                        >
                          {busy ? "Записваме..." : "Откажи"}
                        </button>
                      ) : null}
                      {(isApproved || isRejected) ? (
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={busy}
                          onClick={() => setStatus(item, "pending")}
                        >
                          Върни в чакащи
                        </button>
                      ) : null}
                    </div>
                    {messageTargetId === item.ownerUserId ? (
                      <form
                        className="admin-message-form"
                        onSubmit={(event) => sendAdminMessage(event, item)}
                      >
                        <label>
                          Съобщение до {item.ownerEmail || item.name}
                          <textarea
                            value={adminMessageText}
                            rows={4}
                            maxLength={1200}
                            placeholder="Напиши ясно и професионално съобщение..."
                            onChange={(event) => setAdminMessageText(event.target.value)}
                            disabled={adminMessageBusy}
                          />
                        </label>
                        <div className="admin-message-form__actions">
                          <button
                            className="primary-button"
                            type="submit"
                            disabled={adminMessageBusy || !adminMessageText.trim()}
                          >
                            {adminMessageBusy ? "Изпращаме..." : "Изпрати"}
                          </button>
                          <button
                            className="ghost-button"
                            type="button"
                            disabled={adminMessageBusy}
                            onClick={() => {
                              setMessageTargetId(null);
                              setAdminMessageText("");
                            }}
                          >
                            Отказ
                          </button>
                        </div>
                      </form>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </PageScene>
  );
}
