import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { formatDateTimeBg } from "../../lib/datetime";
import {
  NOTIFICATION_ICONS,
  getNotificationCategory,
  type NotificationCategory
} from "../../lib/notifications";
import type { NotificationItem } from "../../lib/types";

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  admin: "Админ",
  message: "Съобщение",
  booking: "Резервация",
  review: "Отзив",
  system: "Система"
};

// Contextual action shown inside the popup. Legacy notification hrefs point at
// old dashboard anchors, so the list never navigates on click — it opens this
// popup, and the action here is the one explicit way forward.
export function notificationAction(
  item: NotificationItem
): { to: string; label: string } | null {
  if (item.type === "message_received") {
    return { to: "/messages", label: "Към съобщенията" };
  }
  if (getNotificationCategory(item.type) === "booking") {
    // Opens the dashboard WITH the "Предстоящи сесии" popup already open.
    return { to: "/dashboard#sessions", label: "Виж сесиите" };
  }
  return null;
}

export default function NotificationDetailModal({
  notification,
  onClose
}: {
  notification: NotificationItem;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const action = notificationAction(notification);

  return createPortal(
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Известие"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-card notification-modal">
        <header className="modal-card__head">
          <p className="eyebrow">
            {NOTIFICATION_CATEGORY_LABELS[getNotificationCategory(notification.type)]} ·{" "}
            {formatDateTimeBg(notification.createdAt)}
          </p>
          <h2>
            <span aria-hidden="true">
              {NOTIFICATION_ICONS[notification.type] || "🔔"}
            </span>{" "}
            {notification.title}
          </h2>
        </header>
        <p className="notification-modal__body">{notification.body}</p>
        <div className="modal-card__actions">
          {action ? (
            <Link className="primary-button" to={action.to} onClick={onClose}>
              {action.label}
            </Link>
          ) : null}
          <button className="ghost-button" type="button" onClick={onClose}>
            Затвори
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
