import {
  type CSSProperties,
  FormEvent,
  ReactNode,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams
} from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import advertisementOneVideoUrl from "../../../assets/advertisement/1.mp4";
import advertisementTwoVideoUrl from "../../../assets/advertisement/2.mp4";
import advertisementThreeImageUrl from "../../../assets/advertisement/3.jpg";
import advertisementFourImageUrl from "../../../assets/advertisement/4.jpg";
import {
  clearPendingBootstrap,
  readPendingBootstrap,
  socialProviders,
  writePendingBootstrap,
  writeSocialAuthIntent
} from "../../lib/auth-flow";
import { getPersonaById, personaPresets, type PersonaPreset } from "../../lib/personas";
import {
  DOCUMENT_UPLOAD_ACCEPT,
  DOCUMENT_UPLOAD_FORMAT_LABEL,
  DOCUMENT_UPLOAD_MAX_COUNT,
  getDocumentUploadValidationError
} from "../../lib/uploads";
import { resolvePublicUrl } from "../../lib/url";
import type {
  Booking,
  ConsultantMediaKind,
  ConsultantProfile,
  ConsultantProfileType,
  NotificationItem,
  PlanTier,
  UploadedDocument,
  UserProfile,
  UserRole
} from "../../lib/types";

const HeroAnimation = lazy(() => import("./HeroAnimation"));

async function uploadFileToSignedUrl(
  uploadUrl: string,
  file: File,
  failureLabel: string,
  contentType = file.type || "application/octet-stream"
) {
  if (!uploadUrl) {
    return;
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType
    },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error(`Неуспешно качване на ${failureLabel}.`);
  }
}

const MATCH_STOP_WORDS = new Set([
  "and",
  "for",
  "the",
  "with"
]);

function resolveAuthRedirectPath(raw: string | null) {
  if (!raw) {
    return "/dashboard";
  }

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return "/dashboard";
  }

  return raw;
}

type AuthScreen =
  | "login"
  | "register"
  | "confirm"
  | "forgot-request"
  | "forgot-confirm";

type MatchInsight = {
  score: number;
  label: string;
  note: string;
};

type SuggestedFillMode = "replace" | "append-list" | "append-lines" | "append-text";
type QuestionSuggestionOption = string | { label: string; value: string };

const homeRoleChoices = [
  {
    step: "01",
    title: "Търся консултация или менторство",
    text: "Разгледай активни профили, сравни фокус, формат и свободни часове и избери правилния човек за следващата си стъпка.",
    ctaLabel: "Намери консултант",
    ctaTo: "/users"
  },
  {
    step: "02",
    title: "Аз съм консултант или ментор",
    text: "Създай публичен профил с ясна експертиза, снимка, теми и наличности, за да могат хората да те откриват и резервират.",
    ctaLabel: "Създай профил",
    ctaTo: "/auth?tab=register&role=consultant"
  }
] as const;

const profileAdvertisementAssets = [
  {
    type: "video",
    src: advertisementOneVideoUrl,
    poster: advertisementThreeImageUrl
  },
  {
    type: "video",
    src: advertisementTwoVideoUrl,
    poster: advertisementFourImageUrl
  },
  {
    type: "image",
    src: advertisementThreeImageUrl
  },
  {
    type: "image",
    src: advertisementFourImageUrl
  }
] as const;

function stableIndexFromText(value: string, length: number) {
  if (!length) return 0;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % length;
}

const authRoleChoices: Record<
  UserRole,
  { title: string; text: string; meta: string; badge: string }
> = {
  client: {
    title: "Търся консултация",
    text: "Създай личен професионален контекст, за да сравняваш профили и да заявяваш консултации по-точно.",
    meta: "Без членска такса",
    badge: "Потребител"
  },
  consultant: {
    title: "Създавам експертен профил",
    text: "Стартирай публична страница като консултант или ментор с ясни теми, формат и първа наличност.",
    meta: "Публичен профил",
    badge: "Консултант / ментор"
  }
};

const consultantProfileTypeChoices: Record<
  ConsultantProfileType,
  { title: string; text: string; meta: string }
> = {
  consultant: {
    title: "Консултант",
    text: "Подходящо за експертни кариерни, HR, CV, интервю и професионални консултации.",
    meta: "Експертна услуга"
  },
  mentor: {
    title: "Ментор",
    text: "Подходящо за по-дългосрочна подкрепа, развитие, лидерство и професионална посока.",
    meta: "Развитие във времето"
  }
};

type ConsultantThemeToken = NonNullable<ConsultantProfile["theme"]>;

type ConsultantThemeStyle = CSSProperties & {
  "--profile-theme"?: string;
  "--profile-theme-soft"?: string;
  "--profile-theme-border"?: string;
  "--profile-theme-glow"?: string;
  "--profile-theme-text"?: string;
};

const consultantThemeVisuals: Record<
  ConsultantThemeToken,
  { primary: string; soft: string; border: string; glow: string; text: string }
> = {
  violet: {
    primary: "#7c3aed",
    soft: "rgba(124, 58, 237, 0.12)",
    border: "rgba(124, 58, 237, 0.32)",
    glow: "rgba(124, 58, 237, 0.13)",
    text: "#4c1d95"
  },
  sky: {
    primary: "#0284c7",
    soft: "rgba(2, 132, 199, 0.12)",
    border: "rgba(2, 132, 199, 0.3)",
    glow: "rgba(2, 132, 199, 0.12)",
    text: "#075985"
  },
  rose: {
    primary: "#e11d48",
    soft: "rgba(225, 29, 72, 0.11)",
    border: "rgba(225, 29, 72, 0.28)",
    glow: "rgba(225, 29, 72, 0.11)",
    text: "#9f1239"
  },
  mint: {
    primary: "#0f766e",
    soft: "rgba(15, 118, 110, 0.12)",
    border: "rgba(15, 118, 110, 0.28)",
    glow: "rgba(15, 118, 110, 0.12)",
    text: "#115e59"
  },
  amber: {
    primary: "#b45309",
    soft: "rgba(180, 83, 9, 0.12)",
    border: "rgba(180, 83, 9, 0.3)",
    glow: "rgba(180, 83, 9, 0.12)",
    text: "#92400e"
  }
};

function renderSocialProviderIcon(
  providerKey: (typeof socialProviders)[number]["key"]
) {
  if (providerKey === "apple") {
    return (
      <span
        className="social-auth__brand social-auth__brand--apple"
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" role="presentation">
          <path d="M15.2 4.3c.8-1 1.3-2.3 1.2-3.6-1.2.1-2.6.8-3.5 1.8-.8.9-1.4 2.2-1.2 3.5 1.3.1 2.6-.6 3.5-1.7Zm3.4 12.6c-.4 1-1 1.9-1.6 2.7-.9 1.1-1.9 2.4-3.3 2.4-1.2 0-1.7-.8-3.1-.8-1.4 0-1.9.8-3.1.8-1.3 0-2.2-1.2-3.1-2.4C2.7 17.6 1.4 14 2.6 11c.9-2.1 2.7-3.5 4.7-3.5 1.3 0 2.5.9 3.1.9.6 0 2-.9 3.5-.9.6 0 2.5.1 3.8 1.9-.1.1-2.2 1.3-2.2 3.8 0 3 2.7 4 2.8 4.1Z" />
        </svg>
      </span>
    );
  }

  if (providerKey === "linkedin") {
    return (
      <span
        className="social-auth__brand social-auth__brand--linkedin"
        aria-hidden="true"
      >
        <span className="social-auth__brand-label">in</span>
      </span>
    );
  }

  return (
    <span
      className="social-auth__brand social-auth__brand--google"
      aria-hidden="true"
    >
      <span className="social-auth__brand-letter">G</span>
    </span>
  );
}

function formatDate(date: string) {
  const parsed = new Date(date);

  if (!date || Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function formatDocumentUploadedAt(date: string) {
  const parsed = new Date(date);

  if (!date || Number.isNaN(parsed.getTime())) {
    return "Няма дата";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(parsed);
}

function formatConsultantTypeLabel(profileType?: ConsultantProfileType) {
  return profileType === "mentor" ? "Ментор" : "Консултант";
}

function getDirectoryKindLabel(kind: string) {
  if (kind === "mentor" || kind === "consultant") {
    return formatConsultantTypeLabel(kind);
  }

  return "";
}

function buildDirectoryFilterLabels({
  query,
  city,
  kind,
  topOnly
}: {
  query: string;
  city: string;
  kind: string;
  topOnly: boolean;
}) {
  return [
    query ? `Търсене: ${query}` : "",
    city ? `Град: ${city}` : "",
    getDirectoryKindLabel(kind),
    topOnly ? "Само водещи профили" : ""
  ].filter(Boolean);
}

function getConsultantProfileType(consultant: ConsultantProfile) {
  return consultant.profileType || "consultant";
}

function getConsultantThemeVisual(theme?: ConsultantProfile["theme"]) {
  return theme ? consultantThemeVisuals[theme] || null : null;
}

function getConsultantThemeStyle(consultant: ConsultantProfile): ConsultantThemeStyle | undefined {
  const visual = getConsultantThemeVisual(consultant.theme);

  if (!visual) {
    return undefined;
  }

  return {
    "--profile-theme": visual.primary,
    "--profile-theme-soft": visual.soft,
    "--profile-theme-border": visual.border,
    "--profile-theme-glow": visual.glow,
    "--profile-theme-text": visual.text
  };
}

function hasConsultantTheme(consultant: ConsultantProfile) {
  return Boolean(getConsultantThemeVisual(consultant.theme));
}

function formatBookingStatusLabel(status: Booking["status"]) {
  if (status === "confirmed") return "Потвърдена";
  if (status === "declined") return "Отказана от консултанта";
  if (status === "cancelled") return "Отменена";
  return "Чака потвърждение";
}

function getNextBooking(bookings: Booking[]) {
  const now = Date.now();
  const sortedBookings = [...bookings].sort(
    (left, right) =>
      new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime()
  );

  return (
    sortedBookings.find((booking) => new Date(booking.scheduledAt).getTime() >= now) ||
    sortedBookings[0] ||
    null
  );
}

function getProfileCompletion(
  profile: UserProfile,
  consultantProfile: ConsultantProfile | null
) {
  const baseChecks = [
    Boolean(profile.name.trim()),
    Boolean((profile.city || "").trim()),
    Boolean((profile.occupation || "").trim()),
    Boolean(profile.age),
    Boolean((profile.headline || "").trim()),
    Boolean((profile.bio || "").trim()),
    Boolean((profile.experienceSummary || "").trim()),
    Boolean((profile.experienceHighlights || []).length),
    Boolean((profile.educationHighlights || []).length),
    Boolean((profile.skills || []).length),
    Boolean((profile.interests || []).length),
    Boolean((profile.keywords || []).length),
    Boolean((profile.goals || "").trim()),
    Boolean(profile.cvDocument)
  ];

  const consultantChecks =
    profile.role === "consultant"
      ? [
          Boolean((consultantProfile?.headline || "").trim()),
          Boolean((consultantProfile?.bio || "").trim()),
          Boolean((consultantProfile?.experienceSummary || "").trim()),
          Boolean((consultantProfile?.experienceHighlights || []).length),
          Boolean((consultantProfile?.educationHighlights || []).length),
          Boolean((consultantProfile?.specializations || []).length),
          Boolean((consultantProfile?.languages || []).length),
          Boolean((consultantProfile?.idealFor || []).length),
          Boolean((consultantProfile?.consultationTopics || []).length),
          Boolean((consultantProfile?.workApproach || "").trim()),
          Boolean((consultantProfile?.availability || []).length)
        ]
      : [];

  const checks = [...baseChecks, ...consultantChecks];
  const completed = checks.filter(Boolean).length;

  return Math.round((completed / checks.length) * 100);
}

function slugifyValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9а-я]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function parseListValue(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeUniqueValues(current: string, next: string, separator: ", " | "\n") {
  const items = [current, next]
    .flatMap((value) =>
      value
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
    .filter((item, index, values) => values.indexOf(item) === index);

  return items.join(separator);
}

function applySuggestedFieldValue(
  form: HTMLFormElement | null,
  fieldName: string,
  value: string,
  mode: SuggestedFillMode = "replace"
) {
  if (!form) {
    return;
  }

  const control = form.elements.namedItem(fieldName);

  if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
    return;
  }

  const currentValue = control.value.trim();
  const nextValue =
    mode === "append-list"
      ? mergeUniqueValues(currentValue, value, ", ")
      : mode === "append-lines"
        ? mergeUniqueValues(currentValue, value, "\n")
        : mode === "append-text"
          ? currentValue.includes(value)
            ? currentValue
            : [currentValue, value].filter(Boolean).join(" ")
          : value;

  control.value = nextValue;
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  control.focus();
}

// HashRouter owns the URL fragment, so `<a href="#section">` would be
// interpreted as a route ("/section" → 404). Scroll programmatically instead.
function scrollToDashboardSection(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const AVAILABILITY_WEEKDAYS = [
  { value: 1, short: "Пон" },
  { value: 2, short: "Вто" },
  { value: 3, short: "Сря" },
  { value: 4, short: "Чет" },
  { value: 5, short: "Пет" },
  { value: 6, short: "Съб" },
  { value: 0, short: "Нед" }
] as const;

const AVAILABILITY_HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 08:00 – 20:00

function generateAvailabilityPattern({
  weekdays,
  hours,
  weeksAhead
}: {
  weekdays: number[];
  hours: number[];
  weeksAhead: number;
}): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const totalDays = Math.max(1, weeksAhead) * 7;
  for (let offset = 0; offset < totalDays; offset += 1) {
    const day = new Date(start);
    day.setDate(day.getDate() + offset);
    if (!weekdays.includes(day.getDay())) continue;
    for (const hour of hours) {
      const slot = new Date(day);
      slot.setHours(hour, 0, 0, 0);
      if (slot.getTime() > now.getTime()) {
        slots.push(slot.toISOString());
      }
    }
  }
  return slots;
}

function buildAvailabilityPreset(daysAhead: number, hour: number): {
  label: string;
  value: string;
} {
  const slot = new Date();
  slot.setDate(slot.getDate() + daysAhead);
  slot.setHours(hour, 0, 0, 0);

  return {
    label: `${daysAhead === 1 ? "Утре" : `След ${daysAhead} дни`} · ${slot.toLocaleTimeString(
      "bg-BG",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    )}`,
    value: slot.toISOString()
  };
}

function formatDateInputValue(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getRelativeDateInputValue(daysAhead = 0) {
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + daysAhead);
  return formatDateInputValue(nextDate);
}

function buildAvailabilitySlot(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) {
    return "";
  }

  const [year, month, day] = dateValue.split("-").map(Number);
  const [hours, minutes] = timeValue.split(":").map(Number);

  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return "";
  }

  const slot = new Date(year, month - 1, day, hours, minutes, 0, 0);

  if (Number.isNaN(slot.getTime())) {
    return "";
  }

  return slot.toISOString();
}

function normalizeAvailabilitySlots(value: string[]) {
  return Array.from(
    new Set(
      value
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .filter((item) => !Number.isNaN(new Date(item).getTime()))
    )
  ).sort((left, right) => new Date(left).getTime() - new Date(right).getTime());
}

function getUpcomingAvailabilitySlots(
  value: string[],
  limit = Number.POSITIVE_INFINITY
) {
  const cutoff = Date.now() - 5 * 60 * 1000;

  return normalizeAvailabilitySlots(value)
    .filter((item) => new Date(item).getTime() >= cutoff)
    .slice(0, limit);
}

function formatAvailabilityDayLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(parsed);
}

function formatAvailabilityTimeLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function formatAvailabilityShortLabel(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "По договаряне";
  }

  return new Intl.DateTimeFormat("bg-BG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function getAvailabilityDayKey(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0")
  ].join("-");
}

function groupAvailabilityByDay(value: string[]) {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      slots: string[];
    }
  >();

  getUpcomingAvailabilitySlots(value).forEach((slot) => {
    const key = getAvailabilityDayKey(slot);

    if (!key) {
      return;
    }

    const existing = groups.get(key);

    if (existing) {
      existing.slots.push(slot);
      return;
    }

    groups.set(key, {
      key,
      label: formatAvailabilityDayLabel(slot),
      slots: [slot]
    });
  });

  return Array.from(groups.values());
}

function tokenizeText(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9а-я]+/gi)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !MATCH_STOP_WORDS.has(token));
}

function formatSignalLabel(value: string) {
  if (/^[a-z0-9 -]+$/i.test(value)) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getConsultantIdealFor(consultant: ConsultantProfile) {
  return consultant.idealFor?.length ? consultant.idealFor : consultant.tags || [];
}

function getConsultationTopics(consultant: ConsultantProfile) {
  return consultant.consultationTopics?.length
    ? consultant.consultationTopics
    : consultant.specializations || [];
}

function getConsultantWorkApproach(consultant: ConsultantProfile) {
  return (
    consultant.workApproach ||
    "Работата е подредена около профила, целта на консултацията и конкретните следващи стъпки."
  );
}

function getSessionLengthLabel(consultant: ConsultantProfile) {
  return `${consultant.sessionLengthMinutes || 60} минути`;
}

function getConsultantLocationLabel(consultant: ConsultantProfile) {
  return consultant.city || "Онлайн / дистанционно";
}

function getConsultantSummaryTags(consultant: ConsultantProfile) {
  return (consultant.specializations || []).length
    ? (consultant.specializations || []).slice(0, 2)
    : getConsultationTopics(consultant).length
      ? getConsultationTopics(consultant).slice(0, 2)
      : (consultant.experienceHighlights || []).slice(0, 2);
}

function truncateText(value: string, maxLength = 180) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function getConsultantDirectorySummary(consultant: ConsultantProfile) {
  return truncateText(
    consultant.experienceSummary || consultant.bio || getConsultantWorkApproach(consultant),
    190
  );
}

function getConsultantPriceLabel(consultant: ConsultantProfile) {
  return consultant.priceBgn > 0 ? `от ${consultant.priceBgn} лв` : "Цена при запитване";
}

function getNameInitials(name: string) {
  const tokens = name
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 2);

  return tokens.map((item) => item.charAt(0).toUpperCase()).join("") || "CL";
}

function AvatarMedia({
  src,
  name,
  className
}: {
  src?: string;
  name: string;
  className: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src && !failed ? resolvePublicUrl(src) : "";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (resolvedSrc) {
    return (
      <img
        className={`${className} avatar-media`}
        src={resolvedSrc}
        alt={name}
        decoding="async"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} avatar-media avatar-media--fallback visual-avatar`} aria-label={name}>
      <span>{getNameInitials(name)}</span>
    </div>
  );
}

function ExampleBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`example-badge${className ? ` ${className}` : ""}`}
      title="Този профил е примерен и служи за визуализация."
    >
      Пример
    </span>
  );
}

function CoverMedia({
  src,
  name,
  className,
  eyebrow,
  title,
  subtitle
}: {
  src?: string;
  name: string;
  className: string;
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = src && !failed ? resolvePublicUrl(src) : "";

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (resolvedSrc) {
    return (
      <img
        className={className}
        src={resolvedSrc}
        alt={name}
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${className} visual-cover`} aria-label={name}>
      <span className="visual-cover__eyebrow">{eyebrow}</span>
      <strong>{title}</strong>
      <p>{subtitle}</p>
    </div>
  );
}

function getProfileSignalTokens(profile: UserProfile) {
  return Array.from(
    new Set(
      tokenizeText(
        [
          profile.occupation,
          profile.headline,
          profile.bio,
          profile.experienceSummary,
          profile.goals,
          ...(profile.experienceHighlights || []),
          ...(profile.educationHighlights || []),
          ...(profile.skills || []),
          ...(profile.interests || []),
          ...(profile.keywords || [])
        ]
          .filter(Boolean)
          .join(" ")
      )
    )
  );
}

function getConsultantSignalTokens(consultant: ConsultantProfile) {
  return new Set(
    tokenizeText(
      [
        consultant.headline,
        consultant.bio,
        consultant.experienceSummary,
        ...consultant.specializations,
        ...consultant.tags,
        ...(consultant.experienceHighlights || []),
        ...(consultant.educationHighlights || []),
        ...getConsultantIdealFor(consultant),
        ...getConsultationTopics(consultant)
      ].join(" ")
    )
  );
}

