# Opencode 9Router Plugin

![Preview plugin](https://unpkg.com/opencode-9router-plugin@latest/assets/images/cover2.png)

Dynamic 9router provider plugin for [opencode](https://opencode.ai/). Compatible with **OpenCode v2** and **v1 (>= 1.18.29)**.

It discovers available models from your 9router endpoint at startup and injects them into opencode automatically, so model lists do not need to be hardcoded in your config.

## Features

- Discovers models dynamically from `OPENCODE_9ROUTER_URL` (default: `http://localhost:20128/v1`)
- Dual entrypoint in one package:
  - **OpenCode v2**: registers provider `9router` via `ctx.provider.transform` using `@opencode/ai/providers/openai-compatible`
  - **OpenCode v1**: injects provider config through the legacy `config` hook using `@ai-sdk/openai-compatible`
- Sends `OPENCODE_9ROUTER_API_KEY` as Bearer auth when discovering models
- Optionally sets the default model when opencode has none configured
- Never writes opencode config from the runtime plugin
- Includes an explicit installer/check CLI for safer setup and troubleshooting

## Recommended Install

### OpenCode v2

```bash
opencode plugin add opencode-9router-plugin
```

### OpenCode v1

```bash
opencode plugin opencode-9router-plugin
```

Then set your API key and restart opencode.

Windows (cmd):

```bat
setx OPENCODE_9ROUTER_API_KEY "sk-..."
```

macOS/Linux:

```bash
export OPENCODE_9ROUTER_API_KEY="sk-..."
```

If your 9router endpoint is not the default local URL, also set:

```bash
export OPENCODE_9ROUTER_URL="http://localhost:20128/v1"
```

Windows (cmd):

```bat
setx OPENCODE_9ROUTER_URL "http://localhost:20128/v1"
```

Restart opencode, then verify:

```bash
opencode models 9router
```

## Fallback Installer

If the native installer is unavailable, use the package CLI:

```bash
npx opencode-9router-plugin install
```

The CLI detects your opencode major version and tries the matching native command first (`opencode plugin add ...` on v2, `opencode plugin ...` on v1). If that fails, it falls back to safe config editing.

Useful options:

```bash
npx opencode-9router-plugin install --global
npx opencode-9router-plugin install --project
npx opencode-9router-plugin install --config ./opencode.jsonc
npx opencode-9router-plugin install --dry-run
npx opencode-9router-plugin install --yes
npx opencode-9router-plugin install --manual
```

The fallback editor:

- detects your opencode major version and writes the `plugins` key (v2) or legacy `plugin` key (v1)
- recognizes all entry forms: `"pkg"`, `["pkg", {opts}]`, and `{ "package": "pkg", "options": {...} }`
- candidate paths follow v2 precedence: `opencode.jsonc`, `opencode.json`, `.opencode/opencode.jsonc`, `.opencode/opencode.json`
- detects `OPENCODE_CONFIG` and warns about `OPENCODE_CONFIG_CONTENT`
- supports global and project config targets
- creates backups before writing existing files
- writes atomically through a temp file and rename
- avoids duplicate plugin entries
- refuses to edit JSONC files with comments because preserving comments safely is not guaranteed

## Check Setup

Run diagnostics:

```bash
npx opencode-9router-plugin check
```

It checks:

- target config path
- whether config parses successfully
- whether the plugin entry is present (`plugins` and/or `plugin`)
- your opencode major version (and `opencode plugin list` on v2)
- whether `OPENCODE_9ROUTER_API_KEY` is set
- whether `opencode models 9router` returns models

## Uninstall

Use opencode's native plugin management if available (`opencode plugin remove opencode-9router-plugin` on v2). Otherwise:

```bash
npx opencode-9router-plugin uninstall --global
```

or:

```bash
npx opencode-9router-plugin uninstall --project
```

## Manual Config

### OpenCode v2

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-9router-plugin"]
}
```

### OpenCode v1

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-9router-plugin"]
}
```

Do not hardcode model lists. The plugin discovers them dynamically at startup.

## Migrating from 0.1.x (OpenCode v1 only)

Version 0.2.0 adds OpenCode v2 support via a dual entrypoint:

- No config change is required if you already have `"plugin": ["opencode-9router-plugin"]` — v1 keeps working unchanged.
- When you upgrade opencode to v2, rename the key: `"plugin"` → `"plugins"` (or just re-run `npx opencode-9router-plugin install`, which picks the right key for your version).
- Tuple entries like `["opencode-9router-plugin", {}]` still work; v2 also accepts `{ "package": "opencode-9router-plugin", "options": {} }`.

## Environment Variables

- `OPENCODE_9ROUTER_URL` (optional): 9router base URL. Default `http://localhost:20128/v1`
- `OPENCODE_9ROUTER_API_KEY` (recommended): API key used by provider options and model discovery requests
- `OPENCODE_9ROUTER_TIMEOUT_MS` (optional): fetch timeout in ms. Default `5000`

## Development

```bash
npm install
npm run build      # tsc -> dist/
npm run mock       # start a mock 9router /models endpoint on :20128
```

### Local testing

- **v2**: copy the build into the auto-discovered plugins directory, then verify:

  ```bash
  mkdir -p .opencode/plugins
  cp dist/index.js .opencode/plugins/9router.js
  npx -y @opencode/cli@2.0.16 models       # should list 9router/... models
  npx -y @opencode/cli@2.0.16 plugin list  # should show id "9router"
  ```

  Note: v2 ignores file-path entries in project config files (`"plugins": ["./dist/index.js"]`) — use the `.opencode/plugins/` directory for local files, or the npm package name for published installs.
- **v1**: point `OPENCODE_CONFIG` at a config file whose `"plugin"` array contains `"./dist/index.js"`, then run `opencode models 9router`.

### Publishing

1. Bump the version in `package.json`.
2. Create a tag such as `v0.2.0`.
3. Publish to npm manually or with GitHub Actions on tagged releases.

## Troubleshooting

- Restart opencode after changing config or installing plugins.
- If `/model` does not show 9router models, run `npx opencode-9router-plugin check`.
- If models are empty, verify that your 9router endpoint is running and `/models` is reachable.
- If you see `Missing API Key`, set `OPENCODE_9ROUTER_API_KEY` and restart opencode.
- If you previously used a local development copy, remove duplicate local entries such as `./plugins/opencode-9router.ts` before switching to the npm package.

## Github Repository

https://github.com/mdhb2/opencode-9router-plugin
