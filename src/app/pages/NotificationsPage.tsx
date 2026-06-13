import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatRelativeBg } from "../../lib/datetime";
import { NOTIFICATION_ICONS, getNotificationCategory } from "../../lib/notifications";
import type { NotificationItem } from "../../lib/types";
import NotificationDetailModal, {
  NOTIFICATION_CATEGORY_LABELS as CATEGORY_LABELS
} from "../components/NotificationDetailModal";
import PageScene from "../layout/PageScene";

// Keep in sync with AppShell's NOTIFICATIONS_MARKED_READ_EVENT so the header
// badge clears when notifications are marked read from this page.
const NOTIFICATIONS_MARKED_READ_EVENT = "growpoint:notifications-marked-read";

export default function NotificationsPage() {
  const { user, token, isAdmin } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<NotificationItem | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await api.listMyNotifications(token);
      setItems(result.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markAllRead() {
    if (!token || isAdmin || busy) return;
    setBusy(true);
    try {
      await api.markMyNotificationsRead(token);
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt }))
      );
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_MARKED_READ_EVENT, { detail: { readAt } })
      );
    } finally {
      setBusy(false);
    }
  }

  // Opening a notification marks just that one as read (like an inbox).
  function openNotification(item: NotificationItem) {
    setSelected(item);
    if (!token || isAdmin || item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((current) =>
      current.map((n) => (n.id === item.id ? { ...n, readAt } : n))
    );
    window.dispatchEvent(
      new CustomEvent(NOTIFICATIONS_MARKED_READ_EVENT, {
        detail: { readAt, notificationId: item.id }
      })
    );
    void api.markMyNotificationsRead(token, item.id).catch(() => {});
  }

  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unreadCount = sorted.filter((n) => !n.readAt).length;

  return (
    <PageScene tone="dashboard" pageKey="notifications">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">Известия</p>
            <h1>Център за известия.</h1>
            <p className="hero__lede">
              Всички резервации, съобщения, отзиви и административни известия на едно
              място.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container inbox-layout">
          {!user ? (
            <div className="panel">
              <h2>Влез в профила си</h2>
              <p className="form-note">
                Известията са достъпни само за вписани потребители.
              </p>
              <Link className="primary-button" to="/auth">
                Вход / Регистрация
              </Link>
            </div>
          ) : (
            <section className="panel notifications-panel">
              <header className="notifications-panel__head">
                <div>
                  <p className="eyebrow">Списък</p>
                  <h2>
                    Известия{" "}
                    {unreadCount ? (
                      <span className="notifications-panel__badge">{unreadCount}</span>
                    ) : null}
                  </h2>
                </div>
                {unreadCount ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void markAllRead()}
                    disabled={busy}
                  >
                    {busy ? "Маркираме..." : "Маркирай всички като прочетени"}
                  </button>
                ) : null}
              </header>

              {loading ? (
                <p className="form-note">Зареждаме известията...</p>
              ) : sorted.length ? (
                <ul className="notifications-list" aria-label="Списък с известия">
                  {sorted.map((n) => {
                    const category = getNotificationCategory(n.type);
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          className={`notifications-item notifications-item--button notifications-item--${category} ${n.readAt ? "" : "notifications-item--unread"}`}
                          onClick={() => openNotification(n)}
                        >
                          <span className="notifications-item__icon" aria-hidden="true">
                            {NOTIFICATION_ICONS[n.type] || "🔔"}
                          </span>
                          <div className="notifications-item__body">
                            <strong>{n.title}</strong>
                            <p>{n.body}</p>
                            <span className="form-note">
                              <span className="notifications-item__tag">
                                {CATEGORY_LABELS[category]}
                              </span>
                              {formatRelativeBg(n.createdAt)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="form-note">
                  Все още няма известия. Нови резервации, съобщения и админ съобщения
                  ще се показват тук.
                </p>
              )}
            </section>
          )}
        </div>
      </section>

      {selected ? (
        <NotificationDetailModal
          notification={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </PageScene>
  );
}
