# triton-usage

A small CLI to monitor **[TritonAI](https://tritonai-api.ucsd.edu/) / LiteLLM** API key spend and usage. Inspired by [`ccusage`](https://github.com/ryoppippi/ccusage), but for any LiteLLM proxy.

## Features

- **`triton-usage dashboard`** — multi-key overview: spend, budget, usage bar, last active, model count
- **`triton-usage report`** — per-model spend breakdown for a single key over a date range
- **`triton-usage daily`** — daily usage with spend bars, token counts (input/output/cache), and optional per-model matrix
- **`triton-usage sessions`** — per-session breakdown (spend, tokens, duration, models) — like ccusage
- Keys loaded from env vars **and/or** a JSON config file
- Queries LiteLLM `/key/info`, `/key/spend/report`, and `/spend/logs/v2` endpoints

## Quick start

```bash
# From source
git clone <your-repo-url> TritonAI-Usage
cd TritonAI-Usage
npm install
npm run build
npm link   # makes `triton-usage` available globally

# Or via npx once published
npx triton-usage
```

Then configure your keys (see below) and run:

```bash
triton-usage                   # dashboard (default command)
triton-usage report            # last 30 days for first key
triton-usage report -k alice -s 2026-08-01 -e 2026-08-12
```

## Configuration

Keys can be provided via environment variables, a config file, or both (env wins on collisions).

### Environment variables

```bash
# Optional — override the base URL
TRITONAI_BASE_URL=https://tritonai-api.ucsd.edu

# Single key (becomes the "default" key)
TRITONAI_KEY=sk-...

# Named keys (suffix becomes the key name, lowercased)
TRITONAI_KEY_JUDE=sk-...
TRITONAI_KEY_ALICE=sk-...
```

### Config file

`triton-usage` looks for `.triton-usage.json` (or `.jsonc`) in this order:

1. **Current working directory** — project-local, easy to scope per project
2. **Repo root** — next to `package.json`, so `npm run dev` picks it up
3. **Home directory** — user-global fallback

The first file found wins. Copy `.triton-usage.example.jsonc` to get started:

```bash
cp .triton-usage.example.jsonc .triton-usage.jsonc
```

Then edit it:

```jsonc
{
  "base_url": "https://tritonai-api.ucsd.edu",
  "keys": {
    "jude": "sk-...",
    "alice": "sk-...",
    "ci-bot": "sk-..."
  }
}
```

> **Note:** `.triton-usage.json` and `.triton-usage.jsonc` are gitignored so secrets
> never get committed. The committed `.triton-usage.example.jsonc` is the template.

## Commands

### `triton-usage` (or `triton-usage dashboard`)

Shows a table of every configured key with current spend, max budget, a usage bar, last-active time, and number of allowed models. Failed lookups are surfaced inline so you can spot revoked/expired keys at a glance.

### `triton-usage report`

Per-model spend breakdown for one key. Flags:

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which named key to report on |
| `-s, --start <date>` | 30 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |

Example output:

```
Spend Report: jude
Range: 2026-07-13 → 2026-08-12

Current spend: $12.8400 / $50.00
  ████████████░░░░ 26%
Last active:  2h ago

MODEL                    CALLS        TOKENS       SPEND      SHARE
──────────────────────────────────────────────────────────────────
gpt-4o                      142       1.2M     $10.2400    79.8%
claude-3-5-sonnet            58     485.3k      $2.6000    20.2%
──────────────────────────────────────────────────────────────────
TOTAL                       200       1.7M     $12.8400
```

### `triton-usage daily`

Daily usage breakdown with spend bars and token counts (input, output, cache reads). Defaults to the last 14 days.

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which named key to use |
| `-s, --start <date>` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-m, --models` | off | Show per-model spend per day |

Example:

```
Daily Usage: spa-default
Range: 2026-08-01 → 2026-08-12

 DATE         REQS       INPUT      OUTPUT     CACHE R     SPEND  BAR
────────────────────────────────────────────────────────────────────────
 2026-08-11    129      27.90M      314.0k      26.29M    $28.49  ████████████████████
────────────────────────────────────────────────────────────────────────
 TOTAL         129      27.90M      314.0k      26.29M    $28.49
```

With `--models`:

```
 DATE         REQS     SPEND  BAR                        claude-opus-5     claude-sonnet-5
──────────────────────────────────────────────────────────────────────────────────────────
 2026-08-11    129    $28.49  ████████████████████              $24.68               $3.80
──────────────────────────────────────────────────────────────────────────────────────────
 TOTAL         129    $28.49                                    $24.68               $3.80
```

### `triton-usage sessions`

Per-session spend breakdown — groups all requests by `session_id` so you can see how much each Claude Code / coding session cost. Like `ccusage`. Defaults to the last 14 days.

| Flag | Default | Description |
| --- | --- | --- |
| `-k, --key <name>` | first configured key | Which named key to use |
| `-s, --start <date>` | 14 days ago | Start date (`YYYY-MM-DD`) |
| `-e, --end <date>` | today | End date (`YYYY-MM-DD`) |
| `-n, --limit <n>` | 20 | Max sessions to show |

Example:

```
Sessions: spa-default
Range: 2026-08-01 → 2026-08-12

 SESSION   REQS      INPUT    OUTPUT    CACHE R  DURATION     SPEND  BAR                 MODELS
──────────────────────────────────────────────────────────────────────────────────────────────────
 cc27a8e1   128     27.90M    314.0k     26.29M    59m26s    $28.49  ████████████████████  claude-opus-5, claude-sonnet-5
 9d81b44d     1          0         0          0       0ms  $0.0000  ░                     —
──────────────────────────────────────────────────────────────────────────────────────────────────
 TOTAL (2)  129     27.90M    314.0k     26.29M            $28.49
```

## How it works

`triton-usage` calls three LiteLLM proxy endpoints:

- [`GET /key/info`](https://docs.litellm.ai/docs/proxy/virtual_keys#key-info) — current spend, budget, models, last active
- [`GET /key/spend/report`](https://docs.litellm.ai/docs/proxy/spend_tracking) — per-model spend over a date range
- [`GET /spend/logs/v2`](https://docs.litellm.ai/docs/proxy/spend_tracking) — paginated per-request logs (used for daily and session views)

All are callable by the key itself (non-admin callers are auto-scoped to their own key), so you don't need a proxy admin key — each named key just needs permission to view its own usage.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup → dist/
npm run dev         # tsx src/index.ts (no build step)
```

## License

MIT
