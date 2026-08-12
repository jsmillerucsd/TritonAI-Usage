import chalk from "chalk";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getSpendLogs, getKeySpendReport, type SpendLog } from "../api.js";
import { col, daysAgo, divider, formatCurrency, formatNumber, renderTable, sparkBar, today, type Column } from "../format.js";

interface DayBucket {
  date: string;
  spend: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  requests: number;
  byModel: Map<string, { spend: number; requests: number }>;
}

function bucketByDay(logs: SpendLog[]): Map<string, DayBucket> {
  const days = new Map<string, DayBucket>();
  for (const log of logs) {
    const day = log.startTime.slice(0, 10);
    const bucket = days.get(day) ?? {
      date: day,
      spend: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheReadCost: 0,
      cacheWriteCost: 0,
      requests: 0,
      byModel: new Map(),
    };
    bucket.spend += log.spend ?? 0;
    bucket.inputTokens += log.prompt_tokens ?? 0;
    bucket.outputTokens += log.completion_tokens ?? 0;
    bucket.cacheReadTokens += log.metadata?.usage_object?.cache_read_input_tokens ?? 0;
    bucket.cacheWriteTokens += log.metadata?.usage_object?.cache_creation_input_tokens ?? 0;
    bucket.cacheReadCost += log.metadata?.cost_breakdown?.cache_read_cost ?? 0;
    bucket.cacheWriteCost += log.metadata?.cost_breakdown?.cache_creation_cost ?? 0;
    bucket.requests += 1;
    const model = log.model ?? "(unknown)";
    const m = bucket.byModel.get(model) ?? { spend: 0, requests: 0 };
    m.spend += log.spend ?? 0;
    m.requests += 1;
    bucket.byModel.set(model, m);
    days.set(day, bucket);
  }
  return days;
}

