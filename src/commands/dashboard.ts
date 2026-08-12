import chalk from "chalk";
import type { Config } from "../config.js";
import { getKeyInfo, getKeySpendReport } from "../api.js";
import { budgetBar, col, divider, formatCurrency, formatRelative, renderTable, today, daysAgo, type Column } from "../format.js";

interface Row {
  name: string;
  status: string;
  spend: string;
  budget: string;
  usage: string;
  lastActive: string;
  models: string;
  error?: string;
}

async function fetchModelCount(
  config: Config,
  key: { name: string; apiKey: string },
): Promise<string> {
  // Try /key/spend/report with a 30-day range (fast, gives model_details)
  // Some keys (self-service) can't access this endpoint
  try {
    const report = await getKeySpendReport(config, key, daysAgo(30), today());
    const models = (report[0]?.model_details ?? []).filter(
      (d) => (d.total_cost ?? 0) > 0 || (d.total_input_tokens ?? 0) > 0,
    );
    if (models.length > 0) return String(models.length);
  }
  catch { /* key may not have permission */ }

  return "—";
}

async function fetchRow(
  config: Config,
  key: { name: string; apiKey: string },
): Promise<Row> {
  try {
    const info = await getKeyInfo(config, key);
    const blocked = info.blocked === true;
    const expired = info.expires !== null && new Date(info.expires) < new Date();
    let status: string;
    if (blocked) status = chalk.red("blocked");
    else if (expired) status = chalk.red("expired");
    else status = chalk.green("active");

    // Get actual model count in parallel with other data
    const modelCount = await fetchModelCount(config, key);

    return {
      name: key.name,
      status,
      spend: formatCurrency(info.spend ?? 0),
      budget: info.max_budget !== null ? formatCurrency(info.max_budget) : "—",
      usage: budgetBar(info.spend ?? 0, info.max_budget),
      lastActive: formatRelative(info.last_active),
      models: modelCount,
    };
  } catch (err) {
    return {
      name: key.name,
      status: chalk.gray("error"),
      spend: "—",
      budget: "—",
      usage: "—",
      lastActive: "—",
      models: "—",
      error: (err as Error).message,
    };
  }
}

export async function dashboardCommand(config: Config): Promise<void> {
  console.log(chalk.bold.underline(`TritonAI Key Dashboard`));
  console.log(chalk.gray(`Endpoint: ${config.baseUrl}`));
  console.log(chalk.gray(`Keys:     ${config.keys.length}`));
  console.log();

  const rows = await Promise.all(config.keys.map((k) => fetchRow(config, k)));

  const widths = [16, 9, 11, 11, 22, 14, 7];
  const tableRows: Column[][] = [
    [
      col(chalk.bold("NAME"), 16),
      col(chalk.bold("STATUS"), 9),
      col(chalk.bold("SPEND"), 11, "right"),
      col(chalk.bold("BUDGET"), 11, "right"),
      col(chalk.bold("USAGE"), 22),
      col(chalk.bold("LAST ACTIVE"), 14),
      col(chalk.bold("MODELS"), 7, "right"),
    ],
    [divider(widths.reduce((a, b) => a + b + 2, -2))],
  ];

  for (const r of rows) {
    tableRows.push([
      col(r.name, 16),
      col(r.status, 9),
      col(r.spend, 11, "right"),
      col(r.budget, 11, "right"),
      col(r.usage, 22),
      col(r.lastActive, 14),
      col(r.models, 7, "right"),
    ]);
  }
  console.log(renderTable(tableRows, widths));

  const errors = rows.filter((r) => r.error);
  if (errors.length > 0) {
    console.log();
    for (const e of errors) {
      console.log(chalk.red(`  ${e.name}: ${e.error}`));
    }
  }
}
