#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { reportCommand } from "./commands/report.js";

const program = new Command();

program
  .name("triton-usage")
  .description("Monitor TritonAI / LiteLLM API key spend and usage")
  .version("0.1.0")
  .option("--base-url <url>", "Override the LiteLLM API base URL");

program
  .command("dashboard")
  .description("Show spend/budget snapshot for all configured keys (default)")
  .action(async () => {
    try {
      const config = loadConfig();
      await dashboardCommand(config);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("report")
  .description("Per-model spend breakdown for a single key over a date range")
  .option("-k, --key <name>", "Which configured key to use (defaults to first)")
  .option("-s, --start <date>", "Start date YYYY-MM-DD (default: 30 days ago)")
  .option("-e, --end <date>", "End date YYYY-MM-DD (default: today)")
  .action(async (opts: { key?: string; start?: string; end?: string }) => {
    try {
      const config = loadConfig();
      await reportCommand(config, opts);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program.action(async () => {
  try {
    const config = loadConfig();
    await dashboardCommand(config);
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exit(1);
  }
});

program.parseAsync(process.argv);