export async function dailyCommand(
  config: Config,
  opts: { key?: string; start?: string; end?: string; models?: boolean },
): Promise<void> {
  const keyName = opts.key ?? config.keys[0]?.name;
  const key = findKey(config, keyName ?? "");
  if (!key) throw new Error(`Key "${keyName}" not found.`);
  const startDate = opts.start ?? daysAgo(14);
  const endDate = opts.end ?? today();

  console.log(chalk.bold.underline(`Daily Usage: ${key.name}`));
  console.log(chalk.gray(`Range: ${startDate} → ${endDate}`));
  console.log();

  const [logs, report] = await Promise.all([
    getSpendLogs(config, key, startDate, endDate),
    getKeySpendReport(config, key, startDate, endDate).catch(() => []),
  ]);

  // The report endpoint has the authoritative total (logs may have limited retention)
  const reportTotal = report[0]?.total_cost ?? null;
  // Per-model totals from the report (authoritative, covers full date range)
  const reportByModel = new Map<string, number>();
  for (const d of report[0]?.model_details ?? []) {
    reportByModel.set(d.model, d.total_cost ?? 0);
  }

  if (logs.length === 0) {
    if (reportTotal !== null && reportTotal > 0) {
      console.log(chalk.yellow(`No per-request logs available (retention limit).`));
      console.log(chalk.gray(`Aggregated spend for this range: ${formatCurrency(reportTotal)}`));
    } else {
      console.log(chalk.yellow(`No requests in ${startDate} → ${endDate}`));
    }
    return;
  }

  const days = bucketByDay(logs);
  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxSpend = Math.max(...sortedDays.map((d) => d.spend), 0.01);
  const logTotalSpend = sortedDays.reduce((s, d) => s + d.spend, 0);

  const showModels = opts.models === true;

  if (showModels) {
    const allModels = new Set<string>();
    // Models from logs (per-day breakdown)
    for (const d of sortedDays) {
      for (const [m, info] of d.byModel) {
        if (info.spend > 0) allModels.add(m);
      }
    }
    // Models from report (may include models only used outside the log retention window)
    for (const m of reportByModel.keys()) {
      if ((reportByModel.get(m) ?? 0) > 0) allModels.add(m);
    }
    const models = [...allModels].sort((a, b) => {
      const ai = a.replace("vertex_ai/", "");
      const bi = b.replace("vertex_ai/", "");
      if (ai === bi) return a.localeCompare(b);
      if (ai.includes("opus") && !bi.includes("opus")) return -1;
      if (!ai.includes("opus") && bi.includes("opus")) return 1;
      return ai.localeCompare(bi);
    });

    const modelColWidths = models.map(() => 18);
    const baseWidths = [12, 7, 10, 22, ...modelColWidths];
    const tableRows: Column[][] = [
      [
        col(chalk.bold("DATE"), 12),
        col(chalk.bold("REQS"), 7, "right"),
        col(chalk.bold("SPEND"), 10, "right"),
        col(chalk.bold("BAR"), 22),
        ...models.map((m) => col(chalk.bold(m.replace("vertex_ai/", "")), 18, "right")),
      ],
      [divider(baseWidths.reduce((a, b) => a + b + 2, -2))],
    ];

    for (const d of sortedDays) {
      tableRows.push([
        col(d.date, 12),
        col(formatNumber(d.requests), 7, "right"),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
        ...models.map((m) => {
          const entry = d.byModel.get(m);
          return col(entry ? formatCurrency(entry.spend) : "—", 18, "right");
        }),
      ]);
    }
    tableRows.push([divider(baseWidths.reduce((a, b) => a + b + 2, -2))]);
    const totalReqs = sortedDays.reduce((s, d) => s + d.requests, 0);
    tableRows.push([
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatNumber(totalReqs)), 7, "right"),
      col(chalk.bold(formatCurrency(logTotalSpend)), 10, "right"),
      col("", 22),
      ...models.map((m) => {
        const total = sortedDays.reduce((s, d) => s + (d.byModel.get(m)?.spend ?? 0), 0);
        return col(chalk.bold(formatCurrency(total)), 18, "right");
      }),
    ]);
    // If report covers more than logs, add a FULL RANGE row
    if (reportTotal !== null && Math.abs(reportTotal - logTotalSpend) > 0.01) {
      tableRows.push([
        col(chalk.gray("FULL RANGE"), 12),
        col(chalk.gray("—"), 7, "right"),
        col(chalk.gray(formatCurrency(reportTotal)), 10, "right"),
        col("", 22),
        ...models.map((m) => {
          const total = reportByModel.get(m) ?? 0;
          return col(chalk.gray(total > 0 ? formatCurrency(total) : "—"), 18, "right");
        }),
      ]);
    }
    console.log(renderTable(tableRows, baseWidths));
  } else {
    const widths = [12, 7, 12, 12, 12, 12, 10, 10, 22];
    const tableRows: Column[][] = [
      [
        col(chalk.bold("DATE"), 12),
        col(chalk.bold("REQS"), 7, "right"),
        col(chalk.bold("INPUT"), 12, "right"),
        col(chalk.bold("OUTPUT"), 12, "right"),
        col(chalk.bold("CACHE R"), 12, "right"),
        col(chalk.bold("CACHE W"), 12, "right"),
        col(chalk.bold("CACHE $"), 10, "right"),
        col(chalk.bold("SPEND"), 10, "right"),
        col(chalk.bold("BAR"), 22),
      ],
      [divider(widths.reduce((a, b) => a + b + 2, -2))],
    ];

    for (const d of sortedDays) {
      tableRows.push([
        col(d.date, 12),
        col(formatNumber(d.requests), 7, "right"),
        col(formatNumber(d.inputTokens), 12, "right"),
        col(formatNumber(d.outputTokens), 12, "right"),
        col(formatNumber(d.cacheReadTokens), 12, "right"),
        col(formatNumber(d.cacheWriteTokens), 12, "right"),
        col(formatCurrency(d.cacheReadCost + d.cacheWriteCost), 10, "right"),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
      ]);
    }
    tableRows.push([divider(widths.reduce((a, b) => a + b + 2, -2))]);
    const totalReqs = sortedDays.reduce((s, d) => s + d.requests, 0);
    const totalInput = sortedDays.reduce((s, d) => s + d.inputTokens, 0);
    const totalOutput = sortedDays.reduce((s, d) => s + d.outputTokens, 0);
    const totalCacheR = sortedDays.reduce((s, d) => s + d.cacheReadTokens, 0);
    const totalCacheW = sortedDays.reduce((s, d) => s + d.cacheWriteTokens, 0);
    const totalCacheCost = sortedDays.reduce((s, d) => s + d.cacheReadCost + d.cacheWriteCost, 0);
    tableRows.push([
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatNumber(totalReqs)), 7, "right"),
      col(chalk.bold(formatNumber(totalInput)), 12, "right"),
      col(chalk.bold(formatNumber(totalOutput)), 12, "right"),
      col(chalk.bold(formatNumber(totalCacheR)), 12, "right"),
      col(chalk.bold(formatNumber(totalCacheW)), 12, "right"),
      col(chalk.bold(formatCurrency(totalCacheCost)), 10, "right"),
      col(chalk.bold(formatCurrency(logTotalSpend)), 10, "right"),
      col("", 22),
    ]);
    // If report covers more than logs, add a FULL RANGE row
    if (reportTotal !== null && Math.abs(reportTotal - logTotalSpend) > 0.01) {
      tableRows.push([
        col(chalk.gray("FULL RANGE"), 12),
        col(chalk.gray("—"), 7, "right"),
        col(chalk.gray("—"), 12, "right"),
        col(chalk.gray("—"), 12, "right"),
        col(chalk.gray("—"), 12, "right"),
        col(chalk.gray("—"), 12, "right"),
        col(chalk.gray("—"), 10, "right"),
        col(chalk.gray(formatCurrency(reportTotal)), 10, "right"),
        col("", 22),
      ]);
    }
    console.log(renderTable(tableRows, widths));
  }

  // Note if logs don't cover the full range
  if (reportTotal !== null && Math.abs(reportTotal - logTotalSpend) > 0.01) {
    const daysWithData = sortedDays.length;
    const totalDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1);
    console.log();
    console.log(chalk.gray(`  Logs cover ${daysWithData} of ${totalDays} days. FULL RANGE shows report totals.`));
    console.log(chalk.gray(`  Run \`triton-usage report\` for the full per-model breakdown.`));
  }
}
