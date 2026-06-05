import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import {
  clearPendingBootstrap,
  clearSocialAuthIntent,
  readPendingBootstrap,
  readSocialAuthIntent
} from "../../lib/auth-flow";
import { config } from "../../lib/config";
import { applyRouteSeo } from "../../lib/seo";
import AboutPage from "../pages/AboutPage";
import AccountPage from "../pages/AccountPage";
import AdminConsultantPreviewPage from "../pages/AdminConsultantPreviewPage";
import AdminPage from "../pages/AdminPage";
import AuthPage from "../pages/AuthPage";
import ConsultantProfilePage from "../pages/ConsultantProfilePage";
import ContactPage from "../pages/ContactPage";
import FaqPage from "../pages/FaqPage";
import HomePage from "../pages/HomePage";
import LegalPage from "../pages/LegalPage";
import PrivacyPage from "../pages/PrivacyPage";
import TermsPage from "../pages/TermsPage";
import NotFoundPage from "../pages/NotFoundPage";
import ProfilePage from "../pages/ProfilePage";
import UsersPage from "../pages/UsersPage";

function brandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span className="brand-mark__vertical" />
      <span className="brand-mark__horizontal" />
    </span>
  );
}

const primaryNavigation = [
  { to: "/", label: "Начало" },
  { to: "/users", label: "За потребители" }
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
const BETA_NOTICE_STORAGE_KEY = "growpoint.betaNoticeDismissed";

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

function readInitialBetaNoticeVisibility() {
  if (typeof window === "undefined") return true;

  try {
    return window.localStorage.getItem(BETA_NOTICE_STORAGE_KEY) !== "true";
  } catch {
    return true;
  }
}

export default function AppShell() {
  const { user, token, loading, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRouteTransitioning, setIsRouteTransitioning] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(readInitialTheme);
  const [betaNoticeVisible, setBetaNoticeVisible] = useState(readInitialBetaNoticeVisibility);

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
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMenuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKey);
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
    if (loading || !user || !token) {
      return;
    }

    const socialIntent = readSocialAuthIntent();

    if (!socialIntent) {
      return;
    }

    let cancelled = false;
    let completed = false;

    async function finishSocialSignIn() {
      try {
        const pendingBootstrap = readPendingBootstrap();

        if (pendingBootstrap) {
          await api.bootstrapUser(token, {
            ...pendingBootstrap,
            name: pendingBootstrap.name.trim() || user.name,
            email: pendingBootstrap.email.trim() || user.email,
            avatarUrl: user.avatarUrl || pendingBootstrap.avatarUrl || ""
          });
          clearPendingBootstrap();
        } else {
          try {
            await api.getMyProfile(token);
          } catch (value) {
            const message = value instanceof Error ? value.message : "";

            if (!message.includes("Profile not found")) {
              throw value;
            }

            await api.bootstrapUser(token, {
              name: user.name || user.email,
              email: user.email,
              role: "client",
              plan: "free",
              avatarUrl: user.avatarUrl || ""
            });
          }
        }

        if (!cancelled) {
          completed = true;
          navigate(socialIntent.redirect || "/dashboard", { replace: true });
        }
      } catch {
        if (!cancelled) {
          const authParams = new URLSearchParams();
          authParams.set("tab", "register");
          authParams.set("social", "1");
          authParams.set("redirect", socialIntent.redirect || "/dashboard");
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

  function toggleTheme() {
    setTheme((value) => (value === "dark" ? "light" : "dark"));
  }

  function dismissBetaNotice() {
    setBetaNoticeVisible(false);

    try {
      window.localStorage.setItem(BETA_NOTICE_STORAGE_KEY, "true");
    } catch {
      // localStorage may be disabled.
    }
  }

  return (
    <div className={`site-shell ${isLoggingOut ? "site-shell--signing-out" : ""}`}>
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
          <Link className="brand-link" to="/">
            {brandMark()}
            <strong>{config.appName}</strong>
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
                  <Link className="ghost-button" to="/admin">
                    Админ
                  </Link>
                ) : null}
                <Link
                  className="ghost-button user-chip"
                  to="/dashboard"
                  aria-label={`Отвори профила на ${user.name}`}
                >
                  {user.name}
                </Link>
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

      {isMenuOpen ? (
        <>
          <div
            className="mobile-menu__backdrop"
            aria-hidden="true"
            onClick={() => setIsMenuOpen(false)}
          />
          <nav
            id="mobile-menu"
            className="mobile-menu"
            aria-label="Мобилно меню"
          >
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
                  <span className="mobile-menu__user">{user.name}</span>
                  {isAdmin ? (
                    <Link
                      to="/admin"
                      className="mobile-menu__link"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      Админ
                    </Link>
                  ) : null}
                  <Link
                    to="/dashboard"
                    className="mobile-menu__link"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    Моят профил
                  </Link>
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
        </>
      ) : null}

      {betaNoticeVisible ? (
        <button
          className="beta-notice"
          type="button"
          onClick={dismissBetaNotice}
          aria-label="Скрий бета предупреждението"
        >
          <span>Все още работим над проекта, това е бета</span>
          <small>Натисни, за да скриеш</small>
        </button>
      ) : null}

      <main id="main-content" className="page-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/users" element={<UsersPage />} />
          {/* Legacy /consultants catalog merged into /users — keep the path
             as a redirect for any bookmarks or external links. */}
          <Route path="/consultants" element={<Navigate to="/users" replace />} />
          <Route path="/consultants/:slug" element={<ConsultantProfilePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/legal" element={<Navigate to="/terms" replace />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/dashboard" element={<ProfilePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route
            path="/admin/preview/:consultantId"
            element={<AdminConsultantPreviewPage />}
          />
          <Route path="/pricing" element={<Navigate to="/users" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
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
