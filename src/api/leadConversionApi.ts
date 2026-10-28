import { callReportApi } from "./reportApi";

export type LeadConversionRecord = {
  id: string;
  date: string;
  city: "МСК" | "СПБ" | "Не определён";
  brand: string;
  domain: string;
  source: string;
  visits: number;
  leads: number;
};

export type LeadConversionSnapshot = {
  records: LeadConversionRecord[];
  coverage: { fromDate: string; toDate: string } | null;
  updatedAt: string;
  warnings: string[];
  configured: boolean;
};

export function loadLeadConversion(monthKey: string): Promise<LeadConversionSnapshot> {
  return callReportApi<LeadConversionSnapshot>("getLeadConversion", { monthKey });
}

export function refreshLeadConversion(fromDate: string, toDate: string, password: string): Promise<LeadConversionSnapshot> {
  return callReportApi<LeadConversionSnapshot>("syncLeadConversion", { fromDate, toDate }, password);
}
