import { useEffect, useRef } from "react";
import { api } from "./api";
import { startMessageRefresh } from "./live-messages";
import type { BookingMessage } from "./types";

export function useLiveBookingMessages(
  token: string | null,
  bookingId: string | null,
  onMessages: (items: BookingMessage[]) => void,
  onError: (message: string) => void
) {
  const callbacks = useRef({ onMessages, onError });
  callbacks.current = { onMessages, onError };
  useEffect(() => {
    if (!token || !bookingId) return;
    let disposed = false;
    const refresh = startMessageRefresh({
      visible: () => !document.hidden,
      schedule: (callback, delay) => window.setTimeout(callback, delay),
      cancel: id => window.clearTimeout(id),
      read: async () => {
        try {
          const result = await api.listBookingMessages(token, bookingId);
          if (!disposed) callbacks.current.onMessages(result.items || []);
        } catch (error) {
          if (!disposed) callbacks.current.onError("Съобщенията не могат да се обновят. Ще опитаме отново.");
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
  }, [token, bookingId]);
}
