import { clearInviteToken, readInviteToken } from "./auth-flow";
import { config, isApiConfigured } from "./config";
import { getCvUploadContentType, getDocumentUploadContentType } from "./uploads";
import type {
  AdminConsultantDetail,
  AdminConsultantSummary,
  AdminInvite,
  AdminMetrics,
  Booking,
  BookingMessage,
  ConsultantMediaKind,
  ConsultantPackageTier,
  ConsultantProfile,
  ConsultantProfileType,
  NotificationItem,
  PlanTier,
  PublicUserProfile,
  UploadedDocument,
  UserProfile,
  UserRole
} from "./types";

type BootstrapInput = {
  email: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
  avatarUrl?: string;
  city?: string;
  occupation?: string;
  headline?: string;
  consultantProfileType?: ConsultantProfileType;
  // When true, an existing user's role is updated to `role` (used by the
  // social-onboarding role choice). Cognito group membership still wins.
  setRole?: boolean;
  // Admin email-invite token (?invite=...) — redeemed server-side to grant a
  // free comped consultant account.
  inviteToken?: string;
};

type UpdateProfileInput = Partial<
  Pick<
    UserProfile,
    | "name"
    | "avatarUrl"
    | "avatarStorageKey"
    | "city"
    | "occupation"
    | "age"
    | "headline"
    | "bio"
    | "experienceSummary"
    | "experienceHighlights"
    | "educationHighlights"
    | "skills"
    | "interests"
    | "keywords"
    | "goals"
    | "preferredSessionModes"
    | "plan"
    | "documents"
  >
> & {
  cvDocument?: UploadedDocument | null;
};

type UpdateConsultantInput = Partial<
  Pick<
    ConsultantProfile,
    | "slug"
    | "name"
    | "headline"
    | "bio"
    | "experienceSummary"
    | "experienceHighlights"
    | "educationHighlights"
    | "city"
    | "experienceYears"
    | "priceEur"
    | "featured"
    | "rating"
    | "reviewCount"
    | "nextAvailable"
    | "avatarUrl"
    | "heroUrl"
    | "avatarStorageKey"
    | "heroStorageKey"
    | "profileType"
    | "theme"
    | "idealFor"
    | "consultationTopics"
    | "workApproach"
    | "sessionLengthMinutes"
  >
> & {
  languages?: string[];
  specializations?: string[];
  sessionModes?: string[];
  tags?: string[];
  availability?: string[];
};

function requireBackend() {
  if (!isApiConfigured) {
    throw new Error("Backendът не е конфигуриран.");
  }
}

