import { client } from "./client";

export interface ReportTotals {
  total: number;
  sent: number;
  failed: number;
  cancelled: number;
  pending: number;
  running: number;
  success_rate: number | null;
  avg_latency_ms: number | null;
}

export interface ReportBucket {
  sent: number;
  failed: number;
}

export interface ReportResponse {
  from: string;
  to: string;
  totals: ReportTotals;
  by_day: Array<ReportBucket & { date: string }>;
  by_account: Array<ReportBucket & { account_id: number; label: string }>;
  by_destination: Array<ReportBucket & { label: string }>;
}

export async function fetchReport(params: {
  days?: number;
  from?: string;
  to?: string;
  account?: string;
}): Promise<ReportResponse> {
  const { data } = await client.get<ReportResponse>("/reports/", { params });
  return data;
}
