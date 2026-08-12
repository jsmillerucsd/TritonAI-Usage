# TritonAI-Usage

A CLI for monitoring API key spend and usage on [TritonAI](https://tritonai-api.ucsd.edu/) or any [LiteLLM](https://docs.litellm.ai/docs/proxy/get_started) proxy. Track spend across multiple keys. Break down usage by day, model, and session. All from your terminal.

Inspired by [`ccusage`](https://github.com/ryoppippi/ccusage). Built for LiteLLM proxies.

## Install

Requires Node.js 18+.

**npx (no install):**
```bash
npx triton-usage dashboard
```

**npm (global):**
```bash
npm install -g triton-usage
triton-usage dashboard
```

**From source:**
```bash
git clone https://github.com/jsmillerucsd/TritonAI-Usage.git
cd TritonAI-Usage
npm install
npm run build
npm link
```

## Using with Claude Code, Codex, or any AI harness

If your AI coding tool routes requests through a LiteLLM proxy, TritonAI-Usage shows you exactly how much each session costs. Configure your proxy keys (see below) and run any command. Works with any LiteLLM-compatible endpoint by setting the base URL.

## Configuration

Keys can be provided via environment variables, a config file, or both. Environment variables take precedence on name collisions.

### Environment variables

```bash
export TRITONAI_BASE_URL=https://tritonai-api.ucsd.edu
export TRITONAI_KEY=sk-...
export TRITONAI_KEY_WORKSPACE=sk-...
export TRITONAI_KEY_CI_BOT=sk-...
```

### Config file

TritonAI-Usage searches for `.triton-usage.json` (or `.jsonc`) in this order:

1. Current working directory
2. Repo root (next to `package.json`)
3. Home directory

The first file found is used. Copy the example to get started:

```bash
cp .triton-usage.example.jsonc .triton-usage.jsonc
```

```jsonc
{
  "base_url": "https://tritonai-api.ucsd.edu",
  "keys": {
    "workspace":  "sk-...",
    "ci-bot":     "sk-...",
    "team-alice": "sk-..."
  }
}
```

> **Security:** `.triton-usage.json` and `.triton-usage.jsonc` are gitignored by default so secrets are never committed. Only `.triton-usage.example.jsonc` (with placeholder values) is tracked.

## Commands

### `triton-usage`

Show help with a list of all commands.

### `triton-usage dashboard`

Snapshot of all configured keys: spend, budget, usage bar, last active time, and model count.

```
TritonAI Key Dashboard
Endpoint: https://tritonai-api.ucsd.edu
Keys:     3

NAME              STATUS           SPEND       BUDGET  USAGE                   LAST ACTIVE      MODELS
──────────────────────────────────────────────────────────────────────────────────────────────────────
spa-default       active         $382.03     $2000.00  ███░░░░░░░░░░░░░ 19%    18s ago               1
spa-on-prem       active         $0.0000     $2000.00  ░░░░░░░░░░░░░░░░ 0%     —                     1
continue.dev      active         $236.45            —  no budget               40s ago               1
```

### `triton-usage daily`

Day-by-day usage with spend bars and token counts. Defaults to last 14 days. Uses the aggregated spend report API for fast results (~3 seconds for 14 days).

```
Daily Usage: spa-default
Range: 2026-07-29 -> 2026-08-12

DATE                   INPUT          OUTPUT          TOKENS       SPEND  BAR
──────────────────────────────────────────────────────────────────────────────
2026-08-11            27.90M          314.0k          28.22M      $28.49  ██░░░░░░░░░░░░░░░░░░
2026-08-12           455.15M           2.13M         457.28M     $354.03  ████████████████████
──────────────────────────────────────────────────────────────────────────────
TOTAL                483.06M           2.44M         485.50M     $382.52
```

With `--models` for a per-model breakdown per day:

```
Daily Usage: spa-default
Range: 2026-07-29 -> 2026-08-12

DATE               SPEND  BAR                          claude-opus-5     claude-sonnet-5
────────────────────────────────────────────────────────────────────────────────────────
2026-08-11        $28.49  ██░░░░░░░░░░░░░░░░░░                $24.68               $3.80
2026-08-12       $354.03  ████████████████████               $256.78              $97.26
────────────────────────────────────────────────────────────────────────────────────────
TOTAL            $382.52                                     $281.46             $101.06
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-m, --models` | off | Show per-model spend per day |

### `triton-usage sessions`

Per-session breakdown. Groups requests by `session_id` so you can see how much each coding session cost. Sorted by spend (highest first). Defaults to last 7 days.

A progress indicator is shown while fetching logs, since high-volume keys can have thousands of requests.

```
Sessions: spa-default
Range: 2026-08-12 → 2026-08-12

SESSION       REQS        INPUT      OUTPUT      CACHE R      HIT %     CACHE $       SPEND  BAR                   MODELS
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
666dccca       877      179.39M      549.6k      174.12M        49%     $102.49     $117.14  ████████████████████  claude-opus-5, claude-sonnet-5
433e000d       738       57.00M      756.9k       49.97M        47%      $57.31      $77.99  █████████████░░░░░░░  claude-opus-5, claude-sonnet-5
cc27a8e1       162       80.60M      163.1k       75.53M        48%      $62.27      $66.68  ███████████░░░░░░░░░  claude-opus-5, claude-sonnet-5
a69945a4       339       87.68M      309.6k       84.58M        49%      $37.41      $42.23  ███████░░░░░░░░░░░░░  claude-sonnet-5, claude-opus-5
2b774c17       217       22.39M      217.8k       20.33M        48%      $19.24      $25.10  ████░░░░░░░░░░░░░░░░  claude-opus-5, claude-sonnet-5
d478d051       186       28.09M      129.5k       26.40M        48%      $21.54      $24.88  ████░░░░░░░░░░░░░░░░  claude-opus-5, claude-sonnet-5
─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TOTAL (6)     2.5k      455.15M       2.13M      430.94M        49%     $300.25     $354.03
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 7 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-n, --limit <n>` | 20 | Max sessions to show |

### `triton-usage cache`

Cache analytics for prompt caching. Shows hit rate, cache read/write tokens, cache cost, estimated savings, and a per-model breakdown. Defaults to last 7 days.

```
Cache Analysis: spa-default
Range: 2026-08-12 -> 2026-08-12

Summary
  Requests:          2.5k (2299 with cache hits)
  Cache hit rate:    48.6% of input tokens served from cache
  Cache reads:       431.66M tokens
  Cache writes:      23.34M tokens
  Cache cost:        $300.72 (84.8% of total spend)
  Total spend:       $354.54
  Est. savings:      $1647.65 (approximate cost avoided by caching)

MODEL                                 REQS      CACHE READ     CACHE WRITE         HIT %     CACHE $       SPEND
────────────────────────────────────────────────────────────────────────────────────────────────────────────────
claude-opus-5                         1.3k         267.88M          12.05M           49%     $209.26     $257.29
claude-sonnet-5                       1.2k         163.78M          11.29M           48%      $91.46      $97.25
────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TOTAL                                 2.5k         431.66M          23.34M           49%     $300.72     $354.54
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 7 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |

### `triton-usage report`

Per-model spend breakdown for a single key over a date range. Defaults to last 30 days. Shows budget usage and each model's share of total spend.

```
Spend Report: spa-default
Range: 2026-07-13 → 2026-08-12

Current spend: $381.97 / $2000.00
  ███░░░░░░░░░░░░░ 19%
Last active:  2026-08-12T20:54:23.479000+00:00

MODEL                                      INPUT TOK      OUTPUT TOK         SPEND       SHARE
──────────────────────────────────────────────────────────────────────────────────────────────
vertex_ai/claude-opus-5                      304.48M           2.09M       $281.46       73.5%
vertex_ai/claude-sonnet-5                    179.22M          351.0k       $101.30       26.5%
──────────────────────────────────────────────────────────────────────────────────────────────
TOTAL                                        483.70M           2.44M       $382.76
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 30 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |

## How it works

TritonAI-Usage queries three LiteLLM proxy endpoints:

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /key/info` | `dashboard`, `report` | Current spend, budget, models, last active |
| `GET /key/spend/report` | `report`, `daily` | Aggregated per-model spend over a date range |
| `GET /spend/logs/v2` | `sessions`, `cache` | Per-request logs (paginated) for session and cache breakdowns |

All endpoints are callable by the key itself. No proxy admin key required. Each key only needs permission to view its own usage.

> **Note on log retention:** LiteLLM proxies may prune per-request logs after a retention period. When this happens, `sessions` and `cache` will show data only for days where logs still exist. The `report`, `daily`, and `dashboard` commands use aggregated spend tables and are not affected by log retention.

> **Performance:** `daily` and `report` use the aggregated spend API and complete in seconds. `sessions` and `cache` fetch per-request logs, which can be slow for high-volume keys (thousands of requests per day). A progress indicator is shown during fetch. Narrow the date range with `-s` and `-e` for faster results.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup -> dist/
npm run dev         # tsx src/index.ts (no build step)
```
