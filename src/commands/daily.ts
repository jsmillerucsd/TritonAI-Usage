import chalk from "chalk";
import cliui from "cliui";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getSpendLogs, type SpendLog } from "../api.js";
import { col, daysAgo, divider, formatCurrency, formatNumber, today } from "../format.js";

interface DayBucket {
  date: string;
  spend: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
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
      requests: 0,
      byModel: new Map(),
    };
    bucket.spend += log.spend ?? 0;
    bucket.inputTokens += log.prompt_tokens ?? 0;
    bucket.outputTokens += log.completion_tokens ?? 0;
    bucket.cacheReadTokens += log.metadata?.usage_object?.cache_read_input_tokens ?? 0;
    bucket.cacheWriteTokens += log.metadata?.usage_object?.cache_creation_input_tokens ?? 0;
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

function sparkBar(value: number, max: number, width = 20): string {
  if (max <= 0) return chalk.gray("░".repeat(width));
  const filled = Math.max(1, Math.round((value / max) * width));
  return chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
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

  const logs = await getSpendLogs(config, key, startDate, endDate);
  if (logs.length === 0) {
    console.log(chalk.yellow(`No requests in ${startDate} → ${endDate}`));
    return;
  }

  const days = bucketByDay(logs);
  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const maxSpend = Math.max(...sortedDays.map((d) => d.spend));

  const showModels = opts.models === true;

  if (showModels) {
    // Day x model matrix — dedupe models that only differ by provider prefix
    const allModels = new Set<string>();
    for (const d of sortedDays) {
      for (const [m, info] of d.byModel) {
        if (info.spend > 0) allModels.add(m);
      }
    }
    // Sort: put claude-opus first, then claude-sonnet, then alphabetical
    const models = [...allModels].sort((a, b) => {
      const ai = a.replace("vertex_ai/", "");
      const bi = b.replace("vertex_ai/", "");
      if (ai === bi) return a.localeCompare(b);
      if (ai.includes("opus") && !bi.includes("opus")) return -1;
      if (!ai.includes("opus") && bi.includes("opus")) return 1;
      return ai.localeCompare(bi);
    });

    const ui = cliui({ width: 130 });
    const modelCols = models.map((m) => ({
      name: m.replace("vertex_ai/", ""),
      full: m,
    }));

    ui.div(
      col(chalk.bold("DATE"), 12),
      col(chalk.bold("REQS"), 7, "right"),
      col(chalk.bold("SPEND"), 10, "right"),
      col(chalk.bold("BAR"), 22),
      ...modelCols.map((m) => col(chalk.bold(m.name), 20, "right")),
    );
    ui.div(divider(130));

    for (const d of sortedDays) {
      ui.div(
        col(d.date, 12),
        col(formatNumber(d.requests), 7, "right"),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
        ...modelCols.map((m) => {
          const entry = d.byModel.get(m.full);
          return col(entry ? formatCurrency(entry.spend) : "—", 20, "right");
        }),
      );
    }
    ui.div(divider(130));
    const totalSpend = sortedDays.reduce((s, d) => s + d.spend, 0);
    const totalReqs = sortedDays.reduce((s, d) => s + d.requests, 0);
    ui.div(
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatNumber(totalReqs)), 7, "right"),
      col(chalk.bold(formatCurrency(totalSpend)), 10, "right"),
      col("", 22),
      ...modelCols.map((m) => {
        const total = sortedDays.reduce(
          (s, d) => s + (d.byModel.get(m.full)?.spend ?? 0),
          0,
        );
        return col(chalk.bold(formatCurrency(total)), 20, "right");
      }),
    );
    console.log(ui.toString());
  } else {
    // Simple daily view
    const ui = cliui({ width: 100 });
    ui.div(
      col(chalk.bold("DATE"), 12),
      col(chalk.bold("REQS"), 7, "right"),
      col(chalk.bold("INPUT"), 12, "right"),
      col(chalk.bold("OUTPUT"), 12, "right"),
      col(chalk.bold("CACHE R"), 12, "right"),
      col(chalk.bold("SPEND"), 10, "right"),
      col(chalk.bold("BAR"), 22),
    );
    ui.div(divider(100));

    for (const d of sortedDays) {
      ui.div(
        col(d.date, 12),
        col(formatNumber(d.requests), 7, "right"),
        col(formatNumber(d.inputTokens), 12, "right"),
        col(formatNumber(d.outputTokens), 12, "right"),
        col(formatNumber(d.cacheReadTokens), 12, "right"),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
      );
    }
    ui.div(divider(100));
    const totalSpend = sortedDays.reduce((s, d) => s + d.spend, 0);
    const totalReqs = sortedDays.reduce((s, d) => s + d.requests, 0);
    const totalInput = sortedDays.reduce((s, d) => s + d.inputTokens, 0);
    const totalOutput = sortedDays.reduce((s, d) => s + d.outputTokens, 0);
    const totalCache = sortedDays.reduce((s, d) => s + d.cacheReadTokens, 0);
    ui.div(
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatNumber(totalReqs)), 7, "right"),
      col(chalk.bold(formatNumber(totalInput)), 12, "right"),
      col(chalk.bold(formatNumber(totalOutput)), 12, "right"),
      col(chalk.bold(formatNumber(totalCache)), 12, "right"),
      col(chalk.bold(formatCurrency(totalSpend)), 10, "right"),
      col("", 22),
    );
    console.log(ui.toString());
  }
}