function getConsultantMatch(profile: UserProfile | null, consultant: ConsultantProfile) {
  if (!profile || profile.role !== "client") {
    return null;
  }

  const profileTokens = getProfileSignalTokens(profile);

  if (!profileTokens.length) {
    return null;
  }

  const consultantTokens = getConsultantSignalTokens(consultant);
  const overlaps = profileTokens.filter((token) => consultantTokens.has(token));
  const preferredModes = profile.preferredSessionModes || [];
  const modeMatch = preferredModes.some((mode) => consultant.sessionModes.includes(mode));
  const cityMatch =
    Boolean(profile.city) && consultant.city.toLowerCase() === String(profile.city).toLowerCase();

  const rawScore = overlaps.length * 18 + (modeMatch ? 10 : 0) + (cityMatch ? 6 : 0);
  const score = Math.min(98, Math.max(32, rawScore));

  if (!overlaps.length && !modeMatch && !cityMatch) {
    return null;
  }

  const reasons = overlaps.slice(0, 2).map(formatSignalLabel);

  if (modeMatch) {
    reasons.push("предпочитан формат");
  }

  const label = score >= 72 ? "Силно съвпадение" : "Добро съвпадение";
  const note = reasons.length
    ? `Подходящ по ${reasons.join(", ")}.`
    : "Подходящ спрямо профила и предпочитанията ти.";

  return {
    score,
    label,
    note
  } satisfies MatchInsight;
}

function getPersonaMatch(persona: PersonaPreset | null, consultant: ConsultantProfile) {
  if (!persona) {
    return null;
  }

  if (getConsultantProfileType(consultant) !== persona.type) {
    return null;
  }

  const personaTokens = new Set(tokenizeText(persona.tags.join(" ")));

  if (!personaTokens.size) {
    return null;
  }

  const consultantTokens = getConsultantSignalTokens(consultant);
  const overlaps = Array.from(personaTokens).filter((token) => consultantTokens.has(token));

  if (!overlaps.length) {
    return null;
  }

  const score = Math.min(98, Math.max(45, overlaps.length * 22));
  const reasons = overlaps.slice(0, 3).map(formatSignalLabel);

  return {
    score,
    label: score >= 72 ? "Силно съвпадение" : "Подходящ профил",
    note: `Подходящ по ${reasons.join(", ")}.`
  } satisfies MatchInsight;
}

