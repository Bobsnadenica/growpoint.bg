export type UserRole = "client" | "consultant";
export type PlanTier = "free" | "pro";

// Paid visibility packages for expert profiles (Стр. 6 of the designer doc).
// Missing/legacy profiles are treated as "start" (grandfathered).
export type ConsultantPackageTier = "start" | "grow" | "spotlight";
export type ConsultantPackageSource = "purchased" | "granted";
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type ConsultantProfileType = "consultant" | "mentor";
export type ConsultantProfileTheme = "violet" | "sky" | "rose" | "mint" | "amber";
export type ConsultantMediaKind = "avatar" | "hero";
export type UserMediaKind = "user-avatar";
export type ConsultantProfileStatus = "pending" | "approved" | "rejected";

export interface AdminConsultantDetail extends ConsultantProfile {
  ownerEmail: string;
  ownerName: string;
  profileStatus: ConsultantProfileStatus | "active";
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  statusUpdatedAt: string;
  statusUpdatedBy: string;
  statusUpdatedByEmail: string;
  statusSelfApproved: boolean;
}

export interface AdminConsultantSummary {
  consultantId: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
  slug: string;
  name: string;
  headline: string;
  bio: string;
  city: string;
  profileType: ConsultantProfileType;
  profileStatus: ConsultantProfileStatus | "active";
  isPublic: boolean;
  featured: boolean;
  comped?: boolean;
  restricted?: boolean;
  packageTier?: ConsultantPackageTier;
  packageSource?: string;
  membershipTier: string;
  avatarUrl: string;
  experienceYears: number;
  languages: string[];
  sessionModes: string[];
  specializations: string[];
  consultationTopics: string[];
  availabilityCount: number;
  createdAt: string;
  updatedAt: string;
  statusUpdatedAt: string;
  statusUpdatedBy: string;
  statusUpdatedByEmail: string;
  statusSelfApproved: boolean;
}

export interface AdminInvite {
  email: string;
  status: "pending" | "redeemed" | string;
  profileType: ConsultantProfileType;
  invitedByEmail: string;
  invitedAt: string;
  expiresAt: string;
  redeemedAt: string | null;
}

export interface AdminMetrics {
  generatedAt: string;
  // Authoritative account stats read straight from the Cognito user pool.
  // `available: false` means the pool could not be read (env unset or call
  // failed) and the UI should fall back to the DynamoDB `users` counts.
  cognito:
    | { available: false }
    | {
        available: true;
        total: number;
        confirmed: number;
        unconfirmed: number;
        disabled: number;
        newLast7: number;
        capped: boolean;
        byProvider: {
          email: number;
          google: number;
          apple: number;
          linkedin: number;
          other: number;
        };
      };
  users: {
    total: number;
    clients: number;
    consultants: number;
    registrationsLast7: number;
    registrationsPerDay: { date: string; count: number }[];
  };
  consultants: {
    total: number;
    public: number;
    pending: number;
    approved: number;
    rejected: number;
  };
  bookings: {
    total: number;
    pending: number;
    confirmed: number;
    declined: number;
    cancelled: number;
    confirmedSessions: number;
    upcomingConfirmed: number;
  };
  messages: number;
  reviews: number;
  averageRating: number;
  visits: {
    total: number;
    last7: number;
    perDay: { date: string; count: number }[];
  };
}

export type DocumentCategory = "cv" | "certificate" | "portfolio" | "other";

export interface UploadedDocument {
  fileName: string;
  storageKey: string;
  uploadedAt: string;
  category?: DocumentCategory;
  sizeBytes?: number;
  downloadUrl?: string;
  sharedWithConsultantIds?: string[];
}

