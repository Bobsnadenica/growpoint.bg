import type { NotificationItem } from "./types";

export const NOTIFICATION_ICONS: Record<NotificationItem["type"], string> = {
  booking_requested: "📨",
  booking_accepted: "✅",
  booking_declined: "↩️",
  booking_cancelled: "⛔",
  booking_rescheduled: "🔁",
  booking_reminder: "⏰",
  session_confirmed: "✓",
  message_received: "✉",
  admin_message: "!",
  review_received: "⭐"
};

export type NotificationCategory = "admin" | "message" | "booking" | "review" | "system";

/**
 * Group notification types into a small set of categories so the UI can
 * colour-code them (admin/global, a direct message, a booking event, a review,
 * or a generic system notice) instead of showing everything in one colour.
 */
export function getNotificationCategory(type: NotificationItem["type"]): NotificationCategory {
  if (type === "admin_message") return "admin";
  if (type === "message_received") return "message";
  if (type === "review_received") return "review";
  if (type === "session_confirmed" || type.startsWith("booking_")) return "booking";
  return "system";
}
