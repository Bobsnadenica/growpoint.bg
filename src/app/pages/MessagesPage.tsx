import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { formatDateTimeBg, formatRelativeBg } from "../../lib/datetime";
import type { Booking, BookingMessage, UserProfile } from "../../lib/types";
import PageScene from "../layout/PageScene";

type Conversation = {
  booking: Booking;
  counterpartName: string;
  lastMessage?: BookingMessage;
  lastActivity: number;
};

export default function MessagesPage() {
  const { user, token } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<BookingMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setBookings([]);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [profileResult, bookingsResult] = await Promise.all([
        api.getMyProfile(token).catch(() => null),
        api.listBookings(token).catch(() => [])
      ]);
      setProfile(profileResult);
      setBookings(Array.isArray(bookingsResult) ? bookingsResult : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const consultantView = profile?.role === "consultant";

  const conversations = useMemo<Conversation[]>(() => {
    return bookings
      .filter(
        (booking) =>
          booking.status === "confirmed" ||
          (Array.isArray(booking.messages) && booking.messages.length > 0)
      )
      .map((booking) => {
        const messages = Array.isArray(booking.messages) ? booking.messages : [];
        const lastMessage = messages[messages.length - 1];
        const lastActivity = Math.max(
          lastMessage ? new Date(lastMessage.createdAt).getTime() : 0,
          new Date(booking.scheduledAt).getTime() || 0
        );
        return {
          booking,
          counterpartName: consultantView
            ? booking.clientName || "Потребител"
            : booking.consultantName,
          lastMessage,
          lastActivity
        };
      })
      .sort((a, b) => b.lastActivity - a.lastActivity);
  }, [bookings, consultantView]);

  const activeConversation = conversations.find(
    (item) => item.booking.bookingId === activeId
  );

  const loadThread = useCallback(
    async (bookingId: string) => {
      if (!token) return;
      setThreadLoading(true);
      setError("");
      try {
        const result = await api.listBookingMessages(token, bookingId);
        setThread(result.items || []);
      } catch {
        setThread([]);
      } finally {
        setThreadLoading(false);
      }
    },
    [token]
  );

  function openConversation(bookingId: string) {
    setActiveId(bookingId);
    setDraft("");
    setError("");
    void loadThread(bookingId);
  }

  async function sendMessage() {
    if (!token || !activeId) return;
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const result = await api.sendBookingMessage(token, activeId, body);
      setThread((current) => [...current, result.message]);
      setDraft("");
      // Keep the conversation list in sync so the preview/order updates.
      setBookings((current) =>
        current.map((booking) =>
          booking.bookingId === activeId ? result.booking : booking
        )
      );
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Съобщението не беше изпратено. Опитай отново."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <PageScene tone="dashboard" pageKey="messages">
      <section className="hero hero--centered">
        <div className="container">
          <div className="page-intro">
            <p className="eyebrow">Съобщения</p>
            <h1>Разговори по сесиите.</h1>
            <p className="hero__lede">
              Пиши кратко и конкретно по потвърдените срещи. Всеки разговор е свързан с
              конкретна резервация.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {!user ? (
            <div className="panel">
              <h2>Влез в профила си</h2>
              <p className="form-note">
                Съобщенията са достъпни само за вписани потребители.
              </p>
              <Link className="primary-button" to="/auth">
                Вход / Регистрация
              </Link>
            </div>
          ) : loading ? (
            <div className="panel">
              <p className="form-note">Зареждаме разговорите...</p>
            </div>
          ) : conversations.length === 0 ? (
            <div className="panel">
              <h2>Все още няма разговори</h2>
              <p className="form-note">
                След като резервация бъде потвърдена, тук ще се появи разговор с
                другата страна.
              </p>
              <Link className="primary-button" to="/users">
                Разгледай консултантите
              </Link>
            </div>
          ) : (
            <div className="messages-layout">
              <aside className="messages-list panel" aria-label="Разговори">
                <ul>
                  {conversations.map((conversation) => {
                    const isActive =
                      conversation.booking.bookingId === activeId;
                    return (
                      <li key={conversation.booking.bookingId}>
                        <button
                          type="button"
                          className={`messages-list__item ${isActive ? "messages-list__item--active" : ""}`}
                          onClick={() =>
                            openConversation(conversation.booking.bookingId)
                          }
                        >
                          <strong>{conversation.counterpartName}</strong>
                          <span className="messages-list__preview">
                            {conversation.lastMessage
                              ? conversation.lastMessage.body
                              : formatDateTimeBg(conversation.booking.scheduledAt)}
                          </span>
                          {conversation.lastMessage ? (
                            <time
                              className="messages-list__time"
                              dateTime={conversation.lastMessage.createdAt}
                            >
                              {formatRelativeBg(conversation.lastMessage.createdAt)}
                            </time>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </aside>

              <section className="messages-thread panel" aria-label="Разговор">
                {!activeConversation ? (
                  <p className="form-note messages-thread__placeholder">
                    Избери разговор отляво, за да видиш съобщенията.
                  </p>
                ) : (
                  <>
                    <header className="messages-thread__head">
                      <div>
                        <strong>{activeConversation.counterpartName}</strong>
                        <p className="form-note">
                          Сесия:{" "}
                          {formatDateTimeBg(activeConversation.booking.scheduledAt)}
                        </p>
                      </div>
                      <span
                        className={`status-badge status-badge--${activeConversation.booking.status}`}
                      >
                        {activeConversation.booking.status === "confirmed"
                          ? "Потвърдена"
                          : "Архив"}
                      </span>
                    </header>

                    <div className="booking-messages__list messages-thread__list">
                      {threadLoading ? (
                        <p className="form-note">Зареждаме съобщенията...</p>
                      ) : thread.length ? (
                        [...thread]
                          .sort(
                            (left, right) =>
                              new Date(left.createdAt || 0).getTime() -
                              new Date(right.createdAt || 0).getTime()
                          )
                          .map((message) => {
                            const own = message.senderUserId === user.id;
                            return (
                              <div
                                className={`booking-message ${own ? "booking-message--own" : ""}`}
                                key={message.id}
                              >
                                <div className="booking-message__meta">
                                  <strong>{own ? "Ти" : message.senderName}</strong>
                                  <span>{formatRelativeBg(message.createdAt)}</span>
                                </div>
                                <p>{message.body}</p>
                              </div>
                            );
                          })
                      ) : (
                        <p className="form-note">
                          Все още няма съобщения. Напиши първото съобщение по тази
                          сесия.
                        </p>
                      )}
                    </div>

                    {activeConversation.booking.status === "confirmed" ? (
                      <form
                        className="booking-messages__form"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void sendMessage();
                        }}
                      >
                        <label>
                          <span className="visually-hidden">Ново съобщение</span>
                          <textarea
                            value={draft}
                            rows={3}
                            maxLength={1200}
                            placeholder="Напиши кратко съобщение..."
                            onChange={(event) => setDraft(event.target.value)}
                            disabled={sending}
                          />
                        </label>
                        {error ? (
                          <p className="form-note form-note--error">{error}</p>
                        ) : null}
                        <button
                          className="primary-button"
                          type="submit"
                          disabled={sending || !draft.trim()}
                        >
                          {sending ? "Изпращаме..." : "Изпрати"}
                        </button>
                      </form>
                    ) : (
                      <p className="form-note">
                        Този разговор е архивиран. Нови съобщения са възможни само по
                        потвърдени сесии.
                      </p>
                    )}
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </section>
    </PageScene>
  );
}
