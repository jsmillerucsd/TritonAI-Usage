import chalk from "chalk";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getKeySpendReport } from "../api.js";
import { col, daysAgo, divider, formatCurrency, formatNumber, renderTable, sparkBar, today, type Column } from "../format.js";

interface DayReport {
  date: string;
  spend: number;
  inputTokens: number;
  outputTokens: number;
  byModel: Map<string, number>;
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const s = new Date(Date.UTC(sy, sm - 1, sd));
  const e = new Date(Date.UTC(ey, em - 1, ed));
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function fetchDailyReports(
  config: Config,
  key: { name: string; apiKey: string },
  dates: string[],
): Promise<DayReport[]> {
  const results: DayReport[] = [];

  // Batch in groups of 7 to avoid overwhelming the API
  for (let i = 0; i < dates.length; i += 7) {
    const batch = dates.slice(i, i + 7);
    const promises = batch.map(async (date) => {
      try {
        const report = await getKeySpendReport(config, key, date, date);
        const row = report[0];
        if (!row) return { date, spend: 0, inputTokens: 0, outputTokens: 0, byModel: new Map() };
        const byModel = new Map<string, number>();
        for (const d of row.model_details ?? []) {
          if ((d.total_cost ?? 0) > 0) byModel.set(d.model, d.total_cost ?? 0);
        }
        return {
          date,
          spend: row.total_cost ?? 0,
          inputTokens: row.total_input_tokens ?? 0,
          outputTokens: row.total_output_tokens ?? 0,
          byModel,
        };
      } catch {
        return { date, spend: 0, inputTokens: 0, outputTokens: 0, byModel: new Map() };
      }
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }
  return results.sort((a, b) => a.date.localeCompare(b.date));
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
  const showModels = opts.models === true;

  console.log(chalk.bold.underline(`Daily Usage: ${key.name}`));
  console.log(chalk.gray(`Range: ${startDate} -> ${endDate}`));
  console.log();

  const dates = dateRange(startDate, endDate);

  // Fetch per-day reports (fast: one small API call per day, batched)
  const reports = await fetchDailyReports(config, key, dates);
  const activeDays = reports.filter((d) => d.spend > 0);

  if (activeDays.length === 0) {
    console.log(chalk.yellow(`No spend in ${startDate} -> ${endDate}`));
    return;
  }

  const maxSpend = Math.max(...activeDays.map((d) => d.spend), 0.01);

  if (showModels) {
    // Collect all models across active days
    const allModels = new Set<string>();
    for (const d of activeDays) for (const m of d.byModel.keys()) allModels.add(m);
    const models = [...allModels].sort((a, b) => {
      const ai = a.replace("vertex_ai/", "");
      const bi = b.replace("vertex_ai/", "");
      if (ai === bi) return a.localeCompare(b);
      if (ai.includes("opus") && !bi.includes("opus")) return -1;
      if (!ai.includes("opus") && bi.includes("opus")) return 1;
      return ai.localeCompare(bi);
    });

    const modelColWidths = models.map(() => 18);
    const widths = [12, 10, 22, ...modelColWidths];
    const sep = widths.reduce((a, b) => a + b + 2, -2);
    const tableRows: Column[][] = [
      [
        col(chalk.bold("DATE"), 12),
        col(chalk.bold("SPEND"), 10, "right"),
        col(chalk.bold("BAR"), 22),
        ...models.map((m) => col(chalk.bold(m.replace("vertex_ai/", "")), 18, "right")),
      ],
      [divider(sep)],
    ];

    for (const d of activeDays) {
      tableRows.push([
        col(d.date, 12),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
        ...models.map((m) => {
          const val = d.byModel.get(m);
          return col(val ? formatCurrency(val) : "—", 18, "right");
        }),
      ]);
    }
    tableRows.push([divider(sep)]);
    const totalSpend = activeDays.reduce((s, d) => s + d.spend, 0);
    tableRows.push([
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatCurrency(totalSpend)), 10, "right"),
      col("", 22),
      ...models.map((m) => {
        const total = activeDays.reduce((s, d) => s + (d.byModel.get(m) ?? 0), 0);
        return col(chalk.bold(formatCurrency(total)), 18, "right");
      }),
    ]);
    console.log(renderTable(tableRows, widths));
  } else {
    const widths = [12, 14, 14, 14, 10, 22];
    const sep = widths.reduce((a, b) => a + b + 2, -2);
    const tableRows: Column[][] = [
      [
        col(chalk.bold("DATE"), 12),
        col(chalk.bold("INPUT"), 14, "right"),
        col(chalk.bold("OUTPUT"), 14, "right"),
        col(chalk.bold("TOKENS"), 14, "right"),
        col(chalk.bold("SPEND"), 10, "right"),
        col(chalk.bold("BAR"), 22),
      ],
      [divider(sep)],
    ];

    for (const d of activeDays) {
      tableRows.push([
        col(d.date, 12),
        col(formatNumber(d.inputTokens), 14, "right"),
        col(formatNumber(d.outputTokens), 14, "right"),
        col(formatNumber(d.inputTokens + d.outputTokens), 14, "right"),
        col(formatCurrency(d.spend), 10, "right"),
        col(sparkBar(d.spend, maxSpend), 22),
      ]);
    }
    tableRows.push([divider(sep)]);
    const totalSpend = activeDays.reduce((s, d) => s + d.spend, 0);
    const totalInput = activeDays.reduce((s, d) => s + d.inputTokens, 0);
    const totalOutput = activeDays.reduce((s, d) => s + d.outputTokens, 0);
    tableRows.push([
      col(chalk.bold("TOTAL"), 12),
      col(chalk.bold(formatNumber(totalInput)), 14, "right"),
      col(chalk.bold(formatNumber(totalOutput)), 14, "right"),
      col(chalk.bold(formatNumber(totalInput + totalOutput)), 14, "right"),
      col(chalk.bold(formatCurrency(totalSpend)), 10, "right"),
      col("", 22),
    ]);
    console.log(renderTable(tableRows, widths));
  }
}
