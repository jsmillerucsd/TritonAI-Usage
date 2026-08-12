import chalk from "chalk";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getKeyInfo, getKeySpendReport } from "../api.js";
import { budgetBar, col, daysAgo, divider, formatCurrency, formatNumber, renderTable, today, type Column } from "../format.js";

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

  const info = await getKeyInfo(config, key);
  console.log(
    `${chalk.bold("Current spend:")} ${formatCurrency(info.spend ?? 0)} / ${info.max_budget !== null ? formatCurrency(info.max_budget) : "no budget"}`,
  );
  console.log(`  ${budgetBar(info.spend ?? 0, info.max_budget)}`);
  console.log(
    `${chalk.bold("Last active:")}  ${info.last_active ?? "—"}`,
  );
  console.log();

  const report = await getKeySpendReport(config, key, startDate, endDate);
  if (report.length === 0) {
    console.log(chalk.yellow(`No spend in ${startDate} → ${endDate}`));
    return;
  }

  const row = report[0];
  const details = row.model_details ?? [];
  if (details.length === 0) {
    console.log(chalk.yellow(`No model-level breakdown available.`));
    return;
  }

  const totalSpend = row.total_cost ?? 0;
  const totalInput = row.total_input_tokens ?? 0;
  const totalOutput = row.total_output_tokens ?? 0;

  const sorted = [...details]
    .filter((d) => d.total_cost > 0 || d.total_input_tokens > 0)
    .sort((a, b) => (b.total_cost ?? 0) - (a.total_cost ?? 0));

  const widths = [36, 14, 14, 12, 10];
  const tableRows: Column[][] = [
    [
      col(chalk.bold("MODEL"), 36),
      col(chalk.bold("INPUT TOK"), 14, "right"),
      col(chalk.bold("OUTPUT TOK"), 14, "right"),
      col(chalk.bold("SPEND"), 12, "right"),
      col(chalk.bold("SHARE"), 10, "right"),
    ],
    [divider(widths.reduce((a, b) => a + b + 2, -2))],
  ];

  for (const d of sorted) {
    const share = totalSpend > 0 ? ((d.total_cost ?? 0) / totalSpend) * 100 : 0;
    tableRows.push([
      col(d.model, 36),
      col(formatNumber(d.total_input_tokens), 14, "right"),
      col(formatNumber(d.total_output_tokens), 14, "right"),
      col(formatCurrency(d.total_cost ?? 0), 12, "right"),
      col(`${share.toFixed(1)}%`, 10, "right"),
    ]);
  }
  tableRows.push([divider(widths.reduce((a, b) => a + b + 2, -2))]);
  tableRows.push([
    col(chalk.bold("TOTAL"), 36),
    col(chalk.bold(formatNumber(totalInput)), 14, "right"),
    col(chalk.bold(formatNumber(totalOutput)), 14, "right"),
    col(chalk.bold(formatCurrency(totalSpend)), 12, "right"),
    col("", 10, "right"),
  ]);
  console.log(renderTable(tableRows, widths));
}
