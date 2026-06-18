import { lookupModel, type ModelsDevModel } from "./models-dev.js";

export interface OpenCodeModelEntry {
  id?: string;
  name?: string;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  cost?: { input: number; output: number };
  limit?: { context: number; output: number };
  modalities?: { input: string[]; output: string[] };
}

const TEMPLATE: OpenCodeModelEntry = {
  id: undefined,
  name: undefined,
  family: undefined,
  attachment: false,
  reasoning: false,
  temperature: true,
  tool_call: true,
};

function mapModel(dev: ModelsDevModel): OpenCodeModelEntry {
  const entry: OpenCodeModelEntry = {};

  if (dev.name) entry.name = dev.name;
  if (dev.family) entry.family = dev.family;
  if (dev.release_date) entry.release_date = dev.release_date;
  if (dev.attachment !== undefined) entry.attachment = dev.attachment;
  if (dev.reasoning !== undefined) entry.reasoning = dev.reasoning;
  if (dev.temperature !== undefined) entry.temperature = dev.temperature;
  if (dev.tool_call !== undefined) entry.tool_call = dev.tool_call;

  if (dev.cost?.input !== undefined && dev.cost?.output !== undefined) {
    entry.cost = { input: dev.cost.input, output: dev.cost.output };
  }

  if (dev.limit?.context !== undefined && dev.limit?.output !== undefined) {
    entry.limit = { context: dev.limit.context, output: dev.limit.output };
  }

  if (dev.modalities) {
    entry.modalities = {
      input: dev.modalities.input ?? ["text"],
      output: dev.modalities.output ?? ["text"],
    };
  }

  return entry;
}

/**
 * Resolve a 9Router model ID (e.g. "mistral/mistral-large-latest")
 * to an OpenCode model entry.
 *
 * - Models with "/" → extract name after "/", lookup in models.dev
 * - Models without "/" (combos) → template
 * - No match in models.dev → template
 */
export async function resolveModel(
  fullId: string,
): Promise<OpenCodeModelEntry> {
  const slashIdx = fullId.indexOf("/");
  let entry: OpenCodeModelEntry;

  if (slashIdx === -1) {
    // Combo model — no provider prefix
    entry = { ...TEMPLATE };
  } else {
    const modelName = fullId.slice(slashIdx + 1);
    const devModel = await lookupModel(modelName);
    entry = devModel ? mapModel(devModel) : { ...TEMPLATE };
  }

  entry.id = fullId;
  entry.name = fullId;

  return entry;
}
