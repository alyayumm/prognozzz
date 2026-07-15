import type { CreateMonthPayload, DailyRecord, DailyValueUpdate, EventItem, MonthConfig } from "../types";

const endpoint = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined;
const envPassword = import.meta.env.VITE_ADMIN_PASSWORD as string | undefined;

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
  return Boolean(endpoint);
}

export async function callReportApi<T>(action: ApiAction, payload: unknown = {}, password = envPassword): Promise<T> {
  if (!endpoint) {
    throw new Error("Apps Script URL is not configured. Local prototype uses sample data.");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, password, payload }),
  });

  const result = await response.json();
  if (!result.ok) {
    throw new Error(result.error || "Google Apps Script request failed");
  }
  return result.data as T;
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
