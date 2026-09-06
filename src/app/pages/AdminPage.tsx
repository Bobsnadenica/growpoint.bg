import MonitoringDashboardPage from "./MonitoringDashboardPage";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type {
  AdminBooking,
  AdminConsultantSummary,
  AdminInvite,
  ConsultantPackageTier
} from "../../lib/types";
import PageScene from "../layout/PageScene";

type Filter = "all" | "public" | "featured" | "restricted";

const PACKAGE_TIER_LABELS: Record<ConsultantPackageTier, string> = {
  start: "Start",
  grow: "Grow",
  spotlight: "Spotlight"
};

function isActiveMember(item: AdminConsultantSummary) {
  return (
    item.comped === true ||
    item.packageSource === "granted" ||
    item.packageSource === "purchased"
  );
}

function membershipLabel(item: AdminConsultantSummary) {
  if (item.restricted) return "Ограничен";
  if (item.isPublic) return "Публичен";
  if (isActiveMember(item)) return "Активен (скрит)";
  return "Неактивен";
}

function membershipBadgeClass(item: AdminConsultantSummary) {
  if (item.restricted) return "status-badge status-badge--cancelled";
  if (item.isPublic) return "status-badge status-badge--success";
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
  const [filter, setFilter] = useState<Filter>("all");
  const [restrictActionId, setRestrictActionId] = useState<string | null>(null);
  const [featuredActionId, setFeaturedActionId] = useState<string | null>(null);
  const [packageActionId, setPackageActionId] = useState<string | null>(null);
  const [visibilityActionId, setVisibilityActionId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [messageTargetId, setMessageTargetId] = useState<string | null>(null);
  const [adminMessageText, setAdminMessageText] = useState("");
  const [adminMessageBusy, setAdminMessageBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [adminBookings, setAdminBookings] = useState<AdminBooking[]>([]);
  const [paidActionId, setPaidActionId] = useState<string | null>(null);

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

  const loadInvites = useCallback(async () => {
    if (!token) return;
    try {
      setInvites(await api.adminListInvites(token));
    } catch {
      // Invites are non-critical for the moderation list.
    }
  }, [token]);

  const loadAdminBookings = useCallback(async () => {
    if (!token) return;
    try {
      setAdminBookings(await api.adminListBookings(token));
    } catch {
      // Bookings list is non-critical for the moderation list.
    }
  }, [token]);

  useEffect(() => {
    if (!isAdmin || !token) return;
    void loadInvites();
    void loadAdminBookings();
  }, [isAdmin, token, loadInvites, loadAdminBookings]);

  const counts = useMemo(() => {
    return {
      all: items.length,
      public: items.filter((item) => item.isPublic && !item.restricted).length,
      featured: items.filter((item) => item.featured).length,
      restricted: items.filter((item) => item.restricted).length
    };
  }, [items]);

  const visible = useMemo(() => {
    if (filter === "public") {
      return items.filter((item) => item.isPublic && !item.restricted);
    }
    if (filter === "featured") return items.filter((item) => item.featured);
    if (filter === "restricted") return items.filter((item) => item.restricted);
    return items;
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

  async function setRestricted(item: AdminConsultantSummary, nextRestricted: boolean) {
    if (!token || !item.ownerUserId) return;
    if (item.ownerUserId === user!.id) {
      setError("Не можеш да ограничиш собствения си акаунт.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmCopy = nextRestricted
        ? `Сигурен ли си, че искаш да ограничиш акаунта на ${item.name}? Профилът ще бъде скрит и входът в системата ще бъде блокиран.`
        : `Да възстановиш ли достъпа на ${item.name}?`;
      if (!window.confirm(confirmCopy)) return;
    }

    setRestrictActionId(item.consultantId);
    setError("");
    setSuccessMessage("");
    try {
      await api.adminRestrictUser(token, item.ownerUserId, nextRestricted);
      await reload();
      setSuccessMessage(
        nextRestricted
          ? `${item.name}: акаунтът е ограничен (профилът е скрит, входът е блокиран).`
          : `${item.name}: достъпът е възстановен.`
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Действието не успя.");
    } finally {
      setRestrictActionId(null);
    }
  }

  async function sendInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || inviteBusy) return;
    const email = inviteEmail.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Въведи валиден имейл за поканата.");
      return;
    }
    setInviteBusy(true);
    setError("");
    setSuccessMessage("");
    try {
      const result = await api.adminCreateInvite(token, email);
      if (result.emailStatus === "accepted") {
        setInviteEmail("");
        setSuccessMessage(`Имейлът с поканата е приет за изпращане до ${email}.`);
      } else {
        setError("Поканата е създадена, но имейлът не е изпратен. Провери SES настройките и опитай отново.");
      }
      await loadInvites();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно изпращане на покана.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function setVisibility(item: AdminConsultantSummary, visibilityMode: "auto" | "shown" | "hidden") {
    if (!token) return;
    setVisibilityActionId(item.consultantId);
    setError(""); setSuccessMessage("");
    try {
      const updated = await api.adminSetConsultantVisibility(token, item.consultantId, visibilityMode);
      setItems(current => current.map(entry => entry.consultantId === item.consultantId ? { ...entry, ...updated } : entry));
      setSuccessMessage(updated.isPublic ? "Профилът е публичен." : "Видимостта е обновена. Автоматичното показване изисква активно членство и 100% попълване.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Неуспешна промяна на видимостта.");
    } finally { setVisibilityActionId(null); }
  }

  async function setFeatured(item: AdminConsultantSummary, nextFeatured: boolean) {
    if (!token) return;

    if (nextFeatured && (!item.isPublic || item.restricted)) {
      setError("Профилът трябва да е публичен и неограничен, преди да го добавиш към подбраните.");
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

  async function setPackage(
    item: AdminConsultantSummary,
    nextTier: ConsultantPackageTier
  ) {
    if (!token || nextTier === (item.packageTier || "start")) return;

    setPackageActionId(item.consultantId);
    setError("");
    setSuccessMessage("");

    try {
      const updated = await api.adminSetConsultantPackage(token, item.consultantId, nextTier);
      setItems((currentItems) =>
        currentItems.map((current) =>
          current.consultantId === item.consultantId
            ? {
                ...current,
                packageTier: nextTier,
                packageSource: updated.packageSource,
                isPublic: updated.isPublic
              }
            : current
        )
      );
      setSuccessMessage(
        `${item.name}: пакетът е сменен на ${PACKAGE_TIER_LABELS[nextTier]}${
          nextTier === "start" ? "." : " (предоставен от админ, без плащане)."
        }`
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешна смяна на пакет.");
    } finally {
      setPackageActionId(null);
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

  async function markBookingPaid(booking: AdminBooking) {
    if (!token || paidActionId) return;
    setPaidActionId(booking.bookingId);
    setError("");
    setSuccessMessage("");
    try {
      await api.adminMarkBookingPaid(token, booking.bookingId);
      await loadAdminBookings();
      setSuccessMessage(
        `Резервацията на ${booking.clientName || booking.clientEmail || "потребител"} е маркирана като платена.`
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно маркиране като платена.");
    } finally {
      setPaidActionId(null);
    }
  }

  const awaitingPayment = adminBookings.filter(
    (b) => b.status === "confirmed" && b.paymentStatus === "unpaid"
  );

  const filterChips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Всички", count: counts.all },
    { key: "public", label: "Публични", count: counts.public },
    { key: "featured", label: "Подбрани", count: counts.featured },
    { key: "restricted", label: "Ограничени", count: counts.restricted }
  ];

  const emptyCopy: Record<Filter, { title: string; hint: string }> = {
    all: {
      title: "Няма консултантски профили в системата.",
      hint: "Поканените експерти ще се появят тук, след като активират профила си."
    },
    public: {
      title: "Все още няма публични профили.",
      hint: "Профил става публичен, когато е активен (платен/поканен) и достатъчно попълнен."
    },
    featured: {
      title: "Няма подбрани профили за началната страница.",
      hint: "Използвай бутона за подбиране на публичен профил, за да го покажеш в началната секция."
    },
    restricted: {
      title: "Няма ограничени акаунти.",
      hint: "Ограничените акаунти са скрити от каталога и не могат да влизат в системата."
    }
  };

  const pendingInvites = invites.filter((invite) => invite.status === "pending");

  return (
    <PageScene tone="dashboard" pageKey="admin">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">Админ</p>
            <h1>Управление на GrowPoint</h1>
            <p className="hero__lede">
              Кани нови експерти, следи активните профили и ограничавай акаунти при
              нужда. Одобрение вече не е необходимо — експертните профили са платени
              (или с покана).
            </p>
          </div>
        </div>
      </section>

      <MonitoringDashboardPage embedded />

      <section className="section section--tight">
        <div className="container">
          <article className="panel admin-invite-panel">
            <div className="dashboard-form-head">
              <p className="eyebrow">Покани</p>
              <h2>Покани експерт безплатно</h2>
            </div>
            <p className="form-note">
              Изпрати покана по имейл. Поканеният създава безплатен експертен профил
              (без плащане), валидна 30 дни. Иначе експертните профили изискват
              платен план (онлайн плащането предстои).
            </p>
            <form className="admin-invite-form" onSubmit={sendInvite}>
              <input
                type="email"
                value={inviteEmail}
                placeholder="имейл на експерта"
                onChange={(event) => setInviteEmail(event.target.value)}
                disabled={inviteBusy}
                aria-label="Имейл за покана"
              />
              <button className="primary-button" type="submit" disabled={inviteBusy || !inviteEmail.trim()}>
                {inviteBusy ? "Изпращаме..." : "Изпрати покана"}
              </button>
            </form>
            {invites.length ? (
              <ul className="admin-invite-list">
                {invites.slice(0, 12).map((invite) => (
                  <li key={invite.email}>
                    <span className="admin-invite-list__email">{invite.email}</span>
                    <span
                      className={`status-badge ${invite.status === "redeemed" ? "status-badge--success" : "plan-pill"}`}
                    >
                      {invite.status === "redeemed" ? "Активирана" : "Чака активиране"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="form-note">Все още няма изпратени покани.</p>
            )}
          </article>

          <article className="panel admin-invite-panel">
            <div className="dashboard-form-head">
              <p className="eyebrow">Плащания</p>
              <h2>Чакащи плащане</h2>
            </div>
            <p className="form-note">
              До интеграцията на онлайн плащането можеш ръчно да маркираш платена резервация —
              това отключва линка за срещата за потребителя.
            </p>
            {awaitingPayment.length ? (
              <ul className="admin-invite-list">
                {awaitingPayment.map((booking) => (
                  <li key={booking.bookingId}>
                    <span className="admin-invite-list__email">
                      {booking.clientName || booking.clientEmail || "Потребител"} →{" "}
                      {booking.consultantName}
                      {booking.hasMeetingLink ? " · линк готов" : " · без линк"}
                    </span>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={paidActionId === booking.bookingId}
                      onClick={() => markBookingPaid(booking)}
                    >
                      {paidActionId === booking.bookingId
                        ? "Записваме..."
                        : "Маркирай като платена"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="form-note">Няма потвърдени резервации, чакащи плащане.</p>
            )}
          </article>

          <dl className="admin-stats">
            <div>
              <dt>Всички</dt>
              <dd>{counts.all}</dd>
            </div>
            <div>
              <dt>Публични</dt>
              <dd>{counts.public}</dd>
            </div>
            <div>
              <dt>Подбрани</dt>
              <dd>{counts.featured}</dd>
            </div>
            <div>
              <dt>Ограничени</dt>
              <dd>{counts.restricted}</dd>
            </div>
            <div>
              <dt>Покани (чакащи)</dt>
              <dd>{pendingInvites.length}</dd>
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
                const isApproved = item.isPublic && !item.restricted;
                const restrictBusy = restrictActionId === item.consultantId;
                const featuredBusy = featuredActionId === item.consultantId;
                const isOwnProfile = item.ownerUserId === user.id;
                const isExpanded = expandedId === item.consultantId;

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
                            {item.restricted ? (
                              <span className="status-badge status-badge--cancelled">
                                Ограничен
                              </span>
                            ) : item.comped ? (
                              <span className="status-badge admin-card__self-badge">
                                Поканен (безплатно)
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
                      <span className={membershipBadgeClass(item)}>
                        {membershipLabel(item)}
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
                      <div>
                        <dt>Пакет</dt>
                        <dd>
                          {PACKAGE_TIER_LABELS[item.packageTier || "start"]}
                          {item.packageSource === "granted" ? " (предоставен)" : ""}
                        </dd>
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

                    <div className="admin-card__actions">
                      <label className="admin-card__package-control">
                        Видимост {typeof item.profileCompletion === "number" ? `· ${item.profileCompletion}% попълнен` : ""}
                        <select
                          aria-label={`Видимост на ${item.name}`}
                          value={item.visibilityMode || "auto"}
                          disabled={visibilityActionId === item.consultantId}
                          onChange={event => void setVisibility(item, event.target.value as "auto" | "shown" | "hidden")}
                        >
                          <option value="auto">Автоматично при 100%</option>
                          <option value="shown" disabled={!isActiveMember(item) || item.restricted}>Показан</option>
                          <option value="hidden">Скрит</option>
                        </select>
                      </label>
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
                        disabled={featuredBusy || (!item.featured && (!item.isPublic || item.restricted))}
                        title={
                          !item.featured && (!item.isPublic || item.restricted)
                            ? "Профилът трябва да е публичен и неограничен."
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
                      <label className="admin-card__package-control">
                        Пакет
                        <select
                          value={item.packageTier || "start"}
                          disabled={packageActionId === item.consultantId}
                          onChange={(event) =>
                            setPackage(item, event.target.value as ConsultantPackageTier)
                          }
                        >
                          {(Object.keys(PACKAGE_TIER_LABELS) as ConsultantPackageTier[]).map(
                            (tier) => (
                              <option key={tier} value={tier}>
                                {PACKAGE_TIER_LABELS[tier]}
                              </option>
                            )
                          )}
                        </select>
                      </label>
                      {item.ownerUserId && !isOwnProfile ? (
                        <button
                          className={`ghost-button ${item.restricted ? "" : "admin-card__danger-action"}`}
                          type="button"
                          disabled={restrictBusy}
                          onClick={() => setRestricted(item, !item.restricted)}
                        >
                          {restrictBusy
                            ? "Записваме..."
                            : item.restricted
                              ? "Възстанови достъпа"
                              : "Ограничи акаунта"}
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
