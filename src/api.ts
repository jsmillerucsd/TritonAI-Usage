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

export async function getSpendLogs(
  config: Config,
  key: KeyEntry,
  startDate: string,
  endDate: string,
  maxPages = 50,
): Promise<SpendLog[]> {
  const all: SpendLog[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await request<SpendLogsResponse>(
      config,
      key,
      "/spend/logs/v2",
      { start_date: startDate, end_date: endDate, page: String(page), size: "100" },
    );
    all.push(...(res.data ?? []));
    if (page >= (res.total_pages ?? 1)) break;
  }
  return all;
}
