import "aws-amplify/auth/enable-oauth-listener";
import {
  confirmSignIn,
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signInWithRedirect,
  signOut,
  signUp
} from "aws-amplify/auth";
import { Amplify } from "aws-amplify";
import { Hub } from "aws-amplify/utils";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { socialProviders, type SocialAuthProviderKey } from "./auth-flow";
import {
  config,
  isCognitoConfigured,
  isCognitoHostedUiConfigured,
  resolveAuthRedirectUrl
} from "./config";
import type { AuthUser, PlanTier, UserRole } from "./types";

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  plan: PlanTier;
};

type AuthContextValue = {
  configured: boolean;
  socialConfigured: boolean;
  loading: boolean;
  user: AuthUser | null;
  token: string;
  isAdmin: boolean;
  availableSocialProviders: SocialAuthProviderKey[];
  register: (input: RegisterInput) => Promise<{ needsConfirmation: boolean }>;
  confirm: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  login: (email: string, password: string) => Promise<string>;
  completeNewPassword: (email: string, newPassword: string) => Promise<string>;
  loginWithProvider: (provider: SocialAuthProviderKey) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  oauthError: string;
  clearOauthError: () => void;
};

function extractGroups(claims: Record<string, unknown> | undefined): string[] {
  const raw = claims?.["cognito:groups"];
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  return String(raw)
    .replace(/^\[|\]$/g, "")
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_NOT_READY_MESSAGE = "Системата за вход все още не е конфигурирана.";
const SOCIAL_AUTH_NOT_READY_MESSAGE =
  "Входът с външен профил още не е свързан за тази среда.";

export class NewPasswordRequiredError extends Error {
  email: string;

  constructor(email: string) {
    super("Трябва да зададеш нова парола, преди да продължиш.");
    this.name = "NewPasswordRequiredError";
    this.email = email;
  }
}

function mapProvider(provider: SocialAuthProviderKey) {
  if (provider === "google") {
    return "Google" as const;
  }

  if (provider === "apple") {
    return "Apple" as const;
  }

  return { custom: "LinkedInOIDC" };
}

function mapAuthUserFromSession(userIdFallback: string, claims: Record<string, unknown> | undefined) {
  return {
    id: String(claims?.sub || userIdFallback),
    email: String(claims?.email || ""),
    name: String(claims?.name || claims?.email || userIdFallback),
    avatarUrl: String(claims?.picture || "")
  };
}

if (isCognitoConfigured) {
  const redirectUrl = resolveAuthRedirectUrl();

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.cognito.userPoolId,
        userPoolClientId: config.cognito.userPoolClientId,
        ...(isCognitoHostedUiConfigured
          ? {
              loginWith: {
                oauth: {
                  domain: config.cognito.domain,
                  scopes: ["email", "openid", "profile"],
                  redirectSignIn: [redirectUrl],
                  redirectSignOut: [redirectUrl],
                  responseType: "code" as const,
                  providers: config.cognito.socialProviders
                    .map((provider) => socialProviders.find((item) => item.label === provider)?.key)
                    .filter(Boolean)
                    .map((provider) => mapProvider(provider as SocialAuthProviderKey))
                }
              }
            }
          : {})
      }
    }
  });
}

// Turn a raw Cognito/IdP federation error into a clear, user-facing message.
// The most common cause with username_attributes=["email"] is an email that
// already belongs to another sign-in method (email/password or another social
// provider) — Cognito refuses to create a second account and bounces back.
function describeOAuthError(raw: string): string {
  const text = (raw || "").toLowerCase();
  if (
    text.includes("already found an entry") ||
    text.includes("already exists") ||
    text.includes("account exists") ||
    text.includes("presignup failed")
  ) {
    return "Вече има профил с този имейл. Влез по начина, с който си се регистрирал(а) първоначално (имейл и парола или Google), след което можеш да добавиш и LinkedIn.";
  }
  if (text.includes("email") && (text.includes("required") || text.includes("attribute"))) {
    return "Доставчикът не сподели имейл адрес. Разреши достъп до имейла си при входа и опитай отново.";
  }
  if (text.includes("invalid_scope") || text.includes("scope")) {
    return "Входът с този доставчик не е напълно конфигуриран (обхвати). Опитай по-късно или използвай друг метод.";
  }
  if (!raw) {
    return "Входът с външния профил не беше завършен. Опитай отново или използвай имейл и парола.";
  }
  return `Входът с външния профил не беше завършен: ${raw}`;
}

