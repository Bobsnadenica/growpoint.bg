import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type {
  AdminConsultantSummary,
  ConsultantProfileStatus
} from "../../lib/types";
import PageScene from "../layout/PageScene";

type Filter = "pending" | "approved" | "rejected" | "all";

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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const counts = useMemo(() => {
    return {
      pending: items.filter((item) => item.profileStatus === "pending").length,
      approved: items.filter(
        (item) => item.profileStatus === "approved" || item.profileStatus === "active"
      ).length,
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
    try {
      await api.adminSetConsultantStatus(token, item.consultantId, nextStatus);
      await reload();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Действието не успя.");
    } finally {
      setPendingActionId(null);
    }
  }

  const filterChips: { key: Filter; label: string; count: number }[] = [
    { key: "pending", label: "Чакащи", count: counts.pending },
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
