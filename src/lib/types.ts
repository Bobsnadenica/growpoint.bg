export type UserRole = "client" | "consultant";
export type PlanTier = "free" | "pro";
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
  isExample?: boolean;
  profileType?: ConsultantProfileType;
  theme?: ConsultantProfileTheme;
  profileStatus?: ConsultantProfileStatus | "active";
  isPublic?: boolean;
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
  priceBgn: number;
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
  createdAt: string;
  updatedAt: string;
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
  review?: BookingReview;
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
