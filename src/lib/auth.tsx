import "aws-amplify/auth/enable-oauth-listener";
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  getCurrentUser,
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
  login: (email: string, password: string) => Promise<string>;
  loginWithProvider: (provider: SocialAuthProviderKey) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  completePasswordReset: (
    email: string,
    code: string,
    newPassword: string
  ) => Promise<void>;
  logout: () => Promise<void>;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState("");
  const [groups, setGroups] = useState<string[]>([]);

  useEffect(() => {
    let active = true;

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

      if (
        payload.event === "signInWithRedirect_failure" ||
        payload.event === "tokenRefresh_failure"
      ) {
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
      async login(email, password) {
        if (!isCognitoConfigured) {
          throw new Error(AUTH_NOT_READY_MESSAGE);
        }

        await signIn({ username: email, password });
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString() || "";
        const claims = session.tokens?.idToken?.payload;
        setUser(mapAuthUserFromSession(email, claims));
        setToken(idToken);
        setGroups(extractGroups(claims));
        return idToken;
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
    [groups, loading, token, user]
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