const REQUEST_TIMEOUT_MS = 15000;

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  requireBackend();

  const headers = new Headers(options.headers || {});

  if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const externalSignal = options.signal;

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal
    });
  } catch (value) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error("Сървърът не отговаря навреме. Опитай отново след малко.");
    }
    throw value;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || "API request failed.";

    try {
      const parsed = JSON.parse(text) as { message?: string };
      message = parsed.message || message;
    } catch {}

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  async listConsultants(filters: { query?: string; city?: string } = {}): Promise<ConsultantProfile[]> {
    requireBackend();
    const params = new URLSearchParams();
    if (filters.query) params.set("query", filters.query);
    if (filters.city) params.set("city", filters.city);
    const queryString = params.toString();

    const payload = await request<
      { items: ConsultantProfile[]; nextCursor?: string | null } | ConsultantProfile[]
    >(`/consultants${queryString ? `?${queryString}` : ""}`);
    return Array.isArray(payload) ? payload : payload.items;
  },

  async getConsultant(slug: string) {
    requireBackend();
    return request<ConsultantProfile>(`/consultants/${encodeURIComponent(slug)}`);
  },

  async getPublicUser(id: string) {
    requireBackend();
    return request<PublicUserProfile>(`/public/users/${encodeURIComponent(id)}`);
  },

  async bootstrapUser(token: string, input: BootstrapInput) {
    // Attach a pending admin email-invite token (if any) so the server can
    // redeem it and grant a free comped consultant account. Single-use: clear
    // it once bootstrap succeeds.
    const inviteToken = input.inviteToken || readInviteToken() || undefined;
    const profile = await request<UserProfile>(
      "/auth/bootstrap",
      { method: "POST", body: JSON.stringify({ ...input, inviteToken }) },
      token
    );
    if (inviteToken) clearInviteToken();
    return profile;
  },

  async getMyProfile(token: string) {
    return request<UserProfile>("/me/profile", undefined, token);
  },

  async updateMyProfile(token: string, input: UpdateProfileInput) {
    return request<UserProfile>(
      "/me/profile",
      { method: "PUT", body: JSON.stringify(input) },
      token
    );
  },

  async getMyConsultantProfile(token: string) {
    return request<ConsultantProfile>("/consultants/me", undefined, token);
  },

  async updateMyConsultantProfile(token: string, input: UpdateConsultantInput) {
    return request<ConsultantProfile>(
      "/consultants/me",
      { method: "PUT", body: JSON.stringify(input) },
      token
    );
  },

  async listBookings(token: string) {
    return request<Booking[]>("/bookings", undefined, token);
  },

  async createBooking(
    token: string,
    input: { consultantId: string; scheduledAt: string; note?: string }
  ) {
    return request<Booking>(
      "/bookings",
      { method: "POST", body: JSON.stringify(input) },
      token
    );
  },

  async cancelBooking(token: string, bookingId: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) },
      token
    );
  },

  async acceptBooking(token: string, bookingId: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/status`,
      { method: "PATCH", body: JSON.stringify({ status: "confirmed" }) },
      token
    );
  },

  async declineBooking(token: string, bookingId: string, reason?: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/status`,
      {
        method: "PATCH",
        body: JSON.stringify(
          reason ? { status: "declined", reason } : { status: "declined" }
        )
      },
      token
    );
  },

  async rescheduleBooking(token: string, bookingId: string, scheduledAt: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/reschedule`,
      { method: "PATCH", body: JSON.stringify({ scheduledAt }) },
      token
    );
  },

  async submitBookingReview(
    token: string,
    bookingId: string,
    rating: number,
    comment?: string
  ) {
    return request<{
      booking: Booking;
      consultant: { consultantId: string; rating: number; reviewCount: number };
    }>(
      `/bookings/${encodeURIComponent(bookingId)}/review`,
      { method: "POST", body: JSON.stringify({ rating, comment }) },
      token
    );
  },

  async confirmBookingSession(token: string, bookingId: string) {
    return request<Booking>(
      `/bookings/${encodeURIComponent(bookingId)}/session-confirm`,
      { method: "POST" },
      token
    );
  },

  async listBookingMessages(token: string, bookingId: string) {
    return request<{ items: BookingMessage[] }>(
      `/bookings/${encodeURIComponent(bookingId)}/messages`,
      undefined,
      token
    );
  },

  async sendBookingMessage(token: string, bookingId: string, body: string) {
    return request<{ booking: Booking; message: BookingMessage }>(
      `/bookings/${encodeURIComponent(bookingId)}/messages`,
      { method: "POST", body: JSON.stringify({ body }) },
      token
    );
  },

  bookingIcsUrl(bookingId: string) {
    return `${config.apiBaseUrl}/bookings/${encodeURIComponent(bookingId)}/ics`;
  },

  async exportMyData(token: string) {
    // Returns the raw text (JSON dump); caller turns it into a Blob download.
    requireBackend();
    const response = await fetch(`${config.apiBaseUrl}/me/data-export`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) {
      throw new Error(`Data export failed: HTTP ${response.status}`);
    }
    return response.text();
  },

  async deleteMyAccount(token: string) {
    return request<{
      deleted: boolean;
      deletionScheduledAt?: string;
      deletionEffectiveAt?: string;
      publicProfileHidden?: boolean;
      note: string;
    }>(
      "/me",
      { method: "DELETE" },
      token
    );
  },

  async getMyDocumentDownloadUrl(token: string, storageKey: string) {
    return request<{ downloadUrl: string; expiresIn: number }>(
      "/me/documents/download-url",
      { method: "POST", body: JSON.stringify({ storageKey }) },
      token
    );
  },

  async listMyNotifications(token: string) {
    return request<{ items: NotificationItem[]; unreadCount: number }>(
      "/me/notifications",
      undefined,
      token
    );
  },

  async markMyNotificationsRead(token: string, notificationId?: string) {
    return request<{ ok: boolean; unreadCount: number }>(
      "/me/notifications/mark-read",
      {
        method: "POST",
        body: JSON.stringify(notificationId ? { notificationId } : {})
      },
      token
    );
  },

  async createCvUpload(token: string, file: File) {
    const contentType = getCvUploadContentType(file);

    return request<{
      uploadUrl: string;
      storageKey: string;
      document: UploadedDocument;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size || 0
        })
      },
      token
    );
  },

  async createDocumentUpload(token: string, file: File) {
    const contentType = getDocumentUploadContentType(file);

    return request<{
      uploadUrl: string;
      storageKey: string;
      document: UploadedDocument;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          fileSize: file.size || 0,
          kind: "document"
        })
      },
      token
    );
  },

  async createConsultantMediaUpload(
    token: string,
    file: File,
    kind: ConsultantMediaKind
  ) {
    return request<{
      uploadUrl: string;
      storageKey: string;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size || 0,
          kind
        })
      },
      token
    );
  },

  async createUserAvatarUpload(token: string, file: File) {
    return request<{
      uploadUrl: string;
      storageKey: string;
    }>(
      "/me/cv/upload-url",
      {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type || "application/octet-stream",
          fileSize: file.size || 0,
          kind: "user-avatar"
        })
      },
      token
    );
  },

  async adminGetMetrics(token: string) {
    return request<AdminMetrics>("/admin/metrics", undefined, token);
  },

  // Fire-and-forget page-view beacon (public, no token). Never throws.
  recordVisit() {
    if (!isApiConfigured) return;
    try {
      void fetch(`${config.apiBaseUrl}/metrics/visit`, {
        method: "POST",
        keepalive: true
      }).catch(() => undefined);
    } catch {
      // ignore — analytics must never affect the app
    }
  },

  async adminListConsultants(token: string) {
    const payload = await request<
      { items: AdminConsultantSummary[]; nextCursor?: string | null } | AdminConsultantSummary[]
    >("/admin/consultants", undefined, token);
    return Array.isArray(payload) ? payload : payload.items;
  },

  async adminGetConsultant(token: string, consultantId: string) {
    return request<AdminConsultantDetail>(
      `/admin/consultants/${encodeURIComponent(consultantId)}`,
      undefined,
      token
    );
  },

  async adminCreateInvite(
    token: string,
    email: string,
    profileType: ConsultantProfileType = "consultant"
  ) {
    return request<{
      email: string;
      status: string;
      profileType: ConsultantProfileType;
      invitedAt: string;
      expiresAt: string;
    }>("/admin/invites", { method: "POST", body: JSON.stringify({ email, profileType }) }, token);
  },

  async adminListInvites(token: string) {
    const payload = await request<{ items: AdminInvite[] }>("/admin/invites", undefined, token);
    return payload.items || [];
  },

  async adminRestrictUser(token: string, userId: string, restricted: boolean) {
    return request<{ userId: string; restricted: boolean; restrictedAt?: string }>(
      `/admin/users/${encodeURIComponent(userId)}/restrict`,
      { method: "PUT", body: JSON.stringify({ restricted }) },
      token
    );
  },

  async adminSetConsultantFeatured(
    token: string,
    consultantId: string,
    featured: boolean
  ) {
    return request<{
      consultantId: string;
      featured: boolean;
      featuredUpdatedAt?: string;
      featuredUpdatedBy?: string;
      featuredUpdatedByEmail?: string;
      unchanged?: boolean;
    }>(
      `/admin/consultants/${encodeURIComponent(consultantId)}/featured`,
      { method: "PUT", body: JSON.stringify({ featured }) },
      token
    );
  },

  async adminSetConsultantPackage(
    token: string,
    consultantId: string,
    packageTier: ConsultantPackageTier
  ) {
    return request<{
      consultantId: string;
      packageTier: ConsultantPackageTier;
      packageSource?: string;
      packageUpdatedAt?: string;
      packageUpdatedByEmail?: string;
    }>(
      `/admin/consultants/${encodeURIComponent(consultantId)}/package`,
      { method: "PUT", body: JSON.stringify({ packageTier }) },
      token
    );
  },

  async adminMessageUser(
    token: string,
    userId: string,
    input: { subject?: string; message: string }
  ) {
    return request<{ ok: boolean; notificationId?: string }>(
      `/admin/users/${encodeURIComponent(userId)}/message`,
      { method: "POST", body: JSON.stringify(input) },
      token
    );
  }
};
