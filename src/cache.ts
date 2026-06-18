import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CACHE_DIR = path.join(os.homedir(), ".cache", "opencode-9router-plugin");
const CACHE_FILE = path.join(CACHE_DIR, "models.dev.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CacheEntry {
  timestamp: number;
  data: Record<string, any>;
}

export async function readCache(): Promise<Record<string, any> | null> {
  try {
    const raw = await fs.readFile(CACHE_FILE, "utf8");
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return entry.data;
    }
    return null; // expired
  } catch {
    return null; // missing or corrupt
  }
}

export async function writeCache(data: Record<string, any>): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const entry: CacheEntry = { timestamp: Date.now(), data };
  const tmp = path.join(CACHE_DIR, `.models.dev.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(entry), "utf8");
  await fs.rename(tmp, CACHE_FILE);
}

export async function getCacheAge(): Promise<{ exists: boolean; ageMs?: number }> {
  try {
    const stat = await fs.stat(CACHE_FILE);
    return { exists: true, ageMs: Date.now() - stat.mtimeMs };
  } catch {
    return { exists: false };
  }
}
