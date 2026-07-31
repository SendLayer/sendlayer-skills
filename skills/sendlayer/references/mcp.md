# SendLayer MCP server

A hosted Model Context Protocol server that lets an assistant operate SendLayer directly, without
writing or running code.

## When to use it instead of code

| Situation | Use |
|---|---|
| "Send a test email to check my setup" | MCP `send-email` |
| "Why did yesterday's email to X fail?" | MCP `get-events` |
| "Clean up my webhooks" | MCP `list-webhooks` + `delete-webhook` |
| "Add SendLayer to my checkout flow" | **Write code.** MCP is for operating the account, not for building the integration. |

Reach for MCP for one-off account operations and diagnosis. Reach for the SDK when the result
needs to live in the codebase.

## Connecting

Hosted endpoint: `https://mcp.sendlayer.com`, streamable HTTP, authenticated with your API key in
an `x-sendlayer-api-key` header.

**Claude Code**

```sh
claude mcp add --transport http sendlayer https://mcp.sendlayer.com \
  --header "x-sendlayer-api-key: $SENDLAYER_API_KEY"
```

**Codex**

```sh
codex mcp add sendlayer --url https://mcp.sendlayer.com
```

**Cursor** — `.cursor/mcp.json` or the global equivalent:

```json
{
  "mcpServers": {
    "sendlayer": {
      "type": "url",
      "url": "https://mcp.sendlayer.com",
      "headers": { "x-sendlayer-api-key": "YOUR_SENDLAYER_API_KEY" }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sendlayer": {
      "url": "https://mcp.sendlayer.com",
      "headers": { "x-sendlayer-api-key": "YOUR_SENDLAYER_API_KEY" }
    }
  }
}
```

**Zed** — `settings.json`:

```json
{ "context_servers": { "sendlayer": { "url": "https://mcp.sendlayer.com" } } }
```

**GitHub Copilot**:

```json
{ "mcp": { "servers": { "sendlayer": { "type": "http", "url": "https://mcp.sendlayer.com" } } } }
```

Installing this repo as a plugin wires the server up automatically via `.mcp.json` — you only
need the manual config above if you are not using the plugin.

## Running it locally

**The server source is not public.** `github.com/SendLayer/sendlayer-mcp` returns 404 to anonymous
requests, and the package is not on npm — so do not tell a user to clone or `npx` it. Use the hosted
endpoint above, which is what it is there for.

If you already have a checkout, build and run it like this:

```sh
npm install && npm run build
```

Stdio transport (the default) for desktop clients:

```json
{
  "mcpServers": {
    "sendlayer": {
      "command": "node",
      "args": ["/absolute/path/to/sendlayer-mcp/build/index.js"],
      "env": {
        "SENDLAYER_API_KEY": "your-key",
        "SENDER_EMAIL_ADDRESS": "you@yourdomain.com"
      }
    }
  }
}
```

Or pass flags instead of env vars: `--key=YOUR_KEY` (required) and `--sender=verified@domain`
(optional). HTTP transport: `node build/index.js --transport=http --port=3000`, which then reads
the API key per-request from the `x-sendlayer-api-key` header.

## Tools

| Tool | Needs API key | What it does |
|---|---|---|
| `send-email` | yes | Send a message. Supports text and HTML bodies, CC/BCC, reply-to, tags, custom headers, attachments. |
| `get-events` | yes | Query delivery history. Same filters as `Events.get`. |
| `list-webhooks` | yes | List configured webhooks. |
| `create-webhook` | yes | Subscribe a URL to one event. |
| `delete-webhook` | yes | Remove a webhook by ID. |
| `query-sendlayer-docs` | **no** | Search the SendLayer developer docs. Params: `query` (required), `topic` (optional: `email`, `events`, `webhooks`, `installation`, `api-reference`). |

`query-sendlayer-docs` needs no credentials, so it works before setup is complete — useful for
checking a request shape or confirming an error code without an account.

## The gotchas still apply

The MCP tools are a thin wrapper over the same API. `create-webhook` still takes `delivery` rather
than `delivered`, delivered payloads still say `opened` rather than `open`, the sender domain must
still be verified, and `send-email` still transmits only one body. Everything in
[../SKILL.md](../SKILL.md) holds.
