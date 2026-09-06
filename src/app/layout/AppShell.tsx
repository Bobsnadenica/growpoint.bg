import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  clearPendingBootstrap,
  clearSocialAuthIntent,
  markSocialOnboardingPending,
  readPendingBootstrap,
  readSocialAuthIntent
} from "../../lib/auth-flow";
import { config } from "../../lib/config";
import { getNotificationCategory } from "../../lib/notifications";
import { applyRouteSeo } from "../../lib/seo";
import type { NotificationItem } from "../../lib/types";
import NotificationDetailModal from "../components/NotificationDetailModal";
import AboutPage from "../pages/AboutPage";
import AccountPage from "../pages/AccountPage";
import AuthPage from "../pages/AuthPage";
import ConsultantProfilePage from "../pages/ConsultantProfilePage";
import ContactPage from "../pages/ContactPage";
import FaqPage from "../pages/FaqPage";
import FilesPage from "../pages/FilesPage";
import HomePage from "../pages/HomePage";
import LegalPage from "../pages/LegalPage";
import MemberProfilePage from "../pages/MemberProfilePage";
import MessagesPage from "../pages/MessagesPage";
import NotificationsPage from "../pages/NotificationsPage";
import PrivacyPage from "../pages/PrivacyPage";
import TermsPage from "../pages/TermsPage";
import NotFoundPage from "../pages/NotFoundPage";
import ProfilePage from "../pages/ProfilePage";
import UsersPage from "../pages/UsersPage";

const AdminPage = lazy(() => import("../pages/AdminPage"));
const AdminConsultantPreviewPage = lazy(() => import("../pages/AdminConsultantPreviewPage"));

const primaryNavigation = [
  { to: "/", label: "Начало" },
  { to: "/users", label: "За хората, които търсят" }
] as const;

const footerLinks = [
  { to: "/about", label: "За нас" },
  { to: "/faq", label: "FAQ" },
  { to: "/contact", label: "Контакти" },
  { to: "/terms", label: "Условия за ползване" },
  { to: "/privacy", label: "Политика за поверителност" }
] as const;

type ThemePreference = "light" | "dark";

const THEME_STORAGE_KEY = "growpoint.theme";
const NOTIFICATIONS_MARKED_READ_EVENT = "growpoint:notifications-marked-read";

function readInitialTheme(): ThemePreference {
  if (typeof window === "undefined") return "light";

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Storage may be unavailable.
  }

  return "light";
}

function ThemeToggleArtwork({ theme }: { theme: ThemePreference }) {
  return (
    <span className="theme-toggle__track" aria-hidden="true">
      <span className="theme-toggle__sky theme-toggle__sky--sun">
        <svg viewBox="0 0 24 24" focusable="false">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 3.3v2.4M12 18.3v2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M3.3 12h2.4M18.3 12h2.4M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7" />
        </svg>
      </span>
      <span className="theme-toggle__sky theme-toggle__sky--moon">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M18.1 15.5A7.6 7.6 0 0 1 8.5 5.9 7.6 7.6 0 1 0 18.1 15.5Z" />
        </svg>
      </span>
      <span className="theme-toggle__thumb">
        {theme === "dark" ? (
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M18.1 15.5A7.6 7.6 0 0 1 8.5 5.9 7.6 7.6 0 1 0 18.1 15.5Z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="4.1" />
            <path d="M12 3.2v2.1M12 18.7v2.1M5.8 5.8l1.5 1.5M16.7 16.7l1.5 1.5M3.2 12h2.1M18.7 12h2.1M5.8 18.2l1.5-1.5M16.7 7.3l1.5-1.5" />
          </svg>
        )}
      </span>
    </span>
  );
}

