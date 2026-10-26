import { callReportApi } from "./reportApi";

export interface WordstatDemandRecord {
  month: string;
  city: "МСК" | "СПБ";
  regionId: string;
  count: number;
  share: number | null;
  updatedAt: string;
}

export interface WordstatDemandSnapshot {
  phrase: "автошкола";
  records: WordstatDemandRecord[];
  configured: boolean;
  connectionMessage: string;
  latestAvailableMonth: string;
  lastSyncedAt: string;
  status: "not_configured" | "ready" | "empty" | "error";
  warnings: string[];
}

let pendingSnapshot: Promise<WordstatDemandSnapshot> | null = null;

export function loadWordstatDemand(): Promise<WordstatDemandSnapshot> {
  if (pendingSnapshot) return pendingSnapshot;
  const request = callReportApi<WordstatDemandSnapshot>("getWordstatDemand").finally(() => {
    if (pendingSnapshot === request) pendingSnapshot = null;
  });
  pendingSnapshot = request;
  return request;
}

export function refreshWordstatDemand(password: string): Promise<WordstatDemandSnapshot> {
  return callReportApi<WordstatDemandSnapshot>("syncWordstatDemand", {}, password);
}
