import type { CreateMonthPayload, DailyRecord, DailyValueUpdate, EventItem, MonthConfig } from "../types";

const envEndpoint = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;
const envPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;
const defaultEndpoint =
  "https://script.google.com/macros/s/AKfycbxQSYUaFmhVdmZ1JKruN2AS0hV7TidbKaXAKXEx0REXmNmvYqIq39YniEyrY8Kes2F7fA/exec";

type ApiAction =
  | "getMonths"
  | "getMonthData"
  | "createMonth"
  | "upsertDailyValues"
  | "getWeeklySummary"
  | "upsertEvent"
  | "deleteEvent"
  | "getForecastCoefficients"
  | "updateForecastCoefficients"
  | "verifyPassword";

export function isReportApiConfigured(): boolean {
  return Boolean(getReportApiEndpoint());
}

export function getReportApiEndpoint(): string {
  const normalizedEnvEndpoint = normalizeEndpoint(envEndpoint);
  if (normalizedEnvEndpoint) return normalizedEnvEndpoint;

  return normalizeEndpoint(defaultEndpoint);
}

export function saveReportApiEndpoint(value: string): string {
  return normalizeEndpoint(value) || getReportApiEndpoint();
}

export async function callReportApi<T>(action: ApiAction, payload: unknown = {}, password = envPassword): Promise<T> {
  const endpoint = getReportApiEndpoint();
  if (!endpoint) {
    throw new Error("Apps Script URL is not configured. Local prototype uses sample data.");
  }
  const body = JSON.stringify({ action, password, payload });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body,
  });
  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || "Google Apps Script request failed");
  }
  return result.data as T;
}

function normalizeEndpoint(value: string | null | undefined): string {
  const endpoint = String(value || "").trim();
  return endpoint.startsWith("https://script.google.com/") ? endpoint : "";
}

export interface MonthPayload {
  config: MonthConfig | null;
  records: DailyRecord[];
  events: EventItem[];
}

export interface DailyValuesPayload {
  monthKey: string;
  records: DailyValueUpdate[];
}

export type CreateMonthRequest = CreateMonthPayload;
