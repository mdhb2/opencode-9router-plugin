import { Model, Plugin, Provider } from "@opencode/plugin";

type AnyCfg = Record<string, any>;

const PROVIDER_ID = "9router";
const PROVIDER_NAME = "9Router";
// v1 config `npm` field loads an AI SDK provider package; v2 uses `package` in Provider.Info.
const PROVIDER_NPM_V1 = "@ai-sdk/openai-compatible";
const PROVIDER_PACKAGE_V2 = "@opencode/ai/providers/openai-compatible";

const DEFAULT_BASE = "http://localhost:20128/v1";
const DEFAULT_TIMEOUT_MS = 5000;

interface Discovery {
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string | null;
}

function readEnv(): { baseUrl: string; apiKey: string; timeoutMs: number } {
  const baseUrl = process.env.OPENCODE_9ROUTER_URL || DEFAULT_BASE;
  const apiKey = process.env.OPENCODE_9ROUTER_API_KEY || "";
  const timeoutMs = Number(process.env.OPENCODE_9ROUTER_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return { baseUrl, apiKey, timeoutMs };
}

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

async function discover(): Promise<Discovery> {
  const { baseUrl, apiKey, timeoutMs } = readEnv();
  try {
    const models = await listModels(baseUrl, timeoutMs, apiKey);
    return { baseUrl, apiKey, models, defaultModel: pickDefaultModel(models) };
  } catch (err) {
    console.warn("opencode-9router plugin: failed to discover models:", (err as any)?.message || err);
    return { baseUrl, apiKey, models: [], defaultModel: null };
  }
}

// Shared by both entrypoints: what each host version injects into the provider config.
function providerOptions(d: Discovery): Record<string, any> {
  const options: Record<string, any> = {
    name: PROVIDER_NAME,
    baseURL: d.baseUrl,
  };
  if (d.apiKey) options.apiKey = d.apiKey;
  return options;
}

export default {
  // ---- OpenCode v2 entrypoint ----
  ...Plugin.define({
    id: PROVIDER_ID,
    async setup(ctx) {
      // Discovery runs BEFORE registering transforms: transforms must be
      // synchronous, cheap and replayable (they capture this data in closure).
      const discovery = await discover();

      const providerID = Provider.ID.make(PROVIDER_ID);
      const models = discovery.models.map((id) => ({
        ...Model.Info.default(providerID, Model.ID.make(id)),
      }));

      await ctx.provider.transform((editor) => {
        editor.add({
          info: {
            ...Provider.Info.empty(providerID),
            name: PROVIDER_NAME,
            activation: "enabled",
            package: PROVIDER_PACKAGE_V2,
            settings: providerOptions(discovery),
          },
          models,
        });
      });

      if (discovery.defaultModel) {
        const defaultModel = discovery.defaultModel;
        await ctx.model.transform((editor) => {
          // Only set a default when the user has not chosen one.
          if (!editor.default.get()) {
            editor.default.set(providerID, Model.ID.make(defaultModel));
          }
        });
      }
    },
  }),

  // ---- OpenCode v1 entrypoint (supported since 1.18.29) ----
  async server() {
    const discovery = await discover();

    return {
      config: async (cfg: AnyCfg) => {
        cfg.provider ||= {};
        cfg.provider[PROVIDER_ID] ||= {};
        cfg.provider[PROVIDER_ID].npm ||= PROVIDER_NPM_V1;
        const options = providerOptions(discovery);
        cfg.provider[PROVIDER_ID].options ||= {};
        for (const [key, value] of Object.entries(options)) {
          cfg.provider[PROVIDER_ID].options[key] ??= value;
        }

        cfg.provider[PROVIDER_ID].models ||= {};
        for (const model of discovery.models) {
          cfg.provider[PROVIDER_ID].models[model] ||= {};
        }

        if (!cfg.model && discovery.defaultModel) {
          cfg.model = `${PROVIDER_ID}/${discovery.defaultModel}`;
        }
      },
    };
  },
};