export interface ConsultantProfile {
  consultantId: string;
  ownerUserId: string;
  profileType?: ConsultantProfileType;
  theme?: ConsultantProfileTheme;
  profileStatus?: ConsultantProfileStatus | "active";
  isPublic?: boolean;
  comped?: boolean;
  restricted?: boolean;
  slug: string;
  name: string;
  headline: string;
  bio: string;
  experienceSummary?: string;
  experienceHighlights?: string[];
  educationHighlights?: string[];
  city: string;
  languages: string[];
  specializations: string[];
  experienceYears: number;
  priceEur: number;
  sessionModes: string[];
  featured: boolean;
  rating: number;
  reviewCount: number;
  ratingSum?: number;
  recentReviews?: ConsultantReviewItem[];
  nextAvailable: string;
  avatarUrl: string;
  heroUrl: string;
  avatarStorageKey?: string;
  heroStorageKey?: string;
  tags: string[];
  availability: string[];
  idealFor?: string[];
  consultationTopics?: string[];
  workApproach?: string;
  sessionLengthMinutes?: number;
  packageTier?: ConsultantPackageTier;
  packageSource?: ConsultantPackageSource;
}

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
  avatarUrl?: string;
  avatarStorageKey?: string;
  city?: string;
  occupation?: string;
  age?: number | null;
  headline?: string;
  bio?: string;
  experienceSummary?: string;
  experienceHighlights?: string[];
  educationHighlights?: string[];
  skills?: string[];
  interests?: string[];
  keywords?: string[];
  goals?: string;
  preferredSessionModes?: string[];
  cvDocument?: UploadedDocument | null;
  documents?: UploadedDocument[];
  points?: number;
  pointsHistory?: PointsHistoryEntry[];
  referralCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PointsHistoryEntry {
  id: string;
  type: string;
  points: number;
  reason: string;
  createdAt: string;
}

export interface Booking {
  bookingId: string;
  consultantId: string;
  consultantName: string;
  clientId: string;
  clientName?: string;
  clientEmail?: string;
  clientSharedDocuments?: UploadedDocument[];
  scheduledAt: string;
  sessionLengthMinutes?: number;
  status: BookingStatus;
  note?: string;
  createdAt: string;
  decidedAt?: string;
  declineReason?: string;
  cancelledAt?: string;
  cancelledBy?: "consultant" | "client";
  rescheduleCount?: number;
  rescheduledAt?: string;
  rescheduledBy?: "consultant" | "client";
  sessionConfirmation?: BookingSessionConfirmation;
  messages?: BookingMessage[];
  review?: BookingReview;
  paymentStatus?: "unpaid" | "free" | "paid";
  freeViaPoints?: boolean;
  meetingLink?: string;
  meetingLinkLocked?: boolean;
}

export interface AdminBooking {
  bookingId: string;
  consultantName: string;
  clientName: string;
  clientEmail: string;
  scheduledAt: string;
  status: string;
  paymentStatus: "unpaid" | "free" | "paid";
  freeViaPoints: boolean;
  hasMeetingLink: boolean;
  createdAt: string;
}

export interface BookingSessionConfirmation {
  clientConfirmedAt?: string;
  consultantConfirmedAt?: string;
}

export interface BookingMessage {
  id: string;
  senderUserId: string;
  senderName: string;
  senderRole: "client" | "consultant" | "admin";
  body: string;
  createdAt: string;
}

export interface BookingReview {
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface ConsultantReviewItem {
  bookingId: string;
  clientName: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export type NotificationType =
  | "booking_requested"
  | "booking_accepted"
  | "booking_declined"
  | "booking_cancelled"
  | "booking_rescheduled"
  | "booking_reminder"
  | "session_confirmed"
  | "message_received"
  | "admin_message"
  | "review_received";

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  createdAt: string;
  readAt?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

// Safe, link-shareable public member card (returned by GET /public/users/{id}).
// Intentionally omits email, age, goals, keywords, documents, plan, and bookings.
export interface PublicUserProfile {
  userId: string;
  name: string;
  role: UserRole;
  avatarUrl: string;
  city: string;
  occupation: string;
  headline: string;
  bio: string;
  experienceSummary: string;
  experienceHighlights: string[];
  educationHighlights: string[];
  skills: string[];
  interests: string[];
}
