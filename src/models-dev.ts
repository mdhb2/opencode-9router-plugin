import { readCache, writeCache } from "./cache.js";

const MODELS_DEV_URL = "https://models.dev/api.json";

export interface ModelsDevProvider {
  id: string;
  name: string;
  npm?: string;
  models: Record<string, ModelsDevModel>;
}

export interface ModelsDevModel {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: { input?: string[]; output?: string[] };
  open_weights?: boolean;
  limit?: { context?: number; output?: number };
  cost?: { input?: number; output?: number };
}

// Flat index: model_id → ModelsDevModel (across all providers)
let flatIndex: Map<string, ModelsDevModel> | null = null;

async function buildIndex(): Promise<Map<string, ModelsDevModel>> {
  const index = new Map<string, ModelsDevModel>();

  // Try cache first
  const cached = await readCache();
  if (cached) {
    for (const [_providerKey, provider] of Object.entries(cached)) {
      const p = provider as ModelsDevProvider;
      if (p?.models) {
        for (const [modelId, model] of Object.entries(p.models)) {
          index.set(modelId, model);
        }
      }
    }
    return index;
  }

  // Fetch fresh
  try {
    const res = await fetch(MODELS_DEV_URL, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await writeCache(data);

    for (const [_providerKey, provider] of Object.entries(data)) {
      const p = provider as ModelsDevProvider;
      if (p?.models) {
        for (const [modelId, model] of Object.entries(p.models)) {
          index.set(modelId, model);
        }
      }
    }
  } catch (err) {
    console.warn(
      "opencode-9router: failed to fetch models.dev, using empty index:",
      (err as Error).message,
    );
  }

  return index;
}

/** Normalize model name for lookup: try exact then fuzzy variations */
function tryLookup(name: string): ModelsDevModel | null {
  if (!flatIndex) return null;

  // 1 — Exact match
  if (flatIndex.has(name)) return flatIndex.get(name)!;

  // 2 — Insert dash between word and number: gpt5.5 → gpt-5.5
  const dashed = name.replace(/([a-zA-Z])(\d)/, "$1-$2");
  if (dashed !== name && flatIndex.has(dashed)) return flatIndex.get(dashed)!;

  // 3 — Second dash: gpt-5.5 → gpt-5.5 (already has dash)
  //    Also try: replace dot with dash: gpt5.5 → gpt5-5
  const dotDash = name.replace(/\./g, "-");
  if (dotDash !== name && flatIndex.has(dotDash)) return flatIndex.get(dotDash)!;

  return null;
}

export async function lookupModel(
  modelName: string,
): Promise<ModelsDevModel | null> {
  if (!flatIndex) {
    flatIndex = await buildIndex();
  }
  return tryLookup(modelName);
}
