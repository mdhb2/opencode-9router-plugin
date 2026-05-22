# opencode-9router-plugin

Dynamic 9router provider plugin for [opencode](https://opencode.ai/).

It discovers available models from your 9router endpoint at startup and injects them into opencode automatically, so you do not need to hardcode model lists in `opencode.json`.

## Features

- Discovers models dynamically from `OPENCODE_9ROUTER_URL` (default: `http://localhost:20128/v1`)
- Registers provider `9router` using `@ai-sdk/openai-compatible`
- Sets a sensible default model (`gpt`, `claude`, `gemini`, `deepseek`, then first available)
- Supports `OPENCODE_9ROUTER_API_KEY` and optional `OPENCODE_9ROUTER_TIMEOUT_MS`

## Install

```bash
npm i opencode-9router-plugin
```

Then add it to your opencode config:

`~/.config/opencode/opencode.json` (global) or project `./opencode.json` / `.opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-9router-plugin"]
}
```

## Environment variables

- `OPENCODE_9ROUTER_URL` (optional): 9router base URL. Default `http://localhost:20128/v1`
- `OPENCODE_9ROUTER_API_KEY` (recommended): API key used by provider options and model discovery requests
- `OPENCODE_9ROUTER_TIMEOUT_MS` (optional): fetch timeout in ms. Default `5000`

Example:

```bash
export OPENCODE_9ROUTER_URL="http://localhost:20128/v1"
export OPENCODE_9ROUTER_API_KEY="sk-..."
```

Windows (cmd):

```bat
set "OPENCODE_9ROUTER_URL=http://localhost:20128/v1"
set "OPENCODE_9ROUTER_API_KEY=sk-..."
```

## Local development

```bash
npm install
npm run build
```

Generated output will be in `dist/`.

## Publish to npm

1. Update package name/version in `package.json`
2. Login:
   ```bash
   npm login
   ```
3. Publish:
   ```bash
   npm publish --access public
   ```

After publish, anyone can install with:

```bash
npm i opencode-9router-plugin
```

## GitHub release flow (recommended)

1. Push this repo to GitHub
2. Create a tag (e.g. `v0.1.0`) and release notes
3. Optionally set up GitHub Actions to run `npm publish` on tagged releases

## Notes

- Restart opencode after changing config/plugins.
- If models are empty, verify your 9router URL, API key, and that `/models` endpoint is reachable.
