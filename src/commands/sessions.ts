import chalk from "chalk";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getSpendLogs, type SpendLog } from "../api.js";
import { col, daysAgo, divider, formatCurrency, formatNumber, renderTable, today, type Column } from "../format.js";

interface SessionBucket {
  sessionId: string;
  spend: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  requests: number;
  firstSeen: string;
  lastSeen: string;
  totalDurationMs: number;
  models: Map<string, number>;
}

function bucketBySession(logs: SpendLog[]): Map<string, SessionBucket> {
  const sessions = new Map<string, SessionBucket>();
  for (const log of logs) {
    const sid = log.session_id ?? "(no-session)";
    const bucket = sessions.get(sid) ?? {
      sessionId: sid,
      spend: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      requests: 0,
      firstSeen: log.startTime,
      lastSeen: log.startTime,
      totalDurationMs: 0,
      models: new Map<string, number>(),
    };
    bucket.spend += log.spend ?? 0;
    bucket.inputTokens += log.prompt_tokens ?? 0;
    bucket.outputTokens += log.completion_tokens ?? 0;
    bucket.cacheReadTokens += log.metadata?.usage_object?.cache_read_input_tokens ?? 0;
    bucket.requests += 1;
    bucket.totalDurationMs += log.request_duration_ms ?? 0;
    if (log.startTime < bucket.firstSeen) bucket.firstSeen = log.startTime;
    if (log.startTime > bucket.lastSeen) bucket.lastSeen = log.startTime;
    if (log.model) {
      const cur = bucket.models.get(log.model) ?? 0;
      bucket.models.set(log.model, cur + (log.spend ?? 0));
    }
    sessions.set(sid, bucket);
  }
  return sessions;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m${rem}s`;
}

function shortSessionId(id: string): string {
  if (id === "(no-session)") return id;
  return id.slice(0, 8);
}

export async function sessionsCommand(
  config: Config,
  opts: { key?: string; start?: string; end?: string; limit?: number },
): Promise<void> {
  const keyName = opts.key ?? config.keys[0]?.name;
  const key = findKey(config, keyName ?? "");
  if (!key) throw new Error(`Key "${keyName}" not found.`);
  const startDate = opts.start ?? daysAgo(14);
  const endDate = opts.end ?? today();
  const limit = opts.limit ?? 20;

  console.log(chalk.bold.underline(`Sessions: ${key.name}`));
  console.log(chalk.gray(`Range: ${startDate} → ${endDate}`));
  console.log();

  const logs = await getSpendLogs(config, key, startDate, endDate);
  if (logs.length === 0) {
    console.log(chalk.yellow(`No requests in ${startDate} → ${endDate}`));
    return;
  }

  const sessions = bucketBySession(logs);
  const sorted = [...sessions.values()].sort((a, b) => b.spend - a.spend);
  const top = sorted.slice(0, limit);
  const maxSpend = Math.max(...sorted.map((s) => s.spend), 0.01);

  const widths = [10, 6, 11, 10, 11, 10, 10, 20, 38];
  const tableRows: Column[][] = [
    [
      col(chalk.bold("SESSION"), 10),
      col(chalk.bold("REQS"), 6, "right"),
      col(chalk.bold("INPUT"), 11, "right"),
      col(chalk.bold("OUTPUT"), 10, "right"),
      col(chalk.bold("CACHE R"), 11, "right"),
      col(chalk.bold("DURATION"), 10, "right"),
      col(chalk.bold("SPEND"), 10, "right"),
      col(chalk.bold("BAR"), 20),
      col(chalk.bold("MODELS"), 38),
    ],
    [divider(widths.reduce((a, b) => a + b + 2, -2))],
  ];

  for (const s of top) {
    const modelList = [...s.models.entries()]
      .filter(([, spend]) => spend > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m.replace("vertex_ai/", ""))
      .join(", ");
    const barLen = Math.max(1, Math.round((s.spend / maxSpend) * 20));
    const bar = chalk.cyan("█".repeat(barLen)) + chalk.gray("░".repeat(20 - barLen));
    tableRows.push([
      col(shortSessionId(s.sessionId), 10),
      col(formatNumber(s.requests), 6, "right"),
      col(formatNumber(s.inputTokens), 11, "right"),
      col(formatNumber(s.outputTokens), 10, "right"),
      col(formatNumber(s.cacheReadTokens), 11, "right"),
      col(formatDuration(s.totalDurationMs), 10, "right"),
      col(formatCurrency(s.spend), 10, "right"),
      col(bar, 20),
      col(modelList, 38),
    ]);
  }
  tableRows.push([divider(widths.reduce((a, b) => a + b + 2, -2))]);
  const totalSpend = sorted.reduce((s, x) => s + x.spend, 0);
  const totalReqs = sorted.reduce((s, x) => s + x.requests, 0);
  const totalInput = sorted.reduce((s, x) => s + x.inputTokens, 0);
  const totalOutput = sorted.reduce((s, x) => s + x.outputTokens, 0);
  const totalCache = sorted.reduce((s, x) => s + x.cacheReadTokens, 0);
  tableRows.push([
    col(chalk.bold(`TOTAL (${sorted.length})`), 10),
    col(chalk.bold(formatNumber(totalReqs)), 6, "right"),
    col(chalk.bold(formatNumber(totalInput)), 11, "right"),
    col(chalk.bold(formatNumber(totalOutput)), 10, "right"),
    col(chalk.bold(formatNumber(totalCache)), 11, "right"),
    col("", 10, "right"),
    col(chalk.bold(formatCurrency(totalSpend)), 10, "right"),
    col("", 20),
    col("", 38),
  ]);
  console.log(renderTable(tableRows, widths));

  if (sorted.length > limit) {
    console.log(chalk.gray(`\n  Showing top ${limit} of ${sorted.length} sessions. Use --limit to see more.`));
  }
}
