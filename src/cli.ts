#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PACKAGE_NAME = "opencode-9router-plugin";
const DEFAULT_CONFIG = { $schema: "https://opencode.ai/config.json" };

type JsonObject = Record<string, any>;

type Args = {
  command: "install" | "check" | "uninstall" | "help";
  config?: string;
  global: boolean;
  project: boolean;
  dryRun: boolean;
  yes: boolean;
  manual: boolean;
};

function parseArgs(argv: string[]): Args {
  let command: Args["command"] = "help";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--config") {
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      command = arg as Args["command"];
      break;
    }
  }
  const configIndex = argv.indexOf("--config");
  return {
    command: ["install", "check", "uninstall"].includes(command) ? command : "help",
    config: configIndex >= 0 ? argv[configIndex + 1] : undefined,
    global: argv.includes("--global"),
    project: argv.includes("--project"),
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes") || argv.includes("-y"),
    manual: argv.includes("--manual"),
  };
}

function printHelp(): void {
  console.log(`Usage:
  ${PACKAGE_NAME} install [--global|--project|--config <path>] [--dry-run] [--yes] [--manual]
  ${PACKAGE_NAME} check [--global|--project|--config <path>]
  ${PACKAGE_NAME} uninstall [--global|--project|--config <path>] [--dry-run] [--yes]

Recommended:
  opencode plugin ${PACKAGE_NAME}

Environment:
  OPENCODE_9ROUTER_URL          default: http://localhost:20128/v1
  OPENCODE_9ROUTER_API_KEY      required for chat completion requests
  OPENCODE_9ROUTER_TIMEOUT_MS   default: 5000`);
}

function globalConfigPath(): string {
  return path.join(os.homedir(), ".config", "opencode", "opencode.json");
}

function candidatesFor(dir: string): string[] {
  return [
    path.join(dir, "opencode.json"),
    path.join(dir, "opencode.jsonc"),
    path.join(dir, ".opencode", "opencode.json"),
  ];
}

