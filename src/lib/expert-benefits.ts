import { request } from "./api";

export type BenefitKind = "podcast" | "campaign" | "event_room";
export type BenefitStatus = "pending" | "scheduled" | "completed" | "cancelled";
export interface BenefitRequest {
  requestId: string;
  kind: BenefitKind;
  period: string;
  status: BenefitStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
  adminNote?: string;
  completedAt?: string;
}
export interface ExpertBenefits {
  monthlyFreeSession: { month: string; eligible: boolean; remaining: number };
  spotlight: { eligible: boolean; quarter: string; eventRoomRemaining: number };
}
export interface ExpertBenefitRequests { benefits: ExpertBenefits; items: BenefitRequest[] }
export interface AdminBenefitRequest extends BenefitRequest { consultantId: string; consultantName: string }

export const BENEFIT_LABELS: Record<BenefitKind, string> = { podcast: "Подкаст", campaign: "Кампания", event_room: "Зала за събитие" };
export const BENEFIT_STATUS_LABELS: Record<BenefitStatus, string> = { pending: "Чака разглеждане", scheduled: "Насрочена", completed: "Изпълнена", cancelled: "Отменена" };

export function nextBenefitQuarter(value: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(value);
  if (!match) return "";
  const year = Number(match[1]), quarter = Number(match[2]);
  return quarter === 4 ? `${year + 1}-Q1` : `${year}-Q${quarter + 1}`;
}

export function hasActiveBenefitRequest(items: BenefitRequest[], kind: BenefitKind, period: string): boolean {
  return items.some(item => item.kind === kind && (kind === "event_room" ? item.period === period && item.status !== "cancelled" : item.status === "pending" || item.status === "scheduled"));
}

export function benefitStatusChoices(item: BenefitRequest): BenefitStatus[] {
  if (item.status === "pending") return ["pending", "scheduled", "cancelled"];
  if (item.status === "scheduled") return ["scheduled", ...(item.scheduledAt && Date.parse(item.scheduledAt) <= Date.now() ? ["completed" as const] : []), "cancelled"];
  return [item.status];
}

export function toLocalScheduleInput(value = ""): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function parseLocalBenefitSchedule(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && toLocalScheduleInput(date.toISOString()) === value ? date.toISOString() : "";
}

export const expertBenefitsApi = {
  list: (token: string, signal?: AbortSignal) => request<ExpertBenefitRequests>("/consultants/me/benefit-requests", { signal }, token),
  create: (token: string, body: { kind: BenefitKind; period?: string; note?: string }) => request<{ request: BenefitRequest; benefits: ExpertBenefits }>("/consultants/me/benefit-requests", { method: "POST", body: JSON.stringify(body) }, token),
  adminList: (token: string, signal?: AbortSignal) => request<{ items: AdminBenefitRequest[] }>("/admin/benefit-requests", { signal }, token),
  adminUpdate: (token: string, requestId: string, body: { consultantId: string; status: BenefitStatus; scheduledAt?: string; adminNote?: string }) => request<{ request: BenefitRequest }>(`/admin/benefit-requests/${encodeURIComponent(requestId)}`, { method: "PATCH", body: JSON.stringify(body) }, token)
};
