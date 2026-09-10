import { useEffect, useRef } from "react";
import { api } from "./api";
import { startMessageRefresh } from "./live-messages";
import type { Booking, BookingMessage } from "./types";

export function useLiveBookingMessages(
  token: string | null,
  bookingId: string | null,
  onMessages: (items: BookingMessage[], status?: Booking["status"]) => void,
  onError: (message: string) => void,
  live = true
) {
  const callbacks = useRef({ onMessages, onError, bookingId, token });
  callbacks.current = { onMessages, onError, bookingId, token };
  useEffect(() => {
    if (!token || !bookingId) return;
    let disposed = false;
    let loaded = false;
    const refresh = startMessageRefresh({
      visible: () => !document.hidden && (live || !loaded),
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: id => window.clearTimeout(id),
      read: async () => {
        try {
          const result = await api.listBookingMessages(token, bookingId);
          loaded = true;
          if (!disposed && callbacks.current.bookingId === bookingId && callbacks.current.token === token) callbacks.current.onMessages(result.items || [], result.status);
        } catch (error) {
          if (!disposed && callbacks.current.bookingId === bookingId && callbacks.current.token === token) callbacks.current.onError("Съобщенията не могат да се обновят. Ще опитаме отново.");
          throw error;
        }
      }
    });
    const wake = () => { void refresh.wake(); };
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      disposed = true;
      refresh.stop();
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [token, bookingId, live]);
}
