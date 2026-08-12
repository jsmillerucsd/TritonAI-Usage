import chalk from "chalk";
import type { Config } from "../config.js";
import { findKey } from "../config.js";
import { getSpendLogs, type SpendLog } from "../api.js";
import { col, daysAgo, divider, formatCurrency, formatNumber, renderTable, today, type Column } from "../format.js";

interface CacheStats {
  totalInput: number;
  cacheRead: number;
  cacheWrite: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  inputCost: number;
  outputCost: number;
  totalSpend: number;
  requests: number;
  cachedRequests: number;
}

interface ModelCacheStats extends CacheStats {
  model: string;
}

function computeStats(logs: SpendLog[]): CacheStats {
  const s: CacheStats = {
    totalInput: 0,
    cacheRead: 0,
    cacheWrite: 0,
    cacheReadCost: 0,
    cacheWriteCost: 0,
    inputCost: 0,
    outputCost: 0,
    totalSpend: 0,
    requests: 0,
    cachedRequests: 0,
  };
  for (const log of logs) {
    const cr = log.metadata?.usage_object?.cache_read_input_tokens ?? 0;
    const cw = log.metadata?.usage_object?.cache_creation_input_tokens ?? 0;
    s.totalInput += log.prompt_tokens ?? 0;
    s.cacheRead += cr;
    s.cacheWrite += cw;
    s.cacheReadCost += log.metadata?.cost_breakdown?.cache_read_cost ?? 0;
    s.cacheWriteCost += log.metadata?.cost_breakdown?.cache_creation_cost ?? 0;
    s.inputCost += log.metadata?.cost_breakdown?.input_cost ?? 0;
    s.outputCost += log.metadata?.cost_breakdown?.output_cost ?? 0;
    s.totalSpend += log.spend ?? 0;
    s.requests += 1;
    if (cr > 0) s.cachedRequests += 1;
  }
  return s;
}

function computeByModel(logs: SpendLog[]): ModelCacheStats[] {
  const byModel = new Map<string, CacheStats>();
  for (const log of logs) {
    const model = log.model ?? "(unknown)";
    const s = byModel.get(model) ?? {
      totalInput: 0, cacheRead: 0, cacheWrite: 0, cacheReadCost: 0,
      cacheWriteCost: 0, inputCost: 0, outputCost: 0, totalSpend: 0,
      requests: 0, cachedRequests: 0,
    };
    const cr = log.metadata?.usage_object?.cache_read_input_tokens ?? 0;
    const cw = log.metadata?.usage_object?.cache_creation_input_tokens ?? 0;
    s.totalInput += log.prompt_tokens ?? 0;
    s.cacheRead += cr;
    s.cacheWrite += cw;
    s.cacheReadCost += log.metadata?.cost_breakdown?.cache_read_cost ?? 0;
    s.cacheWriteCost += log.metadata?.cost_breakdown?.cache_creation_cost ?? 0;
    s.inputCost += log.metadata?.cost_breakdown?.input_cost ?? 0;
    s.outputCost += log.metadata?.cost_breakdown?.output_cost ?? 0;
    s.totalSpend += log.spend ?? 0;
    s.requests += 1;
    if (cr > 0) s.cachedRequests += 1;
    byModel.set(model, s);
  }
  return [...byModel.entries()]
    .map(([model, s]) => ({ ...s, model }))
    .sort((a, b) => b.cacheRead - a.cacheRead);
}

