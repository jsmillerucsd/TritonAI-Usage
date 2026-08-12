# triton-usage

A small CLI to monitor **[TritonAI](https://tritonai-api.ucsd.edu/) / LiteLLM** API key spend and usage. Inspired by [`ccusage`](https://github.com/ryoppippi/ccusage), but for any LiteLLM proxy.

## Features

- **`triton-usage dashboard`** — multi-key overview: spend, budget, usage bar, last active, model count
- **`triton-usage report`** — per-model spend breakdown for a single key over a date range
- Keys loaded from env vars **and/or** a JSON config file
- No daemon, no database — just queries the LiteLLM `/key/info` and `/key/spend/report` endpoints

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

## How it works

`triton-usage` calls two LiteLLM proxy endpoints:

- [`GET /key/info`](https://docs.litellm.ai/docs/proxy/virtual_keys#key-info) — current spend, budget, models, last active
- [`GET /key/spend/report`](https://docs.litellm.ai/docs/proxy/spend_tracking) — per-model spend over a date range

Both are callable by the key itself (non-admin callers are auto-scoped to their own key), so you don't need a proxy admin key to use this tool — each named key just needs permission to view its own usage.

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build       # tsup → dist/
npm run dev         # tsx src/index.ts (no build step)
```

## License

MIT
