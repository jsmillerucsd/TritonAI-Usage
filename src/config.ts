import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEFAULT_BASE_URL = "https://tritonai-api.ucsd.edu";

export interface KeyEntry {
  name: string;
  apiKey: string;
}

export interface Config {
  baseUrl: string;
  keys: KeyEntry[];
}

interface ConfigFile {
  base_url?: string;
  keys?: Record<string, string>;
}

const CONFIG_FILENAMES = [".triton-usage.json", ".triton-usage.jsonc"];

function readConfigFile(): ConfigFile | null {
  const home = homedir();
  for (const name of CONFIG_FILENAMES) {
    const path = join(home, name);
    try {
      const raw = readFileSync(path, "utf8");
      // Strip single-line // comments for .jsonc support
      const stripped = raw.replace(/^\s*\/\/.*$/gm, "");
      return JSON.parse(stripped) as ConfigFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(`Failed to read ${path}: ${(err as Error).message}`);
      }
    }
  }
  return null;
}

function keysFromEnv(): KeyEntry[] {
  const out: KeyEntry[] = [];
  const prefix = "TRITONAI_KEY_";
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith(prefix) && v && v.length > 0) {
      const name = k.slice(prefix.length).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      out.push({ name: name || "unnamed", apiKey: v });
    }
  }
  const single = process.env.TRITONAI_KEY;
  if (single && single.length > 0) {
    out.push({ name: "default", apiKey: single });
  }
  return out;
}

function keysFromFile(file: ConfigFile): KeyEntry[] {
  if (!file.keys) return [];
  return Object.entries(file.keys).map(([name, apiKey]) => ({
    name,
    apiKey,
  }));
}

export function loadConfig(): Config {
  const file = readConfigFile();
  const baseUrl =
    process.env.TRITONAI_BASE_URL ?? file?.base_url ?? DEFAULT_BASE_URL;

  // Merge: env keys first, then file keys (env wins on name collisions)
  const envKeys = keysFromEnv();
  const fileKeys = keysFromFile(file ?? {});
  const seen = new Set(envKeys.map((k) => k.name));
  const keys = [...envKeys, ...fileKeys.filter((k) => !seen.has(k.name))];

  if (keys.length === 0) {
    throw new Error(
      "No API keys configured. Set TRITONAI_KEY / TRITONAI_KEY_<NAME> env vars " +
        "or create ~/.triton-usage.json with a `keys` object.",
    );
  }

  return { baseUrl, keys };
}

export function findKey(config: Config, name: string): KeyEntry | undefined {
  return config.keys.find((k) => k.name === name);
}