export async function cacheCommand(
  config: Config,
  opts: { key?: string; start?: string; end?: string },
): Promise<void> {
  const keyName = opts.key ?? config.keys[0]?.name;
  const key = findKey(config, keyName ?? "");
  if (!key) throw new Error(`Key "${keyName}" not found.`);
  const startDate = opts.start ?? daysAgo(7);
  const endDate = opts.end ?? today();

  console.log(chalk.bold.underline(`Cache Analysis: ${key.name}`));
  console.log(chalk.gray(`Range: ${startDate} -> ${endDate}`));
  console.log();

  const logs = await getSpendLogs(config, key, startDate, endDate);
  if (logs.length === 0) {
    console.log(chalk.yellow(`No requests in ${startDate} -> ${endDate}`));
    return;
  }

  const stats = computeStats(logs);
  const byModel = computeByModel(logs);

  // Summary
  const totalInputTokens = stats.totalInput + stats.cacheRead;
  const hitRate = totalInputTokens > 0 ? (stats.cacheRead / totalInputTokens) * 100 : 0;
  const cacheCostRatio = stats.totalSpend > 0 ? ((stats.cacheReadCost + stats.cacheWriteCost) / stats.totalSpend) * 100 : 0;

  // Estimate savings: what would the input cost be without caching?
  // Cache read cost is typically 10% of normal input cost.
  // So savings ~= cacheRead * (inputCostPerToken - cacheReadCostPerToken)
  // We can approximate: if cache_read_cost is X for Y tokens, normal cost would be ~10X
  const estimatedSavings = stats.cacheReadCost * 9; // 10x multiplier minus the cache cost itself

  console.log(chalk.bold("Summary"));
  console.log(`  Requests:          ${formatNumber(stats.requests)} (${stats.cachedRequests} with cache hits)`);
  console.log(`  Cache hit rate:    ${chalk.cyan(hitRate.toFixed(1) + "%")} of input tokens served from cache`);
  console.log(`  Cache reads:       ${formatNumber(stats.cacheRead)} tokens`);
  console.log(`  Cache writes:      ${formatNumber(stats.cacheWrite)} tokens`);
  console.log(`  Cache cost:        ${formatCurrency(stats.cacheReadCost + stats.cacheWriteCost)} (${cacheCostRatio.toFixed(1)}% of total spend)`);
  console.log(`  Total spend:       ${formatCurrency(stats.totalSpend)}`);
  console.log(`  Est. savings:      ${chalk.green(formatCurrency(estimatedSavings))} (approximate cost avoided by caching)`);
  console.log();

  // Per-model breakdown
  if (byModel.length > 0) {
    const widths = [30, 10, 14, 14, 12, 10, 10];
    const tableRows: Column[][] = [
      [
        col(chalk.bold("MODEL"), 30),
        col(chalk.bold("REQS"), 10, "right"),
        col(chalk.bold("CACHE READ"), 14, "right"),
        col(chalk.bold("CACHE WRITE"), 14, "right"),
        col(chalk.bold("HIT %"), 12, "right"),
        col(chalk.bold("CACHE $"), 10, "right"),
        col(chalk.bold("SPEND"), 10, "right"),
      ],
      [divider(widths.reduce((a, b) => a + b + 2, -2))],
    ];

    for (const m of byModel) {
      const totalIn = m.totalInput + m.cacheRead;
      const rate = totalIn > 0 ? (m.cacheRead / totalIn) * 100 : 0;
      const cacheCost = m.cacheReadCost + m.cacheWriteCost;
      tableRows.push([
        col(m.model.replace("vertex_ai/", ""), 30),
        col(formatNumber(m.requests), 10, "right"),
        col(formatNumber(m.cacheRead), 14, "right"),
        col(formatNumber(m.cacheWrite), 14, "right"),
        col(rate > 0 ? `${rate.toFixed(0)}%` : "—", 12, "right"),
        col(cacheCost > 0 ? formatCurrency(cacheCost) : "—", 10, "right"),
        col(formatCurrency(m.totalSpend), 10, "right"),
      ]);
    }
    tableRows.push([divider(widths.reduce((a, b) => a + b + 2, -2))]);
    tableRows.push([
      col(chalk.bold("TOTAL"), 30),
      col(chalk.bold(formatNumber(stats.requests)), 10, "right"),
      col(chalk.bold(formatNumber(stats.cacheRead)), 14, "right"),
      col(chalk.bold(formatNumber(stats.cacheWrite)), 14, "right"),
      col(chalk.bold(`${hitRate.toFixed(0)}%`), 12, "right"),
      col(chalk.bold(formatCurrency(stats.cacheReadCost + stats.cacheWriteCost)), 10, "right"),
      col(chalk.bold(formatCurrency(stats.totalSpend)), 10, "right"),
    ]);
    console.log(renderTable(tableRows, widths));
  }
}