function readOAuthErrorFromUrl(): string {
  if (typeof window === "undefined") return "";
  const fromSearch = new URLSearchParams(window.location.search);
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const desc =
    fromSearch.get("error_description") ||
    fromHash.get("error_description") ||
    fromSearch.get("error") ||
    fromHash.get("error") ||
    "";
  if (desc && typeof window.history?.replaceState === "function") {
    // Strip the error params so a refresh doesn't re-show the message.
    const url = new URL(window.location.href);
    ["error", "error_description", "state"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }
  return desc ? describeOAuthError(decodeURIComponent(desc)) : "";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState("");
  const [groups, setGroups] = useState<string[]>([]);
  const [oauthError, setOauthError] = useState("");

  async function refreshSignedInSession(userIdFallback: string) {
    const session = await fetchAuthSession();
    const idToken = session.tokens?.idToken?.toString() || "";
    const claims = session.tokens?.idToken?.payload;

    if (!idToken) {
      throw new Error("Неуспешно зареждане на сесията след вход.");
    }

    setUser(mapAuthUserFromSession(userIdFallback, claims));
    setToken(idToken);
    setGroups(extractGroups(claims));
    return idToken;
  }

  useEffect(() => {
    let active = true;

    // Surface an OAuth error returned in the redirect URL (e.g. Cognito bounced
    // the federation back with ?error_description=...).
    const urlError = readOAuthErrorFromUrl();
    if (urlError) {
      setOauthError(urlError);
    }

    async function restoreSession() {
      if (!isCognitoConfigured) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        const currentUser = await getCurrentUser();
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString() || "";
        const claims = session.tokens?.idToken?.payload;

        if (!active) {
          return;
        }

        setUser(mapAuthUserFromSession(currentUser.userId, claims));
        setToken(idToken);
        setGroups(extractGroups(claims));
      } catch {
        if (!active) {
          return;
        }

        setUser(null);
        setToken("");
        setGroups([]);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void restoreSession();

    const cancel = Hub.listen("auth", ({ payload }) => {
      if (!active) {
        return;
      }

      if (
        payload.event === "signedIn" ||
        payload.event === "signInWithRedirect" ||
        payload.event === "customOAuthState" ||
        payload.event === "tokenRefresh"
      ) {
        setOauthError("");
        setLoading(true);
        void restoreSession();
        return;
      }

      if (payload.event === "signedOut") {
        setUser(null);
        setToken("");
        setGroups([]);
        setLoading(false);
        return;
      }

      if (payload.event === "signInWithRedirect_failure") {
        const data = (payload as { data?: unknown }).data as
          | { error?: { message?: string }; message?: string }
          | undefined;
        const message = data?.error?.message || data?.message || "";
        setOauthError(describeOAuthError(message));
        setLoading(false);
        return;
      }

      if (payload.event === "tokenRefresh_failure") {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      cancel();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isCognitoConfigured,
      socialConfigured: isCognitoHostedUiConfigured,
      loading,
      user,
      token,
      isAdmin: groups.includes("admin"),
      availableSocialProviders: socialProviders
        .filter((provider) => config.cognito.socialProviders.includes(provider.label))
        .map((provider) => provider.key),
      oauthError,
      clearOauthError() {
        setOauthError("");
      },
      async register(input) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await signUp({
          username: input.email,
          password: input.password,
          options: {
            userAttributes: {
              email: input.email,
              name: input.name
            }
          }
        });

        return { needsConfirmation: true };
      },
      async confirm(email, code) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await confirmSignUp({
          username: email,
          confirmationCode: code
        });
      },
      async resendConfirmationCode(email) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await resendSignUpCode({ username: email });
      },
      async login(email, password) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        const result = await signIn({ username: email, password });
        const nextStep = result.nextStep?.signInStep;

        if (nextStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
          throw new NewPasswordRequiredError(email);
        }

        if (!result.isSignedIn) {
          throw new Error("Входът изисква допълнителна стъпка, която още не е активирана.");
        }

        return refreshSignedInSession(email);
      },
      async completeNewPassword(email, newPassword) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        const result = await confirmSignIn({ challengeResponse: newPassword });

        if (!result.isSignedIn) {
          throw new Error("Паролата беше приета, но входът изисква допълнителна стъпка.");
        }

        return refreshSignedInSession(email);
      },
      async loginWithProvider(provider) {
        if (!isCognitoHostedUiConfigured) {
          throw new Error(SOCIAL_AUTH_NOT_READY_MESSAGE);
        }

        await signInWithRedirect({
          provider: mapProvider(provider)
        });
      },
      async requestPasswordReset(email) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await resetPassword({ username: email });
      },
      async completePasswordReset(email, code, newPassword) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await confirmResetPassword({
          username: email,
          confirmationCode: code,
          newPassword
        });
      },
      async logout() {
        if (!isCognitoConfigured) {
          setUser(null);
          setToken("");
          setGroups([]);
          return;
        }

        await signOut();
        setUser(null);
        setToken("");
        setGroups([]);
      }
    }),
    [groups, loading, token, user, oauthError]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
