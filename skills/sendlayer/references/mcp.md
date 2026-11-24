# SendLayer MCP server

A hosted Model Context Protocol server that lets an assistant operate SendLayer directly, without
writing or running code.

## When to use it instead of code

| Situation | Use |
|---|---|
| "Send a test email to check my setup" | MCP `send_email`, or the `send_test_email` prompt |
| "Show me this email before you send it" | MCP `preview_email`, then `send_email` with its `previewId` |
| "Why did yesterday's email to X fail?" | MCP `get_email_events` by recipient, then `get_email_timeline` |
| "What bounced this week?" | MCP `what_failed_this_week` prompt |
| "Clean up my webhooks" | MCP `list_webhooks` + `delete_webhook` |
| "Add SendLayer to my checkout flow" | **Write code.** MCP is for operating the account, not for building the integration. |

Reach for MCP for one-off account operations and diagnosis. Reach for the SDK when the result
needs to live in the codebase.

## Connecting

Hosted endpoint: `https://mcp.sendlayer.com`, streamable HTTP. There are two ways to authenticate,
and the same endpoint takes both:

- **Sign in with SendLayer (OAuth).** No API key. The user logs in at `app.sendlayer.com`, picks the
  sender domains the client may use, and picks its permissions: send email, read events, manage
  webhooks (off unless turned on). Works in clients that sign in to remote MCP servers: Claude
  (claude.ai, Desktop, mobile) custom connectors, ChatGPT, Grok, and Claude Code. A connection
  unused for 30 days ends on its own.
- **API key.** Sent as an `x-sendlayer-api-key` header, or as `Authorization: Bearer <key>`. The key
  belongs to one sender domain. Use it for clients that only pass headers (Cursor, Gemini CLI,
  Windsurf), and for unattended use.

A non-empty `x-sendlayer-api-key` header wins. With no key and no token, the server answers `401`
with a `WWW-Authenticate: Bearer resource_metadata=...` challenge, which is what starts sign-in.

**Claude Code, sign in** (then open `/mcp`, choose `sendlayer`, and pick **Authenticate**):

```sh
claude mcp add --scope user --transport http sendlayer https://mcp.sendlayer.com
```

**Claude Code, API key:**

```sh
claude mcp add --scope user --transport http sendlayer https://mcp.sendlayer.com \
  --header "x-sendlayer-api-key: $SENDLAYER_API_KEY"
```

**Claude (claude.ai, Desktop, mobile):** Settings → Connectors → Add custom connector, URL
`https://mcp.sendlayer.com`, then sign in. No config file.

**ChatGPT:** Plugins → Add → Add custom MCP server, URL `https://mcp.sendlayer.com`,
authentication **OAuth**, then sign in.

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

**Gemini CLI** — `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "sendlayer": {
      "httpUrl": "https://mcp.sendlayer.com",
      "headers": { "x-sendlayer-api-key": "YOUR_SENDLAYER_API_KEY" }
    }
  }
}
```

**Windsurf** — `mcp_config.json`:

```json
{
  "mcpServers": {
    "sendlayer": {
      "serverUrl": "https://mcp.sendlayer.com",
      "headers": { "x-sendlayer-api-key": "YOUR_SENDLAYER_API_KEY" }
    }
  }
}
```

Installing this repo as a plugin wires the server up via `.mcp.json`. It sends
`SENDLAYER_API_KEY` when that variable is set; when it is not, the server asks the client to sign
in. You only need the manual config above if you are not using the plugin.

Full setup with screenshots: https://developers.sendlayer.com/integrations/ai-tools/mcp-server

## Running it locally

**The server source is not public.** `github.com/SendLayer/sendlayer-mcp` returns 404 to anonymous
requests, and the package is not on npm — so do not tell a user to clone or `npx` it. Use the hosted
endpoint above, which is what it is there for. Sign-in works only on the hosted server; a local
server takes an API key.

## Tools

| Tool | Permission (sign-in) | What it does |
|---|---|---|
| `send_email` | Send email | Send a message. Text, HTML or both, CC/BCC, reply-to, tags, custom headers, attachments. Optional `previewId`. |
| `preview_email` | Send email | Same input as `send_email`. Sends nothing; returns the email as it would go out and a `preview_id`. |
| `get_email_events` | Read events | Delivery events grouped by email. Filters: `messageId`, `recipient`, `event`, `startDate`, `endDate`, `retrieveCount` (1-100). Default period is the last 7 days. |
| `get_email_timeline` | Read events | Every event of one email by `messageId`, oldest first, over the last 30 days. |
| `list_webhooks` | Manage webhooks | List the webhooks of a sender domain. Never returns the signing key. |
| `create_webhook` | Manage webhooks | Subscribe a `url` to one `event`. |
| `delete_webhook` | Manage webhooks | Remove a webhook by integer `webhookId`. |
| `list_domains` | none | The domains and permissions of this connection. Sign-in only. |
| `query_sendlayer_docs` | none | Search the SendLayer developer docs. Params: `query` (required), `topic` (optional: `email`, `events`, `webhooks`, `installation`, `api-reference`). |

Prompts: `did_my_email_arrive`, `what_failed_this_week`, `send_test_email`.

`query_sendlayer_docs` needs no credentials, so it works before setup is complete — useful for
checking a request shape or confirming an error code without an account.

The hyphenated names (`send-email`, `get-events`, `list-webhooks`, `create-webhook`,
`delete-webhook`, `query-sendlayer-docs`) are deprecated aliases and will be removed in the next
server release. Use the underscore names.

## Domains under sign-in

An API key belongs to one sender domain, so with a key no tool takes a `domain`. A sign-in
connection can cover several domains:

- `get_email_events`, `get_email_timeline`, `list_webhooks`, `create_webhook` and `delete_webhook`
  take a `domain`, one of the connected domains. It may be left out only when the connection has
  exactly one.
- `send_email` and `preview_email` take no `domain`. Their `from` address must be at a connected
  domain, and `send_email` sends from that domain.
- When unsure which domains are connected, call `list_domains` first. A domain the account has but
  the connection does not cannot be used until the user connects again and allows it. Do not retry
  with a different domain on the user's behalf.

## Preview, then send

`preview_email` returns a `preview_id`. Pass it to `send_email` as `previewId` with the same input,
and the server sends only if the email is exactly the one previewed (a linked attachment is matched
by its URL, not its content). If the user changed anything after the preview, preview again.

## The gotchas still apply

The MCP tools are a thin wrapper over the same API:

- `create_webhook` takes `delivery`, `open`, `click`, `bounce`, `complaint` or `unsubscribe`, not
  `delivered` or `opened`.
- `get_email_events` filters with `event: 'failed'` for bounces, but reports them as `bounced`.
- Delivered webhook payloads still say `opened` rather than `open`.
- The sender domain must be verified.
- At most 10 attachments, 10 MB in total. On the hosted server an attachment `path` must be a public
  `https://` URL; otherwise give base64 `content` with a `filename`.

Everything in [../SKILL.md](../SKILL.md) holds.