function useViewerProfile() {
  const { user, token, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!user || !token) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    api
      .getMyProfile(token)
      .then((value) => {
        if (mounted) {
          setProfile(value);
        }
      })
      .catch(() => {
        if (mounted) {
          setProfile(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [authLoading, token, user]);

  return {
    loading,
    profile,
    plan: profile?.plan || ("free" as PlanTier),
    role: profile?.role || ("client" as UserRole)
  };
}

function QuestionBlock({
  step,
  title,
  hint,
  wide = false,
  children
}: {
  step: string;
  title: string;
  hint: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <article className={`question-card ${wide ? "question-card--wide" : ""}`}>
      <div className="question-card__header">
        <span className="question-card__step">{step}</span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </div>
      <div className="question-card__body">{children}</div>
    </article>
  );
}

function SuggestionPills({
  label,
  fieldName,
  options,
  mode = "append-list"
}: {
  label: string;
  fieldName: string;
  options: QuestionSuggestionOption[];
  mode?: SuggestedFillMode;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  useEffect(() => {
    const form = rootRef.current?.closest("form");

    if (!form) {
      return;
    }

    const control = form.elements.namedItem(fieldName);

    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) {
      return;
    }

    const syncValueState = () => {
      setHasValue(Boolean(control.value.trim()));
    };

    const handleFocus = () => {
      setIsFocused(true);
      syncValueState();
    };

    const handleBlur = () => {
      window.setTimeout(() => {
        const activeElement = document.activeElement;
        const stillInsideSuggestions =
          activeElement instanceof Node && rootRef.current?.contains(activeElement);
        const fieldStillFocused = activeElement === control;

        if (!stillInsideSuggestions && !fieldStillFocused) {
          setIsFocused(false);
        }
      }, 0);
    };

    syncValueState();

    control.addEventListener("focus", handleFocus);
    control.addEventListener("blur", handleBlur);
    control.addEventListener("input", syncValueState);
    control.addEventListener("change", syncValueState);

    return () => {
      control.removeEventListener("focus", handleFocus);
      control.removeEventListener("blur", handleBlur);
      control.removeEventListener("input", syncValueState);
      control.removeEventListener("change", syncValueState);
    };
  }, [fieldName]);

  if (!isFocused) {
    return null;
  }

  return (
    <div
      className={`answer-suggestions ${hasValue ? "answer-suggestions--open" : "answer-suggestions--hint"}`}
      ref={rootRef}
    >
      {hasValue ? (
        <>
          <span className="answer-suggestions__label">{label}</span>
          <div className="answer-suggestions__grid">
            {options.map((option) => {
              const item = typeof option === "string" ? { label: option, value: option } : option;

              return (
                <button
                  className="suggestion-pill"
                  key={`${fieldName}-${item.label}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) =>
                    applySuggestedFieldValue(event.currentTarget.form, fieldName, item.value, mode)
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <span className="answer-suggestions__hint">
          Започни да пишеш, за да видиш идеи за това поле.
        </span>
      )}
    </div>
  );
}

export function HomePage() {
  const [homeConsultants, setHomeConsultants] = useState<ConsultantProfile[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    let mounted = true;

    setHomeLoading(true);
    setHomeError("");

    api
      .listConsultants()
      .then((items) => {
        if (mounted) {
          setHomeConsultants(items);
        }
      })
      .catch((value) => {
        if (mounted) {
          setHomeConsultants([]);
          setHomeError(
            value instanceof Error ? value.message : "Неуспешно зареждане на публичните профили."
          );
        }
      })
      .finally(() => {
        if (mounted) {
          setHomeLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const featured = useMemo(
    () =>
      [...homeConsultants]
        .sort((left, right) => {
          if (left.featured !== right.featured) {
            return left.featured ? -1 : 1;
          }

          if (right.rating !== left.rating) {
            return right.rating - left.rating;
          }

          return right.reviewCount - left.reviewCount;
        })
        .slice(0, 3),
    [homeConsultants]
  );

  return (
    <>
      <section className="hero">
        <div className="container home-hero">
          <div className="hero__copy">
            <p className="eyebrow">Консултации и менторство за кариера</p>
            <h1>Избери своята следваща кариерна стъпка.</h1>
            <p className="hero__lede">
              CareerLane свързва професионалисти с консултанти и ментори в подреден
              каталог с ясни профили, фокус и свободни часове.
            </p>

            <div className="hero-choice-grid" aria-label="Избери как искаш да използваш CareerLane">
              {homeRoleChoices.map((choice) => (
                <Link className="hero-choice-card" key={choice.step} to={choice.ctaTo}>
                  <span>{choice.step}</span>
                  <strong>{choice.title}</strong>
                  <p>{choice.text}</p>
                  <em>{choice.ctaLabel}</em>
                </Link>
              ))}
            </div>
          </div>

          <aside className="home-hero__visual" aria-hidden="true">
            <Suspense fallback={<div className="home-hero__visual-skeleton" />}>
              <HeroAnimation />
            </Suspense>
          </aside>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Подбрани профили</p>
              <h2>Силните профили, готови за бърз избор.</h2>
            </div>
            <Link className="ghost-button" to="/users">
              Виж всички профили
            </Link>
          </div>

          <div className="consultant-grid">
            {featured.map((consultant) => (
              <ConsultantCard key={consultant.consultantId} consultant={consultant} />
            ))}
          </div>
          {!homeLoading && !homeError && featured.length === 0 ? (
            <div className="panel empty-state">
              Все още няма публикувани водещи профили. След като консултантите завършат профила си,
              тук ще се показват водещите активни страници.
            </div>
          ) : null}
          {homeError ? <div className="panel panel--error">{homeError}</div> : null}
        </div>
      </section>
    </>
  );
}

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const city = searchParams.get("city") || "";
  const kind = searchParams.get("kind") || "all";
  const topOnly = searchParams.get("top") === "1";
  const persona = getPersonaById(searchParams.get("persona"));
  const { user } = useAuth();
  const { profile } = useViewerProfile();
  const [consultants, setConsultants] = useState<ConsultantProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    api
      .listConsultants({ query, city })
      .then((items) => {
        if (mounted) {
          setConsultants(items);
          setError("");
        }
      })
      .catch((value) => {
        if (mounted) {
          setError(value instanceof Error ? value.message : "Неуспешно зареждане.");
        }
      })
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [city, query]);

  const rankedConsultants = useMemo(() => {
    return consultants
      .filter((consultant) => {
        if (persona && getConsultantProfileType(consultant) !== persona.type) {
          return false;
        }
        const matchesType =
          kind === "all" ||
          getConsultantProfileType(consultant) === kind;
        const matchesTop = !topOnly || consultant.featured;
        return matchesType && matchesTop;
      })
      .map((consultant) => ({
        consultant,
        match: persona
          ? getPersonaMatch(persona, consultant)
          : getConsultantMatch(profile, consultant)
      }))
      .sort((left, right) => {
        const leftScore = left.match?.score || 0;
        const rightScore = right.match?.score || 0;

        if (rightScore !== leftScore) {
          return rightScore - leftScore;
        }

        if (left.consultant.featured !== right.consultant.featured) {
          return left.consultant.featured ? -1 : 1;
        }

        return right.consultant.rating - left.consultant.rating;
      });
  }, [consultants, kind, persona, profile, topOnly]);
  const visibleConsultants = rankedConsultants;
  const hasActiveFilters = Boolean(
    query || city || kind !== "all" || topOnly || persona
  );
  const activeFilterLabels = persona
    ? [`Архетип: ${persona.name}`, ...buildDirectoryFilterLabels({ query, city, kind, topOnly })]
    : buildDirectoryFilterLabels({ query, city, kind, topOnly });
  const profileCtaTo = user ? "/dashboard" : "/auth?tab=register";
  const isConsultantViewer = profile?.role === "consultant";

  function buildSearchParams(nextFilters: {
    query?: string;
    city?: string;
    kind?: string;
    topOnly?: boolean;
    persona?: string | null;
  }) {
    const nextQuery = nextFilters.query ?? query;
    const nextCity = nextFilters.city ?? city;
    const nextKind = nextFilters.kind ?? kind;
    const nextTopOnly = nextFilters.topOnly ?? topOnly;
    const nextPersona = nextFilters.persona ?? persona?.id ?? null;

    const params: Record<string, string> = {};
    if (nextQuery) params.q = nextQuery;
    if (nextCity) params.city = nextCity;
    if (nextKind !== "all") params.kind = nextKind;
    if (nextTopOnly) params.top = "1";
    if (nextPersona) params.persona = nextPersona;
    return params;
  }

  function applyPresetQuery(nextQuery: string) {
    setSearchParams(buildSearchParams({ query: nextQuery }));
  }

  function applyDirectoryFilters(nextFilters: {
    query?: string;
    city?: string;
    kind?: string;
    topOnly?: boolean;
    persona?: string | null;
  }) {
    setSearchParams(buildSearchParams(nextFilters));
  }

  function selectPersona(next: PersonaPreset) {
    if (persona?.id === next.id) {
      applyDirectoryFilters({ persona: null });
      return;
    }
    applyDirectoryFilters({ persona: next.id, kind: next.type });
  }

  return (
    <>
      <section className="hero hero--centered">
        <div className="container">
          <div className="hero__copy">
            <p className="eyebrow">За потребители</p>
            <h1>Избираш консултант по съвпадение, тема и наличност.</h1>
            <p className="hero__lede">
              {isConsultantViewer
                ? "Това е потребителският изглед на CareerLane. Подходящите професионалисти за теб се подреждат в профила и таблото ти."
                : persona
                  ? `Каталогът показва ${persona.type === "mentor" ? "ментори" : "консултанти"} за „${persona.name}".`
                  : "Избери архетип по-долу или попълни профила си, за да виждаш по-подходящите експерти."}
            </p>
          </div>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container">
          <div className="persona-grid">
            {personaPresets.map((preset) => {
              const isActive = persona?.id === preset.id;
              return (
                <button
                  className={`persona-card ${isActive ? "persona-card--active" : ""}`}
                  key={preset.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => selectPersona(preset)}
                >
                  <div className="persona-card__head">
                    <span className="persona-card__code" aria-hidden="true">
                      {preset.code}
                    </span>
                    <span className="persona-card__type">
                      {preset.type === "mentor" ? "Ментор" : "Консултант"}
                    </span>
                  </div>
                  <strong>{preset.name}</strong>
                  <p>{preset.description}</p>
                  <div className="chip-row">
                    {preset.tags.slice(0, 3).map((tag) => (
                      <span className="chip chip--soft" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="directory-controls">
            <div className="filter-bar directory-filter-bar">
              <label>
                Ключова дума
                <input
                  value={query}
                  onChange={(event) =>
                    applyPresetQuery(event.target.value)
                  }
                  placeholder="Executive CV, интервю, leadership, кариерна промяна..."
                />
              </label>
              <label>
                Град
                <input
                  value={city}
                  onChange={(event) =>
                    applyDirectoryFilters({ city: event.target.value })
                  }
                  placeholder="София, Берлин, Лондон, Виена"
                />
              </label>
            </div>

            <div className="search-shortcuts directory-switches">
              <span className="search-shortcuts__label">Тип профил</span>
              <div className="search-shortcuts__list">
                {(
                  [
                    { value: "all", label: "Всички" },
                    { value: "consultant", label: "Консултанти" },
                    { value: "mentor", label: "Ментори" }
                  ] as const
                ).map((option) => (
                  <button
                    className={`shortcut-chip ${kind === option.value ? "shortcut-chip--active" : ""}`}
                    key={option.value}
                    type="button"
                    onClick={() =>
                      applyDirectoryFilters({ kind: option.value, persona: null })
                    }
                  >
                    {option.label}
                  </button>
                ))}
                <button
                  className={`shortcut-chip ${topOnly ? "shortcut-chip--active" : ""}`}
                  type="button"
                  onClick={() => applyDirectoryFilters({ topOnly: !topOnly })}
                >
                  Само водещи профили
                </button>
              </div>
            </div>

            {activeFilterLabels.length ? (
              <div className="directory-filter-summary">
                <div className="directory-filter-chips" aria-label="Активни филтри">
                  {activeFilterLabels.map((item) => (
                    <span className="directory-filter-chip" key={item}>
                      {item}
                    </span>
                  ))}
                </div>
                <div className="filter-actions directory-filter-actions">
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => applyDirectoryFilters({ query: "", city: "", kind: "all", topOnly: false, persona: null })}
                    disabled={!hasActiveFilters}
                  >
                    Изчисти филтрите
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {isConsultantViewer ? (
            <div className="panel panel--subtle role-guard-panel">
              <strong>Това е страница за потребители.</strong>
              <Link className="ghost-button" to={profileCtaTo}>
                {user ? "Отвори таблото си" : "Към профила"}
              </Link>
            </div>
          ) : null}

          {loading ? (
            <div className="consultant-grid consultant-grid--directory consultant-grid--loading">
              {[0, 1, 2, 3].map((item) => (
                <ConsultantCardSkeleton key={item} />
              ))}
            </div>
          ) : null}
          {error ? <div className="panel panel--error">{error}</div> : null}

          {!loading && !error && visibleConsultants.length === 0 ? (
            <DirectoryFeedbackState
              tone="empty"
              title="Няма съвпадения за избраните филтри"
              message="Разшири търсенето или изчисти филтрите."
              actionLabel="Изчисти филтрите"
              onAction={() => applyDirectoryFilters({ query: "", city: "", kind: "all", topOnly: false, persona: null })}
            />
          ) : null}

          {!loading && !error && visibleConsultants.length ? (
            <div className="consultant-grid consultant-grid--directory">
              {visibleConsultants.map(({ consultant, match }) => (
                <ConsultantCard
                  key={consultant.consultantId}
                  consultant={consultant}
                  match={match}
                />
              ))}
            </div>
          ) : null}

        </div>
      </section>
    </>
  );
}

export function NotFoundPage() {
  return (
    <section className="section not-found">
      <div className="container not-found__container">
        <p className="not-found__code" aria-hidden="true">404</p>
        <h1>Тази страница не беше намерена.</h1>
        <p className="not-found__lede">
          Възможно е адресът да е променен или страницата вече да не е активна. Опитай
          с някоя от основните секции по-долу.
        </p>
        <div className="not-found__actions">
          <Link className="primary-button" to="/">
            Към началото
          </Link>
          <Link className="ghost-button" to="/users">
            За потребители
          </Link>
          <Link className="ghost-button" to="/contact">
            Контакти
          </Link>
        </div>
      </div>
    </section>
  );
}

export function ConsultantPage() {
  const { slug = "" } = useParams();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const { profile: viewerProfile, loading: viewerProfileLoading } = useViewerProfile();
  const [consultant, setConsultant] = useState<ConsultantProfile | null>(null);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [confirmedBooking, setConfirmedBooking] = useState<{
    slot: string;
    sessionLength: string;
    format: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    api
      .getConsultant(slug)
      .then((value) => {
        if (!mounted) return;
        setConsultant(value);
        setSelectedSlot(getUpcomingAvailabilitySlots(value.availability, 1)[0] || "");
      })
      .catch((value) => {
        if (!mounted) return;
        setError(value instanceof Error ? value.message : "Неуспешно зареждане.");
      });

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!shareMessage) {
      return;
    }

    const timeout = window.setTimeout(() => setShareMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [shareMessage]);

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <div className="panel panel--error">{error}</div>
        </div>
      </section>
    );
  }

  if (!consultant) {
    return (
      <section className="section">
        <div className="container">
          <div className="panel">Зареждаме профила на консултанта...</div>
        </div>
      </section>
    );
  }

  const isConsultantViewer = viewerProfile?.role === "consultant";
  const bookingCtaTo = user ? "/dashboard" : "/auth?tab=register";
  const visibleAvailability = getUpcomingAvailabilitySlots(consultant.availability, 12);
  const availabilityCalendar = groupAvailabilityByDay(visibleAvailability);
  const themeStyle = getConsultantThemeStyle(consultant);
  const hasTheme = hasConsultantTheme(consultant);
  const profileSummary =
    consultant.bio ||
    consultant.experienceSummary ||
    "Профилът все още няма описание на работата.";
  const profileFacts = [
    { label: "Локация", value: getConsultantLocationLabel(consultant) },
    { label: "Формат", value: (consultant.sessionModes || []).join(" · ") },
    { label: "Продължителност", value: getSessionLengthLabel(consultant) },
    { label: "Цена", value: getConsultantPriceLabel(consultant) }
  ].filter((fact) => String(fact.value || "").trim());
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}${import.meta.env.BASE_URL}#/consultants/${consultant.slug}`
      : "";

  const shareProfile = async () => {
    setShareMessage("");

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `${consultant.name} | CareerLane`,
          text: consultant.headline,
          url: shareUrl
        });
        setShareMessage("Профилът беше споделен успешно.");
        return;
      }

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Линкът към профила беше копиран.");
        return;
      }

      setShareMessage("Профилният линк е готов за споделяне.");
    } catch {
      setShareMessage("Споделянето беше прекъснато.");
    }
  };

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setError("");

    if (isConsultantViewer) {
      setError(
        "Консултантските акаунти не резервират други консултанти. В профила и таблото си ще виждаш подходящите професионалисти за твоята практика."
      );
      return;
    }

    if (!selectedSlot || !visibleAvailability.includes(selectedSlot)) {
      setError("Избери свободен час, преди да изпратиш заявката.");
      return;
    }

    const bookingToken = user && token ? token : "";

    if (!bookingToken) {
      navigate(`/auth?redirect=${encodeURIComponent(`/consultants/${consultant.slug}`)}`);
      return;
    }

    try {
      await api.createBooking(bookingToken, {
        consultantId: consultant.consultantId,
        scheduledAt: selectedSlot,
        note: note.trim()
      });
      setConfirmedBooking({
        slot: selectedSlot,
        sessionLength: getSessionLengthLabel(consultant),
        format: consultant.sessionModes.join(" · ")
      });
      setNote("");
      setSelectedSlot("");
      setMessage("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно създаване на заявка.");
    }
  };

  const resetBookingFlow = () => {
    setConfirmedBooking(null);
    setError("");
    setMessage("");
    setSelectedSlot(getUpcomingAvailabilitySlots(consultant.availability, 1)[0] || "");
  };

  return (
    <>
      <section className="profile-hero">
        <div className="container profile-stage">
          <article
            className={`profile-stage__main ${hasTheme ? "profile-stage__main--themed" : ""}`}
            style={themeStyle}
          >
            {consultant.heroUrl ? (
              <CoverMedia
                className="profile-stage__cover"
                src={consultant.heroUrl}
                name={`${consultant.name} банер`}
                eyebrow="Публичен профил"
                title={consultant.name}
                subtitle={consultant.headline}
              />
            ) : null}
            <div className="profile-stage__content">
              <AvatarMedia
                className="profile-stage__avatar"
                src={consultant.avatarUrl}
                name={consultant.name}
              />

              <div className="profile-stage__body">
                <div>
                  {consultant.isExample ? (
                    <ExampleBadge className="profile-stage__example" />
                  ) : null}
                  <h1>{consultant.name}</h1>
                  <p className="profile-stage__headline">{consultant.headline}</p>
                </div>

                <p className="profile-stage__summary">{profileSummary}</p>

                <div className="profile-stage__facts">
                  {profileFacts.map((item) => (
                    <article key={item.label}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </article>
                  ))}
                </div>

                <div className="profile-actions">
                  <Link className="ghost-button" to="/users">
                    Назад към профилите
                  </Link>
                  <button className="ghost-button" type="button" onClick={shareProfile}>
                    Сподели профила
                  </button>
                </div>
                {shareMessage ? <div className="panel panel--success">{shareMessage}</div> : null}
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="section section--tight">
        <div className="container consultant-detail-grid consultant-detail-grid--profile">
          <div className="panel-stack">
            <article className="panel consultant-detail-panel consultant-detail-panel--wide">
              <h2>За консултанта</h2>
              {consultant.bio ? <p>{consultant.bio}</p> : null}
              {consultant.experienceSummary ? (
                <p>{consultant.experienceSummary}</p>
              ) : null}
              {(consultant.experienceHighlights || []).length ? (
                <ul className="feature-list">
                  {(consultant.experienceHighlights || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </article>

            <article className="panel consultant-detail-panel consultant-detail-panel--wide consultant-expertise">
              <h2>Експертиза и фокус</h2>

              {getConsultantIdealFor(consultant).length ? (
                <section className="consultant-expertise__block">
                  <h3>Подходящо за</h3>
                  <div className="chip-row">
                    {getConsultantIdealFor(consultant).map((item) => (
                      <span className="chip chip--soft" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {getConsultationTopics(consultant).length ? (
                <section className="consultant-expertise__block">
                  <h3>Теми на консултацията</h3>
                  <div className="chip-row">
                    {getConsultationTopics(consultant).map((item) => (
                      <span className="chip" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {(consultant.educationHighlights || []).length ? (
                <section className="consultant-expertise__block">
                  <h3>Образование и сертификати</h3>
                  <div className="chip-row">
                    {(consultant.educationHighlights || []).map((item) => (
                      <span className="chip chip--soft" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {(consultant.recentReviews || []).length ? (
                <section className="consultant-expertise__block consultant-reviews">
                  <h3>
                    Отзиви ({consultant.reviewCount}) ·{" "}
                    <span className="rating-pill">{consultant.rating.toFixed(1)}</span>
                  </h3>
                  <ul className="consultant-reviews__list">
                    {(consultant.recentReviews || []).map((review) => (
                      <li key={review.bookingId} className="consultant-reviews__item">
                        <div className="consultant-reviews__head">
                          <strong>{review.clientName}</strong>
                          <span className="consultant-reviews__stars" aria-label={`${review.rating} от 5 звезди`}>
                            {"★".repeat(review.rating)}
                            <span aria-hidden="true">{"☆".repeat(5 - review.rating)}</span>
                          </span>
                        </div>
                        {review.comment ? <p>„{review.comment}"</p> : null}
                        <span className="form-note">{formatDate(review.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </article>
          </div>

          <aside className="profile-aside-stack" aria-label="Информация и резервация">
            <ProfileSnapshotCard consultant={consultant} />
            <ConsultantAdvertisement consultant={consultant} />

          {confirmedBooking ? (
            <div className="panel booking-success" role="status" aria-live="polite">
              <div className="booking-success__badge" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28">
                  <path
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12.5l4.5 4.5L19 7.5"
                  />
                </svg>
              </div>
              <p className="eyebrow">Заявката е изпратена</p>
              <h2>Запазихме часа ти с {consultant.name}</h2>
              <dl className="booking-success__facts">
                <div>
                  <dt>Дата и час</dt>
                  <dd>
                    {formatAvailabilityDayLabel(confirmedBooking.slot)},{" "}
                    {formatAvailabilityTimeLabel(confirmedBooking.slot)}
                  </dd>
                </div>
                <div>
                  <dt>Продължителност</dt>
                  <dd>{confirmedBooking.sessionLength}</dd>
                </div>
                <div>
                  <dt>Формат</dt>
                  <dd>{confirmedBooking.format}</dd>
                </div>
              </dl>
              <p className="booking-success__hint">
                Часът е резервиран и чака потвърждение от консултанта. Изпратихме
                имейл и на двамата — щом{" "}
                {consultant.name} приеме или откаже, ще получиш отделно
                известие. Можеш да следиш статуса от таблото си.
              </p>
              <div className="booking-success__actions">
                <Link className="primary-button" to="/dashboard">
                  Виж резервациите в таблото
                </Link>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={resetBookingFlow}
                  disabled={!visibleAvailability.length}
                >
                  Заяви още един час
                </button>
              </div>
            </div>
          ) : (
          <form className="panel booking-panel" onSubmit={submitBooking}>
            <header className="booking-panel__head">
              <p className="eyebrow">Резервация</p>
              <h2>Избери свободен час</h2>
              <p className="section-caption">
                {getSessionLengthLabel(consultant)} · {consultant.sessionModes.join(" · ")}
              </p>
            </header>

            {visibleAvailability.length ? (
              <div className="availability-calendar" id="availability-calendar">
                {availabilityCalendar.map((day) => (
                  <article className="availability-calendar__day" key={day.key}>
                    <div className="availability-calendar__day-header">
                      <strong>{day.label}</strong>
                      <span>{day.slots.length} часа</span>
                    </div>
                    <div className="availability-calendar__slots">
                      {day.slots.map((slot) => (
                        <button
                          className={`slot-button slot-button--compact ${
                            selectedSlot === slot ? "slot-button--active" : ""
                          }`}
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          aria-pressed={selectedSlot === slot}
                        >
                          {formatAvailabilityTimeLabel(slot)}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="panel panel--subtle">
                <strong>Свободните часове се подготвят.</strong>
                <p>
                  Профилът вече е активен, но консултантът още не е добавил конкретни
                  часове за резервация.
                </p>
              </div>
            )}

            {isConsultantViewer ? (
              <div className="panel panel--subtle role-guard-panel">
                <strong>Тази стъпка е активна за потребители.</strong>
                <p>
                  CareerLane съпоставя консултантите с потребители, а не с други
                  консултанти. Подходящите професионалисти за теб се показват в профила
                  и таблото ти.
                </p>
                <Link className="ghost-button" to={bookingCtaTo}>
                  {user ? "Отвори таблото си" : "Отвори профила си"}
                </Link>
              </div>
            ) : visibleAvailability.length ? (
              <>
                <label>
                  Кратка бележка <span className="form-note">(по избор)</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Какво искаш да обсъдиш в сесията?"
                  />
                </label>

                <div
                  className={`booking-summary ${
                    selectedSlot ? "booking-summary--ready" : ""
                  }`}
                >
                  {selectedSlot ? (
                    <>
                      <span className="booking-summary__label">Избран час</span>
                      <strong>
                        {formatAvailabilityDayLabel(selectedSlot)},{" "}
                        {formatAvailabilityTimeLabel(selectedSlot)}
                      </strong>
                      <span className="booking-summary__hint">
                        {getSessionLengthLabel(consultant)} ·{" "}
                        {getConsultantPriceLabel(consultant)}
                      </span>
                    </>
                  ) : (
                    <span className="booking-summary__hint">
                      Избери час от календара по-горе, за да продължиш.
                    </span>
                  )}
                </div>
              </>
            ) : null}

            {message ? <div className="panel panel--success">{message}</div> : null}
            {error ? <div className="panel panel--error">{error}</div> : null}

            {!isConsultantViewer ? (
              <button
                className="primary-button"
                type="submit"
                disabled={viewerProfileLoading || !visibleAvailability.length || !selectedSlot}
              >
                {!user
                  ? "Влез, за да резервираш"
                  : selectedSlot
                    ? `Заяви ${formatAvailabilityShortLabel(selectedSlot)}`
                    : "Избери час"}
              </button>
            ) : null}
          </form>
          )}
          <HowItWorksCard />
          </aside>
        </div>
      </section>

      <section className="section consultant-page-cta">
        <div className="container">
          <div className="panel consultant-page-cta__card">
            <div>
              <p className="eyebrow">Още опции</p>
              <h2>Разгледай и други {getConsultantTypeLabelPlural(consultant)}</h2>
              <p className="section-caption">
                Сравни фокус, формат и свободни часове, за да избереш правилния човек за
                следващата си стъпка.
              </p>
            </div>
            <div className="consultant-page-cta__actions">
              <Link className="primary-button" to="/users">
                Към всички профили
              </Link>
              <Link className="ghost-button" to="/users?kind=mentor">
                Само ментори
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function getConsultantTypeLabelPlural(consultant: ConsultantProfile) {
  return getConsultantProfileType(consultant) === "mentor" ? "ментори" : "консултанти";
}

function HowItWorksCard() {
  return (
    <section className="panel how-it-works" aria-label="Как работи">
      <p className="eyebrow">Как работи</p>
      <ol className="how-it-works__list">
        <li>
          <div className="how-it-works__step">
            <strong>Избираш час</strong>
            <span>Заявка се изпраща веднага по имейл.</span>
          </div>
        </li>
        <li>
          <div className="how-it-works__step">
            <strong>Консултантът потвърждава</strong>
            <span>Получаваш отделно известие за приемане или отказ.</span>
          </div>
        </li>
        <li>
          <div className="how-it-works__step">
            <strong>Напомняне 24 часа преди</strong>
            <span>И двете страни получават имейл с детайлите.</span>
          </div>
        </li>
      </ol>
    </section>
  );
}

function ConsultantAdvertisement({ consultant }: { consultant: ConsultantProfile }) {
  const asset =
    profileAdvertisementAssets[
      stableIndexFromText(consultant.slug || consultant.consultantId, profileAdvertisementAssets.length)
    ];

  return (
    <aside className="panel profile-ad-card" aria-label="Партньорско съдържание">
      <div className="profile-ad-card__media">
        {asset.type === "video" ? (
          <video
            src={asset.src}
            poster={asset.poster}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img src={asset.src} alt="" loading="lazy" decoding="async" />
        )}
      </div>
      <div className="profile-ad-card__copy">
        <p className="eyebrow">CareerLane Select</p>
        <strong>Подготви следващия си професионален ход.</strong>
        <span>
          Използвай сесията с {consultant.name} за CV, интервю или стратегическо
          позициониране.
        </span>
      </div>
    </aside>
  );
}

function getProviderLabel(key: (typeof socialProviders)[number]["key"]) {
  return socialProviders.find((item) => item.key === key)?.label || key;
}

function scorePasswordStrength(value: string) {
  const length = value.length >= 8;
  const lower = /[a-zа-я]/.test(value);
  const upper = /[A-ZА-Я]/.test(value);
  const digit = /\d/.test(value);
  return { length, lower, upper, digit };
}

export function AuthPage() {
  const {
    configured,
    socialConfigured,
    availableSocialProviders,
    user,
    token,
    loading,
    register: registerWithAuth,
    confirm: confirmWithAuth,
    login: loginWithAuth,
    loginWithProvider,
    requestPasswordReset,
    completePasswordReset
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const resolvedRedirect = resolveAuthRedirectPath(params.get("redirect"));
  const initialTab = params.get("tab") === "register" ? "register" : "login";
  const initialRole = params.get("role") === "consultant" ? "consultant" : "client";
  const isSocialOnboarding = params.get("social") === "1";

  const [screen, setScreen] = useState<AuthScreen>(initialTab);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    code: "",
    newPassword: "",
    role: initialRole as UserRole,
    consultantProfileType: "consultant" as ConsultantProfileType
  });

  useEffect(() => {
    setScreen(initialTab);
    setForm((current) => ({ ...current, role: initialRole as UserRole }));
  }, [initialRole, initialTab]);

  useEffect(() => {
    if (!isSocialOnboarding || !user) {
      return;
    }
    setScreen("register");
    setForm((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: current.email || user.email || ""
    }));
  }, [isSocialOnboarding, user]);

  if (!loading && user && !isSocialOnboarding) {
    return <Navigate to={resolvedRedirect} replace />;
  }

  const activeTab =
    screen === "register" || screen === "confirm" ? "register" : "login";

  const passwordChecks = scorePasswordStrength(form.password);
  const passwordValid =
    passwordChecks.length && passwordChecks.lower && passwordChecks.upper && passwordChecks.digit;

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const canRegister = isSocialOnboarding && user
    ? Boolean(user)
    : Boolean(
        form.name.trim().length >= 2 &&
          emailValid &&
          passwordValid &&
          acceptedTerms
      );

  const headerLabel =
    screen === "register"
      ? form.role === "consultant"
        ? "Създай експертен профил"
        : "Създай профил"
      : screen === "confirm"
        ? "Потвърди регистрацията"
        : screen === "forgot-request"
          ? "Възстанови достъпа"
          : screen === "forgot-confirm"
            ? "Нова парола"
            : "Вход в CareerLane";

  const headerSubtitle =
    screen === "register"
      ? "Минута за регистрация. Профилът се довършва след вход."
      : screen === "confirm"
        ? "Изпратихме 6-значен код на имейла ти."
        : screen === "forgot-request"
          ? "Ще ти изпратим код за нова парола."
          : screen === "forgot-confirm"
            ? "Въведи получения код и нова парола."
            : "Влез с имейл и парола или с външен профил.";

  function clearFeedback() {
    setMessage("");
    setError("");
  }

  function switchScreen(next: AuthScreen) {
    clearFeedback();
    setShowPassword(false);
    setScreen(next);
  }

  async function handleSocialProvider(
    providerKey: (typeof socialProviders)[number]["key"]
  ) {
    clearFeedback();

    if (!socialConfigured) {
      setError("Входът с външен профил все още не е активиран.");
      return;
    }

    const isRegisterFlow = activeTab === "register";

    writePendingBootstrap({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      plan: "free",
      consultantProfileType:
        form.role === "consultant" ? form.consultantProfileType : undefined
    });

    writeSocialAuthIntent({
      provider: providerKey,
      mode: isRegisterFlow ? "register" : "login",
      redirect: resolvedRedirect,
      createdAt: new Date().toISOString()
    });

    try {
      await loginWithProvider(providerKey);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : "Неуспешно пренасочване към външен вход."
      );
    }
  }

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!form.email.trim() || !form.password.trim()) {
      setError("Въведи имейл и парола.");
      return;
    }

    if (!configured) {
      setError("Системата за вход не е конфигурирана.");
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await loginWithAuth(form.email.trim(), form.password.trim());
      const pendingBootstrap = readPendingBootstrap();

      if (
        pendingBootstrap &&
        pendingBootstrap.email.toLowerCase() === form.email.trim().toLowerCase()
      ) {
        await api.bootstrapUser(idToken, pendingBootstrap);
        clearPendingBootstrap();
      }

      navigate(resolvedRedirect);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Неуспешен вход. Провери имейла и паролата."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!canRegister) {
      if (!emailValid) {
        setError("Въведи валиден имейл адрес.");
      } else if (!passwordValid) {
        setError("Паролата трябва да съдържа минимум 8 символа, малка и главна буква и цифра.");
      } else if (!acceptedTerms) {
        setError("Моля, приеми Условията и Политиката за поверителност.");
      } else {
        setError("Попълни име, имейл и парола.");
      }
      return;
    }

    if (isSocialOnboarding && user) {
      if (!token) {
        setError("Подготвяме сесията ти. Опитай отново след миг.");
        return;
      }

      setSubmitting(true);
      try {
        await api.bootstrapUser(token, {
          name: form.name.trim() || user.name,
          email: form.email.trim() || user.email,
          role: form.role,
          plan: "free",
          avatarUrl: user.avatarUrl || "",
          consultantProfileType:
            form.role === "consultant" ? form.consultantProfileType : undefined
        });
        clearPendingBootstrap();
        navigate(resolvedRedirect);
      } catch (value) {
        setError(
          value instanceof Error ? value.message : "Неуспешно довършване на профила."
        );
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!configured) {
      setError("Системата за регистрация не е конфигурирана.");
      return;
    }

    setSubmitting(true);
    try {
      await registerWithAuth({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        role: form.role,
        plan: "free"
      });

      writePendingBootstrap({
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        plan: "free",
        consultantProfileType:
          form.role === "consultant" ? form.consultantProfileType : undefined
      });

      switchScreen("confirm");
      setMessage("Изпратихме код на " + form.email.trim() + ".");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешна регистрация.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!configured) {
      setError("Системата за регистрация не е конфигурирана.");
      return;
    }

    if (!form.code.trim()) {
      setError("Въведи кода от имейла.");
      return;
    }

    if (!form.password.trim()) {
      setError("Не намерихме запазената ти парола. Влез ръчно от таба за вход.");
      switchScreen("login");
      return;
    }

    setSubmitting(true);
    try {
      await confirmWithAuth(form.email.trim(), form.code.trim());
      const idToken = await loginWithAuth(form.email.trim(), form.password.trim());
      const pendingBootstrap = readPendingBootstrap();

      if (
        pendingBootstrap &&
        pendingBootstrap.email.toLowerCase() === form.email.trim().toLowerCase()
      ) {
        await api.bootstrapUser(idToken, pendingBootstrap);
        clearPendingBootstrap();
      }

      navigate(resolvedRedirect);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно потвърждение.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResendCode() {
    clearFeedback();

    if (!form.email.trim() || !form.password.trim()) {
      setError("За да изпратим нов код, върни се в Регистрация и започни отново.");
      return;
    }

    setSubmitting(true);
    try {
      await registerWithAuth({
        name: form.name.trim() || form.email.trim(),
        email: form.email.trim(),
        password: form.password.trim(),
        role: form.role,
        plan: "free"
      });
      setMessage("Изпратихме нов код на " + form.email.trim() + ".");
    } catch (value) {
      setError(
        value instanceof Error ? value.message : "Неуспешно повторно изпращане на код."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetRequest(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!emailValid) {
      setError("Въведи валиден имейл.");
      return;
    }

    if (!configured) {
      setError("Системата за вход не е конфигурирана.");
      return;
    }

    setSubmitting(true);
    try {
      await requestPasswordReset(form.email.trim());
      switchScreen("forgot-confirm");
      setMessage("Изпратихме код на " + form.email.trim() + ".");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно изпращане на код.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordResetConfirm(event: FormEvent) {
    event.preventDefault();
    clearFeedback();

    if (!form.code.trim()) {
      setError("Въведи кода от имейла.");
      return;
    }

    const newPasswordChecks = scorePasswordStrength(form.newPassword);
    if (
      !newPasswordChecks.length ||
      !newPasswordChecks.lower ||
      !newPasswordChecks.upper ||
      !newPasswordChecks.digit
    ) {
      setError("Новата парола трябва да съдържа минимум 8 символа, малка и главна буква и цифра.");
      return;
    }

    if (!configured) {
      setError("Системата за вход не е конфигурирана.");
      return;
    }

    setSubmitting(true);
    try {
      await completePasswordReset(
        form.email.trim(),
        form.code.trim(),
        form.newPassword.trim()
      );
      switchScreen("login");
      setForm((current) => ({ ...current, code: "", newPassword: "", password: "" }));
      setMessage("Паролата е обновена. Влез с новата парола.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно обновяване на паролата.");
    } finally {
      setSubmitting(false);
    }
  }

  const showTabs = screen === "login" || screen === "register";
  const showSocial = (screen === "login" || screen === "register") && !isSocialOnboarding;

  return (
    <section className="section auth-section">
      <div className="container auth-layout auth-layout--single">
        <div className="panel auth-card">
          <header className="auth-card__header">
            <p className="eyebrow">CareerLane</p>
            <h1>{headerLabel}</h1>
            <p className="auth-card__subtitle">{headerSubtitle}</p>
          </header>

          {showTabs ? (
            <div className="tab-row" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "login"}
                className={activeTab === "login" ? "tab-row__active" : ""}
                onClick={() => switchScreen("login")}
              >
                Вход
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "register"}
                className={activeTab === "register" ? "tab-row__active" : ""}
                onClick={() => switchScreen("register")}
              >
                Регистрация
              </button>
            </div>
          ) : null}

          <div role="status" aria-live="polite">
            {message ? <div className="panel panel--success">{message}</div> : null}
          </div>
          <div role="alert" aria-live="assertive">
            {error ? <div className="panel panel--error">{error}</div> : null}
          </div>

          {showSocial ? (
            <div className="social-auth">
              <span className="search-shortcuts__label">или продължи с</span>
              <div className="social-auth__grid">
                {socialProviders.map((provider) => {
                  const isAvailable =
                    socialConfigured && availableSocialProviders.includes(provider.key);
                  return (
                    <button
                      key={provider.key}
                      type="button"
                      className={`social-auth__button ${isAvailable ? "" : "social-auth__button--soon"}`}
                      disabled={!isAvailable || submitting}
                      aria-label={
                        isAvailable
                          ? `Продължи с ${getProviderLabel(provider.key)}`
                          : `${getProviderLabel(provider.key)} — скоро`
                      }
                      onClick={() => {
                        if (!isAvailable) return;
                        void handleSocialProvider(provider.key);
                      }}
                    >
                      <span className="social-auth__button-content">
                        {renderSocialProviderIcon(provider.key)}
                        <span>{provider.label}</span>
                      </span>
                      {!isAvailable ? (
                        <span className="social-auth__soon-tag">Скоро</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {!socialConfigured ? (
                <p className="form-note">
                  Входът с външен профил ще бъде активиран скоро.
                </p>
              ) : null}
            </div>
          ) : null}

          {isSocialOnboarding && user ? (
            <div className="panel panel--subtle">
              <strong>Профилът ти е свързан.</strong>
              <p>
                Избери ролята си и довърши създаването на профила. Останалите детайли можеш
                да добавиш от таблото си.
              </p>
            </div>
          ) : null}

          {screen === "login" ? (
            <form className="form-stack" onSubmit={handleLogin} noValidate>
              <label>
                Имейл
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  required
                  disabled={submitting}
                />
              </label>
              <label className="auth-password-field">
                <span className="auth-password-field__label">
                  Парола
                  <button
                    type="button"
                    className="text-button auth-password-field__toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? "Скрий" : "Покажи"}
                  </button>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, password: event.target.value }))
                  }
                  autoComplete="current-password"
                  placeholder="Въведи паролата си"
                  required
                  disabled={submitting}
                />
              </label>
              <div className="auth-inline-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchScreen("forgot-request")}
                >
                  Забравена парола?
                </button>
              </div>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Влизаме..." : "Вход"}
              </button>
              <p className="auth-card__switch">
                Нямаш акаунт?{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchScreen("register")}
                >
                  Регистрирай се
                </button>
              </p>
            </form>
          ) : null}

          {screen === "register" ? (
            <form className="form-stack auth-register-form" onSubmit={handleRegister} noValidate>
              <fieldset className="auth-onboarding-section">
                <legend>Аз съм</legend>
                <div className="auth-choice-grid">
                  {(Object.entries(authRoleChoices) as Array<
                    [UserRole, (typeof authRoleChoices)[UserRole]]
                  >).map(([role, choice]) => (
                    <button
                      key={role}
                      type="button"
                      aria-pressed={form.role === role}
                      className={`auth-choice-card${
                        form.role === role ? " auth-choice-card--active" : ""
                      }`}
                      onClick={() => {
                        clearFeedback();
                        setForm((current) => ({
                          ...current,
                          role,
                          consultantProfileType:
                            role === "consultant" ? current.consultantProfileType : "consultant"
                        }));
                      }}
                    >
                      <span>{choice.badge}</span>
                      <strong>{choice.title}</strong>
                      <p>{choice.text}</p>
                    </button>
                  ))}
                </div>
              </fieldset>

              {form.role === "consultant" ? (
                <fieldset className="auth-onboarding-section">
                  <legend>Тип публичен профил</legend>
                  <div className="auth-choice-grid auth-choice-grid--compact">
                    {(Object.entries(consultantProfileTypeChoices) as Array<
                      [
                        ConsultantProfileType,
                        (typeof consultantProfileTypeChoices)[ConsultantProfileType]
                      ]
                    >).map(([profileType, choice]) => (
                      <button
                        key={profileType}
                        type="button"
                        aria-pressed={form.consultantProfileType === profileType}
                        className={`auth-choice-card${
                          form.consultantProfileType === profileType
                            ? " auth-choice-card--active"
                            : ""
                        }`}
                        onClick={() => {
                          clearFeedback();
                          setForm((current) => ({
                            ...current,
                            consultantProfileType: profileType
                          }));
                        }}
                      >
                        <strong>{choice.title}</strong>
                        <p>{choice.text}</p>
                      </button>
                    ))}
                  </div>
                  <p className="form-note">
                    Профилите на консултанти и ментори се преглеждат ръчно преди да станат
                    публични в каталога.
                  </p>
                </fieldset>
              ) : null}

              {!isSocialOnboarding ? (
                <>
                  <label>
                    Име и фамилия
                    <input
                      value={form.name}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, name: event.target.value }))
                      }
                      autoComplete="name"
                      placeholder="Например: Елица Маринова"
                      required
                      disabled={submitting}
                    />
                  </label>
                  <label>
                    Имейл
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, email: event.target.value }))
                      }
                      autoComplete="email"
                      inputMode="email"
                      placeholder="name@example.com"
                      required
                      disabled={submitting}
                    />
                  </label>
                  <label className="auth-password-field">
                    <span className="auth-password-field__label">
                      Парола
                      <button
                        type="button"
                        className="text-button auth-password-field__toggle"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-pressed={showPassword}
                        tabIndex={-1}
                      >
                        {showPassword ? "Скрий" : "Покажи"}
                      </button>
                    </span>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, password: event.target.value }))
                      }
                      autoComplete="new-password"
                      placeholder="Минимум 8 символа"
                      minLength={8}
                      required
                      disabled={submitting}
                      aria-describedby="register-password-hints"
                    />
                    {form.password.length > 0 ? (
                      <ul
                        id="register-password-hints"
                        className="password-checklist"
                        aria-label="Изисквания за парола"
                      >
                        <li className={passwordChecks.length ? "is-valid" : ""}>
                          {passwordChecks.length ? "✓" : "·"} 8+ символа
                        </li>
                        <li
                          className={
                            passwordChecks.lower && passwordChecks.upper ? "is-valid" : ""
                          }
                        >
                          {passwordChecks.lower && passwordChecks.upper ? "✓" : "·"} Малка и
                          главна буква
                        </li>
                        <li className={passwordChecks.digit ? "is-valid" : ""}>
                          {passwordChecks.digit ? "✓" : "·"} Цифра
                        </li>
                      </ul>
                    ) : null}
                  </label>
                  <label className="auth-terms">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(event) => setAcceptedTerms(event.target.checked)}
                      disabled={submitting}
                    />
                    <span>
                      Съгласявам се с{" "}
                      <Link to="/terms" target="_blank" rel="noreferrer">
                        Условията за ползване
                      </Link>{" "}
                      и{" "}
                      <Link to="/privacy" target="_blank" rel="noreferrer">
                        Политиката за поверителност
                      </Link>
                      .
                    </span>
                  </label>
                </>
              ) : null}

              <button
                className="primary-button"
                type="submit"
                disabled={submitting || !canRegister}
              >
                {submitting
                  ? "Записваме..."
                  : isSocialOnboarding
                    ? "Запази профила"
                    : "Създай профил"}
              </button>

              {!isSocialOnboarding ? (
                <p className="auth-card__switch">
                  Вече имаш акаунт?{" "}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => switchScreen("login")}
                  >
                    Влез
                  </button>
                </p>
              ) : null}
            </form>
          ) : null}

          {screen === "confirm" ? (
            <form
              className="form-stack auth-state-panel"
              onSubmit={handleConfirm}
              noValidate
            >
              <div className="auth-state-header">
                <h2>Потвърждение</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchScreen("register")}
                >
                  Назад
                </button>
              </div>
              <p className="form-note">
                Изпратихме код на <strong>{form.email}</strong>. Провери и спам папката.
              </p>
              <label>
                Код за потвърждение
                <input
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value }))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  placeholder="6-значен код"
                  maxLength={10}
                  required
                  disabled={submitting}
                  autoFocus
                />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Потвърждаваме..." : "Потвърди и влез"}
              </button>
              <div className="auth-inline-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={submitting}
                  onClick={handleResendCode}
                >
                  Изпрати нов код
                </button>
              </div>
            </form>
          ) : null}

          {screen === "forgot-request" ? (
            <form
              className="form-stack auth-state-panel"
              onSubmit={handlePasswordResetRequest}
              noValidate
            >
              <div className="auth-state-header">
                <h2>Забравена парола</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchScreen("login")}
                >
                  Назад към вход
                </button>
              </div>
              <label>
                Имейл
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@example.com"
                  required
                  disabled={submitting}
                />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Изпращаме..." : "Изпрати код"}
              </button>
            </form>
          ) : null}

          {screen === "forgot-confirm" ? (
            <form
              className="form-stack auth-state-panel"
              onSubmit={handlePasswordResetConfirm}
              noValidate
            >
              <div className="auth-state-header">
                <h2>Нова парола</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchScreen("login")}
                >
                  Назад към вход
                </button>
              </div>
              <p className="form-note">
                Изпратихме код на <strong>{form.email}</strong>.
              </p>
              <label>
                Код
                <input
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value }))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={10}
                  required
                  disabled={submitting}
                />
              </label>
              <label className="auth-password-field">
                <span className="auth-password-field__label">
                  Нова парола
                  <button
                    type="button"
                    className="text-button auth-password-field__toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-pressed={showPassword}
                    tabIndex={-1}
                  >
                    {showPassword ? "Скрий" : "Покажи"}
                  </button>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.newPassword}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                  autoComplete="new-password"
                  placeholder="Минимум 8 символа"
                  minLength={8}
                  required
                  disabled={submitting}
                />
              </label>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? "Запазваме..." : "Запази новата парола"}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function AccountPage() {
  return <Navigate to="/dashboard" replace />;
}

async function fetchProfileWithRetry(token: string) {
  // The dashboard mounts right after register → bootstrap → navigate.
  // Even with strongly-consistent reads on the backend, the API gateway
  // + Lambda cold start window can race the PutItem write. One short
  // retry covers it. Backoff: ~600ms.
  try {
    return await api.getMyProfile(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.toLowerCase().includes("not found")) {
      throw error;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    return api.getMyProfile(token);
  }
}

export function DashboardPage() {
  const { user, token, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [consultantProfile, setConsultantProfile] = useState<ConsultantProfile | null>(null);
  const [directoryConsultants, setDirectoryConsultants] = useState<ConsultantProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [consultantAvailability, setConsultantAvailability] = useState<string[]>([]);
  const [availabilityDate, setAvailabilityDate] = useState(getRelativeDateInputValue(1));
  const [availabilityTime, setAvailabilityTime] = useState("09:00");
  const [patternWeekdays, setPatternWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [patternHours, setPatternHours] = useState<number[]>([10, 14]);
  const [patternWeeksAhead, setPatternWeeksAhead] = useState(4);
  const [activeProfileSection, setActiveProfileSection] = useState("identity");
  const [activeConsultantSection, setActiveConsultantSection] = useState("presentation");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardReloadKey, setDashboardReloadKey] = useState(0);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);
  const [decidingBookingId, setDecidingBookingId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationsBusy, setNotificationsBusy] = useState(false);
  const [reviewModalBooking, setReviewModalBooking] = useState<Booking | null>(null);
  const [rescheduleModalBooking, setRescheduleModalBooking] = useState<Booking | null>(null);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState<
    "export" | "delete" | null
  >(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth?redirect=/dashboard");
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let mounted = true;
    setDashboardLoading(true);
    setError("");

    Promise.all([
      fetchProfileWithRetry(token),
      api.listBookings(token),
      api
        .getMyConsultantProfile(token)
        .then((value) => value)
        .catch(() => null),
      api.listConsultants().catch(() => []),
      api.listMyNotifications(token).catch(() => ({ items: [], unreadCount: 0 }))
    ])
      .then(
        ([
          nextProfile,
          nextBookings,
          nextConsultantProfile,
          nextDirectoryConsultants,
          nextNotifications
        ]) => {
        if (!mounted) {
          return;
        }

        setProfile(nextProfile);
        setBookings(nextBookings);
        setConsultantProfile(nextConsultantProfile);
        setDirectoryConsultants(nextDirectoryConsultants);
        setNotifications(nextNotifications.items || []);
        }
      )
      .catch((value) => {
        if (mounted) {
          setError(value instanceof Error ? value.message : "Неуспешно зареждане на таблото.");
        }
      })
      .finally(() => {
        if (mounted) {
          setDashboardLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [dashboardReloadKey, token]);

  useEffect(() => {
    setConsultantAvailability(getUpcomingAvailabilitySlots(consultantProfile?.availability || []));
  }, [consultantProfile]);

  // NOTE: All hooks (useState/useEffect/useMemo) must live above the early
  // returns below. The Rules of Hooks require a consistent hook count on
  // every render — calling a hook only when `profile` is non-null would
  // make React's internal cursor desync and crash the route.
  const patternPreview = useMemo(
    () =>
      generateAvailabilityPattern({
        weekdays: patternWeekdays,
        hours: patternHours,
        weeksAhead: patternWeeksAhead
      }),
    [patternWeekdays, patternHours, patternWeeksAhead]
  );

  const patternNewSlots = useMemo(
    () => patternPreview.filter((slot) => !consultantAvailability.includes(slot)),
    [patternPreview, consultantAvailability]
  );

  if (loading || !user) {
    return (
      <section className="section">
        <div className="container">
          <DashboardRouteState
            tone="loading"
            title="Проверяваме достъпа."
            description="Зареждаме сесията ти, преди да отворим личното табло."
          />
        </div>
      </section>
    );
  }

  if (dashboardLoading && !profile) {
    return (
      <section className="section">
        <div className="container">
          <DashboardRouteState
            tone="loading"
            title="Зареждаме таблото."
            description="Събираме профила, документите, резервациите и публичната информация в един работен изглед."
          />
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="section">
        <div className="container">
          {error ? (
            <DashboardRouteState
              tone="error"
              title="Не успяхме да заредим таблото."
              description={error}
              actionLabel="Опитай отново"
              onAction={() => setDashboardReloadKey((current) => current + 1)}
            />
          ) : (
            <DashboardRouteState
              tone="loading"
              title="Зареждаме профила."
              description="Подготвяме основната информация за акаунта ти."
            />
          )}
        </div>
      </section>
    );
  }

  async function cancelBookingAction(bookingId: string, role: "consultant" | "client") {
    if (!token || cancellingBookingId) return;
    const confirmLabel =
      role === "consultant"
        ? "Сигурен ли си, че искаш да откажеш тази резервация? Потребителят ще получи известие."
        : "Сигурен ли си, че искаш да откажеш тази резервация?";
    if (typeof window !== "undefined" && !window.confirm(confirmLabel)) {
      return;
    }
    setCancellingBookingId(bookingId);
    setError("");
    setMessage("");
    try {
      const updated = await api.cancelBooking(token, bookingId);
      setBookings((current) =>
        current.map((item) => (item.bookingId === bookingId ? updated : item))
      );
      setMessage(
        role === "consultant"
          ? "Резервацията е отказана. Потребителят е уведомен."
          : "Резервацията е отказана."
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно отказване.");
    } finally {
      setCancellingBookingId(null);
    }
  }

  async function acceptBookingAction(bookingId: string) {
    if (!token || decidingBookingId) return;
    setDecidingBookingId(bookingId);
    setError("");
    setMessage("");
    try {
      const updated = await api.acceptBooking(token, bookingId);
      setBookings((current) =>
        current.map((item) => (item.bookingId === bookingId ? updated : item))
      );
      setMessage("Заявката е приета. Потребителят е уведомен по имейл.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно потвърждение.");
    } finally {
      setDecidingBookingId(null);
    }
  }

  async function declineBookingAction(bookingId: string) {
    if (!token || decidingBookingId) return;
    const reasonRaw =
      typeof window !== "undefined"
        ? window.prompt(
            "Защо отказваш заявката? (по избор — ще бъде показано на потребителя)",
            ""
          )
        : "";
    if (reasonRaw === null) return;
    const reason = String(reasonRaw || "").trim();
    setDecidingBookingId(bookingId);
    setError("");
    setMessage("");
    try {
      const updated = await api.declineBooking(token, bookingId, reason || undefined);
      setBookings((current) =>
        current.map((item) => (item.bookingId === bookingId ? updated : item))
      );
      setMessage("Заявката е отказана. Потребителят е уведомен по имейл.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно отказване на заявката.");
    } finally {
      setDecidingBookingId(null);
    }
  }

  async function submitReviewAction(rating: number, comment: string) {
    if (!token || !reviewModalBooking) return;
    setReviewSubmitting(true);
    setError("");
    setMessage("");
    try {
      const result = await api.submitBookingReview(
        token,
        reviewModalBooking.bookingId,
        rating,
        comment
      );
      setBookings((current) =>
        current.map((item) =>
          item.bookingId === reviewModalBooking.bookingId ? result.booking : item
        )
      );
      setReviewModalBooking(null);
      setMessage("Благодарим за отзива.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно изпращане на отзив.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function rescheduleAction(newScheduledAt: string) {
    if (!token || !rescheduleModalBooking) return;
    setRescheduleSubmitting(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.rescheduleBooking(
        token,
        rescheduleModalBooking.bookingId,
        newScheduledAt
      );
      setBookings((current) =>
        current.map((item) =>
          item.bookingId === rescheduleModalBooking.bookingId ? updated : item
        )
      );
      setRescheduleModalBooking(null);
      setMessage(
        updated.status === "pending"
          ? "Часът е преместен. Консултантът ще трябва да го потвърди отново."
          : "Часът е преместен."
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно преместване.");
    } finally {
      setRescheduleSubmitting(false);
    }
  }

  async function downloadBookingIcs(bookingId: string) {
    if (!token) return;
    setError("");
    try {
      const url = api.bookingIcsUrl(bookingId);
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `careerlane-${bookingId}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно сваляне на .ics файла.");
    }
  }

  async function exportMyDataAction() {
    if (!token || accountActionLoading) return;
    setAccountActionLoading("export");
    setError("");
    setMessage("");
    try {
      const text = await api.exportMyData(token);
      const blob = new Blob([text], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `careerlane-export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setMessage("Свалихме копие на данните ти.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешен експорт.");
    } finally {
      setAccountActionLoading(null);
    }
  }

  async function markNotificationsReadAction() {
    if (!token || notificationsBusy) return;
    setNotificationsBusy(true);
    try {
      await api.markMyNotificationsRead(token);
      setNotifications((current) =>
        current.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно маркиране на известията.");
    } finally {
      setNotificationsBusy(false);
    }
  }

  async function deleteMyAccountAction() {
    if (!token || accountActionLoading) return;
    setAccountActionLoading("delete");
    setError("");
    setMessage("");
    try {
      const result = await api.deleteMyAccount(token);
      setMessage(result.note || "Профилът е насрочен за изтриване.");
      setDeleteConfirmOpen(false);
      await logout();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно изтриване.");
      setAccountActionLoading(null);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formData = new FormData(event.currentTarget);
    const avatarLink = String(formData.get("avatarUrl") || "").trim();
    const avatarFile = formData.get("avatarFile");
    let avatarStorageKey = avatarLink ? "" : profile.avatarStorageKey;
    let avatarUrl = avatarLink || (avatarStorageKey ? "" : profile.avatarUrl || "");

    try {
      if (avatarFile instanceof File && avatarFile.name) {
        const avatarUpload = await api.createUserAvatarUpload(token, avatarFile);
        await uploadFileToSignedUrl(avatarUpload.uploadUrl, avatarFile, "профилната снимка");
        avatarStorageKey = avatarUpload.storageKey;
        avatarUrl = "";
      }

      const updated = await api.updateMyProfile(token, {
        name: String(formData.get("name") || ""),
        avatarUrl,
        avatarStorageKey,
        city: String(formData.get("city") || ""),
        occupation: String(formData.get("occupation") || ""),
        age: Number(formData.get("age") || 0) || null,
        headline: String(formData.get("headline") || ""),
        bio: String(formData.get("bio") || ""),
        experienceSummary: String(formData.get("experienceSummary") || ""),
        experienceHighlights: parseListValue(formData.get("experienceHighlights")),
        educationHighlights: parseListValue(formData.get("educationHighlights")),
        skills: parseListValue(formData.get("skills")),
        interests: parseListValue(formData.get("interests")),
        keywords: parseListValue(formData.get("keywords")),
        goals: String(formData.get("goals") || ""),
        preferredSessionModes: parseListValue(formData.get("preferredSessionModes")),
        plan: profile.plan
      });
      setProfile(updated);
      setMessage("Профилът е записан.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно записване.");
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const file = formData.get("document") as File | null;

    if (!file || !file.name) {
      setError("Избери файл за качване.");
      return;
    }

    const validationError = getDocumentUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if ((profile.documents || []).length >= DOCUMENT_UPLOAD_MAX_COUNT) {
      setError(`Достигна лимита от ${DOCUMENT_UPLOAD_MAX_COUNT} документа.`);
      return;
    }

    try {
      const contentType = file.type || "application/octet-stream";
      const result = await api.createDocumentUpload(token, file);
      await uploadFileToSignedUrl(result.uploadUrl, file, "документа", contentType);

      const doc: UploadedDocument = {
        ...(result.document as UploadedDocument),
        sizeBytes: file.size || undefined
      };

      const updated = await api.updateMyProfile(token, {
        documents: [...(profile.documents || []), doc]
      });

      setProfile(updated);
      setMessage("Документът е качен.");
      formElement.reset();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно качване.");
    }
  }

  async function removeDocument(storageKey: string) {
    if (typeof window !== "undefined" && !window.confirm("Да премахна документа?")) {
      return;
    }
    setError("");
    setMessage("");
    try {
      const isCurrentCv = profile.cvDocument?.storageKey === storageKey;
      const updated = isCurrentCv
        ? await api.updateMyProfile(token, { cvDocument: null })
        : await api.updateMyProfile(token, {
            documents: (profile.documents || []).filter((d) => d.storageKey !== storageKey)
          });
      setProfile(updated);
      setMessage("Документът е премахнат.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно премахване.");
    }
  }

  async function downloadDocument(storageKey: string, fileName: string) {
    if (!token) return;
    setError("");
    setMessage("");
    try {
      const result = await api.getMyDocumentDownloadUrl(token, storageKey);
      const link = document.createElement("a");
      link.href = result.downloadUrl;
      link.download = fileName || "document";
      link.rel = "noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно сваляне на документа.");
    }
  }

  async function updateDocumentSharing(storageKey: string, sharedWithConsultantIds: string[]) {
    setError("");
    setMessage("");
    try {
      const updateSharedIds = (doc: UploadedDocument) =>
        doc.storageKey === storageKey ? { ...doc, sharedWithConsultantIds } : doc;
      const isCurrentCv = profile.cvDocument?.storageKey === storageKey;
      const updated = isCurrentCv
        ? await api.updateMyProfile(token, {
            cvDocument: profile.cvDocument
              ? updateSharedIds(profile.cvDocument)
              : profile.cvDocument
          })
        : await api.updateMyProfile(token, {
            documents: (profile.documents || []).map(updateSharedIds)
          });
      setProfile(updated);
      setMessage("Достъпът до документа е обновен.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно обновяване на споделянето.");
    }
  }

  async function saveConsultantProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const formData = new FormData(event.currentTarget);
      const avatarLink = String(formData.get("avatarUrl") || "").trim();
      const heroLink = String(formData.get("heroUrl") || "").trim();
      const avatarFile = formData.get("avatarFile");
      const heroFile = formData.get("heroFile");
      const availability = getUpcomingAvailabilitySlots(consultantAvailability);
      let avatarStorageKey = avatarLink ? "" : consultantProfile?.avatarStorageKey;
      let heroStorageKey = heroLink ? "" : consultantProfile?.heroStorageKey;
      let avatarUrl = avatarLink || (avatarStorageKey ? "" : consultantProfile?.avatarUrl || "");
      let heroUrl = heroLink || (heroStorageKey ? "" : consultantProfile?.heroUrl || "");

      async function uploadConsultantMedia(
        fileValue: FormDataEntryValue | null,
        kind: ConsultantMediaKind,
        failureLabel: string
      ) {
        if (!(fileValue instanceof File) || !fileValue.name) {
          return null;
        }

        const result = await api.createConsultantMediaUpload(token, fileValue, kind);
        await uploadFileToSignedUrl(result.uploadUrl, fileValue, failureLabel);
        return result;
      }

      const avatarUpload = await uploadConsultantMedia(
        avatarFile,
        "avatar",
        "профилната снимка"
      );
      const heroUpload = await uploadConsultantMedia(
        heroFile,
        "hero",
        "снимката за корицата"
      );

      if (avatarUpload) {
        avatarStorageKey = avatarUpload.storageKey;
        avatarUrl = "";
      }

      if (heroUpload) {
        heroStorageKey = heroUpload.storageKey;
        heroUrl = "";
      }

      const displayName = String(formData.get("displayName") || consultantProfile?.name || "");
      const rawSlug = String(formData.get("slug") || consultantProfile?.slug || "");
      const resolvedSlug = (rawSlug.trim() || slugifyValue(displayName)).trim();

      if (!resolvedSlug || resolvedSlug.length < 3) {
        setError("Линкът към профила (slug) трябва да съдържа поне 3 символа.");
        return;
      }

      const updated = await api.updateMyConsultantProfile(token, {
        slug: resolvedSlug,
        name: displayName,
        profileType: String(
          formData.get("consultantProfileType") || consultantProfile?.profileType || "consultant"
        ) as ConsultantProfileType,
        headline: String(
          formData.get("consultantHeadline") || consultantProfile?.headline || ""
        ),
        bio: String(formData.get("consultantBio") || consultantProfile?.bio || ""),
        experienceSummary: String(
          formData.get("consultantExperienceSummary") || consultantProfile?.experienceSummary || ""
        ),
        experienceHighlights: parseListValue(formData.get("consultantExperienceHighlights")),
        educationHighlights: parseListValue(formData.get("consultantEducationHighlights")),
        city: String(formData.get("consultantCity") || consultantProfile?.city || ""),
        experienceYears: Number(
          formData.get("experienceYears") || consultantProfile?.experienceYears || 0
        ),
        languages: String(formData.get("languages") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        specializations: String(formData.get("specializations") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        sessionModes: String(formData.get("sessionModes") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        tags: String(formData.get("tags") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        avatarUrl,
        heroUrl,
        avatarStorageKey,
        heroStorageKey,
        idealFor: parseListValue(formData.get("idealFor")),
        consultationTopics: parseListValue(formData.get("consultationTopics")),
        workApproach: String(formData.get("workApproach") || ""),
        sessionLengthMinutes: Number(formData.get("sessionLengthMinutes") || 60) || 60,
        availability
      });

      setConsultantProfile(updated);
      setConsultantAvailability(getUpcomingAvailabilitySlots(updated.availability || []));
      setProfile((current) =>
        current
          ? {
              ...current,
              name: updated.name || current.name,
              headline: updated.headline || current.headline,
              city: updated.city || current.city,
              avatarUrl: updated.avatarUrl || current.avatarUrl,
              avatarStorageKey: updated.avatarStorageKey || current.avatarStorageKey
            }
          : current
      );
      setMessage("Консултантският профил е обновен.");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Неуспешно записване.");
    }
  }

  const membershipNote =
    profile.role === "consultant"
      ? "Публичният ти профил, свободните слотове и съвпаденията с професионалисти се управляват оттук."
      : "Профилът, документите и достъпът до кариерни консултанти се управляват оттук.";
  const profileCompletion = getProfileCompletion(profile, consultantProfile);
  const nextBooking = getNextBooking(bookings);
  const consultantNextAvailable =
    profile.role === "consultant"
      ? getUpcomingAvailabilitySlots(consultantAvailability, 1)[0] || consultantProfile?.nextAvailable || ""
      : "";
  const dashboardMatchedConsultants =
    profile.role === "client"
      ? directoryConsultants
          .map((consultant) => ({
            consultant,
            match: getConsultantMatch(profile, consultant)
          }))
          .sort((left, right) => (right.match?.score || 0) - (left.match?.score || 0))
          .slice(0, 3)
      : [];
  const availabilityPresetOptions = [
    buildAvailabilityPreset(1, 9),
    buildAvailabilityPreset(1, 14),
    buildAvailabilityPreset(2, 11),
    buildAvailabilityPreset(3, 16)
  ];
  const firstName = profile.name.split(" ")[0] || profile.name;
  const consultantPublicSlug =
    consultantProfile?.slug || slugifyValue(consultantProfile?.name || profile.name);
  const consultantPublicUrl =
    profile.role === "consultant" && consultantPublicSlug
      ? typeof window !== "undefined"
        ? `${window.location.origin}${import.meta.env.BASE_URL}#/consultants/${consultantPublicSlug}`
        : `/consultants/${consultantPublicSlug}`
      : "";
  const profileSetupSections = [
    {
      id: "identity",
      step: "01",
      label: "Основа",
      title: "Кой си в момента?",
      hint: "Основните данни дават контекст.",
      ready: Boolean(
        profile.name.trim() &&
          (profile.occupation || profile.city || profile.age || profile.avatarUrl || profile.avatarStorageKey)
      )
    },
    {
      id: "direction",
      step: "02",
      label: "Посока",
      title: "Към каква следваща стъпка се движиш?",
      hint: "Заглавие и цел.",
      ready: Boolean((profile.headline || "").trim() || (profile.goals || "").trim())
    },
    {
      id: "experience",
      step: "03",
      label: "Опит",
      title: "Опит и професионален контекст",
      hint: "Кратко, подредено представяне в стил LinkedIn.",
      ready: Boolean(
        (profile.bio || "").trim() ||
          (profile.experienceSummary || "").trim() ||
          (profile.experienceHighlights || []).length ||
          (profile.educationHighlights || []).length
      )
    },
    {
      id: "fit",
      step: "04",
      label: "Съвпадение",
      title: "Умения, теми и предпочитан формат",
      hint: "Това помага на платформата да те свързва по-точно.",
      ready: Boolean(
        (profile.skills || []).length ||
          (profile.interests || []).length ||
          (profile.keywords || []).length ||
          (profile.preferredSessionModes || []).length
      )
    }
  ];
  const consultantSetupSections = [
    {
      id: "presentation",
      step: "01",
      label: "Визия",
      title: "Как изглеждаш публично?",
      hint: "Име, заглавие и снимка.",
      ready: Boolean(
        (consultantProfile?.slug || "").trim() &&
          (consultantProfile?.name || profile.name).trim() &&
          (consultantProfile?.headline || "").trim() &&
          (consultantProfile?.city || "").trim()
      )
    },
    {
      id: "audience",
      step: "02",
      label: "Теми",
      title: "С кого работиш и по какви теми?",
      hint: "Това определя търсенето.",
      ready: Boolean(
        (consultantProfile?.specializations || []).length ||
          (consultantProfile?.consultationTopics || []).length ||
          (consultantProfile?.idealFor || []).length
      )
    },
    {
      id: "practice",
      step: "03",
      label: "Доверие",
      title: "Опит, практика и подход",
      hint: "Това е публичната част, която създава доверие.",
      ready: Boolean(
        (consultantProfile?.bio || "").trim() ||
          (consultantProfile?.experienceSummary || "").trim() ||
          (consultantProfile?.workApproach || "").trim()
      )
    },
    {
      id: "booking",
      step: "04",
      label: "Часове",
      title: "Как и кога могат да те резервират?",
      hint: "Езици, формат и свободни часове.",
      ready: Boolean(
        (consultantProfile?.languages || []).length ||
          (consultantProfile?.sessionModes || []).length ||
          consultantAvailability.length
      )
    }
  ];
  const activeProfileSectionIndex = Math.max(
    0,
    profileSetupSections.findIndex((section) => section.id === activeProfileSection)
  );
  const activeConsultantSectionIndex = Math.max(
    0,
    consultantSetupSections.findIndex((section) => section.id === activeConsultantSection)
  );
  const activeProfileSetup = profileSetupSections[activeProfileSectionIndex];
  const activeConsultantSetup = consultantSetupSections[activeConsultantSectionIndex];

  function addAvailabilitySlot(slot: string) {
    if (!slot) {
      setError("Избери дата и час, за да добавиш свободен слот.");
      return;
    }

    if (new Date(slot).getTime() < Date.now()) {
      setError("Избраният момент вече е минал. Избери час в бъдещето.");
      return;
    }

    setError("");
    setMessage("");
    setConsultantAvailability((current) => getUpcomingAvailabilitySlots([...current, slot]));
  }

  function addManualAvailabilitySlot() {
    addAvailabilitySlot(buildAvailabilitySlot(availabilityDate, availabilityTime));
  }

  function removeAvailabilitySlot(slot: string) {
    setConsultantAvailability((current) => current.filter((item) => item !== slot));
  }

  function addAvailabilitySlots(slots: string[]) {
    if (!slots.length) return;
    setError("");
    setMessage("");
    setConsultantAvailability((current) => {
      const merged = new Set(current);
      for (const slot of slots) merged.add(slot);
      return getUpcomingAvailabilitySlots(Array.from(merged));
    });
  }

  function clearAllAvailability() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Сигурен ли си, че искаш да изтриеш всички свободни часове?")
    ) {
      return;
    }
    setConsultantAvailability([]);
  }

  function togglePatternWeekday(value: number) {
    setPatternWeekdays((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value].sort()
    );
  }

  function togglePatternHour(value: number) {
    setPatternHours((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value].sort((a, b) => a - b)
    );
  }

  function moveProfileSection(direction: -1 | 1) {
    const nextIndex = activeProfileSectionIndex + direction;

    if (nextIndex < 0 || nextIndex >= profileSetupSections.length) {
      return;
    }

    setActiveProfileSection(profileSetupSections[nextIndex].id);
  }

  function moveConsultantSection(direction: -1 | 1) {
    const nextIndex = activeConsultantSectionIndex + direction;

    if (nextIndex < 0 || nextIndex >= consultantSetupSections.length) {
      return;
    }

    setActiveConsultantSection(consultantSetupSections[nextIndex].id);
  }

  function openConsultantAvailabilitySection() {
    setActiveConsultantSection("booking");
    window.setTimeout(() => scrollToDashboardSection("consultant-profile"), 0);
  }

  return (
    <section className="section">
      <div className={`container dashboard-grid dashboard-grid--${profile.role}`}>
        <aside className={`panel dashboard-sidebar dashboard-sidebar--${profile.role}`}>
          <div className="dashboard-sidebar__profile">
            <AvatarMedia
              src={profile.avatarUrl}
              name={profile.name}
              className="dashboard-sidebar__avatar"
            />
            <div className="dashboard-sidebar__identity">
              <p className="eyebrow">Табло</p>
              <strong>{profile.name}</strong>
              <span>
                {profile.headline ||
                  (profile.role === "consultant"
                    ? "Добави headline за публичния си профил"
                    : "Добави headline за по-силно присъствие")}
              </span>
            </div>
          </div>

          <dl className="dashboard-sidebar__stats">
            <div>
              <dt>Завършеност</dt>
              <dd>
                <span>{profileCompletion}%</span>
                <ProfileCompletionMeter value={profileCompletion} compact />
              </dd>
            </div>
            {profile.role === "consultant" ? (
              <div>
                <dt>
                  <button
                    className="dashboard-stat-link"
                    type="button"
                    onClick={openConsultantAvailabilitySection}
                  >
                    Свободни часове
                  </button>
                </dt>
                <dd>{consultantAvailability.length}</dd>
              </div>
            ) : (
              <div>
                <dt>Резервации</dt>
                <dd>
                  {bookings.filter((b) => b.status !== "cancelled").length}
                </dd>
              </div>
            )}
          </dl>

          <nav className="dashboard-sidebar__nav" aria-label="Секции в таблото">
            <button type="button" onClick={() => scrollToDashboardSection("overview")}>
              Преглед
            </button>
            {notifications.length ? (
              <button type="button" onClick={() => scrollToDashboardSection("notifications")}>
                Известия
                {notifications.filter((n) => !n.readAt).length ? (
                  <span className="notifications-panel__badge notifications-panel__badge--inline">
                    {notifications.filter((n) => !n.readAt).length}
                  </span>
                ) : null}
              </button>
            ) : null}
            {profile.role === "consultant" ? (
              <button type="button" onClick={() => scrollToDashboardSection("consultant-profile")}>
                Публичен профил
              </button>
            ) : (
              <button type="button" onClick={() => scrollToDashboardSection("profile-basics")}>
                Основен профил
              </button>
            )}
            <button type="button" onClick={() => scrollToDashboardSection("documents")}>
              Документи
            </button>
            {profile.role !== "consultant" ? (
              <button type="button" onClick={() => scrollToDashboardSection("matches")}>
                Подходящи консултанти
              </button>
            ) : null}
            <button type="button" onClick={() => scrollToDashboardSection("sessions")}>
              Сесии
            </button>
            <button type="button" onClick={() => scrollToDashboardSection("privacy")}>
              Поверителност
            </button>
          </nav>

          <p className="form-note">{membershipNote}</p>
        </aside>

        <div className="dashboard-content">
          <div role="status" aria-live="polite">
            {message ? <div className="panel panel--success">{message}</div> : null}
          </div>
          <div role="alert" aria-live="assertive">
            {error ? <div className="panel panel--error">{error}</div> : null}
          </div>

          {profile.role === "consultant" && consultantProfile ? (
            <ConsultantStatusBanner consultant={consultantProfile} />
          ) : null}

          <section
            className={`panel dashboard-overview dashboard-overview--${profile.role}`}
            id="overview"
          >
            <div className="dashboard-overview__head">
              <div>
                <h2>Добре дошъл, {firstName}.</h2>
                <p className="section-caption">
                  {profileCompletion >= 80
                    ? "Профилът е добре структуриран."
                    : "Допълни секциите по-долу, за да изглежда профилът ти по-пълен."}
                </p>
              </div>
              <Link
                className="primary-button"
                to={
                  profile.role === "consultant" && consultantProfile
                    ? `/consultants/${consultantProfile.slug}`
                    : "/users"
                }
              >
                {profile.role === "consultant" && consultantProfile
                  ? "Виж публичната страница"
                  : "Търси консултант"}
              </Link>
            </div>

            <div className="summary-grid summary-grid--compact">
              <article className="summary-card">
                <span className="plan-pill">Завършеност</span>
                <strong>{profileCompletion}%</strong>
                <ProfileCompletionMeter value={profileCompletion} />
                <p>
                  {profileCompletion >= 80
                    ? "Готово за публикуване."
                    : "Подреди няколко детайла."}
                </p>
              </article>
              {profile.role === "consultant" ? (
                <button
                  className="summary-card summary-card--button"
                  type="button"
                  onClick={openConsultantAvailabilitySection}
                >
                  <span className="plan-pill">Свободни часове</span>
                  <strong>
                    {consultantNextAvailable ? formatDate(consultantNextAvailable) : "Няма добавени"}
                  </strong>
                  <p>
                    {consultantAvailability.length
                      ? `${consultantAvailability.length} активни слота`
                      : "Добави поне няколко часа."}
                  </p>
                </button>
              ) : (
                <article className="summary-card">
                  <span className="plan-pill">Следваща сесия</span>
                  <strong>{nextBooking ? formatDate(nextBooking.scheduledAt) : "Все още няма"}</strong>
                  <p>
                    {nextBooking
                      ? `С ${nextBooking.consultantName}`
                      : "След резервация ще се покаже тук."}
                  </p>
                </article>
              )}
            </div>
          </section>

          {notifications.length ? (
            <NotificationsPanel
              notifications={notifications}
              busy={notificationsBusy}
              onMarkAllRead={markNotificationsReadAction}
            />
          ) : null}

          {profile.role === "client" ? (
            <section className="panel" id="matches">
              <p className="eyebrow">Подходящи консултанти</p>
              <h2>Профили с най-добро съвпадение и видими свободни часове</h2>
              {dashboardMatchedConsultants.length ? (
                <div className="info-grid info-grid--match">
                  {dashboardMatchedConsultants.map(({ consultant, match }) => (
                    <article className="info-card match-card" key={consultant.consultantId}>
                      <div className="match-card__header">
                        <AvatarMedia
                          src={consultant.avatarUrl}
                          name={consultant.name}
                          className="match-card__avatar"
                        />
                        <div className="match-card__content">
                          <span
                            className={match ? "status-badge status-badge--success" : "plan-pill"}
                          >
                            {match ? `${match.score}% съвпадение` : "Профил"}
                          </span>
                          {consultant.isExample ? <ExampleBadge /> : null}
                          <h3>{consultant.name}</h3>
                          <p>{consultant.headline}</p>
                        </div>
                      </div>
                      <p>{match?.note || "Подходящ консултант според профила ти."}</p>
                      <div className="match-card__meta">
                        <span>{getConsultantLocationLabel(consultant)}</span>
                        <span>{getSessionLengthLabel(consultant)}</span>
                        <span>{consultant.sessionModes[0] || "Онлайн"}</span>
                      </div>
                      <div className="match-card__slots">
                        {getUpcomingAvailabilitySlots(consultant.availability, 3).length ? (
                          getUpcomingAvailabilitySlots(consultant.availability, 3).map((slot) => (
                            <span className="chip chip--soft" key={slot}>
                              {formatAvailabilityShortLabel(slot)}
                            </span>
                          ))
                        ) : (
                          <span className="chip chip--soft">Часовете ще се покажат скоро</span>
                        )}
                      </div>
                      <div className="match-card__actions">
                        <Link className="primary-button" to={`/consultants/${consultant.slug}`}>
                          Виж профила
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="panel empty-state">
                  Все още няма активни публични консултанти, които да бъдат предложени според
                  профила ти.
                </div>
              )}
            </section>
          ) : null}

          {profile.role !== "consultant" ? (
          <form className="panel form-stack" id="profile-basics" noValidate onSubmit={saveProfile}>
            <header className="dashboard-form-head">
              <p className="eyebrow">Основен профил</p>
              <h2>Подреди профила си ясно и професионално.</h2>
            </header>
            <div className="profile-setup-shell">
              <div className="profile-setup-shell__header">
                <div>
                  <span className="plan-pill">
                    {activeProfileSectionIndex + 1} от {profileSetupSections.length}
                  </span>
                  <strong>{activeProfileSetup.title}</strong>
                  <p>{activeProfileSetup.hint}</p>
                </div>
                <span
                  className={
                    activeProfileSetup.ready
                      ? "status-badge status-badge--success"
                      : "plan-pill"
                  }
                >
                  {activeProfileSetup.ready ? "Попълнено" : "В процес"}
                </span>
              </div>

              <div
                className="profile-setup-nav"
                aria-label="Секции в основния профил"
                role="tablist"
              >
                {profileSetupSections.map((section) => (
                  <button
                    key={section.id}
                    className={`profile-setup-nav__button ${
                      activeProfileSection === section.id ? "profile-setup-nav__button--active" : ""
                    } ${section.ready ? "profile-setup-nav__button--ready" : ""}`}
                    type="button"
                    role="tab"
                    aria-selected={activeProfileSection === section.id}
                    onClick={() => setActiveProfileSection(section.id)}
                  >
                    <span className="profile-setup-nav__step">{section.step}</span>
                    <span className="profile-setup-nav__label">{section.label}</span>
                  </button>
                ))}
              </div>

              <div className="question-grid question-grid--profile">
                <div
                  className={`profile-setup-panel ${
                    activeProfileSection === "identity" ? "profile-setup-panel--active" : ""
                  }`}
                >
                  <QuestionBlock
                step="01"
                title="Кой си в момента?"
                hint="Основните данни дават контекст."
              >
                <div className="two-column">
                  <label>
                    Качи профилна снимка
                    <input name="avatarFile" type="file" accept="image/*" />
                    <span className="form-note">
                      Профилната снимка се показва в таблото ти и в потребителските изгледи.
                    </span>
                  </label>
                  <label>
                    Външен линк към снимка
                    <input
                      name="avatarUrl"
                      defaultValue={profile.avatarStorageKey ? "" : profile.avatarUrl || ""}
                      placeholder="https://..."
                    />
                    <span className="form-note">
                      Остави празно, ако използваш качен файл.
                    </span>
                  </label>
                </div>
                <div className="media-preview-grid">
                  <article className="media-preview-card">
                    <span className="search-shortcuts__label">Профилна снимка</span>
                    {profile.avatarUrl ? (
                      <AvatarMedia
                        src={profile.avatarUrl}
                        name={profile.name}
                        className="media-preview-card__image"
                      />
                    ) : (
                      <div className="media-preview-card__placeholder">
                        Добави снимка, за да изглежда профилът ти по-пълен и професионален.
                      </div>
                    )}
                  </article>
                </div>
                <div className="two-column">
                  <label>
                    Име
                    <input
                      name="name"
                      defaultValue={profile.name}
                      placeholder="Име и фамилия"
                      required
                    />
                  </label>
                  <label>
                    Имейл
                    <input value={profile.email} readOnly />
                    <span className="form-note">
                      Имейлът идва от входа в акаунта и не се редактира тук.
                    </span>
                  </label>
                </div>
                <div className="three-column">
                  <label>
                    Град
                    <input
                      name="city"
                      defaultValue={profile.city || ""}
                      placeholder="Например: София"
                    />
                  </label>
                  <label>
                    Професия / роля
                    <input
                      name="occupation"
                      defaultValue={profile.occupation || ""}
                      placeholder="Например: Product manager"
                    />
                  </label>
                  <label>
                    Възраст
                    <input
                      name="age"
                      type="number"
                      min="16"
                      defaultValue={profile.age || ""}
                      placeholder="Например: 32"
                    />
                  </label>
                </div>
                <SuggestionPills
                  label="Бърз старт"
                  fieldName="occupation"
                  mode="replace"
                  options={[
                    "Product manager",
                    "Маркетинг специалист",
                    "Software engineer",
                    "HR business partner"
                  ]}
                />
                  </QuestionBlock>
                </div>

                <div
                  className={`profile-setup-panel ${
                    activeProfileSection === "direction" ? "profile-setup-panel--active" : ""
                  }`}
                >
                  <QuestionBlock
                step="02"
                title="Към каква следваща стъпка се движиш?"
                hint="Заглавие и цел."
              >
                <label>
                  Профилно заглавие
                  <input
                    name="headline"
                    defaultValue={profile.headline || ""}
                    placeholder="Например: Product manager в преход към leadership роля"
                    required
                  />
                </label>
                <SuggestionPills
                  label="Примерни посоки"
                  fieldName="headline"
                  mode="replace"
                  options={[
                    "Product manager в преход към leadership роля",
                    "Маркетинг специалист, подготвящ международен преход",
                    "Софтуерен инженер, ориентиран към senior позиции"
                  ]}
                />
                <label>
                  Какво търсиш в момента
                  <textarea
                    name="goals"
                    rows={4}
                    defaultValue={profile.goals || ""}
                    placeholder="Например: Искам помощ с CV, интервю подготовка и смяна на посоката."
                  />
                </label>
                <SuggestionPills
                  label="Често търсени теми"
                  fieldName="goals"
                  mode="replace"
                  options={[
                    "Търся помощ с CV, LinkedIn и интервю подготовка за следващата си роля.",
                    "Искам да подредя стратегия за кариерен преход и по-силно позициониране.",
                    "Търся по-ясна посока за leadership роля и подготовка за разговори с работодатели."
                  ]}
                />
                  </QuestionBlock>
                </div>

                <div
                  className={`profile-setup-panel ${
                    activeProfileSection === "experience" ? "profile-setup-panel--active" : ""
                  }`}
                >
                  <QuestionBlock
                step="03"
                title="Опит и професионален контекст"
                hint="Кратко, подредено представяне в стил LinkedIn."
                wide
              >
                <div className="two-column">
                  <label>
                    Професионално описание
                    <textarea
                      name="bio"
                      rows={5}
                      defaultValue={profile.bio || ""}
                      placeholder="Разкажи накратко за посоката си, опита си и какво търсиш."
                      required
                    />
                  </label>
                  <label>
                    Професионален опит
                    <textarea
                      name="experienceSummary"
                      rows={5}
                      defaultValue={profile.experienceSummary || ""}
                      placeholder="Например: 7 години опит в продуктови екипи, управление на roadmap, растеж на SaaS продукти и работа с международни stakeholders."
                    />
                  </label>
                </div>
                <div className="two-column">
                  <label>
                    Акценти от опита
                    <input
                      name="experienceHighlights"
                      defaultValue={(profile.experienceHighlights || []).join(", ")}
                      placeholder="B2B SaaS, Product strategy, Team leadership"
                    />
                  </label>
                  <label>
                    Образование и сертификати
                    <input
                      name="educationHighlights"
                      defaultValue={(profile.educationHighlights || []).join(", ")}
                      placeholder="MBA, Product School, Google Analytics"
                    />
                  </label>
                </div>
                <SuggestionPills
                  label="Подсказки за тона"
                  fieldName="bio"
                  mode="replace"
                  options={[
                    "Имам няколко години опит в динамична среда и търся по-ясно позициониране за следващата роля.",
                    "Работя в международен контекст и искам по-силен профил за нова кариерна стъпка.",
                    "Искам да представя по-ясно опита си и да подготвя уверен разказ за интервюта и кандидатстване."
                  ]}
                />
                <SuggestionPills
                  label="Акценти от опита"
                  fieldName="experienceHighlights"
                  options={[
                    "Team leadership",
                    "B2B SaaS",
                    "International teams",
                    "Go-to-market"
                  ]}
                />
                <SuggestionPills
                  label="Образование и сертификати"
                  fieldName="educationHighlights"
                  options={[
                    "MBA",
                    "Scrum certification",
                    "Google Analytics",
                    "Product School"
                  ]}
                />
                  </QuestionBlock>
                </div>

                <div
                  className={`profile-setup-panel ${
                    activeProfileSection === "fit" ? "profile-setup-panel--active" : ""
                  }`}
                >
                  <QuestionBlock
                step="04"
                title="Умения, теми и предпочитан формат"
                hint="Това помага на платформата да те свързва по-точно."
              >
                <div className="three-column">
                  <label>
                    Основни умения
                    <input
                      name="skills"
                      defaultValue={(profile.skills || []).join(", ")}
                      placeholder="Stakeholder management, CV writing, Interview prep"
                    />
                  </label>
                  <label>
                    Интереси
                    <input
                      name="interests"
                      defaultValue={(profile.interests || []).join(", ")}
                      placeholder="Leadership roles, international teams, salary negotiation"
                    />
                  </label>
                  <label>
                    Ключови думи
                    <input
                      name="keywords"
                      defaultValue={(profile.keywords || []).join(", ")}
                      placeholder="Product, leadership, career transition"
                    />
                  </label>
                </div>
                <label>
                  Предпочитан формат
                  <input
                    name="preferredSessionModes"
                    defaultValue={(profile.preferredSessionModes || []).join(", ")}
                    placeholder="Онлайн, В офис"
                  />
                </label>
                <SuggestionPills
                  label="Добави умения"
                  fieldName="skills"
                  options={[
                    "Leadership",
                    "Product strategy",
                    "Interview preparation",
                    "CV writing"
                  ]}
                />
                <SuggestionPills
                  label="Добави теми"
                  fieldName="interests"
                  options={[
                    "Leadership roles",
                    "Career transition",
                    "Interview preparation",
                    "Salary negotiation"
                  ]}
                />
                <SuggestionPills
                  label="Добави ключови думи"
                  fieldName="keywords"
                  options={[
                    "Product",
                    "Leadership",
                    "International teams",
                    "Promotion"
                  ]}
                />
                <SuggestionPills
                  label="Предпочитан формат"
                  fieldName="preferredSessionModes"
                  options={["Онлайн", "В офис", "Хибридно"]}
                />
                  </QuestionBlock>
                </div>
              </div>
            </div>
            <div className="question-form__footer question-form__footer--setup">
              <div className="question-form__pager">
                <button
                  className="ghost-button"
                  type="button"
                  disabled={activeProfileSectionIndex === 0}
                  onClick={() => moveProfileSection(-1)}
                >
                  Назад
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  disabled={activeProfileSectionIndex === profileSetupSections.length - 1}
                  onClick={() => moveProfileSection(1)}
                >
                  Напред
                </button>
              </div>
              <p className="form-note">
                Подреденият профил прави търсенето по-ясно и съвпаденията по-полезни.
              </p>
              <button className="primary-button" type="submit">
                Запази
              </button>
            </div>
          </form>
          ) : null}

          <section className="panel form-stack" id="documents">
            <header className="dashboard-form-head">
              <p className="eyebrow">Документи</p>
              <h2>Дръж всички материали на едно място.</h2>
              <p className="section-caption">
                Файловете са лични за акаунта ти. Споделяш конкретен документ само с избран
                консултант или ментор.
              </p>
            </header>

            <div className="documents-zone">
              <form className="documents-upload" onSubmit={uploadDocument}>
                <label className="dashboard-upload-field">
                  <span>Избери файл</span>
                  <input
                    name="document"
                    type="file"
                    accept={DOCUMENT_UPLOAD_ACCEPT}
                    required
                  />
                  <span className="form-note">{DOCUMENT_UPLOAD_FORMAT_LABEL}</span>
                </label>
                <button className="primary-button" type="submit">
                  Качи документ
                </button>
              </form>

              <UserDocumentList
                cvDocument={profile.cvDocument}
                documents={profile.documents || []}
                shareTargets={profile.role === "client" ? directoryConsultants : []}
                onDownload={downloadDocument}
                onRemove={removeDocument}
                onShareChange={updateDocumentSharing}
              />
            </div>
          </section>

          {profile.role === "consultant" ? (
            <form
              className="panel form-stack"
              id="consultant-profile"
              noValidate
              onSubmit={saveConsultantProfile}
            >
              <header className="dashboard-form-head">
                <p className="eyebrow">Публичен профил</p>
                <h2>Подготви страницата, която хората ще намират и резервират.</h2>
              </header>
              <div className="profile-setup-shell">
                <div className="profile-setup-shell__header">
                  <div>
                    <span className="plan-pill">
                      {activeConsultantSectionIndex + 1} от {consultantSetupSections.length}
                    </span>
                    <strong>{activeConsultantSetup.title}</strong>
                    <p>{activeConsultantSetup.hint}</p>
                  </div>
                  <span
                    className={
                      activeConsultantSetup.ready
                        ? "status-badge status-badge--success"
                        : "plan-pill"
                    }
                  >
                    {activeConsultantSetup.ready ? "Попълнено" : "В процес"}
                  </span>
                </div>

                <div
                  className="profile-setup-nav"
                  aria-label="Секции в публичния профил"
                  role="tablist"
                >
                  {consultantSetupSections.map((section) => (
                    <button
                      key={section.id}
                      className={`profile-setup-nav__button ${
                        activeConsultantSection === section.id
                          ? "profile-setup-nav__button--active"
                          : ""
                      } ${section.ready ? "profile-setup-nav__button--ready" : ""}`}
                      type="button"
                      role="tab"
                      aria-selected={activeConsultantSection === section.id}
                      onClick={() => setActiveConsultantSection(section.id)}
                    >
                      <span className="profile-setup-nav__step">{section.step}</span>
                      <span className="profile-setup-nav__label">{section.label}</span>
                    </button>
                  ))}
                </div>

                <div className="question-grid question-grid--profile">
                  <div
                    className={`profile-setup-panel ${
                      activeConsultantSection === "presentation"
                        ? "profile-setup-panel--active"
                        : ""
                    }`}
                  >
                    <QuestionBlock
                  step="01"
                  title="Как изглеждаш публично?"
                  hint="Име, заглавие и снимка."
                >
                  <div className="two-column">
                    <label>
                      Адрес на профила
                      <input
                        name="slug"
                        defaultValue={consultantProfile?.slug || ""}
                        placeholder="ivan-petrov"
                        required
                      />
                      <span className="form-note">
                        Публична страница:{" "}
                        {consultantProfile?.slug
                          ? `/consultants/${consultantProfile.slug}`
                          : "ще се създаде след записване"}
                      </span>
                    </label>
                    <label>
                      Публично име
                      <input
                        name="displayName"
                        defaultValue={consultantProfile?.name || profile.name}
                        required
                      />
                    </label>
                  </div>
                  <div className="three-column">
                    <label>
                      Тип профил
                      <select
                        name="consultantProfileType"
                        defaultValue={consultantProfile?.profileType || "consultant"}
                      >
                        <option value="consultant">Консултант</option>
                        <option value="mentor">Ментор</option>
                      </select>
                    </label>
                    <label>
                      Град
                      <input
                        name="consultantCity"
                        defaultValue={consultantProfile?.city || ""}
                        placeholder="Например: София"
                        required
                      />
                    </label>
                    <label>
                      Години опит
                      <input
                        name="experienceYears"
                        type="number"
                        min="0"
                        defaultValue={consultantProfile?.experienceYears || 1}
                      />
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Качи профилна снимка
                      <input name="avatarFile" type="file" accept="image/*" />
                      <span className="form-note">
                        Основната снимка за каталога, началната страница, таблото и публичния профил.
                      </span>
                    </label>
                    <label>
                      Качи горен банер (по избор)
                      <input name="heroFile" type="file" accept="image/*" />
                      <span className="form-note">
                        Ако не добавиш банер, секцията за корица се скрива и профилът започва директно със снимката и текста.
                      </span>
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Външен линк към профилна снимка
                      <input
                        name="avatarUrl"
                        defaultValue={
                          consultantProfile?.avatarStorageKey ? "" : consultantProfile?.avatarUrl || ""
                        }
                        placeholder="https://..."
                      />
                      <span className="form-note">
                        Остави празно, ако използваш качен файл.
                      </span>
                    </label>
                    <label>
                      Външен линк към горен банер
                      <input
                        name="heroUrl"
                        defaultValue={
                          consultantProfile?.heroStorageKey ? "" : consultantProfile?.heroUrl || ""
                        }
                        placeholder="https://..."
                      />
                      <span className="form-note">
                        Остави празно, ако използваш качен файл.
                      </span>
                    </label>
                  </div>
                  <div className="media-preview-grid">
                    <article className="media-preview-card">
                      <span className="search-shortcuts__label">Профилна снимка</span>
                      <AvatarMedia
                        src={consultantProfile?.avatarUrl}
                        name={consultantProfile?.name || profile.name}
                        className="media-preview-card__image"
                      />
                    </article>
                    {consultantProfile?.heroUrl ? (
                      <article className="media-preview-card">
                        <span className="search-shortcuts__label">Горен банер</span>
                        <CoverMedia
                          src={consultantProfile.heroUrl}
                          name={consultantProfile.name || profile.name}
                          className="media-preview-card__cover"
                          eyebrow="Публичен профил"
                          title={consultantProfile.name || profile.name}
                          subtitle={
                            consultantProfile.headline ||
                            "Банерът персонализира горната част на публичния профил."
                          }
                        />
                      </article>
                    ) : null}
                  </div>
                  <label>
                    Заглавие
                    <input
                      name="consultantHeadline"
                      defaultValue={consultantProfile?.headline || ""}
                      placeholder="Например: Стратег за leadership преходи и executive позициониране"
                      required
                    />
                  </label>
                  <SuggestionPills
                    label="Стартови идеи"
                    fieldName="consultantHeadline"
                    mode="replace"
                    options={[
                      "Консултант за leadership преходи и executive позициониране",
                      "Кариерен консултант за интервю подготовка и професионално представяне",
                      "Консултант по кариерни преходи и международно позициониране"
                    ]}
                  />
                    </QuestionBlock>
                  </div>

                  <div
                    className={`profile-setup-panel ${
                      activeConsultantSection === "audience"
                        ? "profile-setup-panel--active"
                        : ""
                    }`}
                  >
                    <QuestionBlock
                  step="02"
                  title="С кого работиш и по какви теми?"
                  hint="Това определя търсенето."
                >
                  <label>
                    Специализации
                    <input
                      name="specializations"
                      defaultValue={consultantProfile?.specializations.join(", ") || ""}
                      placeholder="Executive CV, интервю подготовка, leadership"
                      required
                    />
                  </label>
                  <label>
                    Основни теми на консултацията
                    <input
                      name="consultationTopics"
                      defaultValue={
                        consultantProfile ? getConsultationTopics(consultantProfile).join(", ") : ""
                      }
                      placeholder="Кариерна стратегия, CV review, interview preparation"
                    />
                  </label>
                  <label>
                    Подходящо за
                    <input
                      name="idealFor"
                      defaultValue={
                        consultantProfile ? getConsultantIdealFor(consultantProfile).join(", ") : ""
                      }
                      placeholder="Mid-senior professionals, leadership roles, career transition"
                    />
                  </label>
                  <SuggestionPills
                    label="Добави специализации"
                    fieldName="specializations"
                    options={[
                      "Executive CV",
                      "Interview preparation",
                      "Leadership",
                      "Career transition"
                    ]}
                  />
                  <SuggestionPills
                    label="Добави теми"
                    fieldName="consultationTopics"
                    options={[
                      "Кариерна стратегия",
                      "LinkedIn позициониране",
                      "Интервю подготовка",
                      "Executive CV"
                    ]}
                  />
                  <SuggestionPills
                    label="Подходящо за"
                    fieldName="idealFor"
                    options={[
                      "Mid-senior professionals",
                      "Leadership moves",
                      "Career transition",
                      "International roles"
                    ]}
                  />
                    </QuestionBlock>
                  </div>

                  <div
                    className={`profile-setup-panel ${
                      activeConsultantSection === "practice" ? "profile-setup-panel--active" : ""
                    }`}
                  >
                    <QuestionBlock
                      step="03"
                      title="Опит, практика и подход"
                      hint="Това е публичната част, която създава доверие."
                      wide
                    >
                  <div className="two-column">
                    <label>
                      Биография
                      <textarea
                        name="consultantBio"
                        rows={5}
                        defaultValue={consultantProfile?.bio || ""}
                        placeholder="Опиши с кого работиш, по какви теми и какъв резултат постигате."
                        required
                      />
                    </label>
                    <label>
                      Опит и практика
                      <textarea
                        name="consultantExperienceSummary"
                        rows={5}
                        defaultValue={consultantProfile?.experienceSummary || ""}
                        placeholder="Например: 10+ години работа с mid-senior и leadership профили, международни компании и стратегически кариерни преходи."
                      />
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Акценти от практиката
                      <input
                        name="consultantExperienceHighlights"
                        defaultValue={(consultantProfile?.experienceHighlights || []).join(", ")}
                        placeholder="Executive search, Leadership coaching, CV positioning"
                      />
                    </label>
                    <label>
                      Образование и сертификати
                      <input
                        name="consultantEducationHighlights"
                        defaultValue={(consultantProfile?.educationHighlights || []).join(", ")}
                        placeholder="ICF certification, MBA, HR specialization"
                      />
                    </label>
                  </div>
                  <label>
                    Работен подход
                    <textarea
                      name="workApproach"
                      rows={4}
                      defaultValue={consultantProfile?.workApproach || ""}
                      placeholder="Например: Първо подреждаме целите, после профила и подготовката."
                    />
                  </label>
                  <SuggestionPills
                    label="Примерен подход"
                    fieldName="workApproach"
                    mode="replace"
                    options={[
                      "Първо подреждаме целта и текущия профил, след това работим върху позиционирането и подготовката за следващата стъпка.",
                      "Работя на етапи: анализ на профила, конкретни насоки и практическа подготовка за разговори и кандидатстване.",
                      "Всяка консултация започва с ясен контекст и завършва с конкретен план за действие."
                    ]}
                  />
                  <SuggestionPills
                    label="Акценти от практиката"
                    fieldName="consultantExperienceHighlights"
                    options={[
                      "Executive positioning",
                      "Interview preparation",
                      "Leadership coaching",
                      "Career transitions"
                    ]}
                  />
                  <SuggestionPills
                    label="Образование и сертификати"
                    fieldName="consultantEducationHighlights"
                    options={[
                      "ICF certification",
                      "MBA",
                      "Psychology background",
                      "HR specialization"
                    ]}
                  />
                    </QuestionBlock>
                  </div>

                  <div
                    className={`profile-setup-panel ${
                      activeConsultantSection === "booking" ? "profile-setup-panel--active" : ""
                    }`}
                  >
                    <QuestionBlock
                  step="04"
                  title="Как и кога могат да те резервират?"
                  hint="Езици, формат и свободни часове."
                >
                  <div className="two-column">
                    <label>
                      Езици
                      <input
                        name="languages"
                        defaultValue={consultantProfile?.languages.join(", ") || ""}
                        placeholder="Български, English"
                        required
                      />
                    </label>
                    <label>
                      Формати на работа
                      <input
                        name="sessionModes"
                        defaultValue={consultantProfile?.sessionModes.join(", ") || ""}
                        placeholder="Онлайн, В офис"
                      />
                    </label>
                  </div>
                  <div className="two-column">
                    <label>
                      Тагове
                      <input
                        name="tags"
                        defaultValue={consultantProfile?.tags.join(", ") || ""}
                        placeholder="Leadership, Product, Promotions"
                      />
                    </label>
                    <label>
                      Продължителност на сесия
                      <input
                        name="sessionLengthMinutes"
                        type="number"
                        min="30"
                        step="15"
                        defaultValue={consultantProfile?.sessionLengthMinutes || 60}
                      />
                    </label>
                  </div>
                  <input
                    name="availability"
                    type="hidden"
                    value={consultantAvailability.join("\n")}
                    readOnly
                  />
                  <div className="availability-composer">
                    <div className="availability-composer__header">
                      <div>
                        <strong>Свободни часове</strong>
                        <p>
                          Избери дни и часове наведнъж — пиши седмичен график вместо да добавяш по
                          един слот.
                        </p>
                      </div>
                      <span
                        className={
                          consultantAvailability.length
                            ? "status-badge status-badge--success"
                            : "plan-pill"
                        }
                      >
                        {consultantAvailability.length
                          ? `${consultantAvailability.length} активни`
                          : "Няма слотове"}
                      </span>
                    </div>

                    <div className="availability-pattern">
                      <div className="availability-pattern__row">
                        <span className="availability-pattern__label">Дни от седмицата</span>
                        <div className="availability-pattern__chips">
                          {AVAILABILITY_WEEKDAYS.map((day) => {
                            const active = patternWeekdays.includes(day.value);
                            return (
                              <button
                                key={day.value}
                                type="button"
                                className={`pattern-chip ${active ? "pattern-chip--active" : ""}`}
                                onClick={() => togglePatternWeekday(day.value)}
                                aria-pressed={active}
                              >
                                {day.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="availability-pattern__row">
                        <span className="availability-pattern__label">Часове</span>
                        <div className="availability-pattern__chips">
                          {AVAILABILITY_HOURS.map((hour) => {
                            const active = patternHours.includes(hour);
                            return (
                              <button
                                key={hour}
                                type="button"
                                className={`pattern-chip ${active ? "pattern-chip--active" : ""}`}
                                onClick={() => togglePatternHour(hour)}
                                aria-pressed={active}
                              >
                                {String(hour).padStart(2, "0")}:00
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="availability-pattern__row availability-pattern__row--inline">
                        <label className="availability-pattern__weeks">
                          За колко седмици напред
                          <select
                            value={patternWeeksAhead}
                            onChange={(event) =>
                              setPatternWeeksAhead(Number(event.target.value))
                            }
                          >
                            {[1, 2, 4, 6, 8, 12].map((n) => (
                              <option key={n} value={n}>
                                {n} {n === 1 ? "седмица" : "седмици"}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="availability-pattern__summary">
                          <strong>
                            {patternPreview.length} слота · {patternNewSlots.length} нови
                          </strong>
                          <p className="form-note">
                            Само бъдещи часове. Дубликатите се пропускат автоматично.
                          </p>
                        </div>
                      </div>

                      <div className="availability-pattern__actions">
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => addAvailabilitySlots(patternPreview)}
                          disabled={!patternNewSlots.length}
                        >
                          Добави {patternNewSlots.length} нови слота
                        </button>
                        {consultantAvailability.length ? (
                          <button
                            className="ghost-button ghost-button--danger"
                            type="button"
                            onClick={clearAllAvailability}
                          >
                            Изчисти всички
                          </button>
                        ) : null}
                      </div>
                    </div>

                    <details className="availability-single">
                      <summary>Добави един час ръчно</summary>
                      <div className="availability-composer__controls">
                        <label>
                          Дата
                          <input
                            type="date"
                            value={availabilityDate}
                            min={getRelativeDateInputValue(0)}
                            onChange={(event) => setAvailabilityDate(event.target.value)}
                          />
                        </label>
                        <label>
                          Час
                          <input
                            type="time"
                            value={availabilityTime}
                            onChange={(event) => setAvailabilityTime(event.target.value)}
                          />
                        </label>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={addManualAvailabilitySlot}
                        >
                          Добави слот
                        </button>
                      </div>
                      <div className="answer-suggestions">
                        <span className="answer-suggestions__label">Бързи предложения</span>
                        <div className="answer-suggestions__grid">
                          {availabilityPresetOptions.map((option) => (
                            <button
                              className="suggestion-pill"
                              key={option.value}
                              type="button"
                              onClick={() => addAvailabilitySlot(option.value)}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </details>

                    {consultantAvailability.length ? (
                      <div className="availability-saved">
                        <div className="availability-saved__head">
                          <strong>Запазени свободни часове</strong>
                          <span>{consultantAvailability.length} общо</span>
                        </div>
                        <div className="availability-list availability-list--saved">
                          {consultantAvailability.map((slot) => (
                            <article className="availability-item" key={slot}>
                              <div>
                                <strong>{formatAvailabilityDayLabel(slot)}</strong>
                                <p>{formatAvailabilityTimeLabel(slot)}</p>
                              </div>
                              <button
                                className="text-button"
                                type="button"
                                onClick={() => removeAvailabilitySlot(slot)}
                              >
                                Премахни
                              </button>
                            </article>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="panel panel--subtle">
                        <strong>Все още няма свободни часове.</strong>
                        <p>
                          Добави поне няколко слота за следващите дни, за да могат хората
                          да изпращат заявки директно през профила ти.
                        </p>
                      </div>
                    )}
                  </div>
                    </QuestionBlock>
                  </div>
                </div>
              </div>
              <div className="question-form__footer question-form__footer--setup">
                <div className="question-form__pager">
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={activeConsultantSectionIndex === 0}
                    onClick={() => moveConsultantSection(-1)}
                  >
                    Назад
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={
                      activeConsultantSectionIndex === consultantSetupSections.length - 1
                    }
                    onClick={() => moveConsultantSection(1)}
                  >
                    Напред
                  </button>
                </div>
                <p className="form-note">
                  Подреденият профил и свободните часове правят резервацията по-лесна.
                </p>
                <button className="primary-button" type="submit">
                  Запази профила
                </button>
              </div>
            </form>
          ) : null}

          {(() => {
            const consultantView = profile.role === "consultant";
            const now = Date.now();
            const sortedAsc = [...bookings].sort(
              (left, right) =>
                new Date(left.scheduledAt).getTime() -
                new Date(right.scheduledAt).getTime()
            );
            const upcoming = sortedAsc.filter(
              (item) =>
                item.status !== "cancelled" &&
                new Date(item.scheduledAt).getTime() >= now
            );
            const pastOrCancelled = [...bookings]
              .filter(
                (item) =>
                  item.status === "cancelled" ||
                  new Date(item.scheduledAt).getTime() < now
              )
              .sort(
                (left, right) =>
                  new Date(right.scheduledAt).getTime() -
                  new Date(left.scheduledAt).getTime()
              );

            const renderBookingItem = (booking: Booking) => {
              const isPending = booking.status === "pending";
              const isConfirmed = booking.status === "confirmed";
              const isCancelled = booking.status === "cancelled";
              const isDeclined = booking.status === "declined";
              const startMs = new Date(booking.scheduledAt).getTime();
              const isPast = startMs < now;
              // Prefer the snapshot stored on the booking; fall back to the
              // logged-in consultant's profile (for legacy bookings created
              // before the snapshot was introduced). Default to 60 if both
              // are missing.
              const sessionLengthMinutes =
                booking.sessionLengthMinutes ||
                consultantProfile?.sessionLengthMinutes ||
                60;
              const sessionLengthMs = sessionLengthMinutes * 60 * 1000;
              const sessionEndMs = startMs + sessionLengthMs;
              const sessionEnded = sessionEndMs < now;
              const REVIEW_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
              const reviewWindowOpen =
                isConfirmed && sessionEnded && now - sessionEndMs <= REVIEW_WINDOW_MS;
              const canCancel = (isPending || isConfirmed) && !isPast;
              const canReschedule = (isPending || isConfirmed) && !isPast;
              const canDecide = consultantView && isPending && !isPast;
              const canDownloadIcs = isConfirmed && !isPast;
              const canReview =
                !consultantView && reviewWindowOpen && !booking.review;
              const reviewPendingHint =
                !consultantView && isConfirmed && !sessionEnded && !booking.review;
              const reviewExpiredHint =
                !consultantView &&
                isConfirmed &&
                sessionEnded &&
                !booking.review &&
                now - sessionEndMs > REVIEW_WINDOW_MS;
              const isDeciding = decidingBookingId === booking.bookingId;
              return (
                <article className="booking-item" key={booking.bookingId}>
                  <div className="booking-item__main">
                    <strong>
                      {consultantView
                        ? booking.clientName || "Потребител"
                        : booking.consultantName}
                    </strong>
                    <p>{formatDate(booking.scheduledAt)}</p>
                    {consultantView && booking.clientEmail ? (
                      <p className="form-note">{booking.clientEmail}</p>
                    ) : null}
                    {booking.note ? (
                      <p className="booking-item__note">„{booking.note}"</p>
                    ) : null}
                    {isDeclined && booking.declineReason ? (
                      <p className="form-note">Причина: {booking.declineReason}</p>
                    ) : null}
                    {isCancelled && booking.cancelledBy ? (
                      <p className="form-note">
                        {booking.cancelledBy === "consultant"
                          ? "Отказана от консултанта"
                          : "Отказана от потребителя"}
                      </p>
                    ) : null}
                    {booking.review ? (
                      <p className="form-note">
                        Отзив: {"★".repeat(booking.review.rating)}
                        {"☆".repeat(5 - booking.review.rating)}
                        {booking.review.comment ? ` — „${booking.review.comment}"` : ""}
                      </p>
                    ) : null}
                    {reviewPendingHint ? (
                      <p className="form-note">
                        Възможност за отзив след {formatDate(new Date(sessionEndMs).toISOString())}.
                      </p>
                    ) : null}
                    {reviewExpiredHint ? (
                      <p className="form-note">
                        Срокът за отзив е изтекъл (60 дни след сесията).
                      </p>
                    ) : null}
                    {consultantView && (booking.clientSharedDocuments || []).length ? (
                      <div className="booking-shared-documents">
                        <strong>Документи, споделени от потребителя</strong>
                        <div className="booking-shared-documents__list">
                          {(booking.clientSharedDocuments || []).map((doc) => (
                            <a
                              className="ghost-button"
                              href={doc.downloadUrl}
                              target="_blank"
                              rel="noreferrer"
                              key={doc.storageKey}
                            >
                              {doc.fileName}
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="booking-item__actions">
                    <span className={`status-badge status-badge--${booking.status}`}>
                      {formatBookingStatusLabel(booking.status)}
                    </span>
                    {canDecide ? (
                      <>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={isDeciding}
                          onClick={() => acceptBookingAction(booking.bookingId)}
                        >
                          {isDeciding ? "Записваме..." : "Приеми"}
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          disabled={isDeciding}
                          onClick={() => declineBookingAction(booking.bookingId)}
                        >
                          Откажи
                        </button>
                      </>
                    ) : null}
                    {canReschedule ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => setRescheduleModalBooking(booking)}
                      >
                        Премести часа
                      </button>
                    ) : null}
                    {canDownloadIcs ? (
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => downloadBookingIcs(booking.bookingId)}
                      >
                        Добави в календара
                      </button>
                    ) : null}
                    {canReview ? (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => setReviewModalBooking(booking)}
                      >
                        Остави отзив
                      </button>
                    ) : null}
                    {!canDecide && canCancel ? (
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={cancellingBookingId === booking.bookingId}
                        onClick={() =>
                          cancelBookingAction(
                            booking.bookingId,
                            consultantView ? "consultant" : "client"
                          )
                        }
                      >
                        {cancellingBookingId === booking.bookingId
                          ? "Отказваме..."
                          : consultantView
                            ? "Откажи"
                            : "Откажи резервацията"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            };

            return (
              <section className="panel" id="sessions">
                <header className="dashboard-bookings__head">
                  <div>
                    <h2>Предстоящи сесии</h2>
                    <p className="section-caption">
                      Всички заявки и потвърдени срещи са събрани тук.
                    </p>
                  </div>
                  {bookings.length ? (
                    <span className="dashboard-bookings__count">
                      {upcoming.length} предстоящи · {pastOrCancelled.length} архив
                    </span>
                  ) : null}
                </header>

                {bookings.length === 0 ? (
                  <DashboardEmptyState
                    title={
                      consultantView
                        ? "Все още няма заявки към профила ти."
                        : "Все още нямаш предстоящи консултации."
                    }
                    description={
                      consultantView
                        ? "Когато потребител изпрати заявка за свободен час, тя ще се появи тук със статус и дата."
                        : "След като избереш консултант или ментор и изпратиш заявка, срещата ще се показва в този списък."
                    }
                    actionLabel={
                      consultantView
                        ? "Виж публичните профили"
                        : "Разгледай консултантите"
                    }
                    actionTo="/users"
                  />
                ) : (
                  <div className="dashboard-bookings">
                    <section className="dashboard-bookings__group">
                      <header className="dashboard-bookings__group-head">
                        <h3>Предстоящи</h3>
                        <span>{upcoming.length}</span>
                      </header>
                      {upcoming.length ? (
                        <div className="booking-list">
                          {upcoming.map(renderBookingItem)}
                        </div>
                      ) : (
                        <p className="dashboard-bookings__empty">
                          {consultantView
                            ? "Няма предстоящи заявки. Добавянето на свободни часове ще ти помогне."
                            : "Няма предстоящи срещи. Прегледай каталога и заяви час."}
                        </p>
                      )}
                    </section>

                    {pastOrCancelled.length ? (
                      <section className="dashboard-bookings__group dashboard-bookings__group--archive">
                        <header className="dashboard-bookings__group-head">
                          <h3>Архив</h3>
                          <span>{pastOrCancelled.length}</span>
                        </header>
                        <div className="booking-list">
                          {pastOrCancelled.map(renderBookingItem)}
                        </div>
                      </section>
                    ) : null}
                  </div>
                )}
              </section>
            );
          })()}

          <section className="panel form-stack" id="privacy">
            <header className="dashboard-form-head">
              <p className="eyebrow">Поверителност</p>
              <h2>Контрол върху твоите данни.</h2>
            </header>
            <div className="privacy-actions">
              <div>
                <strong>Свали копие на данните си</strong>
                <p className="form-note">
                  Получаваш JSON файл с профила, резервациите и метаданните за качените документи.
                </p>
              </div>
              <button
                className="ghost-button"
                type="button"
                onClick={exportMyDataAction}
                disabled={accountActionLoading !== null}
              >
                {accountActionLoading === "export" ? "Подготвяме..." : "Свали данните"}
              </button>
            </div>
            <div className="privacy-actions privacy-actions--danger">
              <div>
                <strong>Изтрий профила</strong>
                <p className="form-note">
                  Профилът ти, файловете ти и публичният консултантски профил (ако има) ще бъдат
                  премахнати. Резервациите се запазват анонимизирани, за да остане историята на
                  консултантите.
                </p>
              </div>
              <button
                className="ghost-button ghost-button--danger"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={accountActionLoading !== null}
              >
                {accountActionLoading === "delete" ? "Насрочваме..." : "Изтрий профила ми"}
              </button>
            </div>
          </section>
        </div>
      </div>

      {reviewModalBooking ? (
        <ReviewModal
          booking={reviewModalBooking}
          submitting={reviewSubmitting}
          onClose={() => setReviewModalBooking(null)}
          onSubmit={submitReviewAction}
        />
      ) : null}
      {rescheduleModalBooking ? (
        <RescheduleModal
          booking={rescheduleModalBooking}
          consultant={consultantProfile}
          dashboardMatchedConsultants={dashboardMatchedConsultants}
          submitting={rescheduleSubmitting}
          onClose={() => setRescheduleModalBooking(null)}
          onSubmit={rescheduleAction}
        />
      ) : null}
      {deleteConfirmOpen ? (
        <DeleteProfileModal
          submitting={accountActionLoading === "delete"}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={deleteMyAccountAction}
        />
      ) : null}
    </section>
  );
}

const NOTIFICATION_ICONS: Record<NotificationItem["type"], string> = {
  booking_requested: "📨",
  booking_accepted: "✅",
  booking_declined: "↩️",
  booking_cancelled: "⛔",
  booking_rescheduled: "🔁",
  booking_reminder: "⏰",
  review_received: "⭐"
};

function formatRelativeBg(iso: string) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diffSec = Math.round((Date.now() - then) / 1000);
  if (diffSec < 60) return "току-що";
  if (diffSec < 3600) return `преди ${Math.round(diffSec / 60)} мин`;
  if (diffSec < 86400) return `преди ${Math.round(diffSec / 3600)} ч`;
  if (diffSec < 7 * 86400) return `преди ${Math.round(diffSec / 86400)} дни`;
  return formatDate(iso);
}

function NotificationsPanel({
  notifications,
  busy,
  onMarkAllRead
}: {
  notifications: NotificationItem[];
  busy: boolean;
  onMarkAllRead: () => void | Promise<void>;
}) {
  const sorted = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const unreadCount = sorted.filter((n) => !n.readAt).length;
  const visible = sorted.slice(0, 10);

  return (
    <section className="panel notifications-panel" id="notifications">
      <header className="notifications-panel__head">
        <div>
          <p className="eyebrow">Известия</p>
          <h2>
            Какво се случи скоро{" "}
            {unreadCount ? (
              <span className="notifications-panel__badge">{unreadCount}</span>
            ) : null}
          </h2>
        </div>
        {unreadCount ? (
          <button
            className="ghost-button"
            type="button"
            onClick={() => onMarkAllRead()}
            disabled={busy}
          >
            {busy ? "Маркираме..." : "Маркирай като прочетени"}
          </button>
        ) : null}
      </header>
      <ul className="notifications-list" aria-label="Списък с известия">
        {visible.map((n) => (
          <li
            key={n.id}
            className={`notifications-item ${n.readAt ? "" : "notifications-item--unread"}`}
          >
            <span className="notifications-item__icon" aria-hidden="true">
              {NOTIFICATION_ICONS[n.type] || "🔔"}
            </span>
            <div className="notifications-item__body">
              <strong>{n.title}</strong>
              <p>{n.body}</p>
              <span className="form-note">{formatRelativeBg(n.createdAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteProfileModal({
  submitting,
  onClose,
  onConfirm
}: {
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [acknowledgedPrivateData, setAcknowledgedPrivateData] = useState(false);
  const [acknowledgedSchedule, setAcknowledgedSchedule] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const canConfirm =
    acknowledgedPrivateData &&
    acknowledgedSchedule &&
    confirmationText.trim().toUpperCase() === "ИЗТРИЙ";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card delete-profile-modal">
        <header className="modal-card__head">
          <p className="eyebrow">Изтриване на профил</p>
          <h2>Насрочване на автоматично изтриване</h2>
          <p className="section-caption">
            Публичният профил се скрива веднага. Файловете и данните се изтриват
            автоматично след 7 дни.
          </p>
        </header>
        <div className="delete-profile-modal__checks">
          <label>
            <input
              type="checkbox"
              checked={acknowledgedPrivateData}
              onChange={(event) => setAcknowledgedPrivateData(event.target.checked)}
            />
            Разбирам, че качените файлове и профилните данни ще бъдат премахнати.
          </label>
          <label>
            <input
              type="checkbox"
              checked={acknowledgedSchedule}
              onChange={(event) => setAcknowledgedSchedule(event.target.checked)}
            />
            Разбирам, че резервациите се запазват само като анонимизирана история.
          </label>
        </div>
        <label>
          Напиши ИЗТРИЙ, за да потвърдиш
          <input
            value={confirmationText}
            onChange={(event) => setConfirmationText(event.target.value)}
            placeholder="ИЗТРИЙ"
          />
        </label>
        <div className="modal-card__actions">
          <button className="ghost-button" type="button" onClick={onClose} disabled={submitting}>
            Назад
          </button>
          <button
            className="ghost-button ghost-button--danger"
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm || submitting}
          >
            {submitting ? "Насрочваме..." : "Насрочи изтриване"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileSnapshotCard({ consultant }: { consultant: ConsultantProfile }) {
  const ratingValue = consultant.reviewCount
    ? (consultant.rating || 0).toFixed(1)
    : null;
  const topSpecializations = (consultant.specializations || []).slice(0, 3);
  const languages = (consultant.languages || []).filter((l) => String(l || "").trim());
  const sessionModes = (consultant.sessionModes || []).filter((s) => String(s || "").trim());
  // Hide stats with no value entirely instead of rendering empty <dd> rows
  // next to labels. Empty arrays are truthy in JS so we have to length-check.
  const stats: Array<{ label: string; value: string }> = [];
  if (Number(consultant.experienceYears) > 0) {
    stats.push({ label: "Опит", value: `${consultant.experienceYears} години` });
  }
  if (languages.length) {
    stats.push({ label: "Езици", value: languages.join(" · ") });
  }
  if (Number(consultant.priceBgn) > 0) {
    stats.push({ label: "Цена", value: `от ${consultant.priceBgn} лв` });
  }
  if (sessionModes.length) {
    stats.push({ label: "Формат", value: sessionModes.join(" · ") });
  }

  return (
    <section className="panel profile-snapshot" aria-label="Преглед">
      <header className="profile-snapshot__head">
        <span className="eyebrow">Бърз профил</span>
        {ratingValue ? (
          <span className="profile-snapshot__rating">
            <span aria-hidden="true">★</span> {ratingValue}
            <span className="form-note"> · {consultant.reviewCount} отзива</span>
          </span>
        ) : (
          <span className="plan-pill">Нов профил</span>
        )}
      </header>

      {stats.length ? (
        <dl className="profile-snapshot__stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd>{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {topSpecializations.length ? (
        <div className="profile-snapshot__tags">
          {topSpecializations.map((item) => (
            <span className="chip chip--soft" key={item}>
              {item}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ReviewModal({
  booking,
  submitting,
  onClose,
  onSubmit
}: {
  booking: Booking;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
}) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__head">
          <p className="eyebrow">Отзив</p>
          <h2>Оцени сесията с {booking.consultantName}</h2>
        </header>
        <div className="rating-input" role="radiogroup" aria-label="Оценка">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              className={`rating-input__star ${
                rating >= value ? "rating-input__star--active" : ""
              }`}
              onClick={() => setRating(value)}
              aria-checked={rating === value}
              role="radio"
              aria-label={`${value} ${value === 1 ? "звезда" : "звезди"}`}
            >
              {rating >= value ? "★" : "☆"}
            </button>
          ))}
        </div>
        <label>
          Коментар <span className="form-note">(по избор)</span>
          <textarea
            rows={4}
            value={comment}
            maxLength={600}
            placeholder="Какво беше полезно в сесията?"
            onChange={(event) => setComment(event.target.value)}
          />
        </label>
        <div className="modal-card__actions">
          <button
            className="ghost-button"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            Отказ
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => onSubmit(rating, comment.trim())}
            disabled={submitting}
          >
            {submitting ? "Изпращаме..." : "Изпрати отзив"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RescheduleModal({
  booking,
  consultant,
  dashboardMatchedConsultants,
  submitting,
  onClose,
  onSubmit
}: {
  booking: Booking;
  consultant: ConsultantProfile | null;
  dashboardMatchedConsultants: Array<{ consultant: ConsultantProfile; match?: MatchInsight | null }>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (newScheduledAt: string) => void | Promise<void>;
}) {
  const resolvedConsultant =
    consultant && consultant.consultantId === booking.consultantId
      ? consultant
      : dashboardMatchedConsultants.find(
          (entry) => entry.consultant.consultantId === booking.consultantId
        )?.consultant || null;

  const availableSlots = resolvedConsultant
    ? getUpcomingAvailabilitySlots(resolvedConsultant.availability, 24).filter(
        (slot) => slot !== booking.scheduledAt
      )
    : [];

  const [selected, setSelected] = useState("");
  const [manualValue, setManualValue] = useState("");
  const inputId = `reschedule-${booking.bookingId}`;

  const handleSubmit = () => {
    const chosen = selected || (manualValue ? new Date(manualValue).toISOString() : "");
    if (!chosen) return;
    return onSubmit(chosen);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-card">
        <header className="modal-card__head">
          <p className="eyebrow">Преместване</p>
          <h2>Избери нов час за резервацията</h2>
          <p className="section-caption">
            Текущ час: {formatDate(booking.scheduledAt)}
          </p>
        </header>

        {availableSlots.length ? (
          <div className="reschedule-slot-grid" role="radiogroup">
            {availableSlots.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`slot-button ${selected === slot ? "slot-button--active" : ""}`}
                onClick={() => {
                  setSelected(slot);
                  setManualValue("");
                }}
                aria-checked={selected === slot}
                role="radio"
              >
                {formatAvailabilityDayLabel(slot)}, {formatAvailabilityTimeLabel(slot)}
              </button>
            ))}
          </div>
        ) : (
          <p className="form-note">
            Няма открити публикувани часове за този консултант. Можеш да предложиш конкретен час
            по-долу — ще бъде записан само ако консултантът го има в графика си.
          </p>
        )}

        <label htmlFor={inputId}>
          Или въведи конкретен час
          <input
            id={inputId}
            type="datetime-local"
            value={manualValue}
            onChange={(event) => {
              setManualValue(event.target.value);
              setSelected("");
            }}
          />
        </label>

        <div className="modal-card__actions">
          <button
            className="ghost-button"
            type="button"
            onClick={onClose}
            disabled={submitting}
          >
            Отказ
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={handleSubmit}
            disabled={submitting || (!selected && !manualValue)}
          >
            {submitting ? "Местим..." : "Премести"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsultantCard({
  consultant,
  match
}: {
  consultant: ConsultantProfile;
  match?: MatchInsight | null;
}) {
  const summary = getConsultantDirectorySummary(consultant);
  const upcomingSlots = getUpcomingAvailabilitySlots(consultant.availability, 2);
  const profileSignals = Array.from(
    new Set([
      ...getConsultantSummaryTags(consultant),
      ...getConsultationTopics(consultant).slice(0, 2)
    ])
  ).slice(0, 2);
  const themeStyle = getConsultantThemeStyle(consultant);
  const hasTheme = hasConsultantTheme(consultant);

  return (
    <Link
      className={`consultant-card consultant-card--link ${
        hasTheme ? "consultant-card--themed" : ""
      }`}
      style={themeStyle}
      to={`/consultants/${consultant.slug}`}
    >
      <div className="consultant-card__body">
        <div className="consultant-card__portrait">
          <AvatarMedia
            className="consultant-card__avatar"
            src={consultant.avatarUrl}
            name={consultant.name}
          />
          <div className="chip-row consultant-card__status-row">
            <span className="plan-pill">
              {formatConsultantTypeLabel(getConsultantProfileType(consultant))}
            </span>
            {consultant.featured ? <span className="status-badge">Подбран</span> : null}
            {consultant.isExample ? <ExampleBadge /> : null}
            {match ? <span className="plan-pill">{match.score}%</span> : null}
          </div>
        </div>

        <div className="consultant-card__identity">
          <h3>{consultant.name}</h3>
          <p>{consultant.headline}</p>
          <div className="consultant-card__review-row">
            <span className="rating-pill">
              {consultant.reviewCount ? consultant.rating.toFixed(1) : "Нов"}
            </span>
            <span className="review-count-pill">
              {consultant.reviewCount ? `${consultant.reviewCount} мнения` : "нов профил"}
            </span>
          </div>
        </div>

        {match ? <p className="consultant-card__match">{match.note}</p> : null}
        <p className="consultant-card__summary">{summary}</p>

        <ul className="consultant-card__meta">
          <li>{getConsultantLocationLabel(consultant)}</li>
          <li>{getSessionLengthLabel(consultant)}</li>
          <li>{consultant.sessionModes[0] || "Онлайн"}</li>
        </ul>

        {upcomingSlots.length ? (
          <div className="consultant-card__slots-block">
            <span className="consultant-card__slots-label">Свободни часове</span>
            <div className="consultant-card__slots" aria-label="Следващи свободни часове">
              {upcomingSlots.map((slot) => (
                <span className="consultant-slot-pill" key={slot}>
                  {formatAvailabilityShortLabel(slot)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="consultant-card__footer">
          <strong>{getConsultantPriceLabel(consultant)}</strong>
          <span className="consultant-card__link-label">Виж профила →</span>
        </div>
      </div>
    </Link>
  );
}

function DirectoryFeedbackState({
  tone = "neutral",
  title,
  message,
  actionLabel,
  actionTo,
  onAction
}: {
  tone?: "neutral" | "loading" | "empty";
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`panel directory-feedback directory-feedback--${tone}`}>
      <div>
        <span className="directory-feedback__marker" aria-hidden="true" />
      </div>
      <div className="directory-feedback__copy">
        <strong>{title}</strong>
        <p>{message}</p>
      </div>
      {actionLabel && actionTo ? (
        <Link className="ghost-button" to={actionTo}>
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && onAction ? (
        <button className="ghost-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

const DOCUMENT_FILE_TYPE_ICONS: Record<string, { glyph: string; label: string }> = {
  pdf: { glyph: "📕", label: "PDF" },
  doc: { glyph: "📘", label: "Word" },
  docx: { glyph: "📘", label: "Word" },
  rtf: { glyph: "📘", label: "Текст" },
  txt: { glyph: "📄", label: "Текст" },
  md: { glyph: "📄", label: "Markdown" },
  xls: { glyph: "📗", label: "Excel" },
  xlsx: { glyph: "📗", label: "Excel" },
  csv: { glyph: "📗", label: "Таблица" },
  ppt: { glyph: "📙", label: "Презентация" },
  pptx: { glyph: "📙", label: "Презентация" },
  key: { glyph: "📙", label: "Keynote" },
  jpg: { glyph: "🖼️", label: "Изображение" },
  jpeg: { glyph: "🖼️", label: "Изображение" },
  png: { glyph: "🖼️", label: "Изображение" },
  gif: { glyph: "🖼️", label: "Изображение" },
  webp: { glyph: "🖼️", label: "Изображение" },
  svg: { glyph: "🖼️", label: "SVG" },
  heic: { glyph: "🖼️", label: "Изображение" },
  mp4: { glyph: "🎬", label: "Видео" },
  mov: { glyph: "🎬", label: "Видео" },
  avi: { glyph: "🎬", label: "Видео" },
  mkv: { glyph: "🎬", label: "Видео" },
  webm: { glyph: "🎬", label: "Видео" },
  mp3: { glyph: "🎵", label: "Аудио" },
  wav: { glyph: "🎵", label: "Аудио" },
  m4a: { glyph: "🎵", label: "Аудио" },
  zip: { glyph: "🗜️", label: "Архив" },
  rar: { glyph: "🗜️", label: "Архив" },
  "7z": { glyph: "🗜️", label: "Архив" },
  tar: { glyph: "🗜️", label: "Архив" },
  gz: { glyph: "🗜️", label: "Архив" }
};

function getFileTypeIcon(fileName: string) {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  return DOCUMENT_FILE_TYPE_ICONS[ext] || { glyph: "📎", label: "Файл" };
}

function formatBytes(bytes?: number) {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const USER_DOCUMENT_QUOTA_BYTES = 50 * 1024 * 1024;

function ProfileCompletionMeter({
  value,
  compact = false
}: {
  value: number;
  compact?: boolean;
}) {
  const normalized = Math.max(0, Math.min(100, Math.round(value)));
  const steps = [20, 40, 60, 80, 100];

  return (
    <div
      className={`profile-completion-meter ${
        compact ? "profile-completion-meter--compact" : ""
      }`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={normalized}
    >
      <div className="profile-completion-meter__bar">
        <span style={{ width: `${normalized}%` }} />
      </div>
      <div className="profile-completion-meter__steps" aria-hidden="true">
        {steps.map((step) => (
          <span
            className={normalized >= step ? "profile-completion-meter__step--done" : ""}
            key={step}
          />
        ))}
      </div>
    </div>
  );
}

function UserDocumentList({
  cvDocument,
  documents,
  shareTargets = [],
  onDownload,
  onRemove,
  onShareChange
}: {
  cvDocument?: UploadedDocument | null;
  documents: UploadedDocument[];
  shareTargets?: ConsultantProfile[];
  onDownload: (storageKey: string, fileName: string) => Promise<void> | void;
  onRemove: (storageKey: string) => Promise<void> | void;
  onShareChange: (storageKey: string, sharedWithConsultantIds: string[]) => Promise<void> | void;
}) {
  const [shareDrafts, setShareDrafts] = useState<Record<string, string>>({});
  const merged = [
    ...(cvDocument ? [cvDocument] : []),
    ...(documents || [])
  ];
  const shareTargetById = new Map(
    shareTargets.map((consultant) => [consultant.consultantId, consultant])
  );

  const usedBytes = merged.reduce(
    (total, doc) => total + (Number(doc.sizeBytes) || 0),
    0
  );
  const usedMb = (usedBytes / (1024 * 1024)).toFixed(1);
  const quotaMb = (USER_DOCUMENT_QUOTA_BYTES / (1024 * 1024)).toFixed(0);
  const percent = Math.min(100, (usedBytes / USER_DOCUMENT_QUOTA_BYTES) * 100);

  if (!merged.length) {
    return (
      <div className="panel panel--subtle profile-documents__empty">
        <strong>Все още няма качени документи.</strong>
        <p>
          Качи всеки файл, който помага на консултанта да те разбере по-бързо — CV, диплома,
          портфолио, кратко резюме. До 50 MB общо.
        </p>
      </div>
    );
  }

  return (
    <div className="profile-documents-wrap">
      <div
        className="profile-documents__quota"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
      >
        <div className="profile-documents__quota-bar">
          <span style={{ width: `${percent}%` }} />
        </div>
        <span className="form-note">
          {usedMb} MB от {quotaMb} MB ({merged.length}{" "}
          {merged.length === 1 ? "файл" : "файла"})
        </span>
      </div>
      <ul className="profile-documents" aria-label="Документи в профила">
        {merged.map((doc) => {
          const icon = getFileTypeIcon(doc.fileName);
          const size = formatBytes(doc.sizeBytes);
          const sharedIds = Array.isArray(doc.sharedWithConsultantIds)
            ? doc.sharedWithConsultantIds
            : [];
          const shareDraft = shareDrafts[doc.storageKey] || "";
          const availableShareTargets = shareTargets.filter(
            (consultant) => !sharedIds.includes(consultant.consultantId)
          );
          return (
            <li className="profile-documents__item" key={doc.storageKey}>
              <div className="profile-documents__main">
                <span
                  className="profile-documents__icon"
                  title={icon.label}
                  aria-label={icon.label}
                >
                  {icon.glyph}
                </span>
                <div className="profile-documents__text">
                  <strong>{doc.fileName}</strong>
                  <span className="form-note">
                    {formatDocumentUploadedAt(doc.uploadedAt)}
                    {size ? ` · ${size}` : ""}
                  </span>
                </div>
              </div>
              <div className="profile-documents__actions">
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onDownload(doc.storageKey, doc.fileName)}
                >
                  Свали
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => onRemove(doc.storageKey)}
                >
                  Премахни
                </button>
              </div>
              {shareTargets.length || sharedIds.length ? (
                <div className="profile-documents__sharing">
                  <div className="profile-documents__share-head">
                    <span>Споделяне</span>
                    <strong>
                      {sharedIds.length
                        ? `${sharedIds.length} ${sharedIds.length === 1 ? "профил" : "профила"}`
                        : "Личен документ"}
                    </strong>
                  </div>
                  {sharedIds.length ? (
                    <div className="profile-documents__shared-list">
                      {sharedIds.map((consultantId) => {
                        const target = shareTargetById.get(consultantId);
                        return (
                          <span className="profile-documents__shared-chip" key={consultantId}>
                            {target?.name || "Консултант"}
                            <button
                              type="button"
                              aria-label="Премахни достъпа"
                              onClick={() =>
                                onShareChange(
                                  doc.storageKey,
                                  sharedIds.filter((item) => item !== consultantId)
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  {availableShareTargets.length ? (
                    <div className="profile-documents__share-control">
                      <select
                        value={shareDraft}
                        onChange={(event) =>
                          setShareDrafts((current) => ({
                            ...current,
                            [doc.storageKey]: event.target.value
                          }))
                        }
                        aria-label={`Избери консултант за ${doc.fileName}`}
                      >
                        <option value="">Избери консултант или ментор</option>
                        {availableShareTargets.map((consultant) => (
                          <option key={consultant.consultantId} value={consultant.consultantId}>
                            {consultant.name}
                          </option>
                        ))}
                      </select>
                      <button
                        className="ghost-button"
                        type="button"
                        disabled={!shareDraft}
                        onClick={() => {
                          if (!shareDraft) return;
                          onShareChange(doc.storageKey, [...sharedIds, shareDraft]);
                          setShareDrafts((current) => ({
                            ...current,
                            [doc.storageKey]: ""
                          }));
                        }}
                      >
                        Сподели
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DashboardEmptyState({
  title,
  description,
  actionLabel,
  actionTo
}: {
  title: string;
  description: string;
  actionLabel: string;
  actionTo: string;
}) {
  return (
    <div className="dashboard-empty-state">
      <span className="dashboard-empty-state__marker" aria-hidden="true" />
      <div className="dashboard-empty-state__content">
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Link className="ghost-button" to={actionTo}>
        {actionLabel}
      </Link>
    </div>
  );
}

function DashboardRouteState({
  tone = "loading",
  title,
  description,
  actionLabel,
  onAction
}: {
  tone?: "loading" | "error";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className={`panel dashboard-route-state dashboard-route-state--${tone}`}>
      <span className="dashboard-route-state__marker" aria-hidden="true" />
      <div className="dashboard-route-state__copy">
        <p className="eyebrow">{tone === "error" ? "Проблем със зареждането" : "Моето табло"}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="ghost-button" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function ConsultantStatusBanner({ consultant }: { consultant: ConsultantProfile }) {
  const status = consultant.profileStatus || "pending";

  if (status === "approved" || status === "active") {
    return (
      <div className="panel panel--subtle status-banner status-banner--success">
        <div>
          <strong>Профилът е одобрен и публичен.</strong>
          <p>Виден е в каталога и приема резервации.</p>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="panel panel--error status-banner status-banner--rejected">
        <strong>Профилът не беше одобрен.</strong>
        <p>
          Свържи се с екипа за повече информация и редактирай профила преди да поискаш
          повторно разглеждане.
        </p>
      </div>
    );
  }

  return (
    <div className="panel panel--subtle status-banner status-banner--pending">
      <strong>Профилът чака одобрение.</strong>
      <p>
        Профилът ти не е публичен, докато администратор не го прегледа. През това време
        можеш да го допълваш — промените се запазват.
      </p>
    </div>
  );
}

function ConsultantCardSkeleton() {
  return (
    <article className="consultant-card consultant-card--skeleton" aria-hidden="true">
      <div className="consultant-card__body">
        <div className="consultant-card__portrait">
          <span className="skeleton-block skeleton-block--avatar" />
        </div>
        <div className="consultant-card__identity">
          <span className="skeleton-line skeleton-line--title" />
          <span className="skeleton-line" />
          <span className="skeleton-line skeleton-line--short" />
        </div>
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line--wide" />
        <div className="consultant-card__fact-grid consultant-card__fact-grid--compact">
          {[0, 1, 2, 3].map((item) => (
            <article key={item}>
              <span className="skeleton-line skeleton-line--short" />
              <span className="skeleton-line" />
            </article>
          ))}
        </div>
      </div>
    </article>
  );
}
