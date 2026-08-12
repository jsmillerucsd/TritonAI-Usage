# triton-usage

A CLI tool for monitoring API key spend and usage on [TritonAI](https://tritonai-api.ucsd.edu/) or any [LiteLLM](https://docs.litellm.ai/docs/proxy/get_started) proxy. Track spend across multiple keys, break down usage by day, model, and session, all from your terminal.

Inspired by [`ccusage`](https://github.com/ryoppippi/ccusage), built for LiteLLM proxies.

## Install

Requires Node.js 18 or higher.

**npx (no install):**
```bash
npx triton-usage dashboard
```

**npm install (global):**
```bash
npm install -g triton-usage
triton-usage dashboard
```

**Build from source:**
```bash
git clone https://github.com/jsmillerucsd/TritonAI-Usage.git
cd triton-usage
npm install
npm run build
npm link
```

After `npm link`, `triton-usage` is available globally.

## Using with Claude Code, Codex, or any AI harness

If you use an AI coding tool (Claude Code, Codex, Cursor, etc.) that routes requests through a LiteLLM proxy, `triton-usage` shows you exactly how much each session costs. Configure your proxy keys (see below) and run any command. The tool works with any LiteLLM-compatible endpoint by setting the base URL.

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

`triton-usage` searches for `.triton-usage.json` (or `.jsonc`) in this order:

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

Snapshot of all configured keys: current spend, budget, usage bar, last active time, and allowed model count.

```
NAME              STATUS           SPEND       BUDGET  USAGE                   LAST ACTIVE      MODELS
──────────────────────────────────────────────────────────────────────────────────────────────────────
workspace         active         $252.85     $2000.00  ██░░░░░░░░░░░░░░ 13%    2m ago                1
ci-bot            active          $12.40      $500.00  █░░░░░░░░░░░░░░░ 2%     1h ago                3
team-alice        active         $187.22            —  no budget               5s ago                1
```

### `triton-usage daily`

Day-by-day usage with spend bars and token counts (input, output, cache reads). Defaults to the last 14 days.

```
DATE             REQS         INPUT        OUTPUT       CACHE R       SPEND  BAR
───────────────────────────────────────────────────────────────────────────────
2026-08-11        129        27.90M        314.0k        26.29M      $28.49  ████████████████████
───────────────────────────────────────────────────────────────────────────────
TOTAL             129        27.90M        314.0k        26.29M      $28.49
```

With `--models` for a per-model breakdown per day:

```
DATE             REQS       SPEND  BAR                    claude-opus-5     claude-sonnet-5
──────────────────────────────────────────────────────────────────────────────────────────
2026-08-11        129      $28.49  ████████████████████          $24.68               $3.80
──────────────────────────────────────────────────────────────────────────────────────────
TOTAL             129      $28.49                                $24.68               $3.80
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-m, --models` | off | Show per-model spend per day |

### `triton-usage sessions`

Per-session breakdown. Groups requests by `session_id` so you can see how much each coding session cost. Sorted by spend (highest first).

```
SESSION       REQS        INPUT      OUTPUT      CACHE R    DURATION       SPEND  BAR                   MODELS
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
cc27a8e1       128       27.90M      314.0k       26.29M      59m26s      $28.49  ████████████████████  claude-opus-5, claude-sonnet-5
9d81b44d         1            0           0            0         0ms     $0.0000  ░
──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
TOTAL (2)      129       27.90M      314.0k       26.29M                  $28.49
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-n, --limit <n>` | 20 | Max sessions to show |

### `triton-usage report`

Per-model spend breakdown for a single key over a date range. Defaults to the last 30 days.

```
MODEL                                  INPUT TOK    OUTPUT TOK       SPEND     SHARE
──────────────────────────────────────────────────────────────────────────────────
vertex_ai/claude-opus-5                  216.88M         1.25M    $209.18     83.9%
vertex_ai/claude-sonnet-5                 57.35M         30.1k     $43.66     16.1%
──────────────────────────────────────────────────────────────────────────────────
TOTAL                                    274.23M         1.28M    $252.85
```

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which key to report on |
| `-s, --start <date>` | 30 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |

## How it works

`triton-usage` queries three LiteLLM proxy endpoints:

| Endpoint | Used by | Purpose |
| --- | --- | --- |
| `GET /key/info` | `dashboard`, `report` | Current spend, budget, models, last active |
| `GET /key/spend/report` | `report`, `daily` | Aggregated per-model spend over a date range |
| `GET /spend/logs/v2` | `daily`, `sessions` | Per-request logs (paginated) for day/session breakdowns |

All endpoints are callable by the key itself. No proxy admin key required. Each key only needs permission to view its own usage.

> **Note on log retention:** LiteLLM proxies may prune per-request logs after a retention period. When this happens, `daily` and `sessions` will show data only for days where logs still exist, with a note indicating the gap. The `report` and `dashboard` commands use aggregated spend tables and are not affected by log retention.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup -> dist/
npm run dev         # tsx src/index.ts (no build step)
```
