import chalk from "chalk";

export interface Column {
  text: string;
  width: number;
  align: "left" | "right" | "center";
}

export function col(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
): Column {
  return { text, width, align };
}

export function divider(width: number): Column {
  return { text: "─".repeat(width), width, align: "left" };
}

function pad(text: string, width: number, align: "left" | "right" | "center"): string {
  const visible = stripAnsi(text);
  const len = visible.length;
  if (len >= width) return text;
  const padCount = width - len;
  if (align === "right") return " ".repeat(padCount) + text;
  if (align === "center") {
    const left = Math.floor(padCount / 2);
    return " ".repeat(left) + text + " ".repeat(padCount - left);
  }
  return text + " ".repeat(padCount);
}

function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

export function renderTable(columns: Column[][], widths: number[]): string {
  const lines: string[] = [];
  for (const cols of columns) {
    const parts = cols.map((c, i) => pad(c.text, widths[i], c.align));
    lines.push(parts.join("  "));
  }
  return lines.join("\n");
}

export function formatCurrency(n: number): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n < 0.01 && n > 0) return `$${n.toFixed(6)}`;
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

export function sparkBar(value: number, max: number, width = 20): string {
  if (max <= 0) return chalk.gray("░".repeat(width));
  const filled = Math.max(1, Math.round((value / max) * width));
  return chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
