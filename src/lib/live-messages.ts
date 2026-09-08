import type { BookingMessage } from "./types";

// Reads can finish after a send. Merge by ID so an older snapshot cannot erase
// the just-sent message or add a duplicate. The API retains the last 200.
export function mergeMessages(current: BookingMessage[], incoming: BookingMessage[]) {
  return [...new Map([...current, ...incoming].map(message => [message.id, message])).values()]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(-200);
}

export function startMessageRefresh({ read, visible, schedule, cancel }: {
  read: () => Promise<void>;
  visible: () => boolean;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (id: number) => void;
}) {
  let stopped = false;
  let running = false;
  let timer: number | undefined;
  let delay = 15000;
  const wake = async () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    if (stopped || running || !visible()) return;
    running = true;
    try { await read(); delay = 15000; }
    catch { delay = Math.min(delay * 2, 60000); }
    finally {
      running = false;
      if (!stopped && visible()) timer = schedule(() => { void wake(); }, delay);
    }
  };
  void wake();
  return { wake, stop() { stopped = true; if (timer !== undefined) cancel(timer); } };
}
