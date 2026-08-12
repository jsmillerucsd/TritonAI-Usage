import chalk from "chalk";

// Matches cliui's Column type (cliui 8 ships no .d.ts in the package)
export interface Column {
  text: string;
  width: number;
  padding: number[];
  align: "left" | "right" | "center";
}

export function col(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
): Column {
  return { text, width, padding: [0, 1, 0, 1], align };
}

export function divider(width: number): Column {
  return { text: "─".repeat(width), width, padding: [0, 0, 0, 0], align: "left" };
}

export function formatCurrency(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  return formatDateTime(iso);
}

export function budgetBar(spend: number, max: number | null): string {
  if (max === null || max === undefined || max <= 0) {
    return chalk.gray("no budget");
  }
  const pct = Math.min(100, (spend / max) * 100);
  const width = 16;
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  const color = pct >= 100 ? chalk.red : pct >= 80 ? chalk.yellow : chalk.green;
  return `${color(bar)} ${pct.toFixed(0)}%`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
