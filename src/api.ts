import type { Config, KeyEntry } from "./config.js";

export interface KeyInfo {
  key: string;
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
  date?: string;
  model?: string;
  api_key?: string;
  spend: number;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  call_count?: number;
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
  return request<KeyInfo>(config, key, "/key/info");
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