function findProjectConfig(cwd = process.cwd()): string | undefined {
  let current = path.resolve(cwd);
  while (true) {
    for (const candidate of candidatesFor(current)) {
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function projectConfigCreatePath(cwd = process.cwd()): string {
  return path.join(path.resolve(cwd), ".opencode", "opencode.json");
}

function resolveTargetConfig(args: Args): { file: string; warnings: string[]; created: boolean } {
  const warnings: string[] = [];
  if (process.env.OPENCODE_CONFIG_CONTENT) {
    warnings.push("OPENCODE_CONFIG_CONTENT is set; file-based changes may not affect the current opencode process.");
  }

  if (args.config) return { file: path.resolve(args.config), warnings, created: false };

  if (process.env.OPENCODE_CONFIG) {
    warnings.push(`OPENCODE_CONFIG is set; using ${process.env.OPENCODE_CONFIG}`);
    return { file: path.resolve(process.env.OPENCODE_CONFIG), warnings, created: false };
  }

  if (args.global) return { file: globalConfigPath(), warnings, created: !existsSync(globalConfigPath()) };

  if (args.project) {
    const found = findProjectConfig();
    const file = found || projectConfigCreatePath();
    return { file, warnings, created: !existsSync(file) };
  }

  const found = findProjectConfig();
  if (found) return { file: found, warnings, created: false };
  const file = globalConfigPath();
  return { file, warnings, created: !existsSync(file) };
}

function hasJsoncComments(raw: string): boolean {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    if (char === "/" && (next === "/" || next === "*")) return true;
  }
  return false;
}

async function readConfig(file: string): Promise<JsonObject> {
  if (!existsSync(file)) return { ...DEFAULT_CONFIG };
  const raw = await fs.readFile(file, "utf8");
  if (file.endsWith(".jsonc") && hasJsoncComments(raw)) {
    throw new Error(`Refusing to edit JSONC with comments safely: ${file}. Use 'opencode plugin ${PACKAGE_NAME}' or pass --config to a JSON file.`);
  }
  const parsed = JSON.parse(raw) as JsonObject;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Config root must be a JSON object: ${file}`);
  }
  return parsed;
}

function pluginName(entry: unknown): string | undefined {
  if (typeof entry === "string") return entry;
  if (Array.isArray(entry) && typeof entry[0] === "string") return entry[0];
  return undefined;
}

function hasPlugin(cfg: JsonObject): boolean {
  return Array.isArray(cfg.plugin) && cfg.plugin.some((entry) => pluginName(entry) === PACKAGE_NAME);
}

function addPlugin(cfg: JsonObject): { cfg: JsonObject; changed: boolean } {
  if (cfg.plugin === undefined) cfg.plugin = [];
  if (!Array.isArray(cfg.plugin)) throw new Error("Config field 'plugin' exists but is not an array.");
  if (hasPlugin(cfg)) return { cfg, changed: false };
  cfg.plugin.push(PACKAGE_NAME);
  return { cfg, changed: true };
}

function removePlugin(cfg: JsonObject): { cfg: JsonObject; changed: boolean } {
  if (cfg.plugin === undefined) return { cfg, changed: false };
  if (!Array.isArray(cfg.plugin)) throw new Error("Config field 'plugin' exists but is not an array.");
  const before = cfg.plugin.length;
  cfg.plugin = cfg.plugin.filter((entry: unknown) => pluginName(entry) !== PACKAGE_NAME);
  return { cfg, changed: cfg.plugin.length !== before };
}

async function confirm(message: string, yes: boolean): Promise<boolean> {
  if (yes) return true;
  const rl = createInterface({ input, output });
  const answer = await rl.question(`${message} (y/N) `);
  rl.close();
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

async function writeConfig(file: string, cfg: JsonObject, createBackup: boolean): Promise<string | undefined> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  let backup: string | undefined;
  if (createBackup && existsSync(file)) {
    backup = `${file}.bak-${timestamp()}`;
    await fs.copyFile(file, backup);
  }
  const tmp = path.join(path.dirname(file), `.opencode-9router-${process.pid}-${Date.now()}.tmp`);
  await fs.writeFile(tmp, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
  return backup;
}

function tryNativeInstall(): boolean {
  const result = spawnSync("opencode", ["plugin", PACKAGE_NAME], { stdio: "inherit", shell: process.platform === "win32" });
  return result.status === 0;
}

async function install(args: Args): Promise<void> {
  if (!args.manual && !args.config && !args.project && !args.global && !args.dryRun) {
    console.log(`Trying native install: opencode plugin ${PACKAGE_NAME}`);
    if (tryNativeInstall()) {
      console.log("Installed with opencode's native plugin installer. Restart opencode to load the plugin.");
      return;
    }
    console.log("Native installer failed or is unavailable; falling back to safe config edit.");
  }

  const target = resolveTargetConfig(args);
  for (const warning of target.warnings) console.warn(`Warning: ${warning}`);
  const cfg = await readConfig(target.file);
  const result = addPlugin(cfg);

  console.log(`Target config: ${target.file}`);
  if (!result.changed) {
    console.log(`${PACKAGE_NAME} is already present in plugin config.`);
    return;
  }
  console.log(`Will add: "${PACKAGE_NAME}" to plugin array.`);

  if (args.dryRun) {
    console.log(JSON.stringify(result.cfg, null, 2));
    return;
  }

  if (!(await confirm("Apply this change?", args.yes))) {
    console.log("Aborted.");
    return;
  }

  const backup = await writeConfig(target.file, result.cfg, !target.created);
  if (backup) console.log(`Backup created: ${backup}`);
  console.log("Plugin entry installed. Restart opencode to load it.");
}

async function uninstall(args: Args): Promise<void> {
  const target = resolveTargetConfig(args);
  for (const warning of target.warnings) console.warn(`Warning: ${warning}`);
  const cfg = await readConfig(target.file);
  const result = removePlugin(cfg);

  console.log(`Target config: ${target.file}`);
  if (!result.changed) {
    console.log(`${PACKAGE_NAME} was not present in plugin config.`);
    return;
  }
  console.log(`Will remove: "${PACKAGE_NAME}" from plugin array.`);

  if (args.dryRun) {
    console.log(JSON.stringify(result.cfg, null, 2));
    return;
  }

  if (!(await confirm("Apply this change?", args.yes))) {
    console.log("Aborted.");
    return;
  }

  const backup = await writeConfig(target.file, result.cfg, true);
  if (backup) console.log(`Backup created: ${backup}`);
  console.log("Plugin entry removed. Restart opencode to apply the change.");
}

async function check(args: Args): Promise<void> {
  const target = resolveTargetConfig(args);
  for (const warning of target.warnings) console.warn(`Warning: ${warning}`);
  console.log(`Target config: ${target.file}`);

  try {
    const cfg = await readConfig(target.file);
    console.log(`Config parse: ok`);
    console.log(`Plugin entry: ${hasPlugin(cfg) ? "present" : "missing"}`);
  } catch (err) {
    console.log(`Config parse: failed - ${(err as Error).message}`);
  }

  console.log(`OPENCODE_9ROUTER_URL: ${process.env.OPENCODE_9ROUTER_URL || "http://localhost:20128/v1 (default)"}`);
  console.log(`OPENCODE_9ROUTER_API_KEY: ${process.env.OPENCODE_9ROUTER_API_KEY ? "set" : "missing"}`);

  const result = spawnSync("opencode", ["models", "9router"], { encoding: "utf8", shell: process.platform === "win32" });
  if (result.status === 0) {
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    console.log(`opencode models 9router: ok (${lines.length} models)`);
  } else {
    const stderr = result.stderr?.trim() || "command failed or opencode is not on PATH";
    console.log(`opencode models 9router: failed - ${stderr}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (process.argv.includes("--config") && !args.config) {
    throw new Error("--config requires a file path.");
  }
  if (args.command === "help") return printHelp();
  if (args.command === "install") return install(args);
  if (args.command === "uninstall") return uninstall(args);
  if (args.command === "check") return check(args);
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exitCode = 1;
});