function HeaderIcon({ type }: { type: "notifications" | "messages" | "files" }) {
  if (type === "messages") {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4.5 6.5h15v11h-15z" />
        <path d="m5.2 7.1 6.8 5.6 6.8-5.6" />
      </svg>
    );
  }

  if (type === "files") {
    return (
      <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d="M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18V9.5A1.5 1.5 0 0 0 18.5 8H12l-2-2.5H5.5A1.5 1.5 0 0 0 4 7Z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path d="M18 9.8a6 6 0 0 0-12 0c0 4-1.8 5.2-2.3 5.8h16.6C19.8 15 18 13.8 18 9.8Z" />
      <path d="M9.5 18.2a2.7 2.7 0 0 0 5 0" />
    </svg>
  );
}

type HeaderPanel = "notifications" | "messages";

function notificationHref(item: NotificationItem) {
  if (item.href) return item.href;
  return item.type === "message_received" ? "/messages" : "/notifications";
}

function formatHeaderNotificationTime(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "току-що";
  if (diffSec < 3600) return `преди ${Math.round(diffSec / 60)} мин`;
  if (diffSec < 86400) return `преди ${Math.round(diffSec / 3600)} ч`;
  if (diffSec < 7 * 86400) return `преди ${Math.round(diffSec / 86400)} дни`;
  return new Intl.DateTimeFormat("bg-BG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function HeaderNotificationPopover({
  activePanel,
  items,
  unreadCount,
  busy,
  onClose,
  onMarkAllRead,
  onSelectNotification
}: {
  activePanel: HeaderPanel;
  items: NotificationItem[];
  unreadCount: number;
  busy: boolean;
  onClose: () => void;
  onMarkAllRead: () => void | Promise<void>;
  onSelectNotification: (item: NotificationItem) => void;
}) {
  const isMessages = activePanel === "messages";
  const title = isMessages ? "Съобщения" : "Известия";
  const fullHref = isMessages ? "/messages" : "/notifications";
  const visibleItems = items.slice(0, 8);

  return (
    <section
      id="topbar-notification-popover"
      className="topbar-popover"
      role="dialog"
      aria-label={title}
    >
      <header className="topbar-popover__header">
        <div>
          <span className="topbar-popover__eyebrow">{title}</span>
          <strong>
            {unreadCount ? `${unreadCount} непрочетени` : "Няма непрочетени"}
          </strong>
        </div>
        <button
          type="button"
          className="topbar-popover__close"
          onClick={onClose}
          aria-label="Затвори"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      {visibleItems.length ? (
        <ul className="topbar-popover__list" aria-label={`${title} в горната лента`}>
          {visibleItems.map((item) => {
            const itemClass = `topbar-popover__item topbar-popover__item--${getNotificationCategory(item.type)} ${item.readAt ? "" : "topbar-popover__item--unread"}`;
            const copy = (
              <>
                <span className="topbar-popover__dot" aria-hidden="true" />
                <span className="topbar-popover__copy">
                  <strong>{item.title}</strong>
                  <span>{item.body}</span>
                  <time dateTime={item.createdAt}>
                    {formatHeaderNotificationTime(item.createdAt)}
                  </time>
                </span>
              </>
            );
            return (
              <li key={item.id}>
                {isMessages ? (
                  // Messages point to the conversation thread.
                  <Link className={itemClass} to={notificationHref(item)} onClick={onClose}>
                    {copy}
                  </Link>
                ) : (
                  // Notifications open the full-text popup, same as /notifications.
                  <button
                    type="button"
                    className={`${itemClass} topbar-popover__item--button`}
                    onClick={() => onSelectNotification(item)}
                  >
                    {copy}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="topbar-popover__empty">
          {isMessages
            ? "Няма нови съобщения. След потвърдена среща разговорите ще се появяват тук."
            : "Няма нови известия. Резервации, админ съобщения и отзиви ще се появяват тук."}
        </p>
      )}

      <footer className="topbar-popover__footer">
        <Link className="topbar-popover__link" to={fullHref} onClick={onClose}>
          Виж всички
        </Link>
        {unreadCount ? (
          <button
            type="button"
            className="topbar-popover__mark-read"
            onClick={() => onMarkAllRead()}
            disabled={busy}
          >
            {busy ? "Маркираме..." : "Маркирай прочетени"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}

function RouteExperience() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!location.hash.startsWith("#/")) return;
    navigate(location.hash.slice(1), { replace: true });
  }, [location.hash, navigate]);

  useEffect(() => {
    applyRouteSeo(location.pathname);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  return null;
}

export default function AppShell() {
  const { user, token, loading, logout, isAdmin } = useAuth();
  const [savedIdentity, setSavedIdentity] = useState<{ token: string; name: string } | null>(null);
  const displayName = savedIdentity?.token === token && savedIdentity.name ? savedIdentity.name : user?.name;
  useEffect(() => {
    setSavedIdentity(null);
    if (!token) return;
    let active = true;
    let edited = false;
    const updated = (event: Event) => {
      const detail = (event as CustomEvent<{ token: string; name: string }>).detail;
      if (detail?.token !== token) return;
      edited = true;
      setSavedIdentity({ token, name: detail.name });
    };
    window.addEventListener("growpoint:profile-name", updated);
    // One read per session, no polling; never let an older read overwrite a save.
    void api.getMyProfile(token).then(profile => {
      if (active && !edited) setSavedIdentity({ token, name: profile.name });
    }).catch(() => { /* Keep the authentication fallback if no profile exists yet. */ });
    return () => { active = false; window.removeEventListener("growpoint:profile-name", updated); };
  }, [token]);
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState<ThemePreference>(readInitialTheme);
  const [isThemeSwitching, setIsThemeSwitching] = useState(false);
  const [headerNotifications, setHeaderNotifications] = useState<NotificationItem[]>([]);
  const [activeHeaderPanel, setActiveHeaderPanel] = useState<HeaderPanel | null>(null);
  const [headerNotificationsBusy, setHeaderNotificationsBusy] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationItem | null>(null);
  const topbarPanelRef = useRef<HTMLDivElement | null>(null);
  const themeSwitchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage may be disabled.
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (themeSwitchTimerRef.current) {
        window.clearTimeout(themeSwitchTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
    setActiveHeaderPanel(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    mobileMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
      if (event.key === "Tab") {
        const elements = Array.from(mobileMenuRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') || []);
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && (document.activeElement === first || !mobileMenuRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !mobileMenuRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isMenuOpen]);

  useEffect(() => {
    setIsRouteTransitioning(true);

    const timeout = window.setTimeout(() => {
      setIsRouteTransitioning(false);
    }, 540);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [location.pathname]);

  useEffect(() => {
    // First-party page-view beacon: count one visit per browser session per day.
    if (!import.meta.env.PROD || window.location.pathname.startsWith("/admin")) return;
    try {
      const key = `growpoint.visit.${new Date().toISOString().slice(0, 10)}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage unavailable — fall through and still record the visit
    }
    api.recordVisit();
  }, []);

  useEffect(() => {
    if (loading || !user || !token) {
      return;
    }

    const socialIntent = readSocialAuthIntent();

    if (!socialIntent) {
      return;
    }

    // Captured as non-null locals so the narrowing survives into the nested
    // async closure below (TS won't re-narrow the captured hook value there).
    const authedUser = user;
    const intent = socialIntent;

    let cancelled = false;
    let completed = false;

    async function finishSocialSignIn() {
      try {
        const pendingBootstrap = readPendingBootstrap();
        let profileExists = true;

        try {
          await api.getMyProfile(token);
        } catch (value) {
          const message = value instanceof Error ? value.message : "";

          if (message.includes("Profile not found")) {
            profileExists = false;
          } else {
            throw value;
          }
        }

        // Only create + flag onboarding for genuinely new social accounts;
        // returning users skip straight to their dashboard.
        if (!profileExists) {
          await api.bootstrapUser(token, {
            role: "client",
            plan: "free",
            ...(pendingBootstrap || {}),
            name: pendingBootstrap?.name?.trim() || authedUser.name || authedUser.email,
            email: pendingBootstrap?.email?.trim() || authedUser.email,
            avatarUrl: authedUser.avatarUrl || pendingBootstrap?.avatarUrl || ""
          });
          markSocialOnboardingPending();
        }

        clearPendingBootstrap();

        if (!cancelled) {
          completed = true;
          navigate(intent.redirect || "/dashboard", { replace: true });
        }
      } catch {
        if (!cancelled) {
          const authParams = new URLSearchParams();
          authParams.set("tab", "register");
          authParams.set("social", "1");
          authParams.set("redirect", intent.redirect || "/dashboard");
          navigate(`/auth?${authParams.toString()}`, { replace: true });
        }
      } finally {
        clearSocialAuthIntent();

        if (completed) {
          clearPendingBootstrap();
        }
      }
    }

    void finishSocialSignIn();

    return () => {
      cancelled = true;
    };
  }, [loading, location.key, navigate, token, user]);

  useEffect(() => {
    if (loading || !user || !token) {
      setHeaderNotifications([]);
      return;
    }

    let cancelled = false;
    let intervalId = 0;

    async function loadHeaderNotifications() {
      if (document.hidden) return;
      try {
        const result = await api.listMyNotifications(token);
        if (!cancelled) {
          setHeaderNotifications(result.items || []);
        }
      } catch {
        if (!cancelled) {
          setHeaderNotifications([]);
        }
      }
    }

    void loadHeaderNotifications();
    intervalId = window.setInterval(loadHeaderNotifications, 60_000);
    window.addEventListener("focus", loadHeaderNotifications);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", loadHeaderNotifications);
    };
  }, [isAdmin, loading, location.pathname, token, user]);

  useEffect(() => {
    function handleNotificationsMarkedRead(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      const readAt =
        typeof detail?.readAt === "string" ? detail.readAt : new Date().toISOString();
      // A notificationId in the event marks just that one (single-read from the
      // /notifications page); without it, everything is marked read.
      const onlyId =
        typeof detail?.notificationId === "string" ? detail.notificationId : null;
      setHeaderNotifications((items) =>
        items.map((item) =>
          item.readAt || (onlyId && item.id !== onlyId) ? item : { ...item, readAt }
        )
      );
    }

    window.addEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleNotificationsMarkedRead);

    return () => {
      window.removeEventListener(NOTIFICATIONS_MARKED_READ_EVENT, handleNotificationsMarkedRead);
    };
  }, []);

  useEffect(() => {
    if (!activeHeaderPanel) return;

    function handlePointer(event: MouseEvent) {
      if (
        topbarPanelRef.current &&
        event.target instanceof Node &&
        !topbarPanelRef.current.contains(event.target)
      ) {
        setActiveHeaderPanel(null);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveHeaderPanel(null);
      }
    }

    document.addEventListener("mousedown", handlePointer);
    window.addEventListener("keydown", handleKey);

    return () => {
      document.removeEventListener("mousedown", handlePointer);
      window.removeEventListener("keydown", handleKey);
    };
  }, [activeHeaderPanel]);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await new Promise((resolve) => window.setTimeout(resolve, 180));
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  }

  const nextThemeLabel = theme === "dark" ? "светла" : "тъмна";
  const currentThemeLabel = theme === "dark" ? "Тъмна" : "Светла";
  const unreadNotifications = headerNotifications.filter((item) => !item.readAt).length;
  const unreadMessages = headerNotifications.filter(
    (item) => !item.readAt && item.type === "message_received"
  ).length;
  const sortedHeaderNotifications = [...headerNotifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const sortedHeaderMessages = sortedHeaderNotifications.filter(
    (item) => item.type === "message_received"
  );
  const activeHeaderItems =
    activeHeaderPanel === "messages" ? sortedHeaderMessages : sortedHeaderNotifications;
  const activeUnreadCount = activeHeaderItems.filter((item) => !item.readAt).length;

  function toggleTheme() {
    setIsThemeSwitching(true);

    if (themeSwitchTimerRef.current) {
      window.clearTimeout(themeSwitchTimerRef.current);
    }

    themeSwitchTimerRef.current = window.setTimeout(() => {
      setIsThemeSwitching(false);
      themeSwitchTimerRef.current = null;
    }, 560);

    setTheme((value) => (value === "dark" ? "light" : "dark"));
  }

  // Open a notification from the header popover in the same detail popup the
  // /notifications page uses, and mark just that one read.
  function openHeaderNotification(item: NotificationItem) {
    setActiveHeaderPanel(null);
    setSelectedNotification(item);
    if (!token || !user || isAdmin || item.readAt) {
      return;
    }
    const readAt = new Date().toISOString();
    setHeaderNotifications((items) =>
      items.map((n) => (n.id === item.id ? { ...n, readAt } : n))
    );
    window.dispatchEvent(
      new CustomEvent(NOTIFICATIONS_MARKED_READ_EVENT, {
        detail: { readAt, notificationId: item.id }
      })
    );
    void api.markMyNotificationsRead(token, item.id).catch(() => {});
  }

  async function markHeaderNotificationsRead() {
    if (!token || !user || isAdmin || headerNotificationsBusy) {
      return;
    }

    setHeaderNotificationsBusy(true);

    try {
      await api.markMyNotificationsRead(token);
      const readAt = new Date().toISOString();
      setHeaderNotifications((items) =>
        items.map((item) => (item.readAt ? item : { ...item, readAt }))
      );
      window.dispatchEvent(
        new CustomEvent(NOTIFICATIONS_MARKED_READ_EVENT, { detail: { readAt } })
      );
    } finally {
      setHeaderNotificationsBusy(false);
    }
  }

  return (
    <div
      className={[
        "site-shell",
        isLoggingOut ? "site-shell--signing-out" : "",
        isThemeSwitching ? "site-shell--theme-switching" : ""
      ].filter(Boolean).join(" ")}
    >
      <RouteExperience />
      <a className="skip-link" href="#main-content">
        Към съдържанието
      </a>
      <header className="site-header">
        <div
          className={`route-transition ${isRouteTransitioning ? "route-transition--active" : ""}`}
          aria-hidden="true"
        />
        <div className="container site-header__inner">
          <Link className="brand-link" to="/" aria-label={config.appName}>
            <img
              className="brand-logo brand-logo--light"
              src="/assets/logo/logo_dark.png"
              alt={config.appName}
              width={172}
              height={40}
            />
            <img
              className="brand-logo brand-logo--dark"
              src="/assets/logo/logo_white.png"
              alt=""
              aria-hidden="true"
              width={172}
              height={40}
            />
          </Link>

          <nav className="site-nav" aria-label="Основна навигация">
            {primaryNavigation.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="site-header__actions">
            {user ? (
              <>
                {isAdmin ? (
                  <Link
                    className="ghost-button user-chip"
                    to="/admin"
                    aria-label="Отвори админ панела"
                  >
                    Админ панел
                  </Link>
                ) : (
                  <Link
                    className="ghost-button user-chip"
                    to="/dashboard"
                    aria-label={`Отвори профила на ${displayName}`}
                  >
                    {displayName}
                  </Link>
                )}
                {!isAdmin ? (
                  <div className="topbar-alert-group" ref={topbarPanelRef}>
                    <button
                      className="topbar-alert"
                      type="button"
                      aria-label={
                        unreadNotifications
                          ? `${unreadNotifications} непрочетени известия`
                          : "Известия"
                      }
                      aria-haspopup="dialog"
                      aria-expanded={activeHeaderPanel === "notifications"}
                      aria-controls="topbar-notification-popover"
                      title="Известия"
                      onClick={() =>
                        setActiveHeaderPanel((panel) =>
                          panel === "notifications" ? null : "notifications"
                        )
                      }
                    >
                      <HeaderIcon type="notifications" />
                      {unreadNotifications ? (
                        <span className="topbar-alert__badge">{unreadNotifications}</span>
                      ) : null}
                    </button>
                    <button
                      className="topbar-alert"
                      type="button"
                      aria-label={
                        unreadMessages
                          ? `${unreadMessages} непрочетени съобщения`
                          : "Съобщения"
                      }
                      aria-haspopup="dialog"
                      aria-expanded={activeHeaderPanel === "messages"}
                      aria-controls="topbar-notification-popover"
                      title="Съобщения"
                      onClick={() =>
                        setActiveHeaderPanel((panel) =>
                          panel === "messages" ? null : "messages"
                        )
                      }
                    >
                      <HeaderIcon type="messages" />
                      {unreadMessages ? (
                        <span className="topbar-alert__badge">{unreadMessages}</span>
                      ) : null}
                    </button>
                    <Link
                      className="topbar-alert"
                      to="/files"
                      aria-label="Моите файлове"
                      title="Моите файлове"
                      onClick={() => setActiveHeaderPanel(null)}
                    >
                      <HeaderIcon type="files" />
                    </Link>
                    {activeHeaderPanel ? (
                      <HeaderNotificationPopover
                        activePanel={activeHeaderPanel}
                        items={activeHeaderItems}
                        unreadCount={activeUnreadCount}
                        busy={headerNotificationsBusy}
                        onClose={() => setActiveHeaderPanel(null)}
                        onMarkAllRead={markHeaderNotificationsRead}
                        onSelectNotification={openHeaderNotification}
                      />
                    ) : null}
                  </div>
                ) : null}
                <button
                  className="ghost-button"
                  type="button"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                >
                  {isLoggingOut ? "Излизаме..." : "Изход"}
                </button>
              </>
            ) : (
              <Link className="ghost-button" to="/auth" aria-label="Вход и регистрация">
                <span className="auth-label auth-label--full" aria-hidden="true">Вход / Регистрация</span>
                <span className="auth-label auth-label--short" aria-hidden="true">Вход</span>
              </Link>
            )}
            <button
              className={`theme-toggle theme-toggle--${theme}`}
              type="button"
              aria-label={`Включи ${nextThemeLabel} тема`}
              title={`Включи ${nextThemeLabel} тема`}
              onClick={toggleTheme}
            >
              <ThemeToggleArtwork theme={theme} />
              <span className="visually-hidden">Текуща тема: {currentThemeLabel}</span>
            </button>
          </div>

          <button
            type="button"
            className={`menu-toggle ${isMenuOpen ? "menu-toggle--open" : ""}`}
            aria-label={isMenuOpen ? "Затвори менюто" : "Отвори менюто"}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            onClick={() => setIsMenuOpen((value) => !value)}
          >
            <span aria-hidden="true" />
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </button>
        </div>
      </header>

      {isMenuOpen ? createPortal(
        <>
          <div
            className="mobile-menu__backdrop"
            aria-hidden="true"
            onClick={() => setIsMenuOpen(false)}
          />
          <nav
            id="mobile-menu"
            ref={mobileMenuRef}
            className="mobile-menu"
            aria-label="Мобилно меню"
          >
            <button type="button" className="ghost-button mobile-menu__close" onClick={() => setIsMenuOpen(false)} aria-label="Затвори мобилното меню">Затвори ×</button>
            <div className="mobile-menu__group">
              <span className="mobile-menu__label">Навигация</span>
              {primaryNavigation.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="mobile-menu__link"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
            <div className="mobile-menu__group">
              <span className="mobile-menu__label">Изглед</span>
              <button
                type="button"
                className="mobile-menu__link mobile-menu__link--button"
                onClick={toggleTheme}
              >
                <span className={`theme-toggle theme-toggle--mobile theme-toggle--${theme}`} aria-hidden="true">
                  <ThemeToggleArtwork theme={theme} />
                </span>
                Включи {nextThemeLabel} тема
              </button>
            </div>
            <div className="mobile-menu__group">
              <span className="mobile-menu__label">Профил</span>
              {user ? (
                <>
                  <span className="mobile-menu__user">{displayName}</span>
                  {isAdmin ? (
                    <Link
                      to="/admin"
                      className="mobile-menu__link"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Админ панел
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard"
                      className="mobile-menu__link"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Моят профил
                    </Link>
                  )}
                  {!isAdmin ? (
                    <>
                      <Link
                        to="/notifications"
                        className="mobile-menu__link"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Известия{unreadNotifications ? ` (${unreadNotifications})` : ""}
                      </Link>
                      <Link
                        to="/messages"
                        className="mobile-menu__link"
                        onClick={() => setIsMenuOpen(false)}
                      >
                        Съобщения{unreadMessages ? ` (${unreadMessages})` : ""}
                      </Link>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="mobile-menu__link mobile-menu__link--button"
                    disabled={isLoggingOut}
                    onClick={() => {
                      setIsMenuOpen(false);
                      void handleLogout();
                    }}
                  >
                    {isLoggingOut ? "Излизаме..." : "Изход"}
                  </button>
                </>
              ) : (
                <Link
                  to="/auth"
                  className="mobile-menu__link"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Вход / Регистрация
                </Link>
              )}
            </div>
          </nav>
        </>, document.body
      ) : null}

      <main id="main-content" className="page-main">
        <Suspense fallback={<div className="container panel" role="status">Зареждане…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/examples/:id" element={<Navigate to="/users" replace />} />
          <Route path="/users" element={<UsersPage />} />
          {/* Legacy /consultants catalog merged into /users — keep the path
             as a redirect for any bookmarks or external links. */}
          <Route path="/consultants" element={<Navigate to="/users" replace />} />
          <Route path="/consultants/:slug" element={<ConsultantProfilePage />} />
          <Route path="/u/:id" element={<MemberProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/legal" element={<Navigate to="/terms" replace />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/dashboard" element={<ProfilePage />} />
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/files" element={<FilesPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/dashboard" element={<Navigate to="/admin" replace />} />
          <Route
            path="/admin/preview/:consultantId"
            element={<AdminConsultantPreviewPage />}
          />
          <Route path="/pricing" element={<Navigate to="/users" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="container footer-bottom">
          <span>
            © {currentYear} {config.appName}
          </span>
          <div className="footer-bottom__links">
            {footerLinks.map((item) => (
              <Link key={`${item.to}-${item.label}`} to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
      <CookieConsentBanner />
      {selectedNotification ? (
        <NotificationDetailModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
        />
      ) : null}
    </div>
  );
}

const COOKIE_CONSENT_KEY = "growpoint.cookieConsent";

function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(COOKIE_CONSENT_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage unavailable (e.g. private mode) — render banner anyway.
      setVisible(true);
    }
  }, []);

  const persist = (value: "accepted" | "rejected") => {
    try {
      window.localStorage.setItem(
        COOKIE_CONSENT_KEY,
        JSON.stringify({ value, at: new Date().toISOString() })
      );
    } catch {
      /* ignore */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Бисквитки">
      <div className="cookie-banner__copy">
        <strong>Използваме бисквитки</strong>
        <p>
          Запазваме само необходимото за вход и сесия. Не използваме рекламни тракери. Виж{" "}
          <Link to="/privacy">политиката за поверителност</Link> за детайли.
        </p>
      </div>
      <div className="cookie-banner__actions">
        <button
          className="ghost-button"
          type="button"
          onClick={() => persist("rejected")}
        >
          Само необходимите
        </button>
        <button
          className="primary-button"
          type="button"
          onClick={() => persist("accepted")}
        >
          Приемам
        </button>
      </div>
    </div>
  );
}
