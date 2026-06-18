import type { Plugin } from "@opencode-ai/plugin";
import { resolveModel } from "./model-mapper.js";

type AnyCfg = Record<string, any>;

const DEFAULT_BASE = "http://localhost:20128/v1";
const DEFAULT_TIMEOUT_MS = 5000;

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function fetchJson(url: string, timeoutMs: number, apiKey: string): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: buildHeaders(apiKey),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

function extractModels(json: any): string[] {
  if (!json) return [];
  if (Array.isArray(json)) {
    return json.map((it: any) => it?.id || it?.name || String(it)).filter(Boolean);
  }
  if (Array.isArray(json.models)) return json.models.map((m: any) => m?.id || m?.name).filter(Boolean);
  if (Array.isArray(json.data)) return json.data.map((m: any) => m?.id || m?.name).filter(Boolean);
  const maybe = json.model || json.default_model || json.name;
  return maybe ? [maybe] : [];
}

async function listModels(baseUrl: string, timeoutMs: number, apiKey: string): Promise<string[]> {
  const tries = [`${baseUrl}/models`, `${baseUrl}/model`, `${baseUrl}`];
  for (const url of tries) {
    try {
      const data = await fetchJson(url, timeoutMs, apiKey);
      const models = extractModels(data);
      if (models.length > 0) return models;
    } catch {
      // try next endpoint
    }
  }
  return [];
}

function pickDefaultModel(models: string[]): string | null {
  if (!models.length) return null;
  const priorities = ["gpt", "claude", "gemini", "deepseek", "small"];
  for (const p of priorities) {
    const found = models.find((m) => m.toLowerCase().includes(p));
    if (found) return found;
  }
  return models[0] ?? null;
}

const plugin: Plugin = async () => {
  const baseUrl = process.env.OPENCODE_9ROUTER_URL || DEFAULT_BASE;
  const apiKey = process.env.OPENCODE_9ROUTER_API_KEY || "";
  const timeoutMs = Number(process.env.OPENCODE_9ROUTER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  let discoveredModels: string[] = [];
  let defaultModel: string | null = null;

  try {
    discoveredModels = await listModels(baseUrl, timeoutMs, apiKey);
    defaultModel = pickDefaultModel(discoveredModels);
  } catch (err) {
    console.warn("opencode-9router plugin: failed to discover models:", (err as any)?.message || err);
  }

  return {
    config: async (cfg: AnyCfg) => {
      cfg.provider ||= {};
      cfg.provider["9router"] ||= {};
      cfg.provider["9router"].npm ||= "@ai-sdk/openai-compatible";
      cfg.provider["9router"].options ||= {};
      cfg.provider["9router"].options.name ||= "9Router";
      cfg.provider["9router"].options.baseURL ||= baseUrl;
      if (apiKey && !cfg.provider["9router"].options.apiKey) {
        cfg.provider["9router"].options.apiKey = apiKey;
      }

      cfg.provider["9router"].models ||= {};
      for (const model of discoveredModels) {
        if (!cfg.provider["9router"].models[model]) {
          cfg.provider["9router"].models[model] = await resolveModel(model);
        }
      }

      if (!cfg.model && defaultModel) {
        cfg.model = `9router/${defaultModel}`;
      }
    },
  };
};

export default plugin;
