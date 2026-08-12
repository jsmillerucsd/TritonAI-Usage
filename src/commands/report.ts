import chalk from "chalk";
import cliui from "cliui";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getKeyInfo, getKeySpendReport, type SpendReportRow } from "../api.js";
import {
  budgetBar,
  col,
  daysAgo,
  divider,
  formatCurrency,
  formatNumber,
  today,
} from "../format.js";

interface ModelBreakdown {
  model: string;
  spend: number;
  tokens: number;
  calls: number;
}

function aggregateByModel(rows: SpendReportRow[]): ModelBreakdown[] {
  const byModel = new Map<string, ModelBreakdown>();
  for (const row of rows) {
    const model = row.model ?? "(unknown)";
    const entry =
      byModel.get(model) ?? { model, spend: 0, tokens: 0, calls: 0 };
    entry.spend += Number(row.spend ?? 0);
    entry.tokens += Number(row.total_tokens ?? 0);
    entry.calls += Number(row.call_count ?? 0);
    byModel.set(model, entry);
  }
  return [...byModel.values()].sort((a, b) => b.spend - a.spend);
}

export async function reportCommand(
  config: Config,
  opts: {
    key?: string;
    start?: string;
    end?: string;
  },
): Promise<void> {
  const keyName = opts.key ?? config.keys[0]?.name;
  if (!keyName) {
    throw new Error("No key available. Configure keys via env or config file.");
  }
  const key = findKey(config, keyName);
  if (!key) {
    throw new Error(
      `Key "${keyName}" not found. Available: ${config.keys.map((k) => k.name).join(", ")}`,
    );
  }

  const startDate = opts.start ?? daysAgo(30);
  const endDate = opts.end ?? today();

  console.log(chalk.bold.underline(`Spend Report: ${key.name}`));
  console.log(chalk.gray(`Range: ${startDate} → ${endDate}`));
  console.log();

  // Snapshot of current key info
  const info = await getKeyInfo(config, key);
  console.log(
    `${chalk.bold("Current spend:")} ${formatCurrency(info.spend ?? 0)} / ${info.max_budget !== null ? formatCurrency(info.max_budget) : "no budget"}`,
  );
  console.log(`  ${budgetBar(info.spend ?? 0, info.max_budget)}`);
  console.log(
    `${chalk.bold("Last active:")}  ${info.last_active ?? "—"}`,
  );
  console.log();

  // Per-model breakdown
  const rows = await getKeySpendReport(config, key, startDate, endDate);
  if (rows.length === 0) {
    console.log(chalk.yellow(`No spend in ${startDate} → ${endDate}`));
    return;
  }

  const breakdown = aggregateByModel(rows);
  const totalSpend = breakdown.reduce((s, r) => s + r.spend, 0);
  const totalTokens = breakdown.reduce((s, r) => s + r.tokens, 0);
  const totalCalls = breakdown.reduce((s, r) => s + r.calls, 0);

  const ui = cliui({ width: 90 });
  ui.div(
    col(chalk.bold("MODEL"), 40),
    col(chalk.bold("CALLS"), 10, "right"),
    col(chalk.bold("TOKENS"), 14, "right"),
    col(chalk.bold("SPEND"), 12, "right"),
    col(chalk.bold("SHARE"), 10, "right"),
  );
  ui.div(divider(90));

  for (const r of breakdown) {
    const share = totalSpend > 0 ? (r.spend / totalSpend) * 100 : 0;
    ui.div(
      col(r.model, 40),
      col(formatNumber(r.calls), 10, "right"),
      col(formatNumber(r.tokens), 14, "right"),
      col(formatCurrency(r.spend), 12, "right"),
      col(`${share.toFixed(1)}%`, 10, "right"),
    );
  }
  ui.div(divider(90));
  ui.div(
    col(chalk.bold("TOTAL"), 40),
    col(chalk.bold(formatNumber(totalCalls)), 10, "right"),
    col(chalk.bold(formatNumber(totalTokens)), 14, "right"),
    col(chalk.bold(formatCurrency(totalSpend)), 12, "right"),
    col("", 10, "right"),
  );
  console.log(ui.toString());
}
