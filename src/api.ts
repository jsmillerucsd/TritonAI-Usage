import type { Config, KeyEntry } from "./config.js";

export interface KeyInfoResponse {
  key: string;
  info: KeyInfo;
}

export interface KeyInfo {
  key_alias: string | null;
  spend: number;
  max_budget: number | null;
  budget_duration: string | null;
  budget_reset_at: string | null;
  models: string[];
  tpm_limit: number | null;
  rpm_limit: number | null;
  blocked: boolean | null;
  expires: string | null;
  last_active: string | null;
  metadata: Record<string, unknown>;
}

export interface SpendReportRow {
  api_key: string;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
  model_details: ModelDetail[];
}

export interface ModelDetail {
  model: string;
  total_cost: number;
  total_input_tokens: number;
  total_output_tokens: number;
}

export interface SpendLog {
  request_id: string;
  call_type: string;
  api_key: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  startTime: string;
  endTime: string;
  model: string;
  model_group: string;
  custom_llm_provider: string;
  session_id: string | null;
  status: string;
  request_duration_ms: number;
  cache_hit: string | null;
  request_tags: string[];
  end_user: string | null;
  metadata: {
    usage_object?: {
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      prompt_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
    };
    cost_breakdown?: {
      input_cost?: number;
      output_cost?: number;
      cache_read_cost?: number;
      cache_creation_cost?: number;
    };
  };
}

export interface SpendLogsResponse {
  data: SpendLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  total_is_capped: boolean;
}

interface LiteLLMResponse<T> {
  data?: T;
  error?: { message: string; type?: string };
}

async function request<T>(
  config: Config,
  key: KeyEntry,
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(path, config.baseUrl);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${key.apiKey}`,
        "x-litellm-api-key": key.apiKey,
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new Error(`Network error calling ${url.pathname}: ${(err as Error).message}`);
  }
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const msg =
      (parsed && typeof parsed === "object" && "error" in parsed
        ? ((parsed as LiteLLMResponse<unknown>).error?.message ?? res.statusText)
        : typeof parsed === "string" && parsed.length > 0
          ? parsed
          : res.statusText) ?? `HTTP ${res.status}`;
    throw new Error(`API ${res.status} on ${url.pathname}: ${msg}`);
  }
  return parsed as T;
}

export function getKeyInfo(config: Config, key: KeyEntry): Promise<KeyInfo> {
  return request<KeyInfoResponse>(config, key, "/key/info").then((r) => r.info);
}

export function getKeySpendReport(
  config: Config,
  key: KeyEntry,
  startDate?: string,
  endDate?: string,
): Promise<SpendReportRow[]> {
  const params: Record<string, string> = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  return request<SpendReportRow[]>(config, key, "/key/spend/report", params);
}

async function requestWithRetry<T>(
  config: Config,
  key: KeyEntry,
  path: string,
  params: Record<string, string> = {},
  retries = 2,
): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await request<T>(config, key, path, params);
    } catch (err) {
      if (attempt === retries) throw err;
      const msg = (err as Error).message;
      if (!msg.includes("API 500")) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

export async function getSpendLogs(
  config: Config,
  key: KeyEntry,
  startDate: string,
  endDate: string,
  maxPages = 100,
  onProgress?: (fetched: number, total: number) => void,
): Promise<SpendLog[]> {
  // The /spend/logs/v2 endpoint treats end_date as exclusive, so add 1 day
  const [y, m, d] = endDate.split("-").map(Number);
  const endNext = new Date(Date.UTC(y, m - 1, d + 1))
    .toISOString()
    .slice(0, 10);

  // First request to get total_pages
  const first = await requestWithRetry<SpendLogsResponse>(
    config,
    key,
    "/spend/logs/v2",
    { start_date: startDate, end_date: endNext, page: "1", size: "100" },
  );
  const totalPages = Math.min(first.total_pages ?? 1, maxPages);
  const totalCount = first.total ?? 0;
  if (totalPages <= 1) {
    onProgress?.(first.data?.length ?? 0, totalCount);
    return first.data ?? [];
  }

  // Fetch remaining pages in parallel batches of 25 with retry on 500
  const all: SpendLog[] = [...(first.data ?? [])];
  const batchSize = 25;
  for (let batchStart = 2; batchStart <= totalPages; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
    const pagePromises: Promise<SpendLogsResponse>[] = [];
    for (let page = batchStart; page <= batchEnd; page++) {
      pagePromises.push(
        requestWithRetry<SpendLogsResponse>(config, key, "/spend/logs/v2", {
          start_date: startDate,
          end_date: endNext,
          page: String(page),
          size: "100",
        }),
      );
    }
    const batch = await Promise.all(pagePromises);
    all.push(...batch.flatMap((r) => r.data ?? []));
    onProgress?.(all.length, totalCount);
  }
  return all;
}
